#!/usr/bin/env python3
"""
Scraper de Facebook Groups para SiHuella.
Usa Playwright (Chromium) para navegar como browser real.
Corre desde Termux usando la IP del celular (residencial).
No necesita cookies ni cuenta de Facebook (grupos públicos).

Uso:
  python3 scraper.py --token TU_TOKEN               # una vez
  python3 scraper.py --token TU_TOKEN --daemon 30    # cada 30 min
"""

import os, sys, re, json, time, argparse
from urllib.parse import urlparse

CHROMIUM = os.environ.get("CHROMIUM_PATH",
    "/data/data/com.termux/files/usr/bin/chromium-browser")
API_BASE = "https://sigotuhuella.online"


def get_groups(token, api):
    r = __import__("requests").get(f"{api}/api/facebook/scraper-groups", params={"token": token})
    if r.status_code != 200:
        print(f"[scraper] Error grupos: HTTP {r.status_code}")
        sys.exit(1)
    grupos = r.json()
    print(f"[scraper] Grupos activos: {len(grupos)}")
    return grupos


def check_pending(token, api):
    r = __import__("requests").get(f"{api}/api/facebook/pending-scrape", params={"token": token})
    if r.status_code != 200:
        print(f"[scraper] Error al consultar pending: HTTP {r.status_code}")
        return False
    data = r.json()
    return data.get("pending", False)


def mark_done(token, api):
    try:
        r = __import__("requests").post(f"{api}/api/facebook/scrape-done", params={"token": token})
        if r.status_code == 200:
            print("[scraper] Scrape marcado como completado")
        else:
            print(f"[scraper] Error al marcar done: HTTP {r.status_code}")
    except Exception as e:
        print(f"[scraper] Error al marcar done: {e}")


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


def scrape(token, api):
    grupos = get_groups(token, api)

    if not grupos:
        print("[scraper] No hay grupos")
        return

    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROMIUM,
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            viewport={"width": 1440, "height": 900}
        )
        page = context.new_page()

        for grupo in grupos:
            gid = grupo["id"]
            slug = urlparse(grupo["url"]).path.rstrip("/").split("/")[-1]
            name = grupo.get("name", gid)
            url = f"https://www.facebook.com/groups/{slug}/"

            print(f"[scraper] Scrapeando {name} ({slug})...")
            try:
                page.goto(url, wait_until="networkidle", timeout=60000)
                time.sleep(4)

                if "login" in page.url.lower() or "checkpoint" in page.url.lower():
                    print("  Redirige a login — saltando")
                    continue

                html = page.content()
                posts = extract_posts(html, gid, slug)
                print(f"  Posts: {len(posts)}")

                for post in posts:
                    r = __import__("requests").post(f"{api}/api/facebook/webhook",
                                     json={"posts": [post]},
                                     headers={"Authorization": f"Bearer {token}"})
                    if r.status_code == 200:
                        print(f"    OK {post['fb_post_id']}")
                    else:
                        print(f"    FAIL {post['fb_post_id']}: HTTP {r.status_code}")

                time.sleep(2)
            except Exception as e:
                print(f"  Error: {e}")

        browser.close()

    mark_done(token, api)
    print("[scraper] Scrapeo completado")


def main():
    parser = argparse.ArgumentParser(description="Scraper de Facebook Groups para SiHuella")
    parser.add_argument("--token", required=True, help="Token del scraper (fb_scraper_token)")
    parser.add_argument("--api", default=API_BASE, help=f"URL base de la API (default: {API_BASE})")
    parser.add_argument("--daemon", type=int, metavar="MIN", help="Modo daemon: ejecutar cada N minutos")
    args = parser.parse_args()

    token = args.token
    api = args.api.rstrip("/")

    if args.daemon:
        print(f"[scraper] Modo daemon: cada {args.daemon} minutos")
        while True:
            if check_pending(token, api):
                scrape(token, api)
            else:
                print("[scraper] No hay scrape pendiente, esperando...")
            time.sleep(args.daemon * 60)
    else:
        if not check_pending(token, api):
            print("[scraper] No hay scrape pendiente")
            return
        scrape(token, api)


if __name__ == "__main__":
    main()
