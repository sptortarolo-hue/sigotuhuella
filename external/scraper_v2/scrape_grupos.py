import os, requests, sys, time
from urllib.parse import urlparse
from facebook_scraper import get_posts

API_BASE = os.environ.get("API_BASE_URL", "https://sigotuhuella.online")
TOKEN = os.environ.get("FB_SCRAPER_TOKEN", "sihuella-scraper-2024")
COOKIES_FILE = os.environ.get("FB_COOKIES_FILE", "/opt/sihuella/cookies.txt")

resp = requests.get(f"{API_BASE}/api/facebook/scraper-groups", params={"token": TOKEN})
if resp.status_code != 200:
    print("Error al obtener grupos:", resp.text, file=sys.stderr)
    sys.exit(1)

grupos = resp.json()
print(f"Grupos activos: {len(grupos)}")

cookies_path = COOKIES_FILE if os.path.exists(COOKIES_FILE) else None
if cookies_path:
    print(f"Usando cookies: {cookies_path}")

opts = {
    "comments": False,
    "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
}

for grupo in grupos:
    group_name = grupo["name"]
    group_id = grupo["id"]
    group_slug = urlparse(grupo["url"]).path.rstrip("/").split("/")[-1]
    print(f"Scrapeando grupo: {group_name} ({group_slug})")
    try:
        for post in get_posts(group_slug, pages=5, cookies=cookies_path, options=opts):
            payload = {
                "token": TOKEN,
                "group_id": group_id,
                "fb_post_id": post.get("post_id"),
                "author_name": post.get("username") or post.get("author", ""),
                "content": post.get("text", ""),
                "image_urls": post.get("images", []),
                "posted_at": post.get("time").isoformat() if post.get("time") else None,
                "post_url": post.get("post_url", ""),
            }
            r = requests.post(f"{API_BASE}/api/facebook/webhook", json={"posts": [payload]},
                headers={"Authorization": f"Bearer {TOKEN}"})
            if r.status_code == 200:
                print(f"  OK {post.get('post_id')}")
            else:
                print(f"  FAIL {post.get('post_id')}: {r.status_code} {r.text}", file=sys.stderr)
        time.sleep(2)
    except Exception as e:
        print(f"  Error en grupo {group_name}: {e}", file=sys.stderr)

if not cookies_path:
    print("")
    print("⚠ No se encontraron cookies. Para grupos privados exportá tus cookies de Facebook:")
    print("  1. Instalá 'Get cookies.txt' (Chrome) o 'cookies.txt' (Firefox)")
    print("  2. Andá a facebook.com, iniciá sesión")
    print("  3. Exportá cookies → subilas al VPS como /opt/sihuella/cookies.txt")
