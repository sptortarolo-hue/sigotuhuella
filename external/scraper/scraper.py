"""
Facebook Group Scraper — Sigo Tu Huella
Scrapes configured Facebook groups and sends posts to the webhook.

Usage:
  python scraper.py              # Run once
  python scraper.py --daemon     # Run as scheduled daemon

Requires: pip install facebook-scraper requests schedule
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


def load_config():
    config_path = Path(__file__).parent / "config.json"
    if not config_path.exists():
        example = Path(__file__).parent / "config.json.example"
        if example.exists():
            logger.error(
                "config.json not found. Copy config.json.example to config.json "
                "and fill in your groups and webhook URL."
            )
        else:
            logger.error("config.json not found.")
        sys.exit(1)

    with open(config_path) as f:
        return json.load(f)


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


def run():
    config = load_config()
    webhook_url = config["webhook_url"]
    webhook_token = config["webhook_token"]
    max_posts = config.get("max_posts_per_group", 50)

    all_posts = []
    for group in config["groups"]:
        if not group.get("url"):
            continue
        posts = scrape_group(group["name"], group["url"], max_posts)
        all_posts.extend(posts)

    logger.info(f"Total posts scraped: {len(all_posts)}")
    send_to_webhook(webhook_url, webhook_token, all_posts)


def run_daemon():
    try:
        import schedule
    except ImportError:
        logger.error("schedule library required for daemon mode. pip install schedule")
        sys.exit(1)

    config = load_config()
    interval = config.get("scrape_interval_hours", 6)

    logger.info(f"Starting daemon mode — scraping every {interval} hours")
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
