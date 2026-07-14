#!/usr/bin/env python3
"""
Scraper de Facebook Groups para SiHuella.
Usa tls_client con TLS fingerprint real de Chrome (sin browser).
Corre desde Termux (dentro de proot-distro Ubuntu) usando la IP del celular.
No necesita cookies ni cuenta de Facebook.

Setup:
  1. En Termux:     pkg install proot-distro
  2. En Termux:     proot-distro install ubuntu
  3. Login Ubuntu:   proot-distro login ubuntu
  4. En Ubuntu:      pip install tls_client requests
  5. Descargar:      curl -o scraper.py "https://sigotuhuella.online/api/facebook/scraper-script?token=TU_TOKEN"
  6. Ejecutar:       python3 scraper.py --token TU_TOKEN --once --debug

Uso:
  python3 scraper.py --token TU_TOKEN
  python3 scraper.py --token TU_TOKEN --once
  python3 scraper.py --token TU_TOKEN --daemon 30
"""

import os, sys, re, json, time, argparse, subprocess
from urllib.parse import urlparse

import requests
import tls_client

API_BASE = "https://sigotuhuella.online"

MOBILE_UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Mobile Safari/537.36"
)

HEADERS = {
    "User-Agent": MOBILE_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}


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


def make_session():
    return tls_client.Session(
        client_identifier="chrome_120",
        random_tls_extension_order=True
    )


def fetch_html(url, session, debug=False):
    try:
        r = session.get(url, headers=HEADERS, timeout_seconds=30)
        html = r.text
        if debug:
            print(f"  [debug] fetch OK: {len(html)} chars, status: {r.status_code}")
        if not html or len(html) < 100:
            print(f"  HTML vacio o muy corto ({len(html) if html else 0} chars)")
            return None
        if debug:
            debug_path = "/tmp/fb_debug.html"
            try:
                with open(debug_path, "w", encoding="utf-8") as f:
                    f.write(html)
                print(f"  [debug] HTML guardado en {debug_path}")
            except Exception:
                pass
        return html
    except Exception as e:
        print(f"  Error fetch: {e}")
        return None


def debug_info(html):
    title = re.search(r'<title>(.*?)</title>', html, re.DOTALL)
    title_text = title.group(1).strip() if title else "NO TITLE"
    lower = html.lower()
    has_login = 'login' in lower or 'log in' in lower
    has_article = 'role="article"' in html
    has_post_link = '/posts/' in html
    has_serverjs = 'ServerJS' in html
    has_composer = 'structured_composer_async_container' in html
    print(f"  [debug] Title: {title_text}")
    print(f"  [debug] Login: {has_login}, Article: {has_article}, Posts: {has_post_link}")
    print(f"  [debug] ServerJS: {has_serverjs}, Composer: {has_composer}")
    snippet = re.sub(r'<[^>]+>', ' ', html[:2000]).strip()
    print(f"  [debug] Preview: {snippet[:400]}")


def extract_post_ids(html, slug):
    pids = set()
    patterns = [
        rf'/groups/{re.escape(slug)}/posts/(\d+)',
        rf'groups/{re.escape(slug)}/permalink/(\d+)',
        r'"/posts/(\d+)',
        r'permalink\.php\?story_fbid=(\d+)',
    ]
    for pat in patterns:
        for m in re.finditer(pat, html):
            pid = m.group(1)
            if len(pid) > 10:
                pids.add(pid)
    return list(pids)


def extract_post_content(html, pid):
    content = ""

    m = re.search(r'"message"\s*:\s*("(?:[^"\\]|\\.)*")', html)
    if m:
        try:
            raw = json.loads(m.group(1))
            if isinstance(raw, str) and len(raw) > 10:
                content = raw
        except (json.JSONDecodeError, ValueError):
            pass

    if not content:
        for pat in [
            r'<div[^>]*data-ad-preview="message"[^>]*>(.*?)</div>',
            r'<div[^>]*class="[^"]*xdj266r[^"]*"[^>]*>(.*?)</div>',
            r'<div[^>]*data-testid="[^"]*post_message[^"]*"[^>]*>(.*?)</div>',
        ]:
            m = re.search(pat, html, re.DOTALL)
            if m:
                raw = m.group(1).strip()
                raw = re.sub(r'<[^>]+>', ' ', raw)
                raw = re.sub(r'\s+', ' ', raw).strip()
                raw = re.sub(r'\d+\s*[hmHM]\s*·.*$', '', raw)
                raw = re.sub(r'(?i)See more|Ver m[aá]s|Mostrar m[aá]s', '', raw)
                raw = raw.strip()
                if len(raw) > 10:
                    content = raw
                    break

    if not content:
        texts = re.findall(r'>([^<]{20,})<', html)
        cleaned = []
        for t in texts:
            t = t.strip()
            if (len(t) > 20 and
                not t.startswith('{') and
                not t.startswith('"') and
                'facebook' not in t.lower() and
                'sign up' not in t.lower() and
                'cookie' not in t.lower() and
                'javascript' not in t.lower()):
                cleaned.append(t)
        if cleaned:
            content = "\n".join(cleaned[:3])

    author = ""
    for pat in [
        r'"name"\s*:\s*"([^"]{2,50})"',
        r'<strong[^>]*>\s*<a[^>]*>([^<]+)</a>\s*</strong>',
        r'<h3[^>]*>\s*<a[^>]*>([^<]+)</a>',
    ]:
        m = re.search(pat, html)
        if m:
            name = m.group(1).strip()
            if len(name) > 2 and name.lower() not in ['facebook', 'see more', 'log in']:
                author = name
                break

    images = re.findall(r'src="([^"]*(?:scontent|fbcdn)[^"]*)"', html)

    return {
        "content": content[:10000] if content else "",
        "author": author,
        "images": images[:5],
    }


def scrape_group(group, session, token, api, debug=False):
    gid = group["id"]
    slug = urlparse(group["url"]).path.rstrip("/").split("/")[-1]
    name = group.get("name", gid)

    urls_to_try = [
        f"https://www.facebook.com/groups/{slug}/",
        f"https://m.facebook.com/groups/{slug}/",
    ]

    print(f"[scraper] Scrapeando {name} ({slug})...")
    all_pids = set()

    for url in urls_to_try:
        print(f"  Probando {url}...")
        html = fetch_html(url, session, debug=debug)
        if html is None:
            continue
        if debug:
            debug_info(html)

        lower = html.lower()
        if 'facebook is not available' in lower:
            print("  Bloqueado: 'not available'")
            continue
        if 'log in or sign up' in lower or 'please log in' in lower:
            print("  Redirige a login")
            continue

        pids = extract_post_ids(html, slug)
        print(f"  Post IDs encontrados: {len(pids)}")
        if pids:
            all_pids.update(pids)
            break

    if not all_pids:
        print(f"  No se encontraron posts en feed de {name}")
        return []

    all_pids = list(all_pids)[:10]
    print(f"  Fetching {len(all_pids)} posts individuales...")

    posts = []
    for pid in all_pids:
        post_url = f"https://www.facebook.com/groups/{slug}/posts/{pid}/"
        html = fetch_html(post_url, session, debug=False)
        if html:
            data = extract_post_content(html, pid)
            if data["content"] or data["author"]:
                posts.append({
                    "fb_post_id": pid,
                    "group_id": gid,
                    "author_name": data["author"],
                    "content": data["content"],
                    "image_urls": data["images"],
                    "fb_post_url": post_url,
                })
                preview = data["content"][:80].replace("\n", " ")
                print(f"    -> {data['author']}: {preview}...")
            else:
                print(f"    -> {pid}: sin contenido")
        time.sleep(0.5)

    return posts


def send_posts(posts, token, api):
    sent = 0
    for post in posts:
        try:
            r = requests.post(f"{api}/api/facebook/webhook",
                              json={"posts": [post]},
                              headers={"Authorization": f"Bearer {token}"},
                              timeout=30)
            if r.status_code == 200:
                print(f"  OK {post['fb_post_id']}")
                sent += 1
            else:
                print(f"  FAIL {post['fb_post_id']}: HTTP {r.status_code}")
        except Exception as e:
            print(f"  FAIL {post['fb_post_id']}: {e}")
    return sent


def scrape(token, api, debug=False):
    grupos = get_groups(token, api)
    if not grupos:
        print("[scraper] No hay grupos")
        return

    session = make_session()
    total_sent = 0

    for group in grupos:
        posts = scrape_group(group, session, token, api, debug=debug)
        if posts:
            sent = send_posts(posts, token, api)
            total_sent += sent
            print(f"  {sent}/{len(posts)} posts enviados")

    mark_done(token, api)
    print(f"[scraper] Completado. Total enviados: {total_sent}")


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
    parser.add_argument("--debug", action="store_true", help="Debug output + guardar HTML")
    parser.add_argument("--daemon", type=int, nargs="?", const=30, metavar="MIN",
                        help="Modo daemon (default: cada 30 min)")
    parser.add_argument("--once", action="store_true", help="Ejecutar una sola vez")
    args = parser.parse_args()

    token = args.token
    api = args.api.rstrip("/")
    acquire_wakelock()

    if args.once:
        if not check_pending(token, api):
            print("[scraper] No hay scrape pendiente")
            release_wakelock()
            return
        scrape(token, api, debug=args.debug)
        release_wakelock()
        return

    interval = args.daemon or 30
    print(f"[scraper] Modo daemon: cada {interval} minutos")
    while True:
        try:
            if check_pending(token, api):
                scrape(token, api, debug=args.debug)
            else:
                print("[scraper] No hay scrape pendiente, esperando...")
        except Exception as e:
            print(f"[scraper] Error en ciclo: {e}")
        time.sleep(interval * 60)


if __name__ == "__main__":
    main()
