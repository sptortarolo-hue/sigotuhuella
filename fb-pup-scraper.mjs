import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

puppeteer.use(StealthPlugin());

const VPS_URL = 'https://sigotuhuella.online';
const TOKEN = process.env.RELAY_TOKEN;
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/data/data/com.termux/files/usr/bin/chromium-browser';
const COOKIES_PATH = path.join(__dirname, 'fb_scraper_cookies.json');
const BATCH_SIZE = 10;

let config = {
  hour_start: 8, hour_end: 22, interval_hours: 3, jitter_minutes: 15, max_posts: 50,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function randomJitter() {
  return Math.floor(Math.random() * config.jitter_minutes * 60 * 1000 * 2 - config.jitter_minutes * 60 * 1000);
}

function isWithinSchedule() {
  const hour = new Date().getHours();
  return hour >= config.hour_start && hour < config.hour_end;
}

function nextScheduleDelay() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(config.hour_start, 0, 0, 0);
  if (now.getHours() >= config.hour_end) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function downloadCookies() {
  try {
    console.log('[FB Scraper] Descargando cookies del servidor...');
    const { data } = await axios.get(`${VPS_URL}/api/relay/fb/session-file`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 15000,
    });
    if (data?.data) {
      const raw = Buffer.from(data.data, 'base64').toString('utf-8');
      let cookies;
      try {
        const parsed = JSON.parse(raw);
        cookies = parsed.cookies || parsed;
      } catch { cookies = raw; }
      if (Array.isArray(cookies) && cookies.length > 0) {
        fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies));
        console.log(`[FB Scraper] ${cookies.length} cookies descargadas`);
        return true;
      }
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error('[FB Scraper] Error descargando cookies:', err.message);
    }
  }
  return false;
}

function loadCookies() {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const data = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      return Array.isArray(data) && data.length > 0;
    }
  } catch (e) {
    console.error('[FB Scraper] Error cargando cookies:', e.message);
  }
  return false;
}

async function launchBrowser() {
  console.log('[FB Scraper] Lanzando Chromium...');
  if (!fs.existsSync(CHROMIUM_PATH)) {
    console.error(`[FB Scraper] Chromium no encontrado en ${CHROMIUM_PATH}`);
    console.error('[FB Scraper] Ejecutá: pkg install x11-repo && pkg install chromium');
    process.exit(1);
  }
  return await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--single-process', '--disable-blink-features=AutomationControlled',
      '--no-first-run', '--no-default-browser-check',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });
}

async function closeBrowser(b) {
  if (b) { try { await b.close(); } catch {} }
}

async function setupSession(page) {
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36');
  await page.setViewport({ width: 412, height: 915 });

  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  console.log(`[FB Scraper] ${cookies.length} cookies en sesión`);
  await page.goto('about:blank');
  const valid = cookies.map(c => { if (!c.domain) c.domain = '.facebook.com'; if (!c.path) c.path = '/'; return c; });
  await page.setCookie(...valid);
  await page.goto('https://mbasic.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  const url = page.url();
  const hasLogin = await page.evaluate(() => !!document.querySelector('input[name="email"], input[type="email"]'));
  if (hasLogin || url.includes('login')) {
    throw new Error('session expired');
  }
  console.log(`[FB Scraper] Sesión OK: ${url}`);
}

async function scrapeGroup(page, groupId) {
  console.log(`[FB Scraper] Navegando a grupo ${groupId}...`);
  await page.goto(`https://mbasic.facebook.com/groups/${groupId}`, {
    waitUntil: 'networkidle2', timeout: 60000,
  });
  await sleep(3000);

  const url = page.url();
  const title = await page.title();
  console.log(`[FB Scraper] URL: ${url}`);
  console.log(`[FB Scraper] Title: ${title}`);

  if (url.includes('login')) {
    throw new Error('session expired');
  }

  // Click "ver más" si existe para cargar más posts
  try {
    await page.click('#m_group_stories_container > div > a', { timeout: 3000 });
    await sleep(2000);
  } catch {}

  const posts = await page.evaluate((groupId) => {
    const articles = document.querySelectorAll('#m_group_stories_container > section > article');
    const results = [];
    const seen = new Set();

    for (const article of articles) {
      const links = article.querySelectorAll('a[href*="/permalink/"]');
      let fbPostId = '';
      for (const link of links) {
        const m = link.getAttribute('href')?.match(/\/permalink\/(\d+)\//);
        if (m) { fbPostId = m[1]; break; }
      }
      if (!fbPostId || seen.has(fbPostId)) continue;
      seen.add(fbPostId);

      const authorEl = article.querySelector('a[href*="/profile.php"] strong, a[href*="/user/"] strong, a[href*="profile"] strong');
      const authorName = authorEl ? authorEl.textContent.trim() : '';

      const clone = article.cloneNode(true);
      clone.querySelectorAll('a[href*="/permalink/"], a[href*="/groups/"], script, style').forEach(el => el.remove());
      let content = (clone.textContent || '').trim().substring(0, 10000);

      const imgs = [];
      const articleHtml = article.innerHTML;
      const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
      let m2;
      while ((m2 = imgRegex.exec(articleHtml)) !== null) {
        const src = m2[1];
        if (src.includes('fbcdn')) imgs.push(src.startsWith('//') ? 'https:' + src : src);
      }

      results.push({
        fb_post_id: fbPostId,
        fb_post_url: `https://www.facebook.com/groups/${groupId}/permalink/${fbPostId}/`,
        author_name: authorName,
        content,
        image_urls: imgs.slice(0, 5),
        posted_at: null,
      });
    }
    return results;
  }, groupId);

  console.log(`[FB Scraper] ${posts.length} post(s) encontrados`);
  return posts;
}

async function sendPosts(posts) {
  const api = axios.create({ baseURL: VPS_URL, headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 60000 });
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    try {
      const { data } = await api.post('/api/facebook/webhook', { posts: batch });
      console.log(`[FB Scraper] Batch ${i / BATCH_SIZE + 1}: ${data.inserted || 0} inserted, ${data.updated || 0} updated`);
    } catch (err) {
      console.error(`[FB Scraper] Error enviando batch:`, err.response?.data || err.message);
    }
  }
}

async function fetchConfig() {
  try {
    const { data } = await axios.get(`${VPS_URL}/api/facebook/scraper-config`, {
      headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 10000,
    });
    if (data) {
      config.hour_start = parseInt(data.hour_start) || 8;
      config.hour_end = parseInt(data.hour_end) || 22;
      config.interval_hours = parseInt(data.interval_hours) || 3;
      config.jitter_minutes = parseInt(data.jitter_minutes) || 15;
      config.max_posts = parseInt(data.max_posts) || 50;
    }
  } catch (e) {
    console.error('[FB Scraper] Error fetching config:', e.message);
  }
}

async function fetchGroups() {
  const { data } = await axios.get(`${VPS_URL}/api/facebook/scraper-groups`, {
    headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 15000,
  });
  if (!Array.isArray(data) || data.length === 0) {
    console.log('[FB Scraper] No hay grupos activos');
    return [];
  }
  return data.map(g => ({ id: g.fb_group_id, name: g.name }));
}

async function scrapeAllGroups(groups) {
  if (!loadCookies()) {
    console.log('[FB Scraper] Sin cookies, descargando...');
    if (!(await downloadCookies())) { console.error('[FB Scraper] Sin cookies en servidor'); return; }
  }
  const b = await launchBrowser();
  let page = null;
  try {
    page = await b.newPage();
    await setupSession(page);
    for (const group of groups) {
      try {
        let posts = await scrapeGroup(page, group.id);
        if (posts.length > config.max_posts) posts.length = config.max_posts;
        if (posts.length > 0) await sendPosts(posts);
      } catch (err) {
        if (err.message === 'session expired') {
          console.log('[FB Scraper] Sesión expirada, reintentando...');
          await downloadCookies();
          await setupSession(page);
          let posts = await scrapeGroup(page, group.id);
          if (posts.length > config.max_posts) posts.length = config.max_posts;
          if (posts.length > 0) await sendPosts(posts);
        } else {
          console.error(`[FB Scraper] Error en grupo ${group.id}:`, err.message);
        }
      }
    }
  } finally {
    if (page) await page.close().catch(() => {});
    await closeBrowser(b);
  }
}

async function main() {
  if (!TOKEN) { console.error('[FB Scraper] FATAL: RELAY_TOKEN no configurado'); process.exit(1); }
  while (true) {
    await fetchConfig();
    const groups = await fetchGroups();
    if (!isWithinSchedule()) {
      const delay = nextScheduleDelay();
      console.log(`[FB Scraper] Fuera de horario (${config.hour_start}:00-${config.hour_end}:00). Próximo ciclo en ${Math.round(delay / 60000)}min`);
      await sleep(delay); continue;
    }
    if (groups.length === 0) {
      console.log('[FB Scraper] Sin grupos, esperando...');
      await sleep(config.interval_hours * 60 * 60 * 1000); continue;
    }
    try { await scrapeAllGroups(groups); } catch (err) { console.error('[FB Scraper] Error:', err.message); }
    const jitter = randomJitter();
    const delay = config.interval_hours * 60 * 60 * 1000 + jitter;
    console.log(`[FB Scraper] Próximo scrape: ${new Date(Date.now() + delay).toLocaleTimeString()} (en ${Math.round(delay / 60000)}min)`);
    await sleep(delay);
  }
}

(async () => {
  if (process.argv.includes('--test')) {
    const idx = process.argv.indexOf('--test');
    const testGroup = process.argv[idx + 1];
    if (!testGroup) { console.error('Uso: node fb-pup-scraper.js --test <groupId>'); process.exit(1); }
    if (!TOKEN) { console.error('FATAL: RELAY_TOKEN no configurado'); process.exit(1); }

    if (!loadCookies() && !(await downloadCookies())) {
      console.error('[FB Scraper] No se pudieron descargar cookies');
      process.exit(1);
    }

    const b = await launchBrowser();
    const page = await b.newPage();
    try {
      await setupSession(page);
      const posts = await scrapeGroup(page, testGroup);
      if (posts.length > 0) {
        console.log(`[FB Scraper] ${posts.length} post(s). Enviando...`);
        await sendPosts(posts);
      } else {
        console.log('[FB Scraper] 0 posts encontrados');
      }
    } catch (err) {
      console.error('[FB Scraper] Error:', err.message);
      process.exit(1);
    } finally {
      await page.close().catch(() => {});
      await closeBrowser(b);
    }
  } else {
    main().catch(err => { console.error('[FB Scraper] Error fatal:', err); process.exit(1); });
  }
})();
