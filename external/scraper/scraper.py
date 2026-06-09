"""
Facebook Group Scraper — Sigo Tu Huella
Scrapes configured Facebook groups via Selenium (headless Chrome),
classifies posts with Gemini AI, saves to local SQLite,
and exposes a sync endpoint for the production server.

Usage:
  python scraper.py                              # Run once
  python scraper.py --daemon                     # Run as scheduled daemon (with sync server on :3001)

Config: config.json or POST /config endpoint.
Cookies: cookies.txt (auto-refreshed via FB_EMAIL/FB_PASSWORD).
ChromeDriver: auto-managed by webdriver-manager.
"""

import json
import logging
import os
import re
import sqlite3
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import google.generativeai as genai
from bs4 import BeautifulSoup
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
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

CLASSIFICATION_PROMPT = """Eres un clasificador de publicaciones de Facebook sobre mascotas perdidas y encontradas para la app "Sigo Tu Huella".
Analizá el post. Devolvé SOLO un JSON válido sin markdown:

{
  "classification": "lost" | "found" | "sighting" | "reunion" | "other",
  "species": "dog" | "cat" | "other" | null,
  "species_other": "string | null",
  "color": "string | null",
  "location": "string | null",
  "phone": "string | null",
  "confidence": 0-100
}

Reglas:
- lost = reportando mascota perdida
- found = reportando mascota encontrada
- reunion = la mascota ya aparecio
- other = no es sobre mascota perdida/encontrada
- species: si no se puede determinar, null
- confidence: 0-100 que tan seguro estás"""

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
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            cfg = json.load(f)
        return cfg.get("groups", []), cfg.get("scrape_interval_hours", 6), cfg.get("max_posts_per_group", 50)
    return [], 6, 50

def save_config(groups, interval=6, max_posts=50):
    with open(CONFIG_PATH, "w") as f:
        json.dump({"groups": groups, "scrape_interval_hours": interval, "max_posts_per_group": max_posts}, f, indent=2)

# ---------------------------------------------------------------------------
# Gemini classifier
# ---------------------------------------------------------------------------

def classify_post(text, image_urls=None):
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set, using fallback")
        return _fallback_classify(text)
    parts = [text or "(sin texto)"]
    if image_urls:
        valid = [u for u in image_urls if u and u.startswith("http")][:3]
        if valid:
            parts.append("\n\nImagenes:\n" + "\n".join(f"[Imagen: {u}]" for u in valid))
    prompt = CLASSIFICATION_PROMPT + "\n\nPost:\n" + "\n".join(parts)
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-2.5-flash")
        resp = model.generate_content(prompt, generation_config=genai.types.GenerationConfig(response_mime_type="application/json"))
        r = json.loads(resp.text)
        return {
            "classification": r["classification"] if r.get("classification") in ("lost", "found", "sighting", "reunion", "other") else "other",
            "species": r["species"] if r.get("species") in ("dog", "cat", "other", None) else None,
            "color": r.get("color"),
            "location_hint": r.get("location"),
            "phone": r.get("phone"),
            "location_lat": None,
            "location_lng": None,
            "confidence": max(0, min(100, r.get("confidence", 0))),
        }
    except Exception as e:
        logger.error(f"Gemini error: {e}")
        return _fallback_classify(text)

def _fallback_classify(text):
    lower = (text or "").lower()
    if any(w in lower for w in ["apareci", "encontr", "volvi", "regres", "ya esta", "gracias a todos"]):
        cls = "reunion"
    elif any(w in lower for w in ["perd", "perdi", "escap", "busco", "busca", "desapareci"]):
        cls = "lost"
    elif any(w in lower for w in ["encontr", "apareci", "rescata", "recog", "hall"]):
        cls = "found"
    else:
        cls = "other"
    species = "dog" if any(w in lower for w in ["perr", "can", "cachorr"]) else ("cat" if any(w in lower for w in ["gat", "felino", "mich"]) else None)
    phone = re.search(r"(\d{7,15})", text or "")
    return {"classification": cls, "species": species, "color": None, "location_hint": None, "phone": phone.group(1) if phone else None, "location_lat": None, "location_lng": None, "confidence": 30 if cls != "other" else 0}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_group_id(url):
    m = re.search(r"/groups/([^/?]+)", url)
    raw = m.group(1) if m else url
    return raw.split("?")[0].split("/")[0]

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
    logger.info(f"Saved {len(cookies)} cookies")

def load_cookies(driver, filepath):
    try:
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or line.startswith("HttpOnly"):
                    continue
                parts = line.split("\t")
                if len(parts) >= 7:
                    driver.add_cookie({"name": parts[5], "value": parts[6], "domain": parts[0] if parts[0].startswith(".") else "." + parts[0], "path": parts[2] if parts[2] else "/"})
        logger.info(f"Cookies loaded")
    except Exception as e:
        logger.warning(f"Failed to load cookies: {e}")

def login_to_facebook(driver, email, password):
    logger.info("Logging in to Facebook")
    try:
        driver.get("https://www.facebook.com/")
        try:
            WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button[data-cookiebanner='accept_button']"))).click()
            time.sleep(1)
        except (TimeoutException, NoSuchElementException):
            pass
        WebDriverWait(driver, 15).until(EC.visibility_of_element_located((By.ID, "email"))).send_keys(email)
        WebDriverWait(driver, 15).until(EC.visibility_of_element_located((By.ID, "pass"))).send_keys(password)
        WebDriverWait(driver, 15).until(EC.element_to_be_clickable((By.NAME, "login"))).click()
        WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.CSS_SELECTOR, "div[role='feed'], a[aria-label='Home']")))
        logger.info("Login successful")
        return True
    except (TimeoutException, NoSuchElementException, WebDriverException) as e:
        logger.error(f"Login failed: {e}")
        return False

# ---------------------------------------------------------------------------
# BS4 extraction
# ---------------------------------------------------------------------------

POST_CONTAINER_BS = 'div.x1yztbdb.x1n2onr6.xh8yej3.x1ja2u2z, div[role="article"], div[data-ad-preview="message"], div[data-pagelet^="FeedUnit_"]'
AUTHOR_NAME_BS = 'h2 strong, h2 a[role="link"] strong, h3 strong, h3 a[role="link"] strong, a[aria-label][href*="/user/"] > strong, a[aria-label][href*="/profile.php"] > strong, a[href*="/groups/"][href*="/user/"] span, a[href*="/profile.php"] span'
POST_TEXT_BS = 'div[data-ad-rendering-role="story_message"], div[data-ad-preview="message"], div[data-ad-comet-preview="message"], div[dir="auto"]:not([class*=" "]):not(:has(button))'
POST_IMAGE_BS = 'img.x168nmei, div[data-imgperflogname="MediaGridPhoto"] img, img[src*="scontent"], img[src*="fbcdn"]'
POST_TIME_BS = 'abbr[title], a[href*="/posts/"] span[data-lexical-text="true"]'
COMMENT_CONTAINER_BS = 'div[aria-label*="Comment by"], ul > li div[role="article"]'
COMMENTER_NAME_BS = 'a[href*="/user/"] span, a[href*="/profile.php"] span, span > a[role="link"] > span'
COMMENT_TEXT_BS = 'div[data-ad-preview="message"] > span, div[dir="auto"][style="text-align: start;"]'
COMMENT_TIME_BS = 'abbr[title]'

def parse_post(article_soup, group_name):
    html_str = str(article_soup)
    fb_id = None
    fb_post_url = ""
    for a in article_soup.find_all("a", href=True):
        href = a.get("href", "")
        m = re.search(r'(?:story_fbid=|/posts/|/permalink/|fbid=)(\d+)', href)
        if m:
            fb_id = m.group(1)
            fb_post_url = href if href.startswith("http") else "https://www.facebook.com" + href
            break
    if not fb_id:
        m = re.search(r'"post_id":\s*"(\d+)"', html_str)
        if m:
            fb_id = m.group(1)
    if not fb_id:
        return None
    author = (article_soup.select_one(AUTHOR_NAME_BS).get_text(strip=True) if article_soup.select_one(AUTHOR_NAME_BS) else "")
    text_el = article_soup.select_one(POST_TEXT_BS)
    content = text_el.get_text("\n", strip=True) if text_el else article_soup.get_text("\n", strip=True)[:500]
    images = []
    for img in article_soup.select(POST_IMAGE_BS):
        src = img.get("src") or img.get("data-src") or ""
        if src and any(x in src for x in ["scontent", "fbcdn", "safe_image", "cdninstagram"]) and src not in images:
            images.append(src)
    time_el = article_soup.select_one(POST_TIME_BS)
    posted_at = time_el.get("title", "") or time_el.get_text(strip=True) if time_el else ""
    comments = []
    for ce in article_soup.select(COMMENT_CONTAINER_BS):
        cname = (ce.select_one(COMMENTER_NAME_BS).get_text(strip=True) if ce.select_one(COMMENTER_NAME_BS) else "")
        ctxt = (ce.select_one(COMMENT_TEXT_BS).get_text(strip=True) if ce.select_one(COMMENT_TEXT_BS) else "")
        ctime = (ce.select_one(COMMENT_TIME_BS).get("title", "") if ce.select_one(COMMENT_TIME_BS) else "")
        if cname or ctxt:
            comments.append({"id": str(uuid.uuid4()), "author": cname, "text": ctxt[:1000], "timestamp": ctime})
    return {"group_id": None, "group_name": group_name, "fb_post_id": fb_id, "fb_post_url": fb_post_url, "author_name": author, "content": content[:2000], "image_urls": images[:5], "posted_at": posted_at, "comments": comments[:20]}

# ---------------------------------------------------------------------------
# Scraper
# ---------------------------------------------------------------------------

def scrape_group(driver, group_name, group_url, max_posts=50):
    group_id = extract_group_id(group_url)
    logger.info(f"Scraping {group_name} ({group_id})")
    driver.get(f"https://www.facebook.com/groups/{group_id}/?sorting_setting=RECENT_ACTIVITY")
    try:
        WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.CSS_SELECTOR, POST_CONTAINER_BS.replace(", ", ","))))
    except TimeoutException:
        logger.warning(f"[{group_name}] No posts appeared")
        return []
    posts, seen = [], set()
    scrolls, no_new = 0, 0
    while len(posts) < max_posts and scrolls < 30:
        scrolls += 1
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(2)
        try:
            for btn in driver.find_elements(By.XPATH, ".//div[@role='button'][contains(.,'See more') or contains(.,'Ver más')] | .//a[contains(.,'See more') or contains(.,'Ver más')]"):
                if btn.is_displayed():
                    driver.execute_script("arguments[0].click();", btn)
                    time.sleep(0.3)
        except Exception:
            pass
        time.sleep(1)
        try:
            WebDriverWait(driver, 5).until(lambda d: len(d.find_elements(By.CSS_SELECTOR, POST_CONTAINER_BS.replace(", ", ","))) > len(posts))
            no_new = 0
        except TimeoutException:
            no_new += 1
            if no_new >= 3 and posts:
                break
        for article in BeautifulSoup(driver.page_source, "html.parser").select(POST_CONTAINER_BS):
            if len(posts) >= max_posts:
                break
            parsed = parse_post(article, group_name)
            if parsed and parsed["fb_post_id"] not in seen:
                seen.add(parsed["fb_post_id"])
                posts.append(parsed)
    logger.info(f"[{group_name}] Scraped {len(posts)} posts")
    return posts[:max_posts]

# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def ensure_logged_in(fb_email, fb_password):
    driver = init_driver(headless=True)
    try:
        driver.get("https://www.facebook.com/")
        if COOKIES_PATH.exists():
            load_cookies(driver, COOKIES_PATH)
            driver.get("https://www.facebook.com/")
            if check_session(driver):
                return True
        if not fb_email or not fb_password:
            logger.error("No FB_EMAIL/FB_PASSWORD and cookies expired")
            return False
        if login_to_facebook(driver, fb_email, fb_password):
            save_cookies(driver, COOKIES_PATH)
            return True
        return False
    finally:
        driver.quit()

def run():
    groups, _, max_posts = load_groups()
    if not groups:
        logger.warning("No groups configured. Use POST /config endpoint or edit config.json")
        return
    fb_email, fb_password = get_fb_email(), get_fb_password()
    if not ensure_logged_in(fb_email, fb_password):
        return
    conn = init_db()
    driver = init_driver(headless=True)
    try:
        driver.get("https://www.facebook.com/")
        if COOKIES_PATH.exists():
            load_cookies(driver, COOKIES_PATH)
            driver.get("https://www.facebook.com/")
        for group in groups:
            if not group.get("url"):
                continue
            for post in scrape_group(driver, group["name"], group["url"], max_posts):
                if len((post.get("content") or "").strip()) < MIN_CONTENT_LENGTH:
                    continue
                cls = classify_post(post.get("content", ""), post.get("image_urls", []))
                pid = save_post(conn, post, cls)
                if pid:
                    save_comments(conn, pid, post.get("comments", []), [])
                    conn.commit()
                    logger.info(f"Saved {post['fb_post_id']} → {cls['classification']}")
    finally:
        driver.quit()
        conn.close()

def run_daemon():
    try:
        import schedule
    except ImportError:
        logger.error("schedule library required")
        sys.exit(1)
    threading.Thread(target=lambda: Flask(__name__).run(host="0.0.0.0", port=SYNC_PORT, debug=False, use_reloader=False), daemon=True).start()
    logger.info(f"Sync server on port {SYNC_PORT}")
    def job():
        try:
            run()
        except Exception as e:
            logger.error(f"Cycle error: {e}")
    job()
    schedule.every().hours.at(":00").do(job)
    while True:
        schedule.run_pending()
        time.sleep(60)

# ---------------------------------------------------------------------------
# Flask sync routes
# ---------------------------------------------------------------------------

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
    save_config(data["groups"], data.get("scrape_interval_hours", 6), data.get("max_posts_per_group", 50))
    logger.info(f"Config received: {len(data['groups'])} groups")
    return jsonify({"ok": True})

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
