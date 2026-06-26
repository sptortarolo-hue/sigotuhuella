import puppeteer from 'puppeteer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const VPS_URL = 'https://sigotuhuella.online';
const TOKEN = process.env.RELAY_TOKEN;
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/data/data/com.termux/files/usr/bin/chromium-browser';
const COOKIES_PATH = path.join(__dirname, 'fb_scraper_cookies.json');
const BATCH_SIZE = 10;

let config = { hour_start: 8, hour_end: 22, interval_hours: 3, jitter_minutes: 15, max_posts: 50 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const randomJitter = () => Math.floor(Math.random() * config.jitter_minutes * 60 * 1000 * 2 - config.jitter_minutes * 60 * 1000);
const isWithinSchedule = () => { const h = new Date().getHours(); return h >= config.hour_start && h < config.hour_end; };

function nextScheduleDelay() {
  const n = new Date(); const next = new Date(n);
  next.setHours(config.hour_start, 0, 0, 0);
  if (n.getHours() >= config.hour_end) next.setDate(next.getDate() + 1);
  return next.getTime() - n.getTime();
}

async function downloadCookies() {
  console.log('[FB Scraper] Descargando cookies...');
  try {
    const { data } = await axios.get(`${VPS_URL}/api/relay/fb/session-file`, {
      headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 15000,
    });
    if (data?.data) {
      const raw = Buffer.from(data.data, 'base64').toString('utf-8');
      let cookies = JSON.parse(raw);
      cookies = cookies.cookies || cookies;
      if (Array.isArray(cookies) && cookies.length > 0) {
        fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies));
        console.log(`[FB Scraper] ${cookies.length} cookies descargadas`);
        return true;
      }
    }
  } catch (e) { console.error('[FB Scraper] Error cookies:', e.message); }
  return false;
}

function loadCookies() {
  try {
    if (fs.existsSync(COOKIES_PATH)) return Array.isArray(JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8')));
  } catch {}
  return false;
}

async function launchBrowser() {
  console.log('[FB Scraper] Lanzando Chromium...');
  return await puppeteer.launch({
    executablePath: CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process'],
  });
}

async function closeBrowser(b) { if (b) { try { await b.close(); } catch {} } }

async function setupSession(page) {
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36');
  await page.setViewport({ width: 412, height: 915 });
  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  console.log(`[FB Scraper] ${cookies.length} cookies cargadas`);
  await page.goto('about:blank');
  const valid = cookies.map(c => { if (!c.domain) c.domain = '.facebook.com'; if (!c.path) c.path = '/'; return c; });
  await page.setCookie(...valid);
  await page.goto('https://mbasic.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);
  const url = page.url();
  if (url.includes('login')) throw new Error('session expired');
  console.log(`[FB Scraper] Sesión OK: ${url}`);
}

async function scrapeGroup(page, groupId) {
  console.log(`[FB Scraper] Navegando a grupo ${groupId}...`);
  await page.goto(`https://mbasic.facebook.com/groups/${groupId}`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  const url = page.url();
  console.log(`[FB Scraper] URL: ${url}`);
  if (url.includes('login')) throw new Error('session expired');

  try { await page.click('#m_group_stories_container > div > a', { timeout: 3000 }); await sleep(2000); } catch {}

  const posts = await page.evaluate((groupId) => {
    const articles = document.querySelectorAll('#m_group_stories_container > section > article');
    const results = []; const seen = new Set();
    for (const article of articles) {
      const links = article.querySelectorAll('a[href*="/permalink/"]');
      let fbPostId = '';
      for (const link of links) {
        const m = link.getAttribute('href')?.match(/\/permalink\/(\d+)\//);
        if (m) { fbPostId = m[1]; break; }
      }
      if (!fbPostId || seen.has(fbPostId)) continue; seen.add(fbPostId);
      const authorEl = article.querySelector('a[href*="/profile.php"] strong, a[href*="/user/"] strong, a[href*="profile"] strong');
      const authorName = authorEl ? authorEl.textContent.trim() : '';
      const clone = article.cloneNode(true);
      clone.querySelectorAll('a[href*="/permalink/"], a[href*="/groups/"], script, style').forEach(el => el.remove());
      let content = (clone.textContent || '').trim().substring(0, 10000);
      const imgs = []; const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g; let m2;
      while ((m2 = imgRegex.exec(article.innerHTML)) !== null) {
        const src = m2[1]; if (src.includes('fbcdn')) imgs.push(src);
      }
      results.push({
        fb_post_id: fbPostId, fb_post_url: `https://www.facebook.com/groups/${groupId}/permalink/${fbPostId}/`,
        author_name: authorName, content, image_urls: imgs.slice(0, 5), posted_at: null,
      });
    }
    return results;
  }, groupId);
  console.log(`[FB Scraper] ${posts.length} post(s)`);
  return posts;
}

async function sendPosts(posts) {
  const api = axios.create({ baseURL: VPS_URL, headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 60000 });
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    try {
      const { data } = await api.post('/api/facebook/webhook', { posts: batch });
      console.log(`[FB Scraper] Batch ${i / BATCH_SIZE + 1}: ${data.inserted || 0} inserted, ${data.updated || 0} updated`);
    } catch (err) { console.error(`[FB Scraper] Error:`, err.response?.data || err.message); }
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
  } catch {}
}

async function fetchGroups() {
  const { data } = await axios.get(`${VPS_URL}/api/facebook/scraper-groups`, {
    headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 15000,
  });
  if (!Array.isArray(data)) return [];
  return data.map(g => ({ id: g.fb_group_id, name: g.name }));
}

async function scrapeAllGroups(groups) {
  if (!loadCookies() && !(await downloadCookies())) { console.error('[FB Scraper] Sin cookies'); return; }
  const b = await launchBrowser(); let page = null;
  try {
    page = await b.newPage(); await setupSession(page);
    for (const group of groups) {
      try {
        let posts = await scrapeGroup(page, group.id);
        if (posts.length > config.max_posts) posts.length = config.max_posts;
        if (posts.length > 0) await sendPosts(posts);
      } catch (err) {
        if (err.message === 'session expired') { await downloadCookies(); await setupSession(page); let posts = await scrapeGroup(page, group.id); if (posts.length > config.max_posts) posts.length = config.max_posts; if (posts.length > 0) await sendPosts(posts); }
        else console.error(`[FB Scraper] Error ${group.name}:`, err.message);
      }
    }
  } finally { if (page) await page.close().catch(() => {}); await closeBrowser(b); }
}

async function main() {
  if (!TOKEN) { console.error('[FB Scraper] FATAL: RELAY_TOKEN no configurado'); process.exit(1); }
  while (true) {
    await fetchConfig(); const groups = await fetchGroups();
    if (!isWithinSchedule()) { const d = nextScheduleDelay(); console.log(`[FB Scraper] Fuera de horario. Próximo en ${Math.round(d / 60000)}min`); await sleep(d); continue; }
    if (!groups.length) { console.log('[FB Scraper] Sin grupos'); await sleep(config.interval_hours * 60 * 60 * 1000); continue; }
    try { await scrapeAllGroups(groups); } catch (e) { console.error('[FB Scraper] Error:', e.message); }
    const j = randomJitter(); const d = config.interval_hours * 60 * 60 * 1000 + j;
    console.log(`[FB Scraper] Próximo en ${Math.round(d / 60000)}min`); await sleep(d);
  }
}

(async () => {
  if (process.argv.includes('--test')) {
    const g = process.argv[process.argv.indexOf('--test') + 1];
    if (!g) { console.error('Uso: node fb-pup-scraper.js --test <groupId>'); process.exit(1); }
    if (!TOKEN) { console.error('FATAL: RELAY_TOKEN no configurado'); process.exit(1); }
    if (!loadCookies() && !(await downloadCookies())) { console.error('[FB Scraper] Sin cookies'); process.exit(1); }
    const b = await launchBrowser(); const page = await b.newPage();
    try { await setupSession(page); const posts = await scrapeGroup(page, g); if (posts.length) await sendPosts(posts); else console.log('[FB Scraper] 0 posts'); }
    catch (err) { console.error('[FB Scraper] Error:', err.message); process.exit(1); }
    finally { await page.close().catch(() => {}); await closeBrowser(b); }
  } else { main().catch(e => { console.error('[FB Scraper] Error fatal:', e); process.exit(1); }); }
})();
