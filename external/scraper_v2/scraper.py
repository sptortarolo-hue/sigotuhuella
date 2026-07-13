#!/usr/bin/env python3
"""
Scraper de Facebook Groups para SiHuella.
Usa pyppeteer (Chromium headless) + requests.
Corre desde Termux usando la IP del celular (residencial).
No necesita cookies ni cuenta de Facebook.

Uso:
  python3 scraper.py --token TU_TOKEN
  python3 scraper.py --token TU_TOKEN --once
"""

import os, sys, re, json, time, argparse, asyncio
from urllib.parse import urlparse

import requests

API_BASE = "https://sigotuhuella.online"


def check_pending(token, api):
    try:
        r = requests.get(f"{api}/api/facebook/pending-scrape", params={"token": token}, timeout=15)
        return r.json().get("pending", False)
    except Exception as e:
        print(f"[scraper] Error check pending: {e}")
        return False


def mark_done(token, api):
    try:
        r = requests.post(f"{api}/api/facebook/scrape-done", params={"token": token}, timeout=15)
        if r.status_code == 200:
            print("[scraper] Scrape marcado como completado")
    except Exception as e:
        print(f"[scraper] Error mark done: {e}")


def get_groups(token, api):
    r = requests.get(f"{api}/api/facebook/scraper-groups", params={"token": token}, timeout=15)
    if r.status_code != 200:
        print(f"[scraper] Error grupos: HTTP {r.status_code}")
        sys.exit(1)
    grupos = r.json()
    print(f"[scraper] Grupos activos: {len(grupos)}")
    return grupos


def extract_posts(html, gid, slug):
    posts = []
    seen = set()
    articles = re.findall(r'<div[^>]*role="article"[^>]*>(.*?)</div>\s*(?=<div|\Z)', html, re.DOTALL)
    if not articles:
        articles = re.findall(r'<article[^>]*>(.*?)</article>', html, re.DOTALL)
    for art in articles:
        ids = re.findall(r'/posts/(\d+)', art)
        if not ids:
            continue
        pid = ids[0]
        if pid in seen:
            continue
        seen.add(pid)
        msg = re.search(r'data-ad-comet-preview="message"[^>]*>(.*?)</div>', art, re.DOTALL)
        content = ""
        if msg:
            content = re.sub(r'<[^>]+>', '', msg.group(1)).strip()
        if not content:
            dirs = re.findall(r'<div[^>]*dir="auto"[^>]*>(.*?)</div>', art, re.DOTALL)
            parts = []
            for d in dirs:
                t = re.sub(r'<[^>]+>', '', d).strip()
                if len(t) > 15:
                    parts.append(t)
            content = "\n".join(parts)
        content = re.sub(r'\d+\s*[hm]\s*·\s*', '', content)
        content = re.sub(r'(?i)See more|Ver más|Mostrar más', '', content).strip()[:10000]
        author = ""
        for sel in [r'<h2[^>]*>.*?<a[^>]*>(.*?)</a>', r'<h3[^>]*>.*?<a[^>]*>(.*?)</a>', r'<strong[^>]*>.*?<a[^>]*>(.*?)</a>']:
            m = re.search(sel, art, re.DOTALL)
            if m:
                author = re.sub(r'<[^>]+>', '', m.group(1)).strip()
                break
        images = re.findall(r'<img[^>]+src="([^"]*scontent[^"]*)"', art)
        if not images:
            images = re.findall(r'<img[^>]+src="([^"]*fbcdn[^"]*)"', art)
        posts.append({
            "fb_post_id": pid,
            "group_id": gid,
            "author_name": author,
            "content": content,
            "image_urls": images[:5],
            "fb_post_url": f"https://www.facebook.com/groups/{slug}/posts/{pid}/",
        })
    return posts


def send_posts(posts, token, api):
    for post in posts:
        try:
            r = requests.post(f"{api}/api/facebook/webhook",
                              json={"posts": [post]},
                              headers={"Authorization": f"Bearer {token}"},
                              timeout=30)
            if r.status_code == 200:
                print(f"  OK {post['fb_post_id']}")
            else:
                print(f"  FAIL {post['fb_post_id']}: HTTP {r.status_code}")
        except Exception as e:
            print(f"  FAIL {post['fb_post_id']}: {e}")


async def scrape(token, api):
    grupos = get_groups(token, api)
    if not grupos:
        print("[scraper] No hay grupos")
        return

    from pyppeteer import launch

    browser = await launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-setuid-sandbox",
        ]
    )
    page = await browser.newPage()
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    )
    await page.setViewport({"width": 1440, "height": 900})

    for grupo in grupos:
        gid = grupo["id"]
        slug = urlparse(grupo["url"]).path.rstrip("/").split("/")[-1]
        name = grupo.get("name", gid)
        url = f"https://www.facebook.com/groups/{slug}/"

        print(f"[scraper] Scrapeando {name} ({slug})...")
        try:
            await page.goto(url, waitUntil="networkidle", timeout=60000)
            await asyncio.sleep(4)

            if "login" in page.url.lower() or "checkpoint" in page.url.lower():
                print("  Redirige a login — saltando")
                continue

            html = await page.content()
            posts = extract_posts(html, gid, slug)
            print(f"  Posts: {len(posts)}")
            send_posts(posts, token, api)
        except Exception as e:
            print(f"  Error en {name}: {e}")

    await browser.close()
    mark_done(token, api)
    print("[scraper] Scrapeo completado")


def acquire_wakelock():
    try:
        import subprocess
        subprocess.run(["termux-wake-lock"], capture_output=True, timeout=5)
        print("[scraper] Wake lock adquirido")
    except Exception:
        pass


def release_wakelock():
    try:
        import subprocess
        subprocess.run(["termux-wake-unlock"], capture_output=True, timeout=5)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="Scraper de Facebook Groups para SiHuella")
    parser.add_argument("--token", required=True, help="Token del scraper (fb_scraper_token)")
    parser.add_argument("--api", default=API_BASE)
    parser.add_argument("--daemon", type=int, nargs="?", const=30, metavar="MIN",
                        help="Modo daemon (default: cada 30 min). P.ej: --daemon 10")
    parser.add_argument("--once", action="store_true", help="Ejecutar una sola vez (no daemon)")
    args = parser.parse_args()

    token = args.token
    api = args.api.rstrip("/")
    acquire_wakelock()

    if args.once:
        if not check_pending(token, api):
            print("[scraper] No hay scrape pendiente")
            release_wakelock()
            return
        asyncio.run(scrape(token, api))
        release_wakelock()
        return

    interval = args.daemon or 30
    print(f"[scraper] Modo daemon: cada {interval} minutos")
    while True:
        if check_pending(token, api):
            asyncio.run(scrape(token, api))
        else:
            print("[scraper] No hay scrape pendiente, esperando...")
        time.sleep(interval * 60)


if __name__ == "__main__":
    main()
