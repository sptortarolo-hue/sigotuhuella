"""
Facebook Group Scraper — Sigo Tu Huella
Scrapes configured Facebook groups via pyppeteer (headless Chrome) and sends posts to the webhook.

Usage:
  python scraper.py                              # Run once
  python scraper.py --daemon                     # Run as scheduled daemon
  python scraper.py --api-base-url=URL --api-token=TOKEN

Requires cookies.txt (Netscape format) from a logged-in Facebook session.
If cookies are expired, auto-login with FB_EMAIL/FB_PASSWORD env vars (or --fb-email / --fb-password).

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

# Posts containing any of these keywords (case-insensitive) will be skipped
FORBIDDEN_KEYWORDS = [
    "vendo", "compro", "alquilo", "trabajo", "curso",
    "evento", "clase", "servicio", "promoción", "promocion",
    "oferta", "producto", "tarjeta", "servicios", "profesional",
]

# Minimum content length to consider a post relevant
MIN_CONTENT_LENGTH = 50

# Load .env from same directory as this script
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


def save_cookies(page, filepath):
    """Persist current page cookies to Netscape-format cookies.txt."""
    import datetime
    cookies = page.cookies()
    lines = ["# Netscape HTTP Cookie File", "# https://curl.haxx.se/docs/http-cookies.html"]
    for c in cookies:
        domain = c.get("domain", ".facebook.com")
        if domain.startswith("."):
            domain = domain[1:]
        secure = "TRUE" if c.get("secure", False) else "FALSE"
        path = c.get("path", "/")
        http_only = "TRUE" if c.get("httpOnly", False) else "FALSE"
        expires = int(c.get("expires", 0))
        if expires < 0:
            expires = 0
        lines.append(f"{domain}\t{http_only}\t{path}\t{secure}\t{expires}\t{c['name']}\t{c['value']}")
    with open(filepath, "w") as f:
        f.write("\n".join(lines) + "\n")
    logger.info(f"Saved {len(cookies)} cookies to {filepath}")


async def setup_page(page):
    """Common page setup: UA, viewport, headless evasion."""
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    )
    await page.setViewport({"width": 1280, "height": 800})
    # Bypass headless detection
    await page.evaluateOnNewDocument("""() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    }""")


def get_browser_args():
    return [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
    ]


async def login_to_facebook(browser, fb_email, fb_password):
    """Log into Facebook using email/password via pyppeteer.

    Returns True if login succeeds or we are already logged in.
    Saves cookies to cookies.txt on success.
    """
    page = await browser.newPage()
    await setup_page(page)
    cookies_file = Path(__file__).parent / "cookies.txt"
    debug_dir = Path(__file__).parent / "debug"
    debug_dir.mkdir(exist_ok=True)

    # Load existing cookies
    fb_cookies = load_netscape_cookies(cookies_file) if cookies_file.exists() else []
    if fb_cookies:
        await page.setCookie(*fb_cookies)

    # Go to Facebook
    try:
        await page.goto("https://www.facebook.com", waitUntil="load", timeout=30000)
    except Exception as e:
        logger.warning(f"Facebook homepage load: {e}")
    await asyncio.sleep(3)

    title = await page.title()
    logger.info(f"Facebook page title: {title}")

    # Determine if we're on a login page
    body_text = await page.evaluate("document.body?.innerText?.substring(0, 2000) || ''")
    html_snippet = await page.evaluate("document.body?.innerHTML?.substring(0, 3000) || ''")
    logger.info(f"Login page body text (first 300): {body_text[:300]}")
    logger.debug(f"Login page HTML (first 500): {html_snippet[:500]}")

    # Login detection: look for email/phone input
    is_login_page = bool(await page.querySelector("input[name='email']"))
    if not is_login_page:
        is_login_page = bool(await page.querySelector("#email"))
    if not is_login_page:
        is_login_page = "login" in body_text.lower() and "email" in html_snippet.lower()

    if not is_login_page:
        logger.info("Already logged in to Facebook — cookies valid")
        save_cookies(page, cookies_file)
        await page.close()
        return True

    if not fb_email or not fb_password:
        logger.error("Login required but FB_EMAIL / FB_PASSWORD not provided")
        await page.close()
        return False

    logger.info("Login wall detected — attempting login with credentials")

    # Save pre-login screenshot for debugging
    await page.screenshot({"path": str(debug_dir / "login_before.png")})

    try:
        # Fill email
        email_el = await page.querySelector("input[name='email']")
        if not email_el:
            email_el = await page.querySelector("#email")
        if email_el:
            await email_el.click()
            await page.evaluate("() => document.querySelector('input[name=\"email\"]').value = ''")
            await email_el.type(fb_email, delay=40)
            logger.info("Email field filled")
        else:
            logger.error("Email field not found on login page")
            html_dump = await page.content()
            with open(debug_dir / "login_no_email.html", "w") as f:
                f.write(html_dump[:20000])
            await page.screenshot({"path": str(debug_dir / "login_no_email.png")})
            await page.close()
            return False

        # Fill password
        pass_el = await page.querySelector("input[name='pass']")
        if not pass_el:
            pass_el = await page.querySelector("#pass")
        if pass_el:
            await pass_el.click()
            await page.evaluate("() => document.querySelector('input[name=\"pass\"]').value = ''")
            await pass_el.type(fb_password, delay=30)
            logger.info("Password field filled")
        else:
            logger.error("Password field not found")
            await page.close()
            return False

        await asyncio.sleep(1)

        # Submit form via keyboard (Tab + Enter) instead of clicking
        # This triggers React event handlers properly
        logger.info("Pressing Enter to submit login form")
        await page.keyboard.press("Enter")

        # Wait for navigation / redirect after login
        try:
            await page.waitForNavigation({"timeout": 15000, "waitUntil": "load"})
        except Exception as e:
            logger.warning(f"waitForNavigation after login: {e}")
        await asyncio.sleep(3)

        current_url = page.url
        logger.info(f"URL after login: {current_url}")

        is_checkpoint = "checkpoint" in current_url.lower() or "two_step" in current_url.lower()

        if is_checkpoint:
            logger.info("Checkpoint page detected — waiting for React render...")
            await asyncio.sleep(4)

            # Extract visible text from checkpoint page
            body_text = await page.evaluate("""() => {
                const el = document.body;
                if (!el) return '';
                const walker = document.createTreeWalker(el, 4, null, false);
                const texts = [];
                let node;
                while (node = walker.nextNode()) {
                    const t = node.textContent.trim();
                    if (t) texts.push(t);
                }
                return texts.join(' | ').substring(0, 3000);
            }""")
            logger.info(f"Checkpoint text: {body_text[:1000]}")
            await page.screenshot({"path": str(debug_dir / "checkpoint.png"), "fullPage": True})
            with open(debug_dir / "checkpoint_text.txt", "w") as f:
                f.write(body_text[:3000])

            # Try to find and click approval buttons on checkpoint page
            logger.info("Looking for approve/continue button on checkpoint page...")
            clicked = await page.evaluate("""() => {
                const text = document.body.innerText || '';
                const buttons = document.querySelectorAll('button, div[role="button"], a[role="button"]');
                const keywords = ['continue', 'this was me', 'confirm', 'approve',
                                  'continuar', 'esta fui yo', 'confirmar', 'aprobar',
                                  '继续', '这是我', '确认', '批准'];
                for (const btn of buttons) {
                    const t = (btn.textContent || '').toLowerCase();
                    for (const kw of keywords) {
                        if (t.includes(kw)) {
                            btn.click();
                            return kw;
                        }
                    }
                }
                return '';
            }""")
            if clicked:
                logger.info(f"Clicked checkpoint button: '{clicked}' — waiting for redirect...")
                await asyncio.sleep(5)
                try:
                    await page.waitForNavigation({"timeout": 15000, "waitUntil": "load"})
                except Exception:
                    pass
                await asyncio.sleep(3)
                final_url = page.url
                logger.info(f"Post-approval URL: {final_url}")
                # Check if logged in
                if "login" not in final_url.lower() and "checkpoint" not in final_url.lower():
                    logger.info("Checkpoint approved! Login successful.")
                    save_cookies(page, cookies_file)
                    await page.close()
                    return True
                else:
                    logger.error("Checkpoint approval didn't work")
                    await page.screenshot({"path": str(debug_dir / "checkpoint_after_click.png")})
                    await page.close()
                    return False
            else:
                logger.error("No approval button found on checkpoint — manual intervention needed")
                logger.info(f"Checkpoint screenshot saved to {debug_dir / 'checkpoint.png'}")
                await page.close()
                return False

        # Not a checkpoint — navigate to homepage to verify
        try:
            await page.goto("https://www.facebook.com", waitUntil="load", timeout=30000)
        except Exception as e:
            logger.warning(f"Post-login navigation: {e}")
        await asyncio.sleep(3)

        final_url = page.url
        title2 = await page.title()

        # Check if login succeeded (no login form on page)
        still_login = bool(await page.querySelector("input[name='email']"))
        if still_login or "login" in final_url.lower():
            logger.error("Login failed — still on login page")
            await page.screenshot({"path": str(debug_dir / "login_fail.png")})
            await page.close()
            return False

        logger.info("Login successful!")
        save_cookies(page, cookies_file)
        await page.close()
        return True
    except Exception as e:
        logger.error(f"Login error: {e}")
        await page.screenshot({"path": str(debug_dir / "login_error.png")})
        try:
            html_dump = await page.content()
            with open(debug_dir / "login_error.html", "w") as f:
                f.write(html_dump[:20000])
        except Exception:
            pass
        await page.close()
        return False


async def ensure_logged_in(fb_email, fb_password):
    """Spin up a browser once, log in if needed, then close.

    Cookies are saved to cookies.txt for subsequent group scrapes.
    """
    cookies_file = Path(__file__).parent / "cookies.txt"
    # If cookies already exist, skip the login — saves time and avoids checkpoints
    if cookies_file.exists():
        logger.info("cookies.txt found — skipping pyppeteer login")
        return True
    if not fb_email or not fb_password:
        logger.error("No cookies.txt found and no FB credentials provided")
        return False
    from pyppeteer import launch
    browser = await launch(
        headless=True,
        args=get_browser_args(),
        handleSIGINT=False,
        handleSIGTERM=False,
        handleSIGHUP=False,
    )
    success = False
    try:
        success = await login_to_facebook(browser, fb_email, fb_password)
    finally:
        await browser.close()
    return success


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
            fb_post_url = ""
            for a in article.find_all("a", href=True):
                m = re.search(r'(?:story_fbid=|/posts/|fbid=)(\d+)', a["href"])
                if m:
                    fb_id = m.group(1)
                    href = a["href"]
                    if href.startswith("/"):
                        href = "https://www.facebook.com" + href
                    fb_post_url = href
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
            for img in article.find_all("img"):
                src = img.get("src") or img.get("data-src") or ""
                if src and re.search(r"(scontent|fbcdn|safe_image)", src):
                    if src not in images:
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
                "fb_post_url": fb_post_url,
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
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                    if ((src.includes('scontent') || src.includes('fbcdn') || src.includes('safe_image')) &&
                        !images.includes(src)) {
                        images.push(src);
                    }
                });

                posts.push({
                    fb_post_id: fb_id,
                    fb_post_url: href,
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
    """Wait until actual post elements appear in the DOM, scrolling as needed."""
    start = time.time()
    scroll_attempts = 0
    while time.time() - start < timeout:
        has_posts = await page.evaluate("""() => {
            // Only look for actual post links, not sidebar/nav links
            const links = document.querySelectorAll('a[href*="story_fbid"], a[href*="/posts/"], a[href*="/permalink/"]');
            for (const link of links) {
                // Exclude links in navigation/sidebar by checking parents
                const closestFeed = link.closest('[role="article"], [data-pagelet^="Feed"], [id*="feed"], [id*="post"], .x1yztbdb');
                if (closestFeed) return true;
                // Check if link is near visible text content (not in nav)
                const rect = link.getBoundingClientRect();
                if (rect.top > 0 && rect.top < 5000) return true;
            }
            return false;
        }""")
        if has_posts:
            logger.info(f"[{group_name}] Posts appeared after {time.time()-start:.1f}s")
            await asyncio.sleep(2)
            return True
        scroll_attempts += 1
        await page.evaluate(f"window.scrollBy(0, {scroll_attempts * 400})")
        await asyncio.sleep(1.5)
    logger.warning(f"[{group_name}] No posts appeared after {timeout}s")
    # Log page text for diagnosis
    body_text = await page.evaluate("document.body?.innerText?.substring(0, 300) || ''")
    logger.info(f"[{group_name}] Page body text: {body_text[:200]}")
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
        args=get_browser_args(),
        handleSIGINT=False,
        handleSIGTERM=False,
        handleSIGHUP=False,
    )
    try:
        page = await browser.newPage()
        await setup_page(page)

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

def is_post_relevant(post):
    """Check if a post is relevant (not commercial/too short)."""
    content = (post.get("content") or "").strip()
    if len(content) < MIN_CONTENT_LENGTH:
        return False
    lower = content.lower()
    for kw in FORBIDDEN_KEYWORDS:
        if kw in lower:
            return False
    return True


def send_to_webhook(webhook_url, webhook_token, posts):
    if not posts:
        logger.info("No posts to send.")
        return
    # Filter irrelevant posts
    filtered = [p for p in posts if is_post_relevant(p)]
    skipped = len(posts) - len(filtered)
    if skipped:
        logger.info(f"Skipped {skipped} irrelevant posts")
    if not filtered:
        logger.info("No relevant posts after filtering.")
        return
    posts = filtered
    # Force HTTPS to avoid 301 redirect stripping POST body
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


def sync_ensure_logged_in(fb_email, fb_password):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(ensure_logged_in(fb_email, fb_password))
    finally:
        loop.close()


def run_with_config(webhook_url, webhook_token, groups, max_posts, fb_email=None, fb_password=None):
    # Ensure logged in to Facebook before scraping groups
    if not sync_ensure_logged_in(fb_email, fb_password):
        logger.warning("Facebook login skipped or failed — scraping with existing cookies")
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
