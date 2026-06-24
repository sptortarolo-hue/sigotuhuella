import os, sys, time, re
from urllib.parse import urlparse

API_BASE = os.environ.get("API_BASE_URL", "https://sigotuhuella.online")
TOKEN = os.environ.get("FB_SCRAPER_TOKEN", "sihuella-scraper-2024")

try:
    from curl_cffi import requests as http
    HAS_CURL = True
except ImportError:
    import requests as http
    HAS_CURL = False

import requests  # para llamadas a nuestra API
from pyquery import PyQuery as pq

resp = requests.get(f"{API_BASE}/api/facebook/scraper-groups", params={"token": TOKEN})
if resp.status_code != 200:
    print("Error al obtener grupos:", resp.text, file=sys.stderr)
    sys.exit(1)

grupos = resp.json()
print(f"Grupos activos: {len(grupos)}")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9",
}

def extract_posts(html, group_slug):
    posts = []
    doc = pq(html)
    seen = set()
    for article in doc("article, div[role='article'], div[data-ft], div[data-pagelet^='FeedUnit']").items():
        raw = article.html() or ""
        links = []
        for a in article("a").items():
            href = a.attr("href") or ""
            m = re.search(r'/posts/(\d+)', href)
            if m:
                links.append(m.group(1))
        if not links:
            continue
        fb_post_id = links[0]
        if fb_post_id in seen:
            continue
        seen.add(fb_post_id)
        text_parts = []
        for el in article("[dir='auto'], p, span, div[data-ad-comet-preview='message']"):
            el_pq = pq(el)
            txt = el_pq.text()
            if txt and len(txt) > 10:
                text_parts.append(txt)
        content = "\n".join(text_parts)[:10000] if text_parts else ""
        author = article("a[href*='/profile.php'], a[href*='/user/']").eq(0).text() or \
                 article("a[href*='?__tn__=']").eq(0).text() or ""
        images = []
        for img in article("img").items():
            src = img.attr("src") or ""
            if src and "emoji" not in src and not src.startswith("data:") and "static.xx" not in src:
                images.append(src)
        img_re = re.findall(r'<img[^>]+src="([^"]+)"', raw)
        images = list(dict.fromkeys(img_re)) if img_re else images
        images = [i for i in images if not any(x in i for x in ["emoji", "data:", "static.xx"])][:5]
        post_url = f"https://www.facebook.com/groups/{group_slug}/posts/{fb_post_id}/"
        posts.append({
            "fb_post_id": fb_post_id,
            "author_name": author.strip(),
            "content": content,
            "image_urls": images,
            "post_url": post_url,
        })
    return posts

for grupo in grupos:
    group_name = grupo["name"]
    group_id = grupo["id"]
    group_slug = urlparse(grupo["url"]).path.rstrip("/").split("/")[-1]
    url = f"https://m.facebook.com/groups/{group_slug}/"
    print(f"Scrapeando grupo: {group_name} ({group_slug})")
    try:
        fetch_kwargs = {"headers": HEADERS, "timeout": 30}
        if HAS_CURL:
            fetch_kwargs["impersonate"] = "chrome"
        else:
            url = f"https://www.facebook.com/groups/{group_slug}/"  # www a veces es menos restrictivo
        resp = http.get(url, **fetch_kwargs)
        if resp.status_code != 200:
            print(f"  HTTP {resp.status_code} - bloqueado", file=sys.stderr)
            continue
        posts = extract_posts(resp.text, group_slug)
        print(f"  Posts encontrados: {len(posts)}")
        for post in posts:
            post["token"] = TOKEN
            post["group_id"] = group_id
            r = requests.post(f"{API_BASE}/api/facebook/webhook", json={"posts": [post]},
                headers={"Authorization": f"Bearer {TOKEN}"})
            if r.status_code == 200:
                print(f"    OK {post['fb_post_id']}")
            else:
                print(f"    FAIL {post['fb_post_id']}: {r.status_code}")
        time.sleep(2)
    except Exception as e:
        print(f"  Error en grupo {group_name}: {e}", file=sys.stderr)

print(f"\n✅ Scrapeo completado.")
if not HAS_CURL:
    print("💡 Instalá curl_cffi para evitar bloqueos: pip install curl_cffi")
