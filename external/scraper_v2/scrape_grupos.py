import os, requests, sys
from urllib.parse import urlparse
from facebook_scraper import get_posts

API_BASE = os.environ.get("API_BASE_URL", "https://sigotuhuella.online")
TOKEN = os.environ.get("FB_SCRAPER_TOKEN", "sihuella-scraper-2024")

resp = requests.get(f"{API_BASE}/api/facebook/scraper-groups", params={"token": TOKEN})
if resp.status_code != 200:
    print("Error al obtener grupos:", resp.text, file=sys.stderr)
    sys.exit(1)

grupos = resp.json()
print(f"Grupos activos: {len(grupos)}")

for grupo in grupos:
    group_name = grupo["name"]
    group_id = grupo["id"]
    url = grupo["url"]
    group_slug = urlparse(url).path.rstrip("/").split("/")[-1]
    print(f"Scrapeando grupo: {group_name} ({group_slug})")
    try:
        for post in get_posts(group_slug, pages=5, options={"comments": False}):
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
    except Exception as e:
        print(f"  Error en grupo {group_name}: {e}", file=sys.stderr)
