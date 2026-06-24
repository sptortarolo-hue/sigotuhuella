#!/usr/bin/env python3
"""
Scraper de Facebook Groups para SiHuella.
Usa Playwright (Chromium) para navegar como browser real.
Uso: python3 scraper.py --token TU_TOKEN
"""

import os, sys, re, json, time, argparse, base64
from urllib.parse import urlparse
import json as json_mod
import requests as api_req

CHROMIUM = os.environ.get("CHROMIUM_PATH",
    "/data/data/com.termux/files/usr/bin/chromium-browser")
API_BASE = "https://sigotuhuella.online"
COOKIES_FILE = "fb_cookies.json"


def download_cookies(token, api):
    r = api_req.get(f"{api}/api/facebook/session-file", params={"token": token})
    if r.status_code == 404:
        print("[scraper] No hay sesión guardada en el servidor")
        return None
    if r.status_code != 200:
        print(f"[scraper] Error cookies: HTTP {r.status_code}")
        return None
    raw = r.json()["data"]
    try:
        parsed = json_mod.loads(raw)
        cookies = parsed if isinstance(parsed, list) else (parsed.get("cookies") or [])
    except json_mod.JSONDecodeError:
        decoded = json_mod.loads(base64.b64decode(raw).decode("utf-8"))
        cookies = decoded if isinstance(decoded, list) else (decoded.get("cookies") or [])
    with open(COOKIES_FILE, "w") as f:
        json.dump(cookies, f)
    print(f"[scraper] {len(cookies)} cookies descargadas")
    return cookies


def get_groups(token, api):
    r = api_req.get(f"{api}/api/facebook/scraper-groups", params={"token": token})
    if r.status_code != 200:
        print(f"[scraper] Error grupos: HTTP {r.status_code}")
        sys.exit(1)
    grupos = r.json()
    print(f"[scraper] Grupos activos: {len(grupos)}")
    return grupos


def extract_posts(html, gid, slug):
    posts = []
    seen = set()
    # Find all div[role="article"] content
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
        # Content
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
        # Author
        author = ""
        for sel in [r'<h2[^>]*>.*?<a[^>]*>(.*?)</a>', r'<h3[^>]*>.*?<a[^>]*>(.*?)</a>', r'<strong[^>]*>.*?<a[^>]*>(.*?)</a>']:
            m = re.search(sel, art, re.DOTALL)
            if m:
                author = re.sub(r'<[^>]+>', '', m.group(1)).strip()
                break
        # Images
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True)
    parser.add_argument("--api", default=API_BASE)
    args = parser.parse_args()

    from playwright.sync_api import sync_playwright

    token = args.token
    api = args.api.rstrip("/")

    cookies = download_cookies(token, api)
    grupos = get_groups(token, api)

    if not grupos:
        print("[scraper] No hay grupos")
        return

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
        if cookies:
            pw_cookies = []
            for c in cookies:
                if isinstance(c, dict) and "name" in c and "value" in c:
                    pw_cookies.append({
                        "name": c["name"],
                        "value": c["value"],
                        "domain": c.get("domain", ".facebook.com"),
                        "path": c.get("path", "/"),
                        "httpOnly": c.get("httpOnly", False),
                        "secure": c.get("secure", True),
                    })
            context.add_cookies(pw_cookies)

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

                # Check session
                if "login" in page.url.lower() or "checkpoint" in page.url.lower():
                    print("  Sesión expirada — saltando")
                    continue

                html = page.content()
                posts = extract_posts(html, gid, slug)
                print(f"  Posts: {len(posts)}")

                for post in posts:
                    r = api_req.post(f"{api}/api/facebook/webhook",
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

    print("[scraper] Scrapeo completado")


if __name__ == "__main__":
    main()
