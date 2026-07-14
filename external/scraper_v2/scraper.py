#!/usr/bin/env python3
"""
Scraper de Facebook Groups para SiHuella.
Usa curl del sistema para fetch (evita problemas de TLS fingerprinting).
Corre desde Termux (dentro de proot-distro Ubuntu) o directamente en Ubuntu.

Setup (Termux):
  1. pkg install proot-distro
  2. proot-distro install ubuntu
  3. proot-distro login ubuntu
  4. apt update && apt install -y python3 python3-pip curl
  5. pip3 install requests
  6. curl -o /root/scraper.py "https://sigotuhuella.online/api/facebook/scraper-script?token=sihuella"
  7. python3 /root/scraper.py --token sihuella --once --debug
"""

import os, sys, re, json, time, argparse, subprocess, html as html_mod
from urllib.parse import urlparse

import requests

API_BASE = "https://sigotuhuella.online"

MOBILE_UA = (
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.6099.230 Mobile Safari/537.36"
)

HEADERS_FB = [
    "-H", f"User-Agent: {MOBILE_UA}",
    "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H", "Accept-Language: es-419,es;q=0.9,en;q=0.5",
    "-H", "Accept-Encoding: gzip, deflate",
    "-H", "Sec-Fetch-Dest: document",
    "-H", "Sec-Fetch-Mode: navigate",
    "-H", "Sec-Fetch-Site: none",
    "-H", "Sec-Fetch-User: ?1",
    "-H", "Upgrade-Insecure-Requests: 1",
]


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


def curl_fetch(url, debug=False):
    cmd = ["curl", "-s", "-L", "--max-time", "30", "--compressed"] + HEADERS_FB + [url]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=40)
        html = result.stdout.decode("utf-8", errors="replace")
        if debug:
            print(f"  [curl] {len(html)} bytes from {url}")
        if not html or len(html) < 100:
            return None
        if debug:
            debug_path = "/tmp/fb_debug.html"
            try:
                with open(debug_path, "w", encoding="utf-8") as f:
                    f.write(html)
                print(f"  [debug] Guardado en {debug_path}")
            except Exception:
                pass
        return html
    except Exception as e:
        print(f"  [curl] Error: {e}")
        return None


def debug_info(html):
    title = re.search(r'<title>(.*?)</title>', html, re.DOTALL)
    title_text = title.group(1).strip() if title else "NO TITLE"
    lower = html.lower()
    has_login = 'log in' in lower or 'iniciar sesión' in lower
    has_not_avail = 'not available' in lower or 'no está disponible' in lower
    has_article = 'role="article"' in html
    has_post_link = '/posts/' in html or 'ftid=' in html
    has_stories = 'story' in lower
    print(f"  [debug] Title: {title_text}")
    print(f"  [debug] Login: {has_login}, NotAvailable: {has_not_avail}")
    print(f"  [debug] Article: {has_article}, Posts: {has_post_link}, Stories: {has_stories}")
    snippet = re.sub(r'<[^>]+>', ' ', html[:3000]).strip()
    print(f"  [debug] Preview: {snippet[:400]}")


def extract_post_ids(html, slug):
    pids = set()
    patterns = [
        rf'/groups/{re.escape(slug)}/posts/(\d+)',
        rf'groups/{re.escape(slug)}/permalink/(\d+)',
        r'/posts/(\d+)',
        r'ftid=(\d+)',
        r'story_fbid=(\d+)',
    ]
    for pat in patterns:
        for m in re.finditer(pat, html):
            pid = m.group(1)
            if len(pid) >= 10:
                pids.add(pid)
    return list(pids)


def decode_fb_text(text):
    text = html_mod.unescape(text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r'\d+\s*[hmHM]\s*·.*$', '', text)
    text = re.sub(r'(?i)See more|Ver m[aá]s|Mostrar m[aá]s|Ver menos', '', text)
    return text.strip()


def extract_post_content(html, pid):
    content = ""

    m = re.search(r'"message"\s*:\s*("(?:[^"\\]|\\.)*")', html)
    if m:
        try:
            raw = json.loads(m.group(1))
            if isinstance(raw, str) and len(raw) > 10:
                content = decode_fb_text(raw)
        except (json.JSONDecodeError, ValueError):
            pass

    if not content:
        for pat in [
            r'"text"\s*:\s*("(?:[^"\\]|\\.)*")',
            r'data-ad-preview="message"[^>]*>(.*?)</div>',
        ]:
            m = re.search(pat, html, re.DOTALL)
            if m:
                raw = m.group(1)
                if raw.startswith('"'):
                    try:
                        raw = json.loads(raw)
                    except (json.JSONDecodeError, ValueError):
                        raw = raw.strip('"')
                if isinstance(raw, str):
                    decoded = decode_fb_text(raw)
                    if len(decoded) > 10:
                        content = decoded
                        break

    if not content:
        blocks = re.split(r'<div[^>]*>', html)
        candidates = []
        for block in blocks:
            text = decode_fb_text(block)
            if (len(text) > 30 and
                not text.startswith('{') and
                not text.startswith('"') and
                not text.startswith('http') and
                'facebook' not in text.lower() and
                'cookie' not in text.lower() and
                'sign up' not in text.lower() and
                'javascript' not in text.lower()):
                candidates.append(text)
        if candidates:
            content = "\n".join(candidates[:3])

    author = ""
    for pat in [
        r'"name"\s*:\s*"([^"]{2,60})"',
        r'<strong[^>]*>\s*<a[^>]*href="[^"]*"[^>]*>([^<]+)</a>',
        r'<h3[^>]*>\s*<a[^>]*>([^<]+)</a>',
    ]:
        m = re.search(pat, html)
        if m:
            name = m.group(1).strip()
            skip_words = ['facebook', 'see more', 'log in', 'sign up', 'cookie', 'meta']
            if len(name) > 2 and not any(w in name.lower() for w in skip_words):
                author = name
                break

    images = re.findall(r'src="([^"]*(?:scontent|fbcdn)[^"]*)"', html)

    return {
        "content": content[:10000] if content else "",
        "author": author,
        "images": images[:5],
    }


def scrape_group(group, token, api, debug=False):
    gid = group["id"]
    slug = urlparse(group["url"]).path.rstrip("/").split("/")[-1]
    name = group.get("name", gid)

    urls_to_try = [
        f"https://m.facebook.com/groups/{slug}/",
        f"https://www.facebook.com/groups/{slug}/",
    ]

    print(f"[scraper] Scrapeando {name} ({slug})...")
    all_pids = set()

    for url in urls_to_try:
        print(f"  Probando {url}...")
        html = curl_fetch(url, debug=debug)
        if html is None:
            continue
        if debug:
            debug_info(html)

        lower = html.lower()
        if 'not available' in lower and 'browser' in lower:
            print("  Bloqueado: 'not available'")
            continue
        if 'log in or sign up' in lower:
            print("  Login requerido")
            continue

        pids = extract_post_ids(html, slug)
        print(f"  Post IDs: {len(pids)}")
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
        post_url = f"https://m.facebook.com/groups/{slug}/posts/{pid}/"
        html = curl_fetch(post_url, debug=False)
        if html:
            data = extract_post_content(html, pid)
            if data["content"] or data["author"]:
                posts.append({
                    "fb_post_id": pid,
                    "group_id": gid,
                    "author_name": data["author"],
                    "content": data["content"],
                    "image_urls": data["images"],
                    "fb_post_url": f"https://www.facebook.com/groups/{slug}/posts/{pid}/",
                })
                preview = data["content"][:80].replace("\n", " ")
                print(f"    -> {data['author']}: {preview}...")
            else:
                if debug:
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

    total_sent = 0
    for group in grupos:
        posts = scrape_group(group, token, api, debug=debug)
        if posts:
            sent = send_posts(posts, token, api)
            total_sent += sent
            print(f"  {sent}/{len(posts)} posts enviados")

    mark_done(token, api)
    print(f"[scraper] Completado. Total: {total_sent} posts")


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
    parser.add_argument("--token", required=True, help="Token del scraper")
    parser.add_argument("--api", default=API_BASE)
    parser.add_argument("--debug", action="store_true", help="Debug output")
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
