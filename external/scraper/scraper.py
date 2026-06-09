"""
Facebook Group Scraper — Sigo Tu Huella
Scrapes configured Facebook groups via Selenium (headless Chrome) and sends posts to the webhook.

Usage:
  python scraper.py                              # Run once
  python scraper.py --daemon                     # Run as scheduled daemon
  python scraper.py --api-base-url=URL --api-token=TOKEN

Requires cookies.txt (Netscape format) from a logged-in Facebook session.
If cookies are expired, auto-login with FB_EMAIL/FB_PASSWORD env vars (or --fb-email / --fb-password).
ChromeDriver is auto-managed by webdriver-manager.
"""

import json
import logging
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import NoSuchElementException, TimeoutException, WebDriverException
from webdriver_manager.chrome import ChromeDriverManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("fb-scraper")

MIN_CONTENT_LENGTH = 20
CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                _k = _k.strip()
                _v = _v.strip().strip("'\"")
                if _k and not os.environ.get(_k):
                    os.environ[_k] = _v

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_api_base_url():
    for arg in sys.argv:
        if arg.startswith("--api-base-url="):
            return arg.split("=", 1)[1]
    env = os.environ.get("API_BASE_URL")
    if env:
        return env
    cfg_path = Path(__file__).parent / "config.json"
    if cfg_path.exists():
        with open(cfg_path) as f:
            cfg = json.load(f)
        return cfg.get("api_base_url")
    return None

def get_api_token():
    for arg in sys.argv:
        if arg.startswith("--api-token="):
            return arg.split("=", 1)[1]
    token = os.environ.get("API_TOKEN")
    if token:
        return token
    cfg_path = Path(__file__).parent / "config.json"
    if cfg_path.exists():
        with open(cfg_path) as f:
            cfg = json.load(f)
        return cfg.get("webhook_token")
    return None

def get_fb_email():
    for arg in sys.argv:
        if arg.startswith("--fb-email="):
            return arg.split("=", 1)[1]
    return os.environ.get("FB_EMAIL")

def get_fb_password():
    for arg in sys.argv:
        if arg.startswith("--fb-password="):
            return arg.split("=", 1)[1]
    return os.environ.get("FB_PASSWORD")

def fetch_config(api_base_url, webhook_token):
    url = f"{api_base_url.rstrip('/')}/api/facebook/scraper-config"
    headers = {"Authorization": f"Bearer {webhook_token}"}
    logger.info(f"Fetching config from {url}")
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()

def extract_group_id(url):
    match = re.search(r'/groups/([^/?]+)', url)
    raw = match.group(1) if match else url
    return raw.split('?')[0].split('/')[0]

# ---------------------------------------------------------------------------
# Selenium driver
# ---------------------------------------------------------------------------

def init_driver(headless=True):
    options = webdriver.ChromeOptions()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(f"user-agent={CHROME_UA}")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator, 'webdriver', { get: () => false })"
    })
    return driver

# ---------------------------------------------------------------------------
# Session / Login
# ---------------------------------------------------------------------------

def check_session(driver):
    """Navigate to facebook.com and verify we're logged in (feed visible)."""
    try:
        driver.get("https://www.facebook.com/")
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "div[role='feed'], a[aria-label='Home'], div[data-pagelet*='Feed']")
            )
        )
        logger.info("Session valid — logged in")
        return True
    except (TimeoutException, NoSuchElementException, WebDriverException):
        logger.warning("Session check failed — likely logged out")
        return False

def save_cookies(driver, filepath):
    cookies = driver.get_cookies()
    lines = ["# Netscape HTTP Cookie File"]
    for c in cookies:
        domain = c.get("domain", ".facebook.com")
        if domain.startswith("."):
            domain = domain[1:]
        secure = "TRUE" if c.get("secure", False) else "FALSE"
        path = c.get("path", "/")
        http_only = "TRUE" if c.get("httpOnly", False) else "FALSE"
        expires = int(c.get("expiry", 0))
        lines.append(f"{domain}\t{http_only}\t{path}\t{secure}\t{expires}\t{c['name']}\t{c['value']}")
    with open(filepath, "w") as f:
        f.write("\n".join(lines) + "\n")
    logger.info(f"Saved {len(cookies)} cookies to {filepath}")

def load_cookies(driver, filepath):
    """Load Netscape-format cookies into the Selenium driver."""
    try:
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or line.startswith("HttpOnly"):
                    continue
                parts = line.split("\t")
                if len(parts) >= 7:
                    driver.add_cookie({
                        "name": parts[5],
                        "value": parts[6],
                        "domain": parts[0] if parts[0].startswith(".") else "." + parts[0],
                        "path": parts[2] if parts[2] else "/",
                    })
        logger.info(f"Cookies loaded from {filepath}")
    except Exception as e:
        logger.warning(f"Failed to load cookies: {e}")

def login_to_facebook(driver, email, password):
    """Log in with credentials. Returns True on success."""
    logger.info("Logging in to Facebook")
    try:
        driver.get("https://www.facebook.com/")

        try:
            WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "button[data-cookiebanner='accept_button']"))
            ).click()
            time.sleep(1)
        except (TimeoutException, NoSuchElementException):
            pass

        email_el = WebDriverWait(driver, 15).until(
            EC.visibility_of_element_located((By.ID, "email"))
        )
        email_el.clear()
        email_el.send_keys(email)

        pass_el = WebDriverWait(driver, 15).until(
            EC.visibility_of_element_located((By.ID, "pass"))
        )
        pass_el.clear()
        pass_el.send_keys(password)

        WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable((By.NAME, "login"))
        ).click()

        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "div[role='feed'], a[aria-label='Home']")
            )
        )

        logger.info("Login successful")
        return True
    except (TimeoutException, NoSuchElementException, WebDriverException) as e:
        logger.error(f"Login failed: {e}")
        return False

# ---------------------------------------------------------------------------
# BS4 extraction helpers (multiple fallback selectors)
# ---------------------------------------------------------------------------

POST_CONTAINER_BS = (
    'div.x1yztbdb.x1n2onr6.xh8yej3.x1ja2u2z, '
    'div[role="article"], '
    'div[data-ad-preview="message"], '
    'div[data-pagelet^="FeedUnit_"]'
)

POST_LINK_BS = (
    'a[href*="/posts/"], '
    'a[href*="/videos/"], '
    'a[href*="/photos/"], '
    'a[href*="/story.php"], '
    'a[href*="/permalink/"]'
)

AUTHOR_NAME_BS = (
    'h2 strong, h2 a[role="link"] strong, '
    'h3 strong, h3 a[role="link"] strong, '
    'a[aria-label][href*="/user/"] > strong, '
    'a[aria-label][href*="/profile.php"] > strong, '
    'a[href*="/groups/"][href*="/user/"] span, '
    'a[href*="/profile.php"] span'
)

POST_TEXT_BS = (
    'div[data-ad-rendering-role="story_message"], '
    'div[data-ad-preview="message"], '
    'div[data-ad-comet-preview="message"], '
    'div[dir="auto"]:not([class*=" "]):not(:has(button))'
)

POST_IMAGE_BS = (
    'img.x168nmei, '
    'div[data-imgperflogname="MediaGridPhoto"] img, '
    'img[src*="scontent"], '
    'img[src*="fbcdn"]'
)

POST_TIME_BS = 'abbr[title], a[href*="/posts/"] span[data-lexical-text="true"]'

COMMENT_CONTAINER_BS = 'div[aria-label*="Comment by"], ul > li div[role="article"]'
COMMENTER_NAME_BS = 'a[href*="/user/"] span, a[href*="/profile.php"] span, span > a[role="link"] > span'
COMMENT_TEXT_BS = 'div[data-ad-preview="message"] > span, div[dir="auto"][style="text-align: start;"]'
COMMENT_TIME_BS = 'abbr[title]'

def parse_single_post(article_soup, group_name):
    """Extract post data from a BeautifulSoup article element."""
    html_str = str(article_soup)

    fb_id = None
    fb_post_url = ""
    for a in article_soup.find_all("a", href=True):
        href = a.get("href", "")
        m = re.search(r'(?:story_fbid=|/posts/|/permalink/|fbid=)(\d+)', href)
        if m:
            fb_id = m.group(1)
            if href.startswith("/"):
                href = "https://www.facebook.com" + href
            fb_post_url = href
            break
    if not fb_id:
        m2 = re.search(r'"post_id":\s*"(\d+)"', html_str)
        if m2:
            fb_id = m2.group(1)
    if not fb_id:
        return None

    author_el = article_soup.select_one(AUTHOR_NAME_BS)
    author = author_el.get_text(strip=True) if author_el else ""

    text_el = article_soup.select_one(POST_TEXT_BS)
    content = text_el.get_text("\n", strip=True) if text_el else article_soup.get_text("\n", strip=True)[:500]

    images = []
    for img in article_soup.select(POST_IMAGE_BS):
        src = img.get("src") or img.get("data-src") or ""
        if src and any(x in src for x in ["scontent", "fbcdn", "safe_image", "cdninstagram"]):
            if src not in images:
                images.append(src)

    time_el = article_soup.select_one(POST_TIME_BS)
    posted_at = ""
    if time_el:
        posted_at = time_el.get("title", "") or time_el.get_text(strip=True)

    comments = []
    for comment_el in article_soup.select(COMMENT_CONTAINER_BS):
        cname_el = comment_el.select_one(COMMENTER_NAME_BS)
        ctext_el = comment_el.select_one(COMMENT_TEXT_BS)
        ctime_el = comment_el.select_one(COMMENT_TIME_BS)
        ctext = ctext_el.get_text(strip=True) if ctext_el else ""
        cname = cname_el.get_text(strip=True) if cname_el else ""
        ctime = ctime_el.get("title", "") if ctime_el else ""
        if ctext or cname:
            comments.append({
                "id": str(uuid.uuid4()),
                "author": cname,
                "text": ctext[:1000],
                "timestamp": ctime,
            })

    return {
        "group_id": None,
        "group_name": group_name,
        "fb_post_id": fb_id,
        "fb_post_url": fb_post_url,
        "author_name": author,
        "content": content[:2000],
        "image_urls": images[:5],
        "posted_at": posted_at,
        "comments": comments[:20],
    }

# ---------------------------------------------------------------------------
# Scraper
# ---------------------------------------------------------------------------

def scrape_group(driver, group_name, group_url, max_posts=50):
    """Scrape a Facebook group using Selenium + BS4."""
    group_id = extract_group_id(group_url)
    logger.info(f"Scraping group: {group_name} — ID: {group_id}")

    driver.get(f"https://www.facebook.com/groups/{group_id}/?sorting_setting=RECENT_ACTIVITY")

    try:
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, POST_CONTAINER_BS.replace(", ", ","))
            )
        )
    except TimeoutException:
        logger.warning(f"[{group_name}] No posts appeared — group may not be accessible")
        return []

    posts = []
    seen_ids = set()
    scroll_attempts = 0
    max_scrolls = 30
    no_new_count = 0

    def click_see_more():
        try:
            buttons = driver.find_elements(By.XPATH,
                ".//div[@role='button'][contains(.,'See more') or contains(.,'Ver más')] | "
                ".//a[contains(.,'See more') or contains(.,'Ver más')]"
            )
            for btn in buttons[:10]:
                try:
                    if btn.is_displayed():
                        driver.execute_script("arguments[0].click();", btn)
                        time.sleep(0.3)
                except Exception:
                    pass
        except Exception:
            pass

    while len(posts) < max_posts and scroll_attempts < max_scrolls:
        scroll_attempts += 1
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2)

        click_see_more()
        time.sleep(1)

        try:
            WebDriverWait(driver, 5).until(
                lambda d: len(d.find_elements(By.CSS_SELECTOR, POST_CONTAINER_BS.replace(", ", ","))) > len(posts)
            )
            no_new_count = 0
        except TimeoutException:
            no_new_count += 1
            if no_new_count >= 3 and len(posts) > 0:
                logger.info(f"[{group_name}] No new posts after {no_new_count} scrolls, stopping")
                break

        page_html = driver.page_source
        soup = BeautifulSoup(page_html, "html.parser")

        for article in soup.select(POST_CONTAINER_BS):
            if len(posts) >= max_posts:
                break
            parsed = parse_single_post(article, group_name)
            if parsed and parsed["fb_post_id"] not in seen_ids:
                seen_ids.add(parsed["fb_post_id"])
                posts.append(parsed)
                if len(posts) <= 5 or len(posts) % 10 == 0:
                    logger.info(f"[{group_name}] Post #{len(posts)}: {parsed['fb_post_id']} — {parsed['content'][:60]}...")

    logger.info(f"[{group_name}] Scraped {len(posts)} posts")
    return posts[:max_posts]

# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------

def is_post_relevant(post):
    content = (post.get("content") or "").strip()
    return len(content) >= MIN_CONTENT_LENGTH

def send_to_webhook(webhook_url, webhook_token, posts):
    if not posts:
        logger.info("No posts to send.")
        return
    filtered = [p for p in posts if is_post_relevant(p)]
    skipped = len(posts) - len(filtered)
    if skipped:
        logger.info(f"Skipped {skipped} posts (too short)")
    if not filtered:
        logger.info("No relevant posts after filtering.")
        return
    posts = filtered
    if webhook_url.startswith("http://"):
        webhook_url = "https://" + webhook_url[7:]
    payload = {"posts": posts}
    headers = {"Authorization": f"Bearer {webhook_token}", "Content-Type": "application/json"}
    try:
        resp = requests.post(webhook_url, json=payload, headers=headers, timeout=60)
        logger.info(f"Webhook response: HTTP {resp.status_code} ({len(resp.content)} bytes)")
        if resp.status_code >= 400:
            logger.error(f"Webhook error body: {resp.text[:500]}")
        else:
            try:
                logger.info(f"Webhook JSON: {resp.json()}")
            except Exception:
                logger.warning(f"Webhook response is not JSON: {resp.text[:200]}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending to webhook: {e}")

# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def ensure_logged_in(fb_email, fb_password):
    """Check session, login if needed. Returns True if session is valid."""
    cookies_file = Path(__file__).parent / "cookies.txt"
    driver = init_driver(headless=True)
    try:
        driver.get("https://www.facebook.com/")
        if cookies_file.exists():
            load_cookies(driver, cookies_file)
            driver.get("https://www.facebook.com/")
            if check_session(driver):
                return True

        if not fb_email or not fb_password:
            logger.error("Cookies expired and no FB_EMAIL/FB_PASSWORD provided")
            return False

        if login_to_facebook(driver, fb_email, fb_password):
            save_cookies(driver, cookies_file)
            return True
        return False
    finally:
        driver.quit()

def run_with_config(webhook_url, webhook_token, groups, max_posts, fb_email=None, fb_password=None):
    if not ensure_logged_in(fb_email, fb_password):
        logger.error("Cannot scrape — not logged in to Facebook")
        return

    driver = init_driver(headless=True)
    try:
        cookies_file = Path(__file__).parent / "cookies.txt"
        driver.get("https://www.facebook.com/")
        if cookies_file.exists():
            load_cookies(driver, cookies_file)
            driver.get("https://www.facebook.com/")

        all_posts = []
        for group in groups:
            if not group.get("url"):
                continue
            posts = scrape_group(driver, group["name"], group["url"], max_posts)
            all_posts.extend(posts)
        logger.info(f"Total posts scraped: {len(all_posts)}")
        send_to_webhook(webhook_url, webhook_token, all_posts)
    finally:
        driver.quit()

def run():
    api_base_url = get_api_base_url()
    cfg_path = Path(__file__).parent / "config.json"
    fb_email = get_fb_email()
    fb_password = get_fb_password()

    if api_base_url:
        logger.info("Auto-config mode: fetching from API")
        token = get_api_token()
        if not token:
            logger.error("API_TOKEN required. Use --api-token=TOKEN or set API_TOKEN env var")
            sys.exit(1)
        cfg = fetch_config(api_base_url, token)
        run_with_config(cfg["webhook_url"], cfg["webhook_token"], cfg["groups"], cfg["max_posts_per_group"], fb_email, fb_password)
    else:
        logger.info("Legacy mode: reading config.json")
        if not cfg_path.exists():
            logger.error("config.json not found")
            sys.exit(1)
        with open(cfg_path) as f:
            cfg = json.load(f)
        run_with_config(cfg["webhook_url"], cfg["webhook_token"], cfg["groups"], cfg.get("max_posts_per_group", 50), fb_email, fb_password)

def run_daemon():
    try:
        import schedule
    except ImportError:
        logger.error("schedule library required for daemon mode")
        sys.exit(1)

    api_base_url = get_api_base_url()
    fb_email = get_fb_email()
    fb_password = get_fb_password()

    if api_base_url:
        token = get_api_token()
        if not token:
            logger.error("API_TOKEN required in daemon mode")
            sys.exit(1)

        def job():
            try:
                cfg = fetch_config(api_base_url, token)
                run_with_config(cfg["webhook_url"], cfg["webhook_token"], cfg["groups"], cfg["max_posts_per_group"], fb_email, fb_password)
            except Exception as e:
                logger.error(f"Daemon cycle error: {e}")
            try:
                cfg = fetch_config(api_base_url, token)
                interval = cfg.get("scrape_interval_hours", 6)
                schedule.clear("fb")
                schedule.every(interval).hours.do(job).tag("fb")
                logger.info(f"Re-scheduled: every {interval} hours")
            except Exception as e:
                logger.error(f"Error re-scheduling: {e}")

        job()
        schedule.every(6).hours.do(job).tag("fb")
        while True:
            schedule.run_pending()
            time.sleep(60)
    else:
        cfg_path = Path(__file__).parent / "config.json"
        if not cfg_path.exists():
            logger.error("config.json not found")
            sys.exit(1)
        with open(cfg_path) as f:
            cfg = json.load(f)
        interval = cfg.get("scrape_interval_hours", 6)
        logger.info(f"Starting legacy daemon — scraping every {interval} hours")
        run()
        schedule.every(interval).hours.do(run)
        while True:
            schedule.run_pending()
            time.sleep(60)

if __name__ == "__main__":
    if "--daemon" in sys.argv:
        run_daemon()
    else:
        run()
