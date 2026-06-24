#!/usr/bin/env python3
"""
Scraper de Facebook Groups para SiHuella.
Uso: python3 scraper.py --token TU_TOKEN
Sin dependencias extra — solo requests (stdlib).
"""

import os, sys, re, json, time, argparse, base64
from urllib.parse import urlparse
import requests

API_BASE = "https://sigotuhuella.online"
COOKIES_FILE = "fb_cookies.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True, help="FB_SCRAPER_TOKEN del admin")
    parser.add_argument("--api", default=API_BASE, help="URL base de la API")
    args = parser.parse_args()

    token = args.token
    api = args.api.rstrip("/")

    # 1. Descargar cookies del servidor
    print("[scraper] Descargando cookies...")
    r = requests.get(f"{api}/api/facebook/session-file", params={"token": token})
    if r.status_code == 200:
        raw = r.json()["data"]
        try:
            parsed = json.loads(raw)
            cookies = parsed.get("cookies") or (parsed if isinstance(parsed, list) else [])
        except json.JSONDecodeError:
            decoded = json.loads(base64.b64decode(raw).decode("utf-8"))
            cookies = decoded.get("cookies") or (decoded if isinstance(decoded, list) else [])
        with open(COOKIES_FILE, "w") as f:
            json.dump(cookies, f)
        print(f"[scraper] {len(cookies)} cookies guardadas en {COOKIES_FILE}")
    elif r.status_code == 404:
        print("[scraper] No hay sesión guardada — continuando sin cookies")
        cookies = []
    else:
        print(f"[scraper] Error descargando cookies: HTTP {r.status_code} — {r.text}")
        sys.exit(1)

    # 2. Obtener grupos activos
    print("[scraper] Obteniendo grupos...")
    r = requests.get(f"{api}/api/facebook/scraper-groups", params={"token": token})
    if r.status_code != 200:
        print(f"[scraper] Error obteniendo grupos: HTTP {r.status_code} — {r.text}")
        sys.exit(1)
    grupos = r.json()
    print(f"[scraper] Grupos activos: {len(grupos)}")

    if not grupos:
        print("[scraper] No hay grupos configurados")
        return

    # 3. Scrapear cada grupo
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    }

    s = requests.Session()
    s.headers.update(headers)
    if cookies:
        for c in cookies:
            if isinstance(c, dict) and "name" in c and "value" in c:
                s.cookies.set(c["name"], c["value"],
                              domain=c.get("domain", ".facebook.com"),
                              path=c.get("path", "/"))

    for grupo in grupos:
        gid = grupo["id"]
        slug = urlparse(grupo["url"]).path.rstrip("/").split("/")[-1]
        name = grupo.get("name", gid)
        url = f"https://www.facebook.com/groups/{slug}/"

        print(f"[scraper] Scrapeando {name} ({slug})...")

        try:
            resp = s.get(url, timeout=30)
            if resp.status_code != 200:
                print(f"  HTTP {resp.status_code} — bloqueado")
                continue

            html = resp.text
            posts = []
            seen = set()

            # Extraer posts con regex (sin dependencias extra)
            # Cada post tiene un div con role="article"
            articles = re.findall(r'<div[^>]*role="article"[^>]*>(.*?)</div>\s*(?=<div|\Z)', html, re.DOTALL)
            if not articles:
                articles = re.findall(r'<article[^>]*>(.*?)</article>', html, re.DOTALL)

            for art in articles:
                # Buscar post ID
                ids = re.findall(r'/posts/(\d+)', art)
                if not ids:
                    continue
                pid = ids[0]
                if pid in seen:
                    continue
                seen.add(pid)

                # Contenido
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

                # Autor
                author = ""
                for sel in [r'<h2[^>]*>.*?<a[^>]*>(.*?)</a>', r'<h3[^>]*>.*?<a[^>]*>(.*?)</a>', r'<strong[^>]*>.*?<a[^>]*>(.*?)</a>']:
                    m = re.search(sel, art, re.DOTALL)
                    if m:
                        author = re.sub(r'<[^>]+>', '', m.group(1)).strip()
                        break

                # Imágenes
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

            print(f"  Posts: {len(posts)}")

            # 4. Enviar al webhook
            for post in posts:
                r = requests.post(f"{api}/api/facebook/webhook",
                                  json={"posts": [post]},
                                  headers={"Authorization": f"Bearer {token}"})
                if r.status_code == 200:
                    print(f"    OK {post['fb_post_id']}")
                else:
                    print(f"    FAIL {post['fb_post_id']}: HTTP {r.status_code}")

            time.sleep(2)

        except Exception as e:
            print(f"  Error: {e}")

    print("[scraper] Scrapeo completado")


if __name__ == "__main__":
    main()
