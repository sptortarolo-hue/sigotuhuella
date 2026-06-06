"""
Facebook Group Scraper — Sigo Tu Huella
Scrapes configured Facebook groups via mbasic.facebook.com and sends posts to the webhook.

Usage:
  python scraper.py                              # Run once (fetches config from API)
  python scraper.py --daemon                     # Run as scheduled daemon
  python scraper.py --api-base-url=URL --api-token=TOKEN

Requires cookies.txt (Netscape format) from a logged-in Facebook session.
"""

import json
import os
import re
import sys
import time
import logging
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("fb-scraper")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml",
}


def get_api_base_url():
    for arg in sys.argv:
        if arg.startswith("--api-base-url="):
            return arg.split("=", 1)[1]
    env_url = os.environ.get("API_BASE_URL")
    if env_url:
        return env_url
    config_path = Path(__file__).parent / "config.json"
    if config_path.exists():
        with open(config_path) as f:
            cfg = json.load(f)
        if "api_base_url" in cfg:
            return cfg["api_base_url"]
    return None


def get_api_token():
    for arg in sys.argv:
        if arg.startswith("--api-token="):
            return arg.split("=", 1)[1]
    token = os.environ.get("API_TOKEN")
    if token:
        return token
    config_path = Path(__file__).parent / "config.json"
    if config_path.exists():
        with open(config_path) as f:
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


def load_cookies_jar():
    cookies_path = Path(__file__).parent / "cookies.txt"
    if not cookies_path.exists():
        return None
    try:
        import http.cookiejar
        cj = http.cookiejar.MozillaCookieJar(str(cookies_path))
        cj.load()
        logger.info(f"Loaded {len(cj)} cookies from cookies.txt")
        return cj
    except Exception as e:
        logger.warning(f"Failed to load cookies: {e}")
    return None


def make_session():
    session = requests.Session()
    session.headers.update(HEADERS)
    cj = load_cookies_jar()
    if cj:
        session.cookies.update(cj)
    return session


def parse_mbasic_post(article, group_name):
    """Parse a single post from mbasic.facebook.com HTML."""
    try:
        # post id from the article anchor or data
        post_link = article.find("a", href=re.compile(r"/story\.php\?story_fbid=|/posts/"))
        if not post_link:
            post_link = article.find("a", href=re.compile(r"mbasic\.facebook\.com"))
        if not post_link:
            return None

        href = post_link.get("href", "")
        fb_id_match = re.search(r'story_fbid=(\d+)|/posts/(\d+)', href)
        fb_post_id = fb_id_match.group(1) or fb_id_match.group(2) if fb_id_match else None
        fb_post_url = urljoin("https://mbasic.facebook.com", href) if href else None

        # author name
        author_tag = article.find("h3")
        if not author_tag:
            author_tag = article.find("strong")
        author_name = author_tag.get_text(strip=True) if author_tag else ""

        # content text
        content_div = article.find("div", class_="msg")
        if not content_div:
            content_div = article.find("div", attrs={"data-sigil": "message"})
        if not content_div:
            content_div = article.find("span", class_="message")
        if not content_div:
            content_div = article.find("p")
        content = ""
        if content_div:
            content = content_div.get_text("\n", strip=True)
        if not content:
            content = article.get_text("\n", strip=True)[:500]

        # images
        images = []
        for img in article.find_all("img", src=re.compile(r"^https?")):
            src = img.get("src", "")
            if src and "scontent" in src and src not in images:
                images.append(src)

        # time
        time_tag = article.find("abbr") or article.find("time")
        posted_at = time_tag.get("title", "") if time_tag else ""

        if not fb_post_id:
            return None

        return {
            "group_id": None,
            "group_name": group_name,
            "fb_post_id": fb_post_id,
            "fb_post_url": fb_post_url,
            "author_name": author_name,
            "content": content,
            "image_urls": images[:5],
            "posted_at": posted_at,
        }
    except Exception as e:
        logger.debug(f"Error parsing post: {e}")
        return None


def scrape_group(group_name, group_url, max_posts=50):
    group_id = extract_group_id(group_url)
    logger.info(f"Scraping group: {group_name} — ID: {group_id}")

    session = make_session()
    posts = []
    url = f"https://mbasic.facebook.com/groups/{group_id}"

    try:
        resp = session.get(url, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Find all article elements (each is a post)
        articles = soup.find_all("article")
        logger.info(f"Found {len(articles)} articles on page")

        for article in articles:
            post = parse_mbasic_post(article, group_name)
            if post and post["fb_post_id"]:
                if not any(p["fb_post_id"] == post["fb_post_id"] for p in posts):
                    posts.append(post)
            if len(posts) >= max_posts:
                break

        # Try next page if available
        next_link = soup.find("a", href=re.compile(r"/groups/.*?story"))
        if next_link and len(posts) < max_posts:
            try:
                next_url = urljoin("https://mbasic.facebook.com", next_link["href"])
                resp2 = session.get(next_url, timeout=30)
                resp2.raise_for_status()
                soup2 = BeautifulSoup(resp2.text, "html.parser")
                for article in soup2.find_all("article"):
                    post = parse_mbasic_post(article, group_name)
                    if post and post["fb_post_id"]:
                        if not any(p["fb_post_id"] == post["fb_post_id"] for p in posts):
                            posts.append(post)
                    if len(posts) >= max_posts:
                        break
            except Exception as e:
                logger.debug(f"Next page error: {e}")

    except Exception as e:
        logger.error(f"Error scraping {group_name}: {e}")

    logger.info(f"Got {len(posts)} posts from {group_name}")
    return posts


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
    config_path = Path(__file__).parent / "config.json"

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
        if not config_path.exists():
            logger.error("config.json not found. Provide --api-base-url or create config.json")
            sys.exit(1)
        with open(config_path) as f:
            cfg = json.load(f)
        run_with_config(cfg["webhook_url"], cfg["webhook_token"], cfg["groups"], cfg.get("max_posts_per_group", 50))


def run_daemon():
    try:
        import schedule
    except ImportError:
        logger.error("schedule library required for daemon mode. pip install schedule")
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
        config_path = Path(__file__).parent / "config.json"
        if not config_path.exists():
            logger.error("config.json not found")
            sys.exit(1)
        with open(config_path) as f:
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
