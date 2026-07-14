#!/usr/bin/env python3
"""
Scraper de Facebook Groups para SiHuella.
Usa Google Search para descubrir posts recientes, luego fetch cada URL individual.
No necesita browser ni TLS fingerprinting.
Corre desde Termux usando la IP del celular (residencial).

Uso:
  python3 scraper.py --token TU_TOKEN
  python3 scraper.py --token TU_TOKEN --once
"""

import os, sys, re, json, time, argparse, subprocess
from urllib.parse import urlparse, quote_plus, unquote

import requests

API_BASE = "https://sigotuhuella.online"

MOBILE_UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Mobile Safari/537.36"
)

HEADERS = {
    "User-Agent": MOBILE_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
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


def discover_posts_via_google(slug, debug=False):
    post_urls = []
    seen = set()

    queries = [
        f"site:facebook.com/groups/{slug}/posts",
        f'site:facebook.com/groups/{slug} "public"',
        f"facebook.com/groups/{slug}/posts",
    ]

    for q in queries:
        search_url = f"https://www.google.com/search?q={quote_plus(q)}&num=20&tbs=qdr:w"
        if debug:
            print(f"  [debug] Google: {q}")

        try:
            r = requests.get(search_url, headers=HEADERS, timeout=20)
            html = r.text

            urls = re.findall(
                r'https?://(?:www\.|m\.)?facebook\.com/groups/' + re.escape(slug) + r'/posts/(\d+)',
                html
            )

            for pid in urls:
                if pid not in seen:
                    seen.add(pid)
                    post_urls.append(pid)

            urls2 = re.findall(
                r'facebook\.com/groups/' + re.escape(slug) + r'/posts/(\d+)',
                html
            )
            for pid in urls2:
                if pid not in seen:
                    seen.add(pid)
                    post_urls.append(pid)

            if debug:
                print(f"  [debug] Google results: {len(post_urls)} post IDs")

        except Exception as e:
            if debug:
                print(f"  [debug] Google error: {e}")

        time.sleep(1)

    return post_urls


def discover_posts_via_bing(slug, debug=False):
    post_urls = []
    seen = set()

    queries = [
        f"site:facebook.com/groups/{slug}/posts",
        f"facebook.com/groups/{slug}/posts",
    ]

    for q in queries:
        search_url = f"https://www.bing.com/search?q={quote_plus(q)}&count=20"
        try:
            r = requests.get(search_url, headers=HEADERS, timeout=20)
            html = r.text

            urls = re.findall(
                r'facebook\.com/groups/' + re.escape(slug) + r'/posts/(\d+)',
                html
            )
            for pid in urls:
                if pid not in seen:
                    seen.add(pid)
                    post_urls.append(pid)

            if debug:
                print(f"  [debug] Bing results: {len(post_urls)} post IDs")

        except Exception as e:
            if debug:
                print(f"  [debug] Bing error: {e}")

        time.sleep(1)

    return post_urls


def discover_posts_via_duckduckgo(slug, debug=False):
    post_urls = []
    seen = set()

    query = f"site:facebook.com/groups/{slug}/posts"
    search_url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"

    try:
        r = requests.get(search_url, headers=HEADERS, timeout=20)
        html = r.text

        urls = re.findall(
            r'facebook\.com/groups/' + re.escape(slug) + r'/posts/(\d+)',
            html
        )
        for pid in urls:
            if pid not in seen:
                seen.add(pid)
                post_urls.append(pid)

        if debug:
            print(f"  [debug] DDG results: {len(post_urls)} post IDs")

    except Exception as e:
        if debug:
            print(f"  [debug] DDG error: {e}")

    return post_urls


def discover_posts(slug, debug=False):
    posts = discover_posts_via_google(slug, debug)
    if not posts:
        if debug:
            print("  Google no dio resultados, probando Bing...")
        posts = discover_posts_via_bing(slug, debug)
    if not posts:
        if debug:
            print("  Bing no dio resultados, probando DuckDuckGo...")
        posts = discover_posts_via_duckduckgo(slug, debug)
    return posts


def fetch_post_page(pid, slug, debug=False):
    urls_to_try = [
        f"https://www.facebook.com/groups/{slug}/posts/{pid}/",
        f"https://m.facebook.com/groups/{slug}/posts/{pid}/",
    ]

    for url in urls_to_try:
        try:
            r = requests.get(url, headers=HEADERS, timeout=20, allow_redirects=True)
            html = r.text

            lower = html.lower()
            if 'facebook is not available' in lower:
                if debug:
                    print(f"    [debug] {url} blocked")
                continue
            if 'log in or sign up' in lower or 'please log in' in lower:
                if debug:
                    print(f"    [debug] {url} login required")
                continue
            if len(html) < 500:
                if debug:
                    print(f"    [debug] {url} too short ({len(html)})")
                continue

            if debug:
                title = re.search(r'<title>(.*?)</title>', html, re.DOTALL)
                t = title.group(1).strip() if title else "NO TITLE"
                print(f"    [debug] {url} OK ({len(html)} chars, title: {t})")

            return html

        except Exception as e:
            if debug:
                print(f"    [debug] {url} error: {e}")

    return None


def extract_post_from_page(html, pid, gid, slug):
    post = {
        "fb_post_id": pid,
        "group_id": gid,
        "author_name": "",
        "content": "",
        "image_urls": [],
        "fb_post_url": f"https://www.facebook.com/groups/{slug}/posts/{pid}/",
    }

    content_patterns = [
        r'"message"\s*:\s*"([^"]{10,})"',
        r'<div[^>]*data-ad-preview="message"[^>]*>(.*?)</div>',
        r'<span[^>]*class="[^"]*"[^>]*>([^<]{20,})</span>',
    ]

    for pat in content_patterns:
        m = re.search(pat, html, re.DOTALL)
        if m:
            text = m.group(1).strip()
            text = re.sub(r'<[^>]+>', '', text)
            text = re.sub(r'\d+\s*[hmHM]\s*·', '', text)
            text = re.sub(r'(?i)See more|Ver m[aá]s|Mostrar m[aá]s', '', text)
            text = text.strip()
            if len(text) > 10:
                post["content"] = text[:10000]
                break

    if not post["content"]:
        texts = re.findall(r'>([^<]{20,})<', html)
        cleaned = []
        for t in texts:
            t = t.strip()
            t = re.sub(r'\d+\s*[hmHM]\s*·', '', t)
            t = re.sub(r'(?i)See more|Ver m[aá]s|Mostrar m[aá]s', '', t)
            t = t.strip()
            if (len(t) > 20 and
                not t.startswith('{') and
                not t.startswith('"') and
                'facebook' not in t.lower() and
                'sign up' not in t.lower()):
                cleaned.append(t)
        if cleaned:
            post["content"] = "\n".join(cleaned[:3])

    author_patterns = [
        r'"name"\s*:\s*"([^"]{2,50})"',
        r'<strong[^>]*>\s*<a[^>]*>([^<]+)</a>\s*</strong>',
        r'<h3[^>]*>\s*<a[^>]*>([^<]+)</a>',
    ]
    for pat in author_patterns:
        m = re.search(pat, html)
        if m:
            name = m.group(1).strip()
            if len(name) > 2 and name.lower() not in ['facebook', 'see more', 'log in']:
                post["author_name"] = name
                break

    images = re.findall(r'src="([^"]*(?:scontent|fbcdn|external)[^"]*)" ', html)
    post["image_urls"] = images[:5]

    if post["content"] or post["author_name"]:
        return post
    return None


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
    for grupo in grupos:
        gid = grupo["id"]
        slug = urlparse(grupo["url"]).path.rstrip("/").split("/")[-1]
        name = grupo.get("name", gid)

        print(f"[scraper] Buscando posts de {name} ({slug})...")
        pids = discover_posts(slug, debug)
        print(f"  Encontrados {len(pids)} post IDs via search engines")

        if not pids:
            print(f"  No se encontraron posts para {name}")
            continue

        posts = []
        for pid in pids[:15]:
            print(f"  Fetching post {pid}...")
            html = fetch_post_page(pid, slug, debug)
            if html:
                post = extract_post_from_page(html, pid, gid, slug)
                if post and post["content"]:
                    posts.append(post)
                    print(f"    -> {post['author_name']}: {post['content'][:80]}...")
                else:
                    print(f"    -> No se pudo extraer contenido")
            time.sleep(0.5)

        if posts:
            sent = send_posts(posts, token, api)
            total_sent += sent
            print(f"  {sent}/{len(posts)} posts enviados de {name}")

    mark_done(token, api)
    print(f"[scraper] Scrapeo completado. Total: {total_sent} posts")


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
