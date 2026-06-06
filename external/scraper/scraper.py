"""
Facebook Group Scraper — Sigo Tu Huella
Scrapes configured Facebook groups via pyppeteer (headless Chrome) and sends posts to the webhook.

Usage:
  python scraper.py                              # Run once
  python scraper.py --daemon                     # Run as scheduled daemon
  python scraper.py --api-base-url=URL --api-token=TOKEN

Requires cookies.txt (Netscape format) from a logged-in Facebook session.
Chromium is auto-downloaded by pyppeteer on first run.
"""

import asyncio
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("fb-scraper")


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


def load_netscape_cookies(filepath):
    """Parse Netscape-format cookies.txt and return list of pyppeteer-compatible cookie dicts."""
    cookies = []
    try:
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or line.startswith("HttpOnly"):
                    continue
                parts = line.split("\t")
                if len(parts) >= 7:
                    domain = parts[0] if parts[0].startswith(".") else "." + parts[0]
                    cookies.append({
                        "name": parts[5],
                        "value": parts[6],
                        "domain": domain,
                        "path": parts[2] if parts[2] else "/",
                        "secure": parts[3].upper() == "TRUE",
                        "httpOnly": parts[1].upper() == "TRUE",
                    })
        logger.info(f"Loaded {len(cookies)} cookies from {filepath}")
    except Exception as e:
        logger.warning(f"Failed to load cookies: {e}")
    return cookies


def parse_post_elements(html, group_name):
    """Parse Facebook post data from rendered HTML."""
    soup = BeautifulSoup(html, "html.parser")
    posts = []
    seen_ids = set()

    # Try finding posts via aria-label or role="article"
    for article in soup.find_all("div", attrs={"role": "article"}) or soup.find_all("article"):
        try:
            html_str = str(article)

            # post ID: look for story.php or posts/ in links
            fb_id = None
            for a in article.find_all("a", href=True):
                m = re.search(r'(?:story_fbid=|/posts/|fbid=)(\d+)', a["href"])
                if m:
                    fb_id = m.group(1)
                    break
            if not fb_id:
                m2 = re.search(r'"post_id":\s*"(\d+)"', html_str)
                if m2:
                    fb_id = m2.group(1)
            if not fb_id:
                continue
            if fb_id in seen_ids:
                continue
            seen_ids.add(fb_id)

            # author
            author = ""
            for sel in ["h3", "h4", "strong", "a[role='link']"]:
                tag = article.find(sel)
                if tag:
                    author = tag.get_text(strip=True)
                    if author:
                        break

            # content
            content = ""
            for sel in ["div[data-ad-preview='message']", "div[dir='auto']", "span[dir='auto']"]:
                tag = article.select_one(sel)
                if tag:
                    text = tag.get_text("\n", strip=True)
                    if len(text) > 20:
                        content = text
                        break
            if not content:
                content = article.get_text("\n", strip=True)[:500]

            # images
            images = []
            for img in soup.find_all("img", src=re.compile(r"^https?://.*scontent")):
                src = img.get("src", "")
                if src and src not in images:
                    images.append(src)

            # time
            posted_at = ""
            for t in article.find_all(["time", "span"]):
                for attr in ["title", "datetime", "data-utime"]:
                    val = t.get(attr, "")
                    if val:
                        posted_at = val
                        break
                if posted_at:
                    break

            posts.append({
                "group_id": None,
                "group_name": group_name,
                "fb_post_id": fb_id,
                "fb_post_url": f"https://www.facebook.com/{fb_id}" if fb_id else "",
                "author_name": author,
                "content": content,
                "image_urls": images[:5],
                "posted_at": posted_at,
            })
        except Exception:
            continue

    return posts


# ---------------------------------------------------------------------------
# Scraper
# ---------------------------------------------------------------------------

async def page_diagnostics(page, group_name):
    """Log diagnostics about current page state."""
    current_url = page.url
    logger.info(f"[{group_name}] Final URL: {current_url}")
    title = await page.title()
    logger.info(f"[{group_name}] Page title: {title}")

    # Check for common non-content indicators
    body_text = await page.evaluate("document.body?.innerText?.substring(0, 500) || ''")
    lower = body_text.lower()
    if "log in" in lower or "login" in lower or "sign in" in lower:
        logger.warning(f"[{group_name}] Page shows login wall — cookies may be expired")
    if "confirm" in lower and "identity" in lower:
        logger.warning(f"[{group_name}] Page shows identity confirmation — cookies need refresh")
    if "this content isn't available" in lower:
        logger.warning(f"[{group_name}] Content not available — group may not be accessible")


async def extract_posts_via_js(page, group_name):
    """Try extracting post data via JavaScript evaluate()."""
    try:
        data = await page.evaluate("""() => {
            const posts = [];
            // Find all links that contain story_fbid or /posts/ or /permalink/
            const links = document.querySelectorAll(
                'a[href*="story_fbid"], a[href*="/posts/"], a[href*="/permalink/"]'
            );
            const seen = new Set();
            links.forEach(link => {
                const href = link.href || '';
                let fb_id = '';
                // story_fbid=12345
                let m = href.match(/story_fbid=(\\d+)/);
                if (m) fb_id = m[1];
                // /posts/12345 or /posts/permalink/12345
                if (!fb_id) {
                    m = href.match(/\\/posts\\/(\\d+)/);
                    if (m) fb_id = m[1];
                }
                // /permalink/12345
                if (!fb_id) {
                    m = href.match(/\\/permalink\\/(\\d+)/);
                    if (m) fb_id = m[1];
                }
                if (!fb_id || seen.has(fb_id)) return;
                seen.add(fb_id);

                // Try to find the post container by walking up from the link
                let container = link;
                for (let i = 0; i < 10; i++) {
                    if (!container.parentElement) break;
                    container = container.parentElement;
                    if (container.getAttribute('role') === 'article') break;
                    if (container.hasAttribute('data-pagelet')) break;
                }

                // Author from first strong/a/h3
                const authorEl = container.querySelector('strong, h3, h4, a[role="link"]');
                const author = authorEl ? authorEl.innerText.trim() : '';

                // Content text - the container text minus metadata
                let content = '';
                const msgEl = container.querySelector(
                    'div[data-ad-preview="message"], ' +
                    'div[dir="auto"], ' +
                    'span[dir="auto"]'
                );
                if (msgEl) content = msgEl.innerText.trim();
                if (!content || content.length < 20) {
                    content = container.innerText.trim();
                    // Remove common FB UI text
                    content = content.replace(/Reacciones?\\s*.*/, '').trim();
                    content = content.substring(0, 500);
                }

                // Find images
                const images = [];
                container.querySelectorAll('img').forEach(img => {
                    const src = img.src || '';
                    if ((src.includes('scontent') || src.includes('fbcdn')) &&
                        !images.includes(src)) {
                        images.push(src);
                    }
                });

                posts.push({
                    fb_post_id: fb_id,
                    fb_post_url: 'https://www.facebook.com/' + fb_id,
                    author_name: author,
                    content: content,
                    image_urls: images.slice(0, 5),
                });
            });
            return JSON.stringify(posts);
        }""")
        return json.loads(data)
    except Exception as e:
        logger.warning(f"[{group_name}] JS extraction error: {e}")
        return []


async def wait_for_posts(page, group_name, timeout=30):
    """Wait until post elements appear in the DOM, scrolling as needed."""
    start = time.time()
    scroll_attempts = 0
    while time.time() - start < timeout:
        # Check for post-related DOM elements
        has_content = await page.evaluate("""() => {
            const selectors = [
                'a[href*="story_fbid"]',
                'a[href*="/posts/"]',
                'a[href*="/permalink/"]',
                'div[role="article"]',
                '[data-pagelet^="FeedUnit"]',
                'div.x1yztbdb',
            ];
            for (const sel of selectors) {
                if (document.querySelector(sel)) return true;
            }
            // Also check if body text contains "h" (logged in indicator)
            return false;
        }""")
        if has_content:
            logger.info(f"[{group_name}] Posts appeared after {time.time()-start:.1f}s")
            await asyncio.sleep(2)  # let them fully render
            return True
        scroll_attempts += 1
        await page.evaluate(f"window.scrollBy(0, {scroll_attempts * 400})")
        await asyncio.sleep(1.5)
    logger.warning(f"[{group_name}] No posts appeared after {timeout}s")
    return False


async def async_scrape_group(group_name, group_url, max_posts=50):
    """Scrape a Facebook group using pyppeteer headless browser."""
    group_id = extract_group_id(group_url)
    logger.info(f"Scraping group: {group_name} — ID: {group_id}")

    cookies_file = Path(__file__).parent / "cookies.txt"
    fb_cookies = load_netscape_cookies(cookies_file) if cookies_file.exists() else []

    from pyppeteer import launch

    browser = await launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
        handleSIGINT=False,
        handleSIGTERM=False,
        handleSIGHUP=False,
    )
    try:
        page = await browser.newPage()
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        )
        await page.setViewport({"width": 1280, "height": 800})

        # Set cookies before navigating
        if fb_cookies:
            await page.setCookie(*fb_cookies)

        # Navigate directly to group
        group_url_full = f"https://www.facebook.com/groups/{group_id}/?sorting_setting=RECENT_ACTIVITY"
        logger.info(f"Navigating to {group_url_full}")
        try:
            await page.goto(group_url_full, waitUntil="load", timeout=60000)
        except Exception as e:
            logger.warning(f"[{group_name}] goto timeout: {e}")

        await page_diagnostics(page, group_name)

        # Wait for posts to appear via lazy loading / API
        posts_appeared = await wait_for_posts(page, group_name, timeout=30)

        # Try JS extraction first (more reliable)
        posts = []
        if posts_appeared:
            # Scroll more to load all posts
            for _ in range(5):
                await page.evaluate("window.scrollBy(0, 1500)")
                await asyncio.sleep(1)
            # Try the new JS-based extraction
            posts = await extract_posts_via_js(page, group_name)

        if not posts:
            logger.info(f"[{group_name}] JS extraction returned 0 posts, dumping diagnostics...")
            # Take screenshot for debugging
            screenshot_file = Path(__file__).parent / f"debug_{group_id}.png"
            await page.screenshot({"path": str(screenshot_file)})
            logger.info(f"[{group_name}] Saved screenshot to {screenshot_file}")
            # Dump HTML snippet
            html = await page.content()
            snippet_file = Path(__file__).parent / f"debug_{group_id}.html"
            with open(snippet_file, "w") as f:
                f.write(html[:20000])
            logger.info(f"[{group_name}] Saved HTML snippet to {snippet_file}")

            posts = parse_post_elements(html, group_name)

        logger.info(f"[{group_name}] Found {len(posts)} posts")

    finally:
        await browser.close()

    for post in posts:
        post["group_name"] = group_name
    return posts[:max_posts]


def scrape_group(group_name, group_url, max_posts=50):
    """Synchronous wrapper around async_scrape_group."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(async_scrape_group(group_name, group_url, max_posts))
    finally:
        loop.close()


# ---------------------------------------------------------------------------
# Communication
# ---------------------------------------------------------------------------

def send_to_webhook(webhook_url, webhook_token, posts):
    if not posts:
        logger.info("No posts to send.")
        return
    payload = {"posts": posts}
    headers = {"Authorization": f"Bearer {webhook_token}", "Content-Type": "application/json"}
    try:
        resp = requests.post(webhook_url, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        logger.info(f"Webhook response: {resp.json()}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending to webhook: {e}")


def run_with_config(webhook_url, webhook_token, groups, max_posts):
    all_posts = []
    for group in groups:
        if not group.get("url"):
            continue
        posts = scrape_group(group["name"], group["url"], max_posts)
        all_posts.extend(posts)
    logger.info(f"Total posts scraped: {len(all_posts)}")
    send_to_webhook(webhook_url, webhook_token, all_posts)


def run():
    api_base_url = get_api_base_url()
    cfg_path = Path(__file__).parent / "config.json"

    if api_base_url:
        logger.info("Auto-config mode: fetching from API")
        token = get_api_token()
        if not token:
            logger.error("API_TOKEN required. Use --api-token=TOKEN or set API_TOKEN env var")
            sys.exit(1)
        cfg = fetch_config(api_base_url, token)
        run_with_config(cfg["webhook_url"], cfg["webhook_token"], cfg["groups"], cfg["max_posts_per_group"])
    else:
        logger.info("Legacy mode: reading config.json")
        if not cfg_path.exists():
            logger.error("config.json not found")
            sys.exit(1)
        with open(cfg_path) as f:
            cfg = json.load(f)
        run_with_config(cfg["webhook_url"], cfg["webhook_token"], cfg["groups"], cfg.get("max_posts_per_group", 50))


def run_daemon():
    try:
        import schedule
    except ImportError:
        logger.error("schedule library required for daemon mode")
        sys.exit(1)

    api_base_url = get_api_base_url()

    if api_base_url:
        token = get_api_token()
        if not token:
            logger.error("API_TOKEN required in daemon mode")
            sys.exit(1)

        def job():
            try:
                cfg = fetch_config(api_base_url, token)
                run_with_config(cfg["webhook_url"], cfg["webhook_token"], cfg["groups"], cfg["max_posts_per_group"])
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
