#!/usr/bin/env python3
"""
Scraper de Facebook Groups para SiHuella.
Usa tls_client con TLS fingerprint real de Chrome (sin browser).
Corre desde Termux usando la IP del celular (residencial).
No necesita cookies ni cuenta de Facebook.

Uso:
  python3 scraper.py --token TU_TOKEN
  python3 scraper.py --token TU_TOKEN --once
"""

import os, sys, re, json, time, argparse, subprocess
from urllib.parse import urlparse

import requests

try:
    import tls_client
    HAS_TLS_CLIENT = True
except ImportError:
    HAS_TLS_CLIENT = False

try:
    from curl_cffi import requests as cffi_requests
    HAS_CURL_CFFI = True
except ImportError:
    HAS_CURL_CFFI = False

API_BASE = "https://sigotuhuella.online"

MOBILE_UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Mobile Safari/537.36"
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


def fetch_html(url, debug=False):
    html = None

    if HAS_TLS_CLIENT:
        try:
            session = tls_client.Session(
                client_identifier="chrome_120",
                random_tls_extension_order=True
            )
            r = session.get(url, headers=HEADERS, timeout_seconds=30)
            html = r.text
            if debug:
                print(f"  [debug] tls_client OK ({len(html)} chars)")
        except Exception as e:
            if debug:
                print(f"  [debug] tls_client error: {e}")

    if not html and HAS_CURL_CFFI:
        try:
            r = cffi_requests.get(url, headers=HEADERS, impersonate="chrome", timeout=30)
            html = r.text
            if debug:
                print(f"  [debug] curl_cffi OK ({len(html)} chars)")
        except Exception as e:
            if debug:
                print(f"  [debug] curl_cffi error: {e}")

    if not html:
        try:
            r = requests.get(url, headers=HEADERS, timeout=30, allow_redirects=True)
            html = r.text
            if debug:
                print(f"  [debug] requests OK ({len(html)} chars)")
        except Exception as e:
            if debug:
                print(f"  [debug] requests error: {e}")

    if not html or len(html) < 100:
        if debug:
            print(f"  HTML vacio o muy corto ({len(html) if html else 0} chars)")
        return None

    if debug:
        debug_path = "/tmp/fb_debug.html"
        try:
            with open(debug_path, "w", encoding="utf-8") as f:
                f.write(html)
            print(f"  [debug] HTML guardado en {debug_path} ({len(html)} chars)")
        except Exception:
            pass

    return html


def debug_info(html):
    title = re.search(r'<title>(.*?)</title>', html, re.DOTALL)
    title_text = title.group(1).strip() if title else "NO TITLE"
    has_login = 'login' in html.lower()
    has_article = 'role="article"' in html
    has_post_link = '/posts/' in html or 'ftid=' in html
    has_serverjs = 'require("ServerJS")' in html or 'ServerJS' in html
    has_data_store = '"__bbox"' in html or '"require"' in html
    print(f"  [debug] Title: {title_text}")
    print(f"  [debug] Login: {has_login}, Article: {has_article}, Post links: {has_post_link}")
    print(f"  [debug] ServerJS: {has_serverjs}, DataStore: {has_data_store}")
    snippet = re.sub(r'<[^>]+>', ' ', html[:3000]).strip()[:500]
    print(f"  [debug] Preview: {snippet[:300]}...")


def extract_posts_from_json(html, gid, slug):
    posts = []
    seen = set()

    matches = re.findall(
        r'require\("ServerJS"\)\.handle\((.*?)\);\s*</script>',
        html, re.DOTALL
    )
    if not matches:
        matches = re.findall(
            r'"require"\s*:\s*\[\[.*?"__bbox"\s*:\s*(\{.*?\})\s*\]',
            html, re.DOTALL
        )

    for match in matches:
        try:
            data = json.loads(match)
        except (json.JSONDecodeError, ValueError):
            continue

        text = json.dumps(data)

        pids = re.findall(r'/posts/(\d+)', text)
        for pid in pids:
            if pid in seen or len(pid) < 10:
                continue
            seen.add(pid)

            post_data = None
            for key_match in re.finditer(r'"' + pid + r'"\s*:\s*(\{[^}]*"message"\s*:\s*"[^"]*"[^}]*\})', text):
                try:
                    post_data = json.loads(key_match.group(1))
                except (json.JSONDecodeError, ValueError):
                    pass

            content = ""
            if post_data:
                content = post_data.get("message", "")
            if not content:
                msg_match = re.search(r'"message"\s*:\s*"([^"]{15,})"', text)
                if msg_match:
                    content = msg_match.group(1)
                    try:
                        content = content.encode().decode('unicode_escape', errors='replace')
                    except Exception:
                        pass

            author = ""
            for author_match in re.finditer(r'"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"', text):
                author = author_match.group(1)
                break
            if not author:
                author_match = re.search(r'"name"\s*:\s*"([^"]{3,50})"[^}]*"id"\s*:\s*"' + re.escape(gid), text)
                if author_match:
                    author = author_match.group(1)

            images = re.findall(r'"image"\s*:\s*\{[^}]*"uri"\s*:\s*"([^"]*(?:scontent|fbcdn)[^"]*)"', text)
            if not images:
                images = re.findall(r'"uri"\s*:\s*"([^"]*(?:scontent|fbcdn)[^"]*)"', text)

            posts.append({
                "fb_post_id": pid,
                "group_id": gid,
                "author_name": author,
                "content": content[:10000] if content else "",
                "image_urls": images[:5],
                "fb_post_url": f"https://www.facebook.com/groups/{slug}/posts/{pid}/",
            })

    return posts


def extract_posts_from_links(html, gid, slug):
    posts = []
    seen = set()

    patterns = [
        rf'href="[^"]*facebook\.com/groups/{re.escape(slug)}/posts/(\d+)[^"]*"',
        rf'href="/groups/{re.escape(slug)}/posts/(\d+)[^"]*"',
        r'href="[^"]*"/posts/(\d+)',
        r'ftid=(\d+)',
    ]

    all_pids = []
    for pat in patterns:
        all_pids.extend(re.findall(pat, html))

    blocks = re.split(r'(?=href="[^"]*(?:/posts/|ftid=))', html)

    for pid in all_pids:
        if pid in seen or len(pid) < 10:
            continue
        seen.add(pid)

        block = ""
        for b in blocks:
            if pid in b:
                block = b[:5000]
                break

        content = ""
        if block:
            texts = re.findall(r'>([^<]{15,})<', block)
            cleaned = []
            for t in texts:
                t = t.strip()
                t = re.sub(r'\d+\s*[hmHM]\s*·', '', t)
                t = re.sub(r'(?i)See more|Ver m[aá]s|Mostrar m[aá]s', '', t)
                t = t.strip()
                if len(t) > 15 and not t.startswith('{') and not t.startswith('"'):
                    cleaned.append(t)
            content = "\n".join(cleaned[:3])

        author = ""
        if block:
            for pat in [
                r'<strong[^>]*>\s*<a[^>]*>([^<]+)</a>\s*</strong>',
                r'<h3[^>]*>\s*<a[^>]*>([^<]+)</a>',
                r'"name"\s*:\s*"([^"]{3,50})"',
            ]:
                m = re.search(pat, block, re.DOTALL)
                if m:
                    author = m.group(1).strip()
                    break

        images = []
        if block:
            images = re.findall(r'src="([^"]*(?:scontent|fbcdn)[^"]*)"', block)

        posts.append({
            "fb_post_id": pid,
            "group_id": gid,
            "author_name": author,
            "content": content[:10000],
            "image_urls": images[:5],
            "fb_post_url": f"https://www.facebook.com/groups/{slug}/posts/{pid}/",
        })

    return posts


def extract_posts(html, gid, slug):
    posts = extract_posts_from_json(html, gid, slug)
    if posts:
        print(f"  JSON: {len(posts)} posts")
        return posts

    posts = extract_posts_from_links(html, gid, slug)
    if posts:
        print(f"  Links: {len(posts)} posts")
        return posts

    seen = set()
    article_blocks = re.findall(
        r'<div[^>]*role="article"[^>]*>(.*?)</div>\s*(?=<div[^>]*role="|$)',
        html, re.DOTALL
    )

    for block in article_blocks:
        ids = re.findall(r'/posts/(\d+)', block)
        if not ids:
            ids = re.findall(r'ftid=(\d+)', block)
        if not ids:
            continue
        pid = ids[0]
        if pid in seen or len(pid) < 10:
            continue
        seen.add(pid)

        content = ""
        msg = re.search(r'<div[^>]*>([^<]{15,})</div>', block, re.DOTALL)
        if msg:
            raw = msg.group(1).strip()
            raw = re.sub(r'<[^>]+>', '', raw)
            raw = re.sub(r'\d+\s*[hmHM]\s*·', '', raw)
            raw = re.sub(r'(?i)See more|Ver m[aá]s|Mostrar m[aá]s', '', raw)
            raw = raw.strip()
            if len(raw) > 15:
                content = raw[:10000]

        author = ""
        for pat in [
            r'<strong[^>]*>\s*<a[^>]*>([^<]+)</a>\s*</strong>',
            r'<h3[^>]*>\s*<a[^>]*>([^<]+)</a>',
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

    if posts:
        print(f"  HTML: {len(posts)} posts")
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


def scrape(token, api, debug=False):
    grupos = get_groups(token, api)
    if not grupos:
        print("[scraper] No hay grupos")
        return

    for grupo in grupos:
        gid = grupo["id"]
        slug = urlparse(grupo["url"]).path.rstrip("/").split("/")[-1]
        name = grupo.get("name", gid)

        urls_to_try = [
            f"https://www.facebook.com/groups/{slug}/",
            f"https://m.facebook.com/groups/{slug}/",
            f"https://mbasic.facebook.com/groups/{slug}/",
        ]

        print(f"[scraper] Scrapeando {name} ({slug})...")
        group_ok = False
        for url in urls_to_try:
            print(f"  Probando {url}...")
            html = fetch_html(url, debug=debug)
            if html is None:
                continue
            if debug:
                debug_info(html)

            lower = html.lower()
            if 'facebook is not available' in lower:
                print("  Bloqueado: 'not available on this browser'")
                continue
            if 'log in or sign up' in lower or ('please log in' in lower):
                print("  Redirige a login")
                continue

            posts = extract_posts(html, gid, slug)
            print(f"  Posts: {len(posts)}")
            if posts:
                send_posts(posts, token, api)
                group_ok = True
                break

        if not group_ok:
            print(f"  No se pudieron extraer posts de {name}")

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
    parser.add_argument("--debug", action="store_true", help="Guardar HTML debug en /tmp/fb_debug.html")
    parser.add_argument("--daemon", type=int, nargs="?", const=30, metavar="MIN",
                        help="Modo daemon (default: cada 30 min). P.ej: --daemon 10")
    parser.add_argument("--once", action="store_true", help="Ejecutar una sola vez (no daemon)")
    args = parser.parse_args()

    if not HAS_TLS_CLIENT and not HAS_CURL_CFFI:
        print("[scraper] Instalar tls_client O curl_cffi:")
        print("  pip install tls_client")
        print("  pip install curl_cffi")
        sys.exit(1)

    lib = "tls_client" if HAS_TLS_CLIENT else "curl_cffi"
    print(f"[scraper] HTTP library: {lib}")

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
