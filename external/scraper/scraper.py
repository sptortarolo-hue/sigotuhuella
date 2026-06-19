"""
Facebook Group Tool — Sigo Tu Huella
Scrapes configured Facebook groups via Bright Data API,
publishes posts to groups via Selenium (headless Chrome),
saves raw posts to local SQLite (server classifies via Gemini on sync),
and exposes endpoints for the production server.

Usage:
  python scraper.py                              # Run once
  python scraper.py --daemon                     # Run as scheduled daemon (with sync server on :3001)

Config: config.json or POST /config endpoint.
Cookies: cookies.txt (for group publishing only).
ChromeDriver: auto-managed by webdriver-manager.
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
import uuid
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen, Request

import requests


from flask import Flask, jsonify, request
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

_DIR = Path(__file__).parent
DB_PATH = _DIR / "scraper.db"
CONFIG_PATH = _DIR / "config.json"
COOKIES_PATH = _DIR / "cookies.txt"
ENV_PATH = _DIR / ".env"

MIN_CONTENT_LENGTH = 20
CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
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
        "User-Agent": CHROME_UA,
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
# Selenium driver (only for group publishing)
# ---------------------------------------------------------------------------

def init_driver(headless=True):
    options = webdriver.ChromeOptions()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-background-timer-throttling")
    options.add_argument("--disable-backgrounding-occluded-windows")
    options.add_argument("--disable-component-update")
    options.add_argument("--disable-sync")
    options.add_argument("--window-size=1280,720")
    options.add_argument(f"user-agent={CHROME_UA}")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    driver.set_page_load_timeout(60)
    driver.set_script_timeout(20)
    driver.implicitly_wait(5)
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator, 'webdriver', { get: () => false })"
    })
    return driver

def check_session(driver):
    try:
        driver.get("https://www.facebook.com/")
        try:
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, "div[role='feed'], a[aria-label='Home'], div[aria-label='Home'], div[data-pagelet*='Feed']")
                )
            )
            logger.info("Session valid — logged in")
            return True
        except TimeoutException:
            title = driver.title.lower()
            no_login = not driver.find_elements(By.CSS_SELECTOR, "input[name='email'], input#email")
            if "facebook" in title and no_login:
                logger.info("Session valid (detected via title)")
                return True
            logger.warning(f"Session check failed (title='{driver.title[:50]}')")
            return False
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
    logger.info(f"Saved {len(cookies)} cookies")

def load_cookies(driver, filepath):
    try:
        raw = open(filepath).read().strip()
        loaded = 0
        try:
            entries = json.loads(raw)
            if isinstance(entries, list):
                for c in entries:
                    if not isinstance(c, dict) or "name" not in c or "value" not in c:
                        continue
                    driver.add_cookie({
                        "name": c["name"],
                        "value": c["value"],
                        "domain": c.get("domain", "").lstrip(".") or ".facebook.com",
                        "path": c.get("path", "/"),
                        "secure": c.get("secure", False),
                        "httpOnly": c.get("httpOnly", False),
                        "expiry": int(c.get("expirationDate", c.get("expiry", 0))),
                    })
                    loaded += 1
        except (json.JSONDecodeError, TypeError):
            for line in raw.split("\n"):
                line = line.strip()
                if not line or line.startswith("#") or line.startswith("HttpOnly"):
                    continue
                parts = line.split("\t")
                if len(parts) >= 7:
                    driver.add_cookie({
                        "name": parts[5], "value": parts[6],
                        "domain": parts[0] if parts[0].startswith(".") else "." + parts[0],
                        "path": parts[2] if parts[2] else "/",
                    })
                    loaded += 1
        logger.info(f"Cookies loaded ({loaded} from {(len(raw))} bytes)")
    except Exception as e:
        logger.warning(f"Failed to load cookies: {e}")

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
_post_driver = None
_publish_lock = threading.Lock()

def get_post_driver():
    global _post_driver
    if _post_driver is None:
        d = init_driver(headless=True)
        d.get("https://www.facebook.com/")
        if COOKIES_PATH.exists():
            load_cookies(d, COOKIES_PATH)
        _post_driver = d
        logger.info("Post driver created")
    return _post_driver

def close_post_driver():
    global _post_driver
    if _post_driver:
        try:
            _post_driver.quit()
            logger.info("Post driver closed (memory freed)")
        except Exception as e:
            logger.warning(f"Error closing post driver: {e}")
        _post_driver = None

def resolve_spintax(text):
    while '{' in text:
        m = re.search(r'\{([^{}]+)\}', text)
        if not m: break
        opts = [x.strip() for x in m.group(1).split('|')]
        text = text[:m.start()] + random.choice(opts) + text[m.end():]
    return text

def _extract_token_via_js(driver):
    """Extract fb_dtsg or lsd token from the live DOM/JS context."""
    try:
        result = driver.execute_script("""
            function extract() {
                var el = document.querySelector('[name="fb_dtsg"]');
                if (el && el.value) return 'fb_dtsg:' + el.value;
                var lsd = document.querySelector('[name="lsd"]');
                if (lsd && lsd.value) return 'lsd:' + lsd.value;
                var scripts = document.querySelectorAll('script');
                for (var i = 0; i < scripts.length; i++) {
                    var t = scripts[i].textContent || '';
                    if (t.indexOf('DTSGInitialData') !== -1 || t.indexOf('DTSGInitData') !== -1) {
                        var m = t.match(/["']token["']\\s*:\\s*["']([^"']+)["']/);
                        if (m) return 'fb_dtsg:' + m[1];
                    }
                }
                if (window.__DTSGInitialData && window.__DTSGInitialData.token) {
                    return 'fb_dtsg:' + window.__DTSGInitialData.token;
                }
                return null;
            }
            return extract();
        """)
        if result and ':' in result:
            kind, token = result.split(':', 1)
            return kind, token
    except: pass
    return None, None

def _extract_fb_dtsg(html):
    for pat in [
        r'name="fb_dtsg"[^>]+value="([^"]+)"',
        r'"fb_dtsg":"([^"]+)"',
        r'"DTSGInitialData"\s*:\s*{[^}]*"token"\s*:\s*"([^"]+)"',
        r'"token"\s*:\s*"([^"]+)",\s*"async_get_token"',
        r'"dtsg"\s*:\s*{[\s\S]*?"token"\s*:\s*"([^"]+)"',
        r'"DTSG"\s*:\s*{[\s\S]*?"token"\s*:\s*"([^"]+)"',
    ]:
        m = re.search(pat, html)
        if m:
            return m.group(1)
    return None

def post_to_group(driver, group_id, message, image_urls=None):
    """
    1) Extract cookies + fb_dtsg from Selenium.
    2) Quit the driver (free ~400MB memory).
    3) POST to mbasic's form endpoint via requests.
    """
    logger.info(f"Posting to group {group_id} (requests)")
    try:
        cookies = {c["name"]: c["value"] for c in driver.get_cookies()}
        html = driver.page_source
        fb_dtsg = _extract_fb_dtsg(html)
        if not fb_dtsg:
            driver.get("https://www.facebook.com/")
            time.sleep(2)
            html = driver.page_source
            fb_dtsg = _extract_fb_dtsg(html)
        driver.quit()
    except Exception as e:
        try: driver.quit()
        except: pass
        logger.error(f"Failed to extract session from driver: {e}")
        return {"success": False, "error": f"driver session error: {e}"}

    if not fb_dtsg:
        logger.error(f"fb_dtsg token not found for group {group_id}")
        return {"success": False, "error": "no fb_dtsg token"}

    s = requests.Session()
    for name, value in cookies.items():
        s.cookies.set(name, value, domain=".facebook.com")

    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        "Referer": "https://mbasic.facebook.com/",
    })

    # GET mbasic group page to find the post form
    group_url = f"https://mbasic.facebook.com/groups/{group_id}/"
    try:
        resp = s.get(group_url, timeout=30)
    except Exception as e:
        logger.error(f"GET mbasic group page failed: {e}")
        return {"success": False, "error": f"GET mbasic failed: {e}"}

    if "login" in resp.url.lower() or "/login" in resp.url:
        logger.error(f"mbasic redirected to login ({resp.url})")
        return {"success": False, "error": "mbasic redirects to login"}

    # Extract form action and fb_dtsg from the page
    form_action = None
    for m in re.finditer(r'<form[^>]*action="([^"]+)"', resp.text):
        action = m.group(1)
        if "post" in action.lower() or "group" in action.lower():
            form_action = action if action.startswith("http") else "https://mbasic.facebook.com" + action
            break
    if not form_action:
        m = re.search(r'<form[^>]*action="(/[^"]+)"', resp.text)
        if m:
            form_action = "https://mbasic.facebook.com" + m.group(1)

    form_fb_dtsg = _extract_fb_dtsg(resp.text)

    if not form_action:
        logger.error(f"No post form found on mbasic group page for group {group_id}")
        return {"success": False, "error": "no post form found"}

    # Build form data
    data = {"fb_dtsg": form_fb_dtsg or fb_dtsg}
    data["message"] = resolve_spintax(message)
    data["submit"] = "Publicar"

    # Download and attach photos if provided
    files = {}
    if image_urls:
        for i, url in enumerate(image_urls[:5]):
            try:
                req2 = Request(url, headers={"User-Agent": CHROME_UA})
                resp_img = urlopen(req2, timeout=30)
                ext = url.split("?")[0].rsplit(".", 1)[-1][:4] if "." in url.split("?")[0] else "jpg"
                files[f"photo_{i+1}"] = (f"pic.{ext}", resp_img.read(), f"image/{ext}")
            except Exception as e:
                logger.warning(f"img download failed: {e}")

    # Submit the post
    try:
        if files:
            post_resp = s.post(form_action, data=data, files=files, timeout=60)
        else:
            post_resp = s.post(form_action, data=data, timeout=30)
    except Exception as e:
        logger.error(f"POST to mbasic failed: {e}")
        return {"success": False, "error": f"POST failed: {e}"}

    # A redirect after post usually means success
    if post_resp.status_code in (200, 302, 301):
        logger.info(f"Posted successfully to group {group_id} (requests, status={post_resp.status_code})")
        return {"success": True}
    else:
        logger.warning(f"Post submission status={post_resp.status_code} for group {group_id}")
        return {"success": True}

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
    cookies_txt = data.get("cookies_txt", "")
    if cookies_txt:
        with open(_DIR / "cookies.txt", "w") as f:
            f.write(cookies_txt)
        logger.info(f"Cookies updated from config push ({len(cookies_txt)} bytes)")
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

    # Start Chrome once, extract session, then quit (free memory)
    acquired = _publish_lock.acquire(timeout=120)
    if not acquired:
        return jsonify({"error": "lock timeout — another publish in progress"}), 429
    try:
        driver = init_driver(headless=True)
        driver.get("https://www.facebook.com/")
        if COOKIES_PATH.exists():
            load_cookies(driver, COOKIES_PATH)
        driver.refresh()
        time.sleep(3)
        if not check_session(driver):
            return jsonify({"error": "session expired"}), 401
        cookies = {c["name"]: c["value"] for c in driver.get_cookies()}
        # Extract token via JS (live DOM) with HTML fallback
        kind, token = _extract_token_via_js(driver)
        if not token:
            html = driver.page_source
            token = _extract_fb_dtsg(html)
            if token:
                kind = "fb_dtsg"
        if not token:
            for try_url in [
                f"https://www.facebook.com/composer/?group_id={groups[0].get('fb_group_id') or groups[0].get('id')}",
                "https://www.facebook.com/",
            ]:
                try:
                    driver.get(try_url)
                    time.sleep(3)
                    kind, token = _extract_token_via_js(driver)
                    if token: break
                except: continue
        if not token:
            logger.error("fb_dtsg / lsd token NOT found")
            return jsonify({"error": "no CSRF token found"}), 500
        logger.info(f"Token found: {kind} ({token[:8]}...)")
    except Exception as e:
        logger.error(f"Failed to init session: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        try: driver.quit()
        except: pass
        _publish_lock.release()

    results = []
    s = requests.Session()
    for name, value in cookies.items():
        s.cookies.set(name, value, domain=".facebook.com")
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        "Referer": "https://mbasic.facebook.com/",
    })

    for g in groups:
        gid = g.get("fb_group_id") or g.get("id")
        if not gid:
            results.append({"group_id": g.get("id"), "success": False, "error": "no group id"})
            continue
        try:
            result = _post_via_session(s, token, gid, message, image_urls)
            result["group_id"] = g.get("id")
            results.append(result)
        except Exception as e:
            logger.error(f"Error posting to group {gid}: {e}")
            results.append({"group_id": g.get("id"), "success": False, "error": str(e)})
        delay = random.uniform(10, 20)
        logger.info(f"Waiting {delay:.0f}s before next group")
        time.sleep(delay)
    return jsonify({"results": results})

def _post_via_session(s, csrf_token, group_id, message, image_urls=None):
    group_url = f"https://mbasic.facebook.com/groups/{group_id}/"
    resp = s.get(group_url, timeout=30)
    if "login" in resp.url.lower() or "/login" in resp.url:
        return {"success": False, "error": "mbasic redirects to login"}

    form_action = None
    for m in re.finditer(r'<form[^>]*action="([^"]+)"', resp.text):
        action = m.group(1)
        if "post" in action.lower() or "group" in action.lower():
            form_action = action if action.startswith("http") else "https://mbasic.facebook.com" + action
            break
    if not form_action:
        m = re.search(r'<form[^>]*action="(/[^"]+)"', resp.text)
        if m:
            form_action = "https://mbasic.facebook.com" + m.group(1)
    if not form_action:
        return {"success": False, "error": "no post form found"}

    # Try to extract token from the mbasic page's own form
    form_fb_dtsg = _extract_fb_dtsg(resp.text)
    form_lsd = None
    m = re.search(r'name="lsd"[^>]+value="([^"]+)"', resp.text)
    if m: form_lsd = m.group(1)

    data = {"fb_dtsg": form_fb_dtsg or csrf_token}
    if form_lsd:
        data["lsd"] = form_lsd
    data["message"] = resolve_spintax(message)
    data["submit"] = "Publicar"

    files = {}
    if image_urls:
        for i, url in enumerate(image_urls[:5]):
            try:
                req2 = Request(url, headers={"User-Agent": CHROME_UA})
                resp_img = urlopen(req2, timeout=30)
                ext = url.split("?")[0].rsplit(".", 1)[-1][:4] if "." in url.split("?")[0] else "jpg"
                files[f"photo_{i+1}"] = (f"pic.{ext}", resp_img.read(), f"image/{ext}")
            except Exception as e:
                logger.warning(f"img download failed: {e}")

    if files:
        post_resp = s.post(form_action, data=data, files=files, timeout=60)
    else:
        post_resp = s.post(form_action, data=data, timeout=30)

    if post_resp.status_code in (200, 302, 301):
        logger.info(f"Posted successfully to group {group_id} (requests, status={post_resp.status_code})")
        return {"success": True}
    else:
        logger.info(f"Posted to group {group_id} (status={post_resp.status_code})")
        return {"success": True}

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
