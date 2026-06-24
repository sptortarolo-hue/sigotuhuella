import os, sys, time, json
from urllib.parse import urlparse

API_BASE = os.environ.get("API_BASE_URL", "https://sigotuhuella.online")
TOKEN = os.environ.get("FB_SCRAPER_TOKEN", "sihuella-scraper-2024")
USE_BROWSER = os.environ.get("FB_USE_BROWSER", "").lower() in ("1", "true", "yes")

import requests  # solo para llamadas a nuestra API

resp = requests.get(f"{API_BASE}/api/facebook/scraper-groups", params={"token": TOKEN})
if resp.status_code != 200:
    print("Error al obtener grupos:", resp.text, file=sys.stderr)
    sys.exit(1)

grupos = resp.json()
print(f"Grupos activos: {len(grupos)}")

if USE_BROWSER:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from webdriver_manager.chrome import ChromeDriverManager

    chrome_opts = Options()
    chrome_opts.add_argument("--headless=new")
    chrome_opts.add_argument("--no-sandbox")
    chrome_opts.add_argument("--disable-dev-shm-usage")
    chrome_opts.add_argument("--disable-gpu")
    chrome_opts.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=chrome_opts
    )

    def get_posts_from_html(driver, group_url, group_id):
        posts = []
        driver.get(group_url)
        time.sleep(3)
        from selenium.webdriver.common.by import By
        articles = driver.find_elements(By.XPATH, "//div[@role='article']")
        if not articles:
            articles = driver.find_elements(By.TAG_NAME, "article")
        if not articles:
            articles = driver.find_elements(By.CSS_SELECTOR, "[data-pagelet^='FeedUnit']")
        for art in articles:
            try:
                text = art.text.strip()
                if not text:
                    continue
                links = art.find_elements(By.TAG_NAME, "a")
                fb_post_id = ""
                for link in links:
                    href = link.get_attribute("href") or ""
                    m = __import__("re").search(r'/posts/(\d+)', href)
                    if m:
                        fb_post_id = m.group(1)
                        break
                if not fb_post_id:
                    continue
                imgs = [img.get_attribute("src") for img in art.find_elements(By.TAG_NAME, "img")
                        if img.get_attribute("src") and "emoji" not in (img.get_attribute("src") or "")]
                posts.append({
                    "fb_post_id": fb_post_id,
                    "author_name": "",
                    "content": text[:10000],
                    "image_urls": imgs[:5],
                    "post_url": f"https://www.facebook.com/groups/{urlparse(group_url).path.rstrip('/').split('/')[-1]}/posts/{fb_post_id}/",
                })
            except:
                pass
        return posts

    for grupo in grupos:
        group_name = grupo["name"]
        group_id = grupo["id"]
        group_url = grupo["url"]
        print(f"Scrapeando grupo: {group_name}")
        try:
            posts = get_posts_from_html(driver, group_url, group_id)
            print(f"  Posts: {len(posts)}")
            for post in posts:
                post["token"] = TOKEN
                post["group_id"] = group_id
                r = requests.post(f"{API_BASE}/api/facebook/webhook", json={"posts": [post]},
                    headers={"Authorization": f"Bearer {TOKEN}"})
                if r.status_code == 200:
                    print(f"    OK {post['fb_post_id']}")
                else:
                    print(f"    FAIL {post['fb_post_id']}: {r.status_code} {r.text[:100]}")
            time.sleep(3)
        except Exception as e:
            print(f"  Error: {e}", file=sys.stderr)

    driver.quit()

else:
    from facebook_scraper import get_posts
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
            for post in get_posts(group_slug, pages=5, options=opts):
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
                    print(f"  FAIL {post.get('post_id')}: {r.status_code}")
            time.sleep(2)
        except Exception as e:
            print(f"  Error en grupo {group_name}: {e}", file=sys.stderr)

print("")
print("✅ Scrapeo completado")
if not USE_BROWSER:
    print("Para mejor compatibilidad (si Facebook bloquea el VPS), instalá:")
    print("  apt install chromium-browser -y")
    print("  pip install selenium webdriver-manager")
    print("  FB_USE_BROWSER=1 python3 scrape_grupos.py")
