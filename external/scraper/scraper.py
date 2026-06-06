"""
Facebook Group Scraper — Sigo Tu Huella
Scrapes configured Facebook groups and sends posts to the webhook.

Usage:
  python scraper.py              # Run once (fetches config from API)
  python scraper.py --daemon     # Run as scheduled daemon

Config priority:
  1. Command-line argument --api-base-url (or API_BASE_URL env var)
  2. config.json (legacy local config)
"""

import json
import os
import sys
import time
import logging
from datetime import datetime
from pathlib import Path

import requests
from facebook_scraper import get_posts

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("fb-scraper")


def get_api_base_url():
    """Return API base URL from CLI arg, env var, or config.json fallback."""
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
    """Return API token from CLI arg, env var, or config.json fallback."""
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
    """Fetch scraper config from the app API."""
    url = f"{api_base_url.rstrip('/')}/api/facebook/scraper-config"
    headers = {"Authorization": f"Bearer {webhook_token}"}
    logger.info(f"Fetching config from {url}")
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()


def scrape_group(group_name, group_url, max_posts=50):
    """Scrape posts from a Facebook group."""
    logger.info(f"Scraping group: {group_name} ({group_url})")

    posts = []
    try:
        for post in get_posts(group_url, pages=5, options={"posts_per_page": max_posts}):
            post_data = {
                "group_id": None,
                "group_name": group_name,
                "fb_post_id": str(post.get("post_id", "")),
                "fb_post_url": post.get("post_url", ""),
                "author_name": post.get("username", ""),
                "content": post.get("text", ""),
                "image_urls": post.get("images", []),
                "posted_at": (
                    post.get("time").isoformat()
                    if post.get("time")
                    else None
                ),
            }
            if post_data["fb_post_id"]:
                posts.append(post_data)

            if len(posts) >= max_posts:
                break

    except Exception as e:
        logger.error(f"Error scraping {group_name}: {e}")

    logger.info(f"Got {len(posts)} posts from {group_name}")
    return posts


def send_to_webhook(webhook_url, webhook_token, posts):
    """Send scraped posts to the app webhook."""
    if not posts:
        logger.info("No posts to send.")
        return

    payload = {"posts": posts}
    headers = {"Authorization": f"Bearer {webhook_token}", "Content-Type": "application/json"}

    try:
        resp = requests.post(webhook_url, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"Webhook response: {result}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending to webhook: {e}")


def run_with_config(webhook_url, webhook_token, groups, max_posts):
    """Scrape all groups and send to webhook."""
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
        # Auto-configure from API
        logger.info("Auto-config mode: fetching from API")
        token = get_api_token()
        if not token:
            logger.error("API_TOKEN required when using --api-base-url. Use --api-token=TOKEN or set API_TOKEN env var")
            sys.exit(1)

        cfg = fetch_config(api_base_url, token)
        run_with_config(
            cfg["webhook_url"],
            cfg["webhook_token"],
            cfg["groups"],
            cfg["max_posts_per_group"],
        )
    else:
        # Legacy: read config.json
        logger.info("Legacy mode: reading config.json")
        if not config_path.exists():
            logger.error(
                "config.json not found. Provide --api-base-url or create config.json"
            )
            sys.exit(1)

        with open(config_path) as f:
            cfg = json.load(f)

        run_with_config(
            cfg["webhook_url"],
            cfg["webhook_token"],
            cfg["groups"],
            cfg.get("max_posts_per_group", 50),
        )


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
        logger.info("Daemon mode: fetching config from API every cycle")

        def job():
            try:
                cfg = fetch_config(api_base_url, token)
                run_with_config(
                    cfg["webhook_url"],
                    cfg["webhook_token"],
                    cfg["groups"],
                    cfg["max_posts_per_group"],
                )
            except Exception as e:
                logger.error(f"Daemon cycle error: {e}")
            # Re-schedule with updated interval
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
        # Legacy daemon mode
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
