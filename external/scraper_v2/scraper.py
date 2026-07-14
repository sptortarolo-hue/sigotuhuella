#!/usr/bin/env python3
"""
Scraper de Facebook Groups para SiHuella.
Usa chromium headless para fetch mbasic.facebook.com.
Corre desde Termux usando la IP del celular (residencial).
No necesita cookies ni cuenta de Facebook.

Uso:
  python3 scraper.py --token TU_TOKEN
  python3 scraper.py --token TU_TOKEN --once
"""

import os, sys, re, json, time, argparse, subprocess, shutil
from urllib.parse import urlparse

import requests

API_BASE = "https://sigotuhuella.online"

MOBILE_UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Mobile Safari/537.36"
)

TERMUX_PATHS = [
    "/data/data/com.termux/files/usr/bin/chromium",
    "/data/data/com.termux/files/usr/bin/chromium-browser",
]


def find_chromium(manual_path=None):
    if manual_path:
        if os.path.isfile(manual_path):
            return manual_path
        print(f"[scraper] --chromium-path no encontrado: {manual_path}")
        sys.exit(1)
    found = shutil.which("chromium")
    if found:
        return found
    found = shutil.which("chromium-browser")
    if found:
        return found
    for p in TERMUX_PATHS:
        if os.path.isfile(p):
            return p
    print("[scraper] No se encontro chromium. Instalarlo con:")
    print("  pkg install x11-repo && pkg install chromium")
    print("O especificar path: --chromium-path /ruta/a/chromium")
    sys.exit(1)


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

    post_blocks = re.findall(
        r'<div[^>]*role="article"[^>]*>(.*?)</div>\s*(?=<div[^>]*role="|$)',
        html, re.DOTALL
    )
    if not post_blocks:
        post_blocks = re.findall(
            r'<div[^>]*id="structured_composer_async_container"[^>]*>.*?</div>\s*(.*?)\s*(?=<div[^>]*id="structured_composer_async_container"|<div[^>]*role="complementary"|<form|$)',
            html, re.DOTALL
        )
    if not post_blocks:
        post_blocks = re.findall(
            r'href="[^"]*posts/(\d+)[^"]*".*?(?=href="[^"]*posts/\d+|$)',
            html, re.DOTALL
        )
        post_blocks = [b for b in post_blocks if isinstance(b, str) and len(b) > 50]

    if not post_blocks:
        post_blocks = re.findall(
            r'(<div[^>]*>\s*<[^>]*>\s*<a[^>]*>[^<]+</a>[^<]*<span[^>]*>[^<]*</span>.*?(?:<img[^>]*>|<div[^>]*>.*?</div>).*?</div>)',
            html, re.DOTALL
        )

    for block in post_blocks:
        ids = re.findall(r'/posts/(\d+)', block)
        if not ids:
            ids = re.findall(r'ftid=(\d+)', block)
        if not ids:
            continue
        pid = ids[0]
        if pid in seen:
            continue
        seen.add(pid)

        content = ""
        msg = re.search(r'<div[^>]*>([^<]{15,})</div>', block, re.DOTALL)
        if msg:
            raw = msg.group(1).strip()
            raw = re.sub(r'<[^>]+>', '', raw)
            raw = re.sub(r'\d+\s*[hmHM]\s*·\s*', '', raw)
            raw = re.sub(r'(?i)See more|Ver m[aá]s|Mostrar m[aá]s', '', raw)
            raw = raw.strip()
            if len(raw) > 15:
                content = raw[:10000]

        if not content:
            all_text = re.findall(r'>([^<]{15,})<', block)
            parts = []
            for t in all_text:
                t = t.strip()
                t = re.sub(r'\d+\s*[hmHM]\s*·\s*', '', t)
                t = re.sub(r'(?i)See more|Ver m[aá]s|Mostrar m[aá]s', '', t)
                t = t.strip()
                if len(t) > 15:
                    parts.append(t)
            if parts:
                content = "\n".join(parts[:3])

        author = ""
        for pat in [
            r'<strong[^>]*>\s*<a[^>]*>([^<]+)</a>\s*</strong>',
            r'<h3[^>]*>\s*<a[^>]*>([^<]+)</a>',
            r'<a[^>]*href="[^"]*"[^>]*><strong>([^<]+)</strong>',
        ]:
            m = re.search(pat, block, re.DOTALL)
            if m:
                author = m.group(1).strip()
                break

        images = re.findall(r'<img[^>]+src="([^"]*(?:scontent|fbcdn)[^"]*)"', block)

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


def fetch_html(url, chromium_path, debug=False):
    cmd = [
        chromium_path,
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        f"--user-agent={MOBILE_UA}",
        "--dump-dom",
        url,
    ]
    if shutil.which("xvfb-run"):
        cmd = ["xvfb-run", "-a"] + cmd
    else:
        cmd = ["--headless=new", "--disable-gpu"] + cmd
    result = subprocess.run(cmd, capture_output=True, timeout=90)
    result.check_returncode()
    html = result.stdout.decode("utf-8", errors="replace")
    if debug:
        debug_path = "/tmp/fb_debug.html"
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  [debug] HTML guardado en {debug_path} ({len(html)} chars)")
    if not html or len(html) < 100:
        print(f"  HTML vacio o muy corto ({len(html)} chars)")
        return None
    return html


def debug_info(html):
    title = re.search(r'<title>(.*?)</title>', html, re.DOTALL)
    title_text = title.group(1).strip() if title else "NO TITLE"
    has_login = 'login' in html.lower()
    has_article = 'role="article"' in html
    has_post_link = '/posts/' in html or 'ftid=' in html
    print(f"  [debug] Title: {title_text}")
    print(f"  [debug] Has login: {has_login}, Has article: {has_article}, Has post links: {has_post_link}")
    snippet = re.sub(r'<[^>]+>', ' ', html[:3000]).strip()[:500]
    print(f"  [debug] Preview: {snippet[:300]}...")


def scrape(token, api, chromium_path, debug=False):
    grupos = get_groups(token, api)
    if not grupos:
        print("[scraper] No hay grupos")
        return

    grupo = grupos[0]
    gid = grupo["id"]
    slug = urlparse(grupo["url"]).path.rstrip("/").split("/")[-1]
    name = grupo.get("name", gid)

    urls_to_try = [
        f"https://www.facebook.com/groups/{slug}/",
        f"https://m.facebook.com/groups/{slug}/",
        f"https://mbasic.facebook.com/groups/{slug}/",
    ]

    for url in urls_to_try:
        print(f"[scraper] Probando {url}...")
        try:
            html = fetch_html(url, chromium_path, debug=debug)
            if html is None:
                continue
            if debug:
                debug_info(html)
            lower = html.lower()
            if 'facebook is not available' in lower:
                print("  Bloqueado: 'not available on this browser'")
                continue
            if 'log in or sign up' in lower or ('login' in lower and '/login/' in lower):
                print("  Redirige a login")
                continue
            posts = extract_posts(html, gid, slug)
            print(f"  Posts: {len(posts)}")
            if posts:
                send_posts(posts, token, api)
                for remaining in grupos[1:]:
                    rslug = urlparse(remaining["url"]).path.rstrip("/").split("/")[-1]
                    rid = remaining["id"]
                    rname = remaining.get("name", rid)
                    rurl = f"https://www.facebook.com/groups/{rslug}/"
                    print(f"[scraper] Scrapeando {rname} ({rslug})...")
                    try:
                        rhtml = fetch_html(rurl, chromium_path)
                        if rhtml is None:
                            continue
                        rposts = extract_posts(rhtml, rid, rslug)
                        print(f"  Posts: {len(rposts)}")
                        send_posts(rposts, token, api)
                    except Exception as e:
                        print(f"  Error en {rname}: {e}")
                mark_done(token, api)
                print("[scraper] Scrapeo completado")
                return
        except Exception as e:
            print(f"  Error: {e}")

    print("[scraper] Ninguna URL funcionó. Usar --debug para inspeccionar HTML")

    mark_done(token, api)
    print("[scraper] Scrapeo completado")


def acquire_wakelock():
    try:
        subprocess.run(["termux-wake-lock"], capture_output=True, timeout=5)
        print("[scraper] Wake lock adquirido")
    except Exception:
        pass


def release_wakelock():
    try:
        subprocess.run(["termux-wake-unlock"], capture_output=True, timeout=5)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="Scraper de Facebook Groups para SiHuella")
    parser.add_argument("--token", required=True, help="Token del scraper (fb_scraper_token)")
    parser.add_argument("--api", default=API_BASE)
    parser.add_argument("--chromium-path", default=None, help="Path manual a chromium")
    parser.add_argument("--debug", action="store_true", help="Guardar HTML debug en /tmp/fb_debug.html")
    parser.add_argument("--daemon", type=int, nargs="?", const=30, metavar="MIN",
                        help="Modo daemon (default: cada 30 min). P.ej: --daemon 10")
    parser.add_argument("--once", action="store_true", help="Ejecutar una sola vez (no daemon)")
    args = parser.parse_args()

    token = args.token
    api = args.api.rstrip("/")
    chromium_path = find_chromium(args.chromium_path)
    print(f"[scraper] Chromium: {chromium_path}")
    acquire_wakelock()

    if args.once:
        if not check_pending(token, api):
            print("[scraper] No hay scrape pendiente")
            release_wakelock()
            return
        scrape(token, api, chromium_path, debug=args.debug)
        release_wakelock()
        return

    interval = args.daemon or 30
    print(f"[scraper] Modo daemon: cada {interval} minutos")
    while True:
        try:
            if check_pending(token, api):
                scrape(token, api, chromium_path, debug=args.debug)
            else:
                print("[scraper] No hay scrape pendiente, esperando...")
        except Exception as e:
            print(f"[scraper] Error en ciclo: {e}")
        time.sleep(interval * 60)


if __name__ == "__main__":
    main()
