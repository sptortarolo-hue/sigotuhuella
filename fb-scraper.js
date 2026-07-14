import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync, execSync } from 'child_process';

puppeteer.use(StealthPlugin());

// ==================== CONFIG ====================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE_URL || 'https://sigotuhuella.online/api';
const RELAY_API = `${API_BASE}/relay`;
const TOKEN = process.env.SCRAPER_TOKEN || 'sihuella';
const HEADED = process.env.FB_SCRAPER_HEADED === 'true' || process.argv.includes('--headed');
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/data/data/com.termux/files/usr/bin/chromium-browser';
const PROFILE_DIR = process.env.FB_SCRAPER_PROFILE_DIR || path.join(__dirname, 'fb_scraper_profile');
const SEEN_PATH = path.join(__dirname, 'fb_scraper_seen.json');

let INTERVAL_HOURS = parseInt(process.env.FB_SCRAPER_INTERVAL || '4');
let MAX_POSTS_PER_GROUP = parseInt(process.env.FB_SCRAPER_MAX_POSTS || '20');

const USER_AGENTS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/50 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickUA() { return randomItem(USER_AGENTS); }

function remoteLog(level, message) {
  const ts = new Date().toISOString();
  console.log(`[Scraper] ${message}`);
  webhookApi.post('/facebook/scraper-log', { level, message, ts }).catch(() => {});
}

const api = axios.create({
  baseURL: RELAY_API,
  headers: { Authorization: `Bearer ${TOKEN}` },
  timeout: 60000,
});

const webhookApi = axios.create({
  baseURL: API_BASE,
  params: { token: TOKEN },
  headers: { Authorization: `Bearer ${TOKEN}` },
  timeout: 120000,
});

let browser = null;

// ==================== WAKE LOCK ====================

function acquireWakeLock() {
  try {
    execSync('termux-wake-lock', { stdio: 'pipe' });
    console.log('[Scraper] Wake lock activado');
  } catch {}
}

// ==================== FETCH CONFIG FROM VPS ====================

async function fetchConfig() {
  try {
    const { data } = await webhookApi.get('/facebook/scraper-config');
    if (data.interval_hours) INTERVAL_HOURS = parseInt(data.interval_hours) || INTERVAL_HOURS;
    if (data.max_posts_per_group) MAX_POSTS_PER_GROUP = parseInt(data.max_posts_per_group) || MAX_POSTS_PER_GROUP;
    console.log(`[Scraper] Config VPS: intervalo=${INTERVAL_HOURS}h, max_posts=${MAX_POSTS_PER_GROUP}`);
    return data;
  } catch (err) {
    console.warn(`[Scraper] No se pudo leer config del VPS, usando defaults: intervalo=${INTERVAL_HOURS}h, max_posts=${MAX_POSTS_PER_GROUP}`);
    return null;
  }
}

// ==================== UTILITIES ====================

function ensureProfileDir() {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
}

function loadSeen() {
  try {
    if (fs.existsSync(SEEN_PATH)) {
      return JSON.parse(fs.readFileSync(SEEN_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveSeen(seen) {
  fs.writeFileSync(SEEN_PATH, JSON.stringify(seen, null, 2));
}

// ==================== BEZIER MOUSE MOVEMENT ====================

async function bezierMove(page, fromX, fromY, toX, toY) {
  const cp1x = fromX + (toX - fromX) * 0.2 + Math.random() * 60 - 30;
  const cp1y = fromY + (toY - fromY) * 0.1 + Math.random() * 40 - 20;
  const cp2x = fromX + (toX - fromX) * 0.8 + Math.random() * 60 - 30;
  const cp2y = fromY + (toY - fromY) * 0.9 + Math.random() * 40 - 20;
  const steps = randomInt(25, 40);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.pow(1 - t, 3) * fromX + 3 * Math.pow(1 - t, 2) * t * cp1x + 3 * (1 - t) * Math.pow(t, 2) * cp2x + Math.pow(t, 3) * toX;
    const y = Math.pow(1 - t, 3) * fromY + 3 * Math.pow(1 - t, 2) * t * cp1y + 3 * (1 - t) * Math.pow(t, 2) * cp2y + Math.pow(t, 3) * toY;
    await page.mouse.move(Math.round(x), Math.round(y));
    await sleep(10 + Math.random() * 15);
  }
}

// ==================== HUMAN SCROLL ====================

async function humanScroll(page, totalY = 2000) {
  const chunks = randomInt(4, 8);
  for (let i = 0; i < chunks; i++) {
    const delta = Math.floor(totalY / chunks) + randomInt(-50, 50);
    await page.evaluate((y) => window.scrollBy(0, y), delta);
    await sleep(randomInt(400, 1200));
  }
  if (Math.random() < 0.2) {
    await page.evaluate(() => window.scrollBy(0, -300));
    await sleep(randomInt(500, 1500));
  }
}

// ==================== SESSION MANAGEMENT ====================

function loadCookies() {
  try {
    const cookiesPath = path.join(PROFILE_DIR, 'cookies.json');
    if (fs.existsSync(cookiesPath)) {
      const data = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
      return Array.isArray(data) && data.length > 0;
    }
  } catch {}
  return false;
}

async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    fs.writeFileSync(path.join(PROFILE_DIR, 'cookies.json'), JSON.stringify(cookies, null, 2));
  } catch {}
}

async function checkSession(page) {
  const hasLogin = await page.evaluate(() => {
    return !!document.querySelector(
      'input[name="email"], input[name="pass"], ' +
      '[aria-label="Correo electrónico"], [aria-label="Contraseña"], ' +
      'input[type="email"], input[type="password"]'
    );
  });
  return !(page.url().includes('login') || page.url().includes('checkpoint') || hasLogin);
}

async function downloadProfileBackup() {
  try {
    const { data } = await api.get('/fb/download-profile');
    if (data?.data) {
      const buf = Buffer.from(data.data, 'base64');
      const tarPath = path.join(__dirname, '.fb_scraper_download.tar.gz');
      fs.writeFileSync(tarPath, buf);
      if (fs.existsSync(PROFILE_DIR)) {
        fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
      }
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
      const result = spawnSync('tar', ['xzf', tarPath, '-C', PROFILE_DIR], { stdio: 'pipe' });
      fs.unlinkSync(tarPath);
      if (result.status !== 0) {
        console.error('[Scraper] Error extrayendo perfil:', result.stderr.toString());
        return false;
      }
      console.log('[Scraper] Perfil restaurado desde backup');
      return true;
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error('[Scraper] Error descargando perfil:', err.message);
    }
  }
  return false;
}

async function uploadProfileBackup() {
  try {
    const tarPath = path.join(__dirname, '.fb_scraper_upload.tar.gz');
    const cwd = path.dirname(PROFILE_DIR);
    const dirName = path.basename(PROFILE_DIR);
    const result = spawnSync('tar', ['czf', tarPath, '-C', cwd, dirName], { stdio: 'pipe' });
    if (result.status !== 0) return;
    const buf = fs.readFileSync(tarPath);
    const base64 = buf.toString('base64');
    await api.post('/fb/upload-profile', { data: base64 });
    fs.unlinkSync(tarPath);
    console.log(`[Scraper] Perfil respaldado (${buf.length} bytes)`);
  } catch (err) {
    console.error('[Scraper] Error subiendo perfil:', err.message);
  }
}

async function downloadSessionData() {
  try {
    const { data } = await api.get('/fb/session-data');
    if (data?.data) return data.data;
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error('[Scraper] Error descargando session data:', err.message);
    }
  }
  return null;
}

async function uploadSessionData(page) {
  try {
    const sessionData = await page.evaluate(() => ({
      localStorage: { ...window.localStorage },
      sessionStorage: { ...window.sessionStorage },
    }));
    await api.post('/fb/session-data', { data: sessionData });
  } catch {}
}

async function restoreSessionData(page, sessionData) {
  if (!sessionData) return;
  try {
    await page.evaluate(data => {
      if (data.localStorage) {
        for (const [key, val] of Object.entries(data.localStorage)) {
          try { window.localStorage.setItem(key, val); } catch {}
        }
      }
      if (data.sessionStorage) {
        for (const [key, val] of Object.entries(data.sessionStorage)) {
          try { window.sessionStorage.setItem(key, val); } catch {}
        }
      }
    }, sessionData);
  } catch {}
}

async function downloadCookiesFromServer() {
  try {
    const { data } = await api.get('/fb/session-file');
    if (data?.data) {
      const raw = Buffer.from(data.data, 'base64').toString('utf-8');
      let cookies;
      try {
        const parsed = JSON.parse(raw);
        cookies = parsed.cookies || parsed;
      } catch {
        cookies = raw;
      }
      if (Array.isArray(cookies) && cookies.length > 0) {
        cookies = cookies.map(c => {
          if (!c.domain) c.domain = '.facebook.com';
          if (!c.path) c.path = '/';
          return c;
        });
        console.log(`[Scraper] ${cookies.length} cookies descargadas del servidor`);
        return cookies;
      }
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error('[Scraper] Error descargando cookies:', err.message);
    }
  }
  return [];
}

async function setCookiesAndCheck(page, cookies) {
  await page.goto('about:blank');
  await page.setCookie(...cookies);
  await page.goto('https://facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);
  if (await checkSession(page)) {
    await saveCookies(page);
    return true;
  }
  return false;
}

async function ensureFacebookSession(page) {
  await page.goto('https://facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(3000);

  if (await checkSession(page)) return true;

  console.log('[Scraper] Sesión no encontrada, intentando restaurar...');

  const sessionData = await downloadSessionData();
  if (sessionData) {
    await restoreSessionData(page, sessionData);
    await page.goto('https://facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
    if (await checkSession(page)) {
      await saveCookies(page);
      console.log('[Scraper] Sesión restaurada desde session data');
      return true;
    }
  }

  const cookies = await downloadCookiesFromServer();
  if (cookies.length > 0) {
    if (await setCookiesAndCheck(page, cookies)) {
      console.log('[Scraper] Sesión restaurada desde cookies del servidor');
      return true;
    }
  }

  return false;
}

// ==================== BROWSER ====================

async function getBrowser(headed = HEADED) {
  if (browser) {
    try { await browser.version(); return browser; } catch { browser = null; }
  }

  if (!fs.existsSync(CHROMIUM_PATH)) {
    console.error(`[Scraper] Chromium no encontrado en ${CHROMIUM_PATH}`);
    console.error('[Scraper] Ejecutá: pkg install x11-repo && pkg install chromium');
    process.exit(1);
  }

  ensureProfileDir();

  console.log(`[Scraper] Lanzando Chromium (${headed ? 'X11 visible' : 'headless'})...`);

  if (headed && !process.env.DISPLAY) {
    console.error('[Scraper] DISPLAY no está definido. Ejecutá:');
    console.error('[Scraper]   termux-x11-nightly :0 &');
    console.error('[Scraper]   export DISPLAY=:0');
    process.exit(1);
  }

  browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: headed ? false : 'new',
    userDataDir: PROFILE_DIR,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=IsolateOrigins,site-per-process,ChromeWhatsNewUI,OptimizationGuideModelDownloading,Translate',
      '--disable-sync',
      '--disable-field-trial-config',
      '--window-size=1366,768',
      '--lang=es-AR',
      '--no-pings',
      '--disable-crash-reporter',
      '--disable-background-networking',
    ],
  });

  return browser;
}

// ==================== GROUPS ====================

async function getActiveGroups() {
  const url = `${API_BASE}/facebook/scraper-groups`;
  try {
    console.log(`[Scraper] Fetching groups from: ${url}`);
    console.log(`[Scraper] Token: ${TOKEN}`);
    const resp = await axios.get(url, {
      params: { token: TOKEN },
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 30000,
    });
    console.log(`[Scraper] Groups response (${resp.status}):`, JSON.stringify(resp.data).substring(0, 200));
    const data = resp.data;
    if (typeof data === 'string' || data?.error) {
      console.error(`[Scraper] Respuesta inesperada:`, typeof data === 'string' ? data.substring(0, 100) : data);
      return [];
    }
    return Array.isArray(data) ? data : (data?.groups || []);
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    console.error(`[Scraper] Error obteniendo grupos (${status}):`, JSON.stringify(body || err.message));
    return [];
  }
}

// ==================== DOM EXTRACTION ====================

async function extractPostsFromGroup(page, groupId, groupUrl, lastSeenId) {
  const url = groupUrl || `https://www.facebook.com/groups/${groupId}`;
  const groupUrlChrono = url.includes('?') ? `${url}&sorting_setting=CHRONOLOGICAL` : `${url}?sorting_setting=CHRONOLOGICAL`;
  console.log(`[Scraper] Navegando a ${groupUrlChrono}`);

  await page.goto(groupUrlChrono, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(randomInt(3000, 6000));

  if (!(await checkSession(page))) {
    throw new Error('session expired');
  }

  try {
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });
  } catch {
    console.log('[Scraper] DEBUG: No [role="feed"] found after 10s');
  }

  const domDebug = await page.evaluate(() => {
    const info = {};
    info.url = location.href;
    info.title = document.title;
    info.feedCount = document.querySelectorAll('[role="feed"]').length;
    info.articleCount = document.querySelectorAll('[role="article"]').length;
    const feed = document.querySelector('[role="feed"]');
    if (feed) {
      info.feedChildren = feed.children.length;
      info.feedChildTags = Array.from(feed.children).slice(0, 5).map(c => `${c.tagName}[${c.getAttribute('role') || ''}]`);
      const articles = feed.querySelectorAll('[role="article"]');
      info.articleDetails = Array.from(articles).slice(0, 3).map(a => ({
        ariaLabel: (a.getAttribute('aria-label') || '').substring(0, 80),
        textLen: (a.innerText || '').length,
        textPreview: (a.innerText || '').substring(0, 150),
        hasStrong: !!a.querySelector('strong'),
        hasDirAuto: !!a.querySelector('div[dir="auto"]'),
        divDirAutoCount: a.querySelectorAll('div[dir="auto"]').length,
        linkCount: a.querySelectorAll('a[href]').length,
      }));
    }
    info.bodyTextPreview = document.body?.innerText?.substring(0, 500) || '';
    return info;
  });
  console.log('[Scraper] DOM Debug:', JSON.stringify(domDebug, null, 2));

  await sleep(randomInt(1500, 3000));

  await page.evaluate(() => {
    const feed = document.querySelector('[role="feed"]');
    if (feed) {
      feed.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo(0, 600);
    }
  });
  await sleep(randomInt(1500, 3000));
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(randomInt(800, 1500));

  let previousArticleCount = 0;
  const MAX_SCROLL_ATTEMPTS = 5;

  for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
    const rawPosts = await page.evaluate((maxPosts, groupId) => {
      const posts = [];
      const feed = document.querySelector('[role="feed"]');
      if (!feed) return posts;

      const allArticles = feed.querySelectorAll('[role="article"]');
      const articles = [];

      for (const article of allArticles) {
        const ariaLabel = article.getAttribute('aria-label') || '';
        if (ariaLabel.startsWith('Comment by')) continue;
        const text = (article.innerText || '').trim();
        if (!text || text.length < 20) continue;
        articles.push(article);
      }

      for (let i = 0; i < articles.length && posts.length < maxPosts; i++) {
        const article = articles[i];

        let authorName = 'Unknown';
        let profileUrl = null;

        const strongElem = article.querySelector('strong');
        if (strongElem) {
          const parentLink = strongElem.closest('a');
          if (parentLink) {
            const href = parentLink.getAttribute('href') || '';
            if (href.includes('/user/') || (href.includes('facebook.com') && !href.includes('/groups/') && !href.includes('/posts/'))) {
              const strongText = strongElem.innerText?.trim() || '';
              if (strongText.length < 50 && !strongText.includes('\n')) {
                authorName = strongText;
                profileUrl = href;
              }
            }
          }
        }

        if (authorName === 'Unknown') {
          const authorLinks = article.querySelectorAll('a[role="link"]');
          for (const link of authorLinks) {
            const href = link.getAttribute('href') || '';
            const linkText = (link.innerText || '').trim();
            if (
              linkText.length > 2 && linkText.length < 50 && !linkText.includes('\n') &&
              (href.includes('/user/') || (href.includes('facebook.com') && !href.includes('/groups/') && !href.includes('/posts/')))
            ) {
              authorName = linkText;
              profileUrl = href;
              break;
            }
          }
        }

        const skipAuthors = ['People you may know', 'Suggested for you', 'Groups you might like'];
        if (skipAuthors.includes(authorName)) continue;

        const contentDivs = article.querySelectorAll('div[dir="auto"]');
        const contentParts = [];
        const skipPhrases = ['Like', 'Comment', 'Share', 'Reply', authorName, '·'];

        for (const div of contentDivs) {
          const text = (div.innerText || '').trim();
          if (text.length < 10) continue;
          if (text === authorName) continue;
          if (skipPhrases.includes(text)) continue;
          if (/^\d+[hdwm]$/.test(text)) continue;
          contentParts.push(text);
        }

        const seenContent = new Set();
        const uniqueParts = [];
        for (const part of contentParts) {
          const cleaned = part.replace(/\s*…?\s*See more\s*$/, '').replace(/^\s*…?\s*See more\s*/, '').trim();
          if (cleaned && !seenContent.has(cleaned)) {
            seenContent.add(cleaned);
            uniqueParts.push(cleaned);
          }
        }

        let content = uniqueParts.slice(0, 2).join('\n') || '';

        if (!content || content.length < 5) {
          const lines = (article.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
          const fallbackContent = lines.filter(l => {
            if (l === authorName) return false;
            if (/^\d+[hdwm]$/.test(l)) return false;
            if (['Like', 'Comment', 'Share', '·', 'Reply'].includes(l)) return false;
            return l.length > 10;
          }).slice(0, 3).join('\n');
          if (fallbackContent.length < 5) continue;
          content = fallbackContent;
        }

        let postId = null;
        let postUrl = null;
        const allLinks = article.querySelectorAll('a[href]');
        for (const link of allLinks) {
          const href = link.getAttribute('href') || '';

          const pfbidMatch = href.match(/pfbid[a-zA-Z0-9]+/);
          if (pfbidMatch) {
            postId = pfbidMatch[0];
            postUrl = href.startsWith('http') ? href.split('?')[0] : `https://www.facebook.com${href}`.split('?')[0];
            break;
          }

          const postsMatch = href.match(/\/posts\/(\d+)/);
          if (postsMatch) {
            postId = postsMatch[1];
            postUrl = href.startsWith('http') ? href.split('?')[0] : `https://www.facebook.com${href}`.split('?')[0];
            break;
          }

          const storyMatch = href.match(/story_fbid=(\d+)/);
          if (storyMatch) {
            postId = storyMatch[1];
            postUrl = href.startsWith('http') ? href.split('?')[0] : `https://www.facebook.com${href}`.split('?')[0];
            break;
          }
        }

        if (!postId) {
          for (const link of allLinks) {
            const href = link.getAttribute('href') || '';
            const numMatch = href.match(/\/(\d{10,})/);
            if (numMatch) {
              postId = numMatch[1];
              postUrl = href.startsWith('http') ? href.split('?')[0] : `https://www.facebook.com${href}`.split('?')[0];
              break;
            }
          }
        }

        if (!postId) {
          const hashInput = `${authorName}|${content.substring(0, 100)}`;
          let hash = 0;
          for (let j = 0; j < hashInput.length; j++) {
            hash = ((hash << 5) - hash + hashInput.charCodeAt(j)) | 0;
          }
          postId = `text_${Math.abs(hash).toString(36)}`;
        }

        let timestamp = '';
        const timeLinks = article.querySelectorAll('a[href*="/posts/"], a[href*="story_fbid"]');
        for (const link of timeLinks) {
          const href = link.getAttribute('href') || '';
          if (href.includes('comment_id=')) continue;

          const aria = link.getAttribute('aria-label') || '';
          if (aria) {
            timestamp = aria;
            break;
          }

          const linkText = (link.innerText || '').trim();
          if (linkText && /\d+[hdwm]|yesterday|just now|ayer|ahora/i.test(linkText)) {
            timestamp = linkText;
            break;
          }
        }

        if (!timestamp) {
          const abbr = article.querySelector('abbr[data-utime]');
          if (abbr) {
            const utime = abbr.getAttribute('data-utime');
            if (utime && /^\d+$/.test(utime)) {
              timestamp = new Date(parseInt(utime) * 1000).toISOString();
            }
          }
        }

        const images = [];
        const imgEls = article.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"]');
        for (const img of imgEls) {
          const src = img.src || img.getAttribute('data-src') || '';
          if (src && !src.includes('profile') && !src.includes('emoji') && !src.includes('reaction') && !src.includes('static')) {
            images.push(src);
          }
        }

        if (lastSeenId && postId === lastSeenId) break;

        if (content.length >= 5 || images.length > 0) {
          posts.push({
            fb_post_id: postId,
            fb_post_url: postUrl || `https://www.facebook.com/groups/${groupId}/posts/${postId}/`,
            author_name: authorName,
            content: content.substring(0, 5000),
            image_urls: images,
            posted_at: timestamp,
            group_id: groupId,
          });
        }
      }

      return posts;
    }, MAX_POSTS_PER_GROUP, groupId);

    if (rawPosts.length > 0) {
      return rawPosts;
    }

    const currentCount = await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      return feed ? feed.querySelectorAll('[role="article"]').length : 0;
    });

    if (currentCount === previousArticleCount) break;
    previousArticleCount = currentCount;

    await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      if (feed) {
        feed.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo(0, document.body.scrollHeight);
      }
    });
    await sleep(randomInt(2000, 4000));
  }

  return [];
}

// ==================== SEND POSTS ====================

async function sendPosts(posts, groupName) {
  if (posts.length === 0) return { inserted: 0, updated: 0, errors: 0 };

  try {
    const payload = { posts };
    const resp = await webhookApi.post('/facebook/webhook', payload);
    const result = resp.data;
    console.log(`[Scraper] ${groupName}: ${result.inserted || 0} nuevos, ${result.updated || 0} actualizados, ${result.errors || 0} errores`);
    return result;
  } catch (err) {
    console.error(`[Scraper] Error enviando posts de ${groupName}:`, err.message);
    return { inserted: 0, updated: 0, errors: posts.length };
  }
}

// ==================== SCRAPE SINGLE GROUP ====================

async function scrapeGroup(page, group, seen) {
  const groupId = group.fb_group_id || group.url?.match(/groups\/(\d+)/)?.[1];
  const groupName = group.name || groupId;
  const lastSeenId = seen[groupId] || null;

  try {
    const posts = await extractPostsFromGroup(page, groupId, group.url, lastSeenId);

    const newPosts = [];
    for (const post of posts) {
      if (lastSeenId && post.fb_post_id === lastSeenId) break;
      newPosts.push(post);
    }

    if (newPosts.length === 0) {
      console.log(`[Scraper] ${groupName}: sin posts nuevos`);
      return 0;
    }

    const limited = newPosts.slice(0, MAX_POSTS_PER_GROUP);
    console.log(`[Scraper] ${groupName}: ${limited.length} posts nuevos`);

    await sendPosts(limited, groupName);

    if (limited.length > 0 && limited[0].fb_post_id) {
      seen[groupId] = limited[0].fb_post_id;
    }

    return limited.length;
  } catch (err) {
    if (err.message === 'session expired') throw err;
    console.error(`[Scraper] Error en grupo ${groupName}:`, err.message);
    return 0;
  }
}

// ==================== MAIN SCRAPE CYCLE ====================

async function runScrapeCycle() {
  remoteLog('info', 'Iniciando ciclo de scraping...');

  const b = await getBrowser();
  const page = await b.newPage();
  await page.setUserAgent(pickUA());
  await page.setViewport({ width: 1366, height: 768 });

  const sessionOk = await ensureFacebookSession(page);
  if (!sessionOk) {
    remoteLog('error', 'No se pudo establecer sesión de Facebook');
    await page.close();
    return;
  }

  await page.setUserAgent(pickUA());

  const seen = loadSeen();
  let totalPosts = 0;

  const groups = await getActiveGroups();
  if (groups.length === 0) {
    remoteLog('warn', 'No hay grupos activos para scrapear');
    await page.close();
    return;
  }

  console.log(`[Scraper] Scrapeando ${groups.length} grupos...`);

  for (const group of groups) {
    try {
      await humanScroll(page, randomInt(200, 500));
      await sleep(randomInt(8000, 22000));

      const count = await scrapeGroup(page, group, seen);
      totalPosts += count;

      saveSeen(seen);
    } catch (err) {
      if (err.message === 'session expired') {
        console.error('[Scraper] Sesión expirada durante scraping');
        await page.close();
        browser = null;

        console.log('[Scraper] Intentando restaurar sesión...');
        const b2 = await getBrowser();
        const page2 = await b2.newPage();
        await page2.setUserAgent(pickUA());
        await page2.setViewport({ width: 1366, height: 768 });

        const restored = await ensureFacebookSession(page2);
        if (!restored) {
          console.error('[Scraper] No se pudo restaurar sesión. Esperá o re-login manual.');
          console.error('[Scraper] Ejecutá: FB_SCRAPER_HEADED=true node fb-scraper.js --login');
          await page2.close();
          return;
        }

        await page2.close();
        break;
      }
      console.error(`[Scraper] Error no recuperable:`, err.message);
    }

    await sleep(randomInt(5000, 10000));
  }

  saveSeen(seen);
  await page.close();

  console.log(`[Scraper] Ciclo completado. ${totalPosts} posts extraídos total.`);

  try {
    await uploadProfileBackup();
  } catch {}
}

// ==================== LOGIN MODE ====================

async function loginMode() {
  console.log('[Scraper] Modo LOGIN — abrí Chromium y logueate en Facebook');
  console.log('[Scraper] Cuando estés logueado, presioná Enter acá para continuar...');

  const b = await getBrowser(true);
  const page = await b.newPage();
  await page.setUserAgent(pickUA());
  await page.setViewport({ width: 1366, height: 768 });

  await page.goto('https://facebook.com/', { waitUntil: 'networkidle2', timeout: 60000 });

  console.log('[Scraper] Abrí Facebook en Chromium y logueate.');
  console.log('[Scraper] Cuando veas tu feed, presioná Enter acá...');

  await new Promise(resolve => {
    process.stdin.resume();
    process.stdin.on('data', () => resolve());
  });

  if (await checkSession(page)) {
    console.log('[Scraper] Sesión verificada. Guardando perfil...');
    await saveCookies(page);
    await uploadSessionData(page);
    await uploadProfileBackup();
    console.log('[Scraper] Login completado. Profile guardado.');
  } else {
    console.error('[Scraper] No se detectó sesión válida. Intentá de nuevo.');
  }

  await page.close();
  await browser.close();
  browser = null;
}

// ==================== TEST MODE ====================

async function testMode(groupId) {
  remoteLog('info', `Modo TEST — scrapeando grupo ${groupId || 'primero'}`);

  const b = await getBrowser();
  const page = await b.newPage();
  await page.setUserAgent(pickUA());
  await page.setViewport({ width: 1366, height: 768 });

  const sessionOk = await ensureFacebookSession(page);
  if (!sessionOk) {
    console.error('[Scraper] Sin sesión. Ejecutá: FB_SCRAPER_HEADED=true node fb-scraper.js --login');
    await page.close();
    await browser.close();
    browser = null;
    return;
  }

  await page.setUserAgent(pickUA());

  const groups = await getActiveGroups();
  const target = groupId
    ? groups.find(g => g.fb_group_id === groupId || g.url?.includes(groupId))
    : groups[0];

  if (!target) {
    console.error('[Scraper] Grupo no encontrado');
    await page.close();
    await browser.close();
    browser = null;
    return;
  }

  const seen = loadSeen();
  try {
    const count = await scrapeGroup(page, target, seen);
    saveSeen(seen);
    console.log(`[Scraper] Test completado. ${count} posts extraídos.`);
  } catch (err) {
    console.error('[Scraper] Error en test:', err.message);
  }

  await page.close();
  await browser.close();
  browser = null;
}

// ==================== MAIN ====================

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--login')) {
    await loginMode();
    return;
  }

  if (args.includes('--test')) {
    const groupIdx = args.indexOf('--group');
    const groupId = groupIdx >= 0 ? args[groupIdx + 1] : null;
    await testMode(groupId);
    return;
  }

  acquireWakeLock();

  await fetchConfig();

  console.log('[Scraper] Facebook Group Scraper (Puppeteer + Stealth)');
  remoteLog('info', `Intervalo: ${INTERVAL_HOURS}h | Max posts: ${MAX_POSTS_PER_GROUP} | Mode: ${HEADED ? 'X11' : 'headless'}`);
  remoteLog('info', `Chromium: ${CHROMIUM_PATH}`);
  console.log(`[Scraper] Perfil: ${PROFILE_DIR}`);

  ensureProfileDir();

  const hasLocalCookies = loadCookies();
  if (!hasLocalCookies) {
    console.log('[Scraper] Sin perfil local. Intentando descargar backup...');
    const restored = await downloadProfileBackup();
    if (!restored) {
      console.log('[Scraper] Sin backup. Necesitás loguear primero:');
      console.log('[Scraper] FB_SCRAPER_HEADED=true node fb-scraper.js --login');
    }
  }

  while (true) {
    try {
      const now = new Date();
      const lastRun = await getLastRunTime();

      if (lastRun) {
        const hoursSince = (now - lastRun) / (1000 * 60 * 60);
        const jitter = randomInt(-30, 30) / 60;
        const waitHours = INTERVAL_HOURS + jitter;

        if (hoursSince < waitHours) {
          const remaining = Math.round((waitHours - hoursSince) * 60);
          console.log(`[Scraper] Próximo scrape en ${remaining} min`);
          await sleep(Math.min(remaining * 60 * 1000, 30 * 60 * 1000));
          continue;
        }
      }

      await fetchConfig();
      await runScrapeCycle();
      await setLastRunTime();

      const sleepTime = (INTERVAL_HOURS + randomInt(-30, 30) / 60) * 60 * 60 * 1000;
      console.log(`[Scraper] Durmiendo ${Math.round(sleepTime / 60000)} min`);
      await sleep(sleepTime);
    } catch (err) {
      console.error('[Scraper] Error en main loop:', err.message);
      await sleep(5 * 60 * 1000);
    }
  }
}

async function getLastRunTime() {
  try {
    const resp = await webhookApi.get('/facebook/stats');
    const data = resp.data;
    if (data?.lastScrape) return new Date(data.lastScrape);
  } catch {}
  try {
    const resp = await axios.get(`${API_BASE}/settings/fb_last_scraper_run`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (resp.data?.value) return new Date(resp.data.value);
  } catch {}
  return null;
}

async function setLastRunTime() {
  try {
    await webhookApi.post('/facebook/webhook', { posts: [] }).catch(() => {});
  } catch {}
}

process.on('SIGINT', async () => {
  console.log('[Scraper] Shutting down...');
  if (browser) {
    try { await browser.close(); } catch {}
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Scraper] SIGTERM received, shutting down...');
  if (browser) {
    try { await browser.close(); } catch {}
  }
  process.exit(0);
});

main().catch(err => {
  console.error('[Scraper] Fatal error:', err);
  process.exit(1);
});
