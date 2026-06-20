"""
Facebook Group Tool — Sigo Tu Huella
Scrapes configured Facebook groups via Bright Data API,
publishes posts to groups via Playwright (headless Chromium),
saves raw posts to local SQLite (server classifies via Gemini on sync),
and exposes endpoints for the production server.

Usage:
  python scraper.py                              # Run once
  python scraper.py --daemon                     # Run as scheduled daemon (with sync server on :3001)

Config: config.json or POST /config endpoint.
Session: storage_state.json (Playwright storage state for group publishing).
Generate: run generate_session.py on your local machine, upload via admin panel.
"""

import json
import logging
import os
import random
import re
import sqlite3
import sys
import threading
import time
import traceback
import uuid
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen, Request

from flask import Flask, jsonify, request
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("fb-scraper")

_DIR = Path(__file__).parent
DB_PATH = _DIR / "scraper.db"
CONFIG_PATH = _DIR / "config.json"
STORAGE_STATE_PATH = _DIR / "storage_state.json"
ENV_PATH = _DIR / ".env"

MIN_CONTENT_LENGTH = 20
PLAYWRIGHT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
SYNC_PORT = int(os.environ.get("SYNC_PORT", "3001"))

if ENV_PATH.exists():
    with open(ENV_PATH) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                _k = _k.strip()
                _v = _v.strip().strip("'\"")
                if _k and not os.environ.get(_k):
                    os.environ[_k] = _v

# ---------------------------------------------------------------------------
# SQLite
# ---------------------------------------------------------------------------

def init_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY,
            fb_post_id TEXT UNIQUE NOT NULL,
            fb_post_url TEXT,
            group_id TEXT,
            group_name TEXT,
            author_name TEXT,
            content TEXT,
            image_urls TEXT,
            posted_at TEXT,
            scraped_at TEXT,
            classification TEXT,
            species TEXT,
            color TEXT,
            location_hint TEXT,
            phone TEXT,
            latitude REAL,
            longitude REAL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            post_id TEXT NOT NULL REFERENCES posts(id),
            fb_comment_id TEXT,
            author_name TEXT,
            text TEXT,
            posted_at TEXT,
            classification TEXT
        )
    """)
    conn.commit()
    return conn

def save_post(conn, post, cls):
    now = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        INSERT OR REPLACE INTO posts
            (id, fb_post_id, fb_post_url, group_id, group_name, author_name,
             content, image_urls, posted_at, scraped_at,
             classification, species, color, location_hint, phone, latitude, longitude)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        str(uuid.uuid4()),
        post.get("fb_post_id"),
        post.get("fb_post_url"),
        post.get("group_id"),
        post.get("group_name"),
        post.get("author_name"),
        post.get("content"),
        json.dumps(post.get("image_urls", [])),
        post.get("posted_at"),
        now,
        cls.get("classification", "other"),
        cls.get("species"),
        cls.get("color"),
        cls.get("location_hint"),
        cls.get("phone"),
        cls.get("location_lat"),
        cls.get("location_lng"),
    ))
    row = conn.execute("SELECT id FROM posts WHERE fb_post_id = ?", (post.get("fb_post_id"),)).fetchone()
    return row[0] if row else None

def save_comments(conn, post_id, comments, classified):
    for i, cmt in enumerate(comments[:20]):
        c = classified[i] if i < len(classified) else {}
        conn.execute("""
            INSERT OR REPLACE INTO comments
                (id, post_id, fb_comment_id, author_name, text, posted_at, classification)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            cmt.get("id", str(uuid.uuid4())),
            post_id,
            cmt.get("id"),
            cmt.get("author"),
            cmt.get("text"),
            cmt.get("timestamp"),
            c.get("classification", "info"),
        ))

def get_unsynced_posts(conn, since=None):
    if since:
        cur = conn.execute("SELECT * FROM posts WHERE scraped_at > ? ORDER BY scraped_at ASC", (since,))
    else:
        cur = conn.execute("SELECT * FROM posts ORDER BY scraped_at ASC")
    columns = [d[0] for d in cur.description]
    posts = []
    for row in cur.fetchall():
        p = dict(zip(columns, row))
        p["image_urls"] = json.loads(p.get("image_urls") or "[]")
        ccur = conn.execute("SELECT * FROM comments WHERE post_id = ?", (p["id"],))
        ccols = [d[0] for d in ccur.description]
        p["comments"] = [dict(zip(ccols, r)) for r in ccur.fetchall()]
        posts.append(p)
    return posts

def load_groups():
    cfg = _load_config()
    return cfg.get("groups", []), cfg.get("scrape_interval_hours", 6), cfg.get("max_posts_per_group", 50)

def _load_config():
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {}

def save_config(groups, interval=6, max_posts=50, api_key=""):
    cfg = _load_config()
    cfg["groups"] = groups
    cfg["scrape_interval_hours"] = interval
    cfg["max_posts_per_group"] = max_posts
    if api_key:
        cfg["brightdata_api_key"] = api_key
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)

# ---------------------------------------------------------------------------
# Raw classifier (DonWeb does the real Gemini classification)
# ---------------------------------------------------------------------------

def classify_post(text, image_urls=None):
    return {"classification": "unclassified", "species": None, "color": None, "location_hint": None, "phone": None, "location_lat": None, "location_lng": None, "confidence": 0}

# ---------------------------------------------------------------------------
# Bright Data API
# ---------------------------------------------------------------------------

BRIGHTDATA_GROUP_DATASET = "gd_lz11l67o2cb3r0lkj3"
BRIGHTDATA_POST_DATASET = "gd_lyclm1571iy3mv57zw"

def extract_group_id(url):
    m = re.search(r"/groups/([^/?]+)", url)
    raw = m.group(1) if m else url
    return raw.split("?")[0].split("/")[0]

def scrape_group_via_brightdata(group_name, group_url, api_key):
    group_id = extract_group_id(group_url)
    logger.info(f"[BD] Scraping {group_name} ({group_id})")
    api_url = f"https://api.brightdata.com/datasets/v3/scrape?dataset_id={BRIGHTDATA_GROUP_DATASET}&format=json&include_errors=true"
    payload = json.dumps([{"url": f"https://www.facebook.com/groups/{group_id}/"}]).encode()
    req = Request(api_url, data=payload, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": PLAYWRIGHT_UA,
    })
    try:
        resp = urlopen(req, timeout=120)
        data = json.loads(resp.read().decode())
    except Exception as e:
        logger.error(f"[BD] API error for {group_name}: {e}")
        return []
    if isinstance(data, dict) and data.get("snapshot_id"):
        logger.info(f"[BD] Async snapshot {data['snapshot_id']} for {group_name}, will skip this cycle")
        return []
    if not isinstance(data, list):
        logger.warning(f"[BD] Unexpected response type for {group_name}: {type(data).__name__}")
        return []
    posts = []
    for record in data:
        if record.get("_error") or record.get("error"):
            if record.get("_error"):
                logger.warning(f"[BD] Error for one URL in {group_name}: {record['_error']}")
            continue
        pid = record.get("post_id") or extract_post_id_from_url(record.get("url", ""))
        if not pid:
            continue
        content = record.get("content") or ""
        if len(content.strip()) < MIN_CONTENT_LENGTH:
            continue
        images = []
        for a in record.get("attachments") or []:
            src = a.get("photo_image") or a.get("image_url") or a.get("thumbnail_url") or a.get("src")
            if src and src.startswith("http"):
                images.append(src)
        posts.append({
            "group_id": group_id,
            "group_name": group_name,
            "fb_post_id": pid,
            "fb_post_url": record.get("url") or f"https://www.facebook.com/groups/{group_id}/posts/{pid}/",
            "author_name": record.get("user_username_raw") or record.get("user_url") or "",
            "content": content[:2000],
            "image_urls": images[:5],
            "posted_at": record.get("date_posted") or "",
            "comments": [],
        })
    logger.info(f"[BD] {group_name}: got {len(posts)} posts")
    return posts

def extract_post_id_from_url(url):
    m = re.search(r'/posts/(\d+)', url)
    return m.group(1) if m else None

# ---------------------------------------------------------------------------
# Playwright (only for group publishing)
# ---------------------------------------------------------------------------

def _launch_playwright(headless=True, storage_state_path=None):
    """Launch Playwright and return (playwright, browser, context, page)."""
    p = sync_playwright().start()
    browser = p.chromium.launch(
        headless=headless,
        args=[
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-component-update",
            "--disable-sync",
            f"--user-agent={PLAYWRIGHT_UA}",
        ],
    )
    kwargs = {"user_agent": PLAYWRIGHT_UA, "viewport": {"width": 1280, "height": 720}}
    if storage_state_path and storage_state_path.exists():
        kwargs["storage_state"] = str(storage_state_path)
    context = browser.new_context(**kwargs)
    page = context.new_page()
    return p, browser, context, page

def check_session(page):
    """Verify Facebook session by loading homepage and checking for login redirect."""
    try:
        page.goto("https://www.facebook.com/", timeout=30000, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        current = page.url
        if "/login" in current.lower() or "checkpoint" in current.lower():
            _save_debug_screenshot(page, "session_login_redirect")
            logger.warning(f"Session expired ({current})")
            return False
        try:
            page.wait_for_selector(
                "div[role='feed'], a[aria-label='Home'], div[aria-label='Home'], div[data-pagelet*='Feed']",
                timeout=25000,
            )
            logger.info("Session valid")
            return True
        except PlaywrightTimeout:
            _save_debug_screenshot(page, "session_no_feed")
            current = page.url
            if "/login" in current.lower() or "checkpoint" in current.lower():
                _save_debug_screenshot(page, "session_login_redirect_late")
                logger.warning(f"Session expired — redirected to login ({current})")
                return False
            logger.warning(f"No feed found but no login redirect — proceeding anyway (url='{current}')")
            return True
    except Exception as e:
        _save_debug_screenshot(page, "session_error")
        logger.warning(f"Session check error: {e}")
        return False

# ---------------------------------------------------------------------------
# Post driver
# ---------------------------------------------------------------------------

def run():
    groups, _, max_posts = load_groups()
    if not groups:
        logger.warning("No groups configured. Use POST /config endpoint or edit config.json")
        return
    cfg = _load_config()
    api_key = cfg.get("brightdata_api_key", "")
    if not api_key:
        logger.error("No brightdata_api_key configured. Set it via admin panel or config endpoint")
        return
    conn = init_db()
    for group in groups:
        if not group.get("url"):
            continue
        posts = scrape_group_via_brightdata(group["name"], group["url"], api_key)
        for post in posts:
            pid = save_post(conn, post, classify_post(post.get("content", ""), post.get("image_urls", [])))
            if pid:
                conn.commit()
                logger.info(f"Saved {post['fb_post_id']} → raw")
    conn.close()

# ---------------------------------------------------------------------------
# Post driver globals (must be before any route that uses them)
# ---------------------------------------------------------------------------
_playwright_ctx = None  # (pw, browser, context, page)
_publish_lock = threading.Lock()

def resolve_spintax(text):
    while '{' in text:
        m = re.search(r'\{([^{}]+)\}', text)
        if not m: break
        opts = [x.strip() for x in m.group(1).split('|')]
        text = text[:m.start()] + random.choice(opts) + text[m.end():]
    return text

def get_playwright():
    global _playwright_ctx
    if _playwright_ctx is None:
        pw, browser, context, page = _launch_playwright(headless=True, storage_state_path=STORAGE_STATE_PATH)
        _playwright_ctx = (pw, browser, context, page)
        logger.info("Playwright browser created")
    return _playwright_ctx[3], _playwright_ctx[2]  # page, context

def close_playwright():
    global _playwright_ctx
    if _playwright_ctx:
        pw, browser, context, page = _playwright_ctx
        try:
            context.close()
            browser.close()
            pw.stop()
            logger.info("Playwright closed (memory freed)")
        except Exception as e:
            logger.warning(f"Error closing Playwright: {e}")
        _playwright_ctx = None

def _cleanup_debug(max_files=30):
    try:
        debug_dir = _DIR / "debug"
        if not debug_dir.exists():
            return
        files = sorted(debug_dir.iterdir(), key=lambda f: f.stat().st_mtime, reverse=True)
        if len(files) > max_files:
            for f in files[max_files:]:
                f.unlink(missing_ok=True)
            logger.info(f"[Debug] Cleaned {len(files) - max_files} old debug files")
    except Exception as e:
        logger.warning(f"[Debug] Cleanup error: {e}")

def _save_debug_screenshot(page, name):
    try:
        debug_dir = _DIR / "debug"
        debug_dir.mkdir(exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        page.screenshot(path=str(debug_dir / f"{name}_{ts}.png"))
        with open(debug_dir / f"{name}_{ts}.html", "w", encoding="utf-8") as f:
            f.write(page.content())
        logger.info(f"[Debug] Saved {name}_{ts}")
        _cleanup_debug()
    except Exception as e:
        logger.warning(f"[Debug] Failed to save: {e}")

def _find_composer(page):
    """Find the composer element using multiple selector strategies."""
    strategies = [
        # 1. Direct contenteditable
        ("css", "div[role='textbox'][contenteditable='true']:visible"),
        ("css", "div.notranslate[contenteditable='true']:visible"),
        # 2. By aria-label
        ("css", "div[aria-label*='Escribe' i]:visible"),
        ("css", "div[aria-label*='Write' i]:visible"),
        ("css", "div[aria-label*='Crea' i]:visible"),
        ("css", "div[aria-label*='Create' i]:visible"),
        # 3. Any contenteditable
        ("css", "[contenteditable='true']:visible"),
    ]
    for kind, sel in strategies:
        try:
            locator = page.locator(sel)
            if locator.count() > 0 and locator.first.is_visible():
                return locator.first
        except:
            continue
    return None

def _find_post_button(page):
    """Find the Post/Publicar button using multiple selector strategies."""
    strategies = [
        # XPath selectors first (more flexible)
        "//div[@role='button' and not(contains(@aria-disabled,'true')) and contains(text(),'Publicar')]",
        "//div[@role='button' and not(contains(@aria-disabled,'true')) and contains(text(),'Post')]",
        "//div[@role='button' and contains(text(),'Publicar')]",
        "//div[@role='button' and contains(text(),'Post')]",
        "//span[contains(text(),'Publicar')]",
        "//*[contains(text(),'Publicar')]",
        "//span[contains(text(),'Post')]",
        # CSS selectors
        "div[aria-label='Publicar']",
        "div[aria-label='Post']",
        "button[type='submit']",
    ]
    for sel in strategies:
        try:
            locator = page.locator(sel)
            if locator.count() > 0:
                return locator.first
        except:
            continue
    return None

def post_to_group_via_dom(page, context, group_id, message, image_urls=None):
    """Post to a Facebook group using Playwright DOM interaction with robust selector fallbacks."""
    group_id = str(group_id).strip()
    logger.info(f"[DOM] Posting to group {group_id}")

    # Navigate to group
    for url in [
        "https://www.facebook.com/",
        f"https://www.facebook.com/groups/{group_id}/",
    ]:
        try:
            page.goto(url, timeout=30000, wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
        except Exception:
            pass
    page.wait_for_timeout(5000)

    current_url = page.url
    page_title = page.title()[:80]
    logger.info(f"[DOM] URL={current_url} title='{page_title}'")

    # If redirected to login, try refreshing
    if "/login" in current_url or "login" in current_url.lower():
        _save_debug_screenshot(page, f"login_redirect_{group_id}")
        logger.warning("[DOM] Redirected to login, refreshing")
        try:
            page.goto(f"https://www.facebook.com/groups/{group_id}/", timeout=30000, wait_until="domcontentloaded")
            page.wait_for_timeout(5000)
        except Exception:
            pass
        logger.info(f"[DOM] After refresh URL={page.url}")
        _save_debug_screenshot(page, f"after_refresh_{group_id}")

    composer = None

    # Strategy A: quick find
    composer = _find_composer(page)
    if composer:
        logger.info("[DOM] Found composer via quick find")

    # Strategy B: wait for contenteditable
    if not composer:
        try:
            page.wait_for_selector("div[role='textbox'][contenteditable='true'], [contenteditable='true']", timeout=8000)
            composer = _find_composer(page)
            if composer:
                logger.info("[DOM] Found composer via wait")
        except PlaywrightTimeout:
            pass

    # Strategy C: click "Create Post" button
    if not composer:
        for btn_sel in [
            "//span[contains(text(),'Crear publicaci')]",
            "//span[contains(text(),'Create post')]",
            "//span[contains(text(),'Escribe algo')]",
            "//span[contains(text(),'Write something')]",
            "//div[@role='button' and contains(text(),'Crear')]",
            "//div[@role='button' and contains(text(),'Create')]",
            "//*[@aria-label='Crear publicaci' or @aria-label='Create post']",
        ]:
            try:
                btn = page.locator(btn_sel)
                if btn.count() > 0:
                    btn.first.click()
                    page.wait_for_timeout(2000)
                    composer = _find_composer(page)
                    if composer:
                        logger.info(f"[DOM] Found composer after create-btn click")
                        break
            except:
                continue

    # Strategy D: open composer URL directly
    if not composer:
        try:
            page.goto(f"https://www.facebook.com/composer/?group_id={group_id}", timeout=30000, wait_until="domcontentloaded")
            page.wait_for_timeout(5000)
            composer = _find_composer(page)
            if composer:
                logger.info("[DOM] Found composer via direct URL")
        except:
            pass

    # Strategy E: reload and retry
    if not composer:
        try:
            logger.warning("[DOM] Reloading page and retrying composer")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(6000)
            composer = _find_composer(page)
            if composer:
                logger.info("[DOM] Found composer after reload")
        except:
            pass

    # Strategy F: navigate to recent activity tab
    if not composer:
        try:
            page.goto(f"https://www.facebook.com/groups/{group_id}/?sorting_setting=RECENT_ACTIVITY", timeout=30000, wait_until="domcontentloaded")
            page.wait_for_timeout(5000)
            composer = _find_composer(page)
            if composer:
                logger.info("[DOM] Found composer via posts tab")
        except:
            pass

    if not composer:
        _save_debug_screenshot(page, f"composer_not_found_{group_id}")
        return {"success": False, "error": "composer not found"}

    _save_debug_screenshot(page, f"composer_found_{group_id}")

    # 2. Type message via JavaScript
    try:
        composer.click()
        page.wait_for_timeout(1000)
    except:
        pass

    # Re-find composer after click (may have expanded)
    composer = _find_composer(page) or composer

    msg = resolve_spintax(message)
    try:
        page.evaluate("(el, text) => { el.focus(); el.innerText = text; }", composer, msg)
    except Exception as e:
        logger.warning(f"[DOM] JS innerText failed: {e}")
        try:
            page.evaluate("(el, text) => { el.textContent = text; }", composer, msg)
        except Exception as e2:
            logger.warning(f"[DOM] JS textContent failed: {e2}")
            try:
                composer.type(msg, delay=50)
            except Exception as e3:
                return {"success": False, "error": f"cannot type message: {e3}"}

    # 3. Upload images
    temp_files = []
    if image_urls:
        for i, url in enumerate(image_urls[:5]):
            try:
                req = Request(url, headers={"User-Agent": PLAYWRIGHT_UA})
                resp = urlopen(req, timeout=30)
                data = resp.read()
                ext = "jpg"
                if "." in url.split("?")[0]:
                    ext = url.split("?")[0].rsplit(".", 1)[-1][:4]
                tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
                tmp.write(data)
                tmp.close()
                temp_files.append(tmp.name)
            except Exception as e:
                logger.warning(f"[DOM] Image download failed: {e}")

        if temp_files:
            uploaded = False
            # Try direct file input set
            try:
                file_input = page.locator("input[type='file']").first
                if file_input.count() > 0:
                    file_input.set_input_files(temp_files)
                    uploaded = True
                    logger.info(f"[DOM] Uploaded {len(temp_files)} images via direct input")
            except:
                pass

            # Try clicking photo button then file chooser
            if not uploaded:
                for photo_sel in [
                    "//div[@role='button' and (@aria-label='Foto' or @aria-label='Photo' or @aria-label='Agregar foto' or @aria-label='Add photo')]",
                    "//div[@role='button' and (@aria-label='Foto/video' or @aria-label='Photo/video')]",
                ]:
                    try:
                        photo_btn = page.locator(photo_sel).first
                        if photo_btn.count() > 0:
                            with page.expect_file_chooser() as fc_info:
                                photo_btn.click()
                            file_chooser = fc_info.value
                            file_chooser.set_files(temp_files)
                            uploaded = True
                            logger.info(f"[DOM] Uploaded {len(temp_files)} images via file chooser")
                            break
                    except:
                        continue

            if not uploaded:
                logger.warning("[DOM] Could not upload images")

            for f in temp_files:
                try: os.unlink(f)
                except: pass

    # 4. Click body to blur and trigger Post button
    try:
        page.locator("body").click()
        page.wait_for_timeout(1000)
    except:
        pass

    # 5. Click Post button
    post_button = _find_post_button(page)

    if not post_button:
        # Last resort: press Enter
        try:
            logger.info("[DOM] Trying Enter key as last resort")
            page.keyboard.press("Enter")
            page.wait_for_timeout(3000)
            return {"success": True}
        except:
            pass
        _save_debug_screenshot(page, f"post_btn_not_found_{group_id}")
        return {"success": False, "error": "post button not found"}

    try:
        post_button.click()
        logger.info(f"[DOM] Post button clicked for group {group_id}")
        page.wait_for_timeout(3000)
        return {"success": True}
    except Exception as e:
        _save_debug_screenshot(page, f"post_click_failed_{group_id}")
        return {"success": False, "error": f"click failed: {e}"}


sync_app = Flask(__name__)

@sync_app.route("/health")
def health():
    return jsonify({"ok": True})

@sync_app.route("/sync")
def sync_get():
    since = request.args.get("since")
    conn = init_db()
    try:
        posts = get_unsynced_posts(conn, since)
        return jsonify({"posts": posts, "count": len(posts)})
    finally:
        conn.close()

@sync_app.route("/config", methods=["POST"])
def sync_config():
    data = request.get_json()
    if not data or "groups" not in data:
        return jsonify({"error": "invalid"}), 400
    save_config(data["groups"], data.get("scrape_interval_hours", 6), data.get("max_posts_per_group", 50), data.get("brightdata_api_key", ""))
    logger.info(f"Config received: {len(data['groups'])} groups")
    state_json = data.get("storage_state_json", "")
    if state_json:
        with open(STORAGE_STATE_PATH, "w") as f:
            f.write(state_json)
        logger.info(f"Storage state updated from config push ({len(state_json)} bytes)")
    if data.get("brightdata_api_key"):
        logger.info("Bright Data API key updated from config push")
    return jsonify({"ok": True})

@sync_app.route("/publish-to-groups", methods=["POST"])
def publish_to_groups():
    data = request.get_json()
    groups = data.get("groups", [])
    message = data.get("message", "")
    image_urls = data.get("image_urls", [])
    if not groups or not message:
        return jsonify({"error": "groups and message required"}), 400

    acquired = _publish_lock.acquire(timeout=300)
    if not acquired:
        return jsonify({"error": "lock timeout — another publish in progress"}), 429

    pw = browser = context = page = None
    try:
        pw, browser, context, page = _launch_playwright(headless=True, storage_state_path=STORAGE_STATE_PATH)
        page.goto("https://www.facebook.com/", timeout=30000, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        if not check_session(page):
            return jsonify({"error": "session expired"}), 401

        results = []
        for g in groups:
            gid = g.get("fb_group_id") or g.get("id")
            if not gid:
                results.append({"group_id": g.get("id"), "success": False, "error": "no group id"})
                continue
            try:
                result = post_to_group_via_dom(page, context, gid, message, image_urls)
                result["group_id"] = g.get("id")
                results.append(result)
            except Exception as e:
                logger.error(f"Error posting to group {gid}: {e}\n{traceback.format_exc()}")
                results.append({"group_id": g.get("id"), "success": False, "error": str(e)})
            delay = random.uniform(5, 10)
            logger.info(f"Waiting {delay:.0f}s before next group")
            time.sleep(delay)

        return jsonify({"results": results})
    except Exception as e:
        logger.error(f"Publish error: {e}\n{traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500
    finally:
        if context:
            try: context.close()
            except: pass
        if browser:
            try: browser.close()
            except: pass
        if pw:
            try: pw.stop()
            except: pass
        _publish_lock.release()

def _clamp_interval(h):
    return max(1, min(24, int(h or 6)))

def run_daemon():
    try:
        import schedule
    except ImportError:
        logger.error("schedule library required")
        sys.exit(1)
    threading.Thread(target=lambda: sync_app.run(host="0.0.0.0", port=SYNC_PORT, threaded=True, debug=False, use_reloader=False), daemon=True).start()
    logger.info(f"Sync server on port {SYNC_PORT}")
    def job():
        try:
            run()
        except Exception as e:
            logger.error(f"Cycle error: {e}")
    def _reschedule(cfg_interval):
        schedule.clear()
        interval = _clamp_interval(cfg_interval)
        minute = random.randint(5, 55)
        schedule.every(interval).hours.at(f":{minute:02d}").do(job)
        logger.info(f"Scrape scheduled every {interval}h at :{minute:02d}")
        return interval
    groups, cur_hours, _ = load_groups()
    cur_hours = _reschedule(cur_hours)
    job()
    while True:
        schedule.run_pending()
        _, new_hours, _ = load_groups()
        nh = _clamp_interval(new_hours)
        if nh != cur_hours:
            cur_hours = _reschedule(nh)
        time.sleep(60)

# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if "--daemon" in sys.argv:
        run_daemon()
    elif "--sync-server" in sys.argv:
        sync_app.run(host="0.0.0.0", port=SYNC_PORT, debug=False)
    else:
        run()
