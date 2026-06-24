"""
Facebook Group Scraper for SiHuella
Reads relay cookies (fb_cookies.json) and scrapes Facebook groups via HTTP.
Designed to run on Termux alongside fb-relay.js (residential IP + valid cookies).
"""

import os, sys, re, json, time, logging
from urllib.parse import urlparse

API_BASE = os.environ.get("API_BASE_URL", "https://sigotuhuella.online")
TOKEN = os.environ.get("FB_SCRAPER_TOKEN", "")
COOKIES_PATH = os.environ.get("FB_COOKIES_PATH", "fb_cookies.json")

try:
    from curl_cffi import requests as http
    HAS_CURL = True
except ImportError:
    import requests as http
    HAS_CURL = False

import requests as api_req
from requests.cookies import RequestsCookieJar

try:
    from pyquery import PyQuery as pq
except ImportError:
    pq = None

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
}


def load_cookies():
    if not os.path.exists(COOKIES_PATH):
        log.warning("Cookies no encontradas en %s", COOKIES_PATH)
        return None
    with open(COOKIES_PATH) as f:
        raw = json.load(f)
    if not isinstance(raw, list) or len(raw) == 0:
        return None
    jar = RequestsCookieJar()
    for c in raw:
        if isinstance(c, dict) and 'name' in c and 'value' in c:
            jar.set(c['name'], c['value'],
                    domain=c.get('domain', '.facebook.com'),
                    path=c.get('path', '/'))
    return jar


def get_groups():
    resp = api_req.get(f"{API_BASE}/api/facebook/scraper-groups", params={"token": TOKEN})
    if resp.status_code != 200:
        log.error("Error al obtener grupos: %s", resp.text)
        return []
    return resp.json()


def extract_posts(html, group_id):
    posts = []
    seen = set()
    doc = pq(html)

    for article in doc("div[role='article'], article").items():
        links = []
        for a in article("a[href*='/posts/']").items():
            m = re.search(r'/posts/(\d+)', a.attr("href") or "")
            if m:
                links.append(m.group(1))
        if not links:
            continue
        fb_id = links[0]
        if fb_id in seen:
            continue
        seen.add(fb_id)

        msg_el = article("[data-ad-comet-preview='message']")
        content = msg_el.text().strip() if msg_el else ""
        if not content:
            parts = []
            for d in article("[dir='auto']").items():
                t = d.text().strip()
                if len(t) > 15:
                    parts.append(t)
            content = "\n".join(parts)
        content = re.sub(r'\d+\s*[hm]\s*·\s*', '', content)
        content = re.sub(r'See more|Ver más|Mostrar más', '', content, flags=re.I).strip()[:10000]

        author = article("h2 a, h3 a, strong a, a[href*='/user/']").eq(0).text().strip()

        images = []
        for img in article("img[src*='scontent'], img[src*='fbcdn']").items():
            src = img.attr("src")
            if src:
                images.append(src)

        posts.append({
            "fb_post_id": fb_id,
            "group_id": group_id,
            "author_name": author,
            "content": content,
            "image_urls": images[:5],
            "fb_post_url": f"https://www.facebook.com/groups/{group_id}/posts/{fb_id}/",
        })

    return posts


def main():
    if not TOKEN:
        log.error("FB_SCRAPER_TOKEN no configurado")
        sys.exit(1)

    jar = load_cookies()
    if jar is None:
        log.warning("Sin cookies — continuando (solo grupos públicos)")

    groups = get_groups()
    log.info("Grupos activos: %d", len(groups))
    if not groups:
        return

    for grupo in groups:
        group_id = grupo["id"]
        group_name = grupo.get("name", group_id)
        group_slug = urlparse(grupo["url"]).path.rstrip("/").split("/")[-1]
        url = f"https://www.facebook.com/groups/{group_slug}/"

        log.info("Scrapeando %s (%s)", group_name, group_slug)

        try:
            kwargs = {"headers": HEADERS, "timeout": 30}
            if HAS_CURL:
                kwargs["impersonate"] = "chrome"
            if jar is not None:
                kwargs["cookies"] = jar

            resp = http.get(url, **kwargs)
            if resp.status_code != 200:
                log.warning("HTTP %d — bloqueado", resp.status_code)
                continue

            posts = extract_posts(resp.text, group_id)
            log.info("Posts: %d", len(posts))

            for post in posts:
                r = api_req.post(f"{API_BASE}/api/facebook/webhook",
                                 json={"posts": [post]},
                                 headers={"Authorization": f"Bearer {TOKEN}"})
                if r.status_code == 200:
                    log.info("  OK %s", post["fb_post_id"])
                else:
                    log.warning("  FAIL %s: %d", post["fb_post_id"], r.status_code)

            time.sleep(2)

        except Exception as e:
            log.error("Error en grupo %s: %s", group_id, e)

    log.info("Scrapeo completado")


if __name__ == "__main__":
    main()
