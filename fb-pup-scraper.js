const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const VPS_URL = 'sigotuhuella.online';
const TOKEN = process.env.RELAY_TOKEN;
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

function httpsGet(url, host, headers) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: host || VPS_URL, path: url, method: 'GET', headers: headers || {}, timeout: 30000 };
    const req = https.request(opts, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function httpsPost(url, data, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const opts = { hostname: VPS_URL, path: url, method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, timeout: 60000 };
    const req = https.request(opts, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}

async function downloadCookies() {
  console.log('[FB Scraper] Descargando cookies...');
  try {
    const r = await httpsGet('/api/relay/fb/session-file', null, { Authorization: `Bearer ${TOKEN}` });
    if (r.status === 200) {
      const parsed = JSON.parse(r.body);
      const raw = Buffer.from(parsed.data, 'base64').toString('utf-8');
      let cookies = JSON.parse(raw);
      cookies = cookies.cookies || cookies;
      if (Array.isArray(cookies) && cookies.length > 0) {
        fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies));
        console.log(`[FB Scraper] ${cookies.length} cookies descargadas`);
        return true;
      }
    }
    console.log(`[FB Scraper] Servidor respondió ${r.status}`);
  } catch (e) { console.error('[FB Scraper] Error cookies:', e.message); }
  return false;
}

function loadCookies() {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      return Array.isArray(JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8')));
    }
  } catch {}
  return false;
}

function cookiesToHeader(cookies) {
  return cookies.filter(c => (c.domain || '').includes('facebook.com'))
    .map(c => `${c.name}=${c.value}`).join('; ');
}

async function fetchConfig() {
  try {
    const r = await httpsGet('/api/facebook/scraper-config', null, { Authorization: `Bearer ${TOKEN}` });
    if (r.status === 200) {
      const d = JSON.parse(r.body);
      config.hour_start = parseInt(d.hour_start) || 8;
      config.hour_end = parseInt(d.hour_end) || 22;
      config.interval_hours = parseInt(d.interval_hours) || 3;
      config.jitter_minutes = parseInt(d.jitter_minutes) || 15;
      config.max_posts = parseInt(d.max_posts) || 50;
    }
  } catch {}
}

async function fetchGroups() {
  const r = await httpsGet('/api/facebook/scraper-groups', null, { Authorization: `Bearer ${TOKEN}` });
  const data = JSON.parse(r.body);
  if (!Array.isArray(data)) return [];
  return data.map(g => ({ id: g.fb_group_id, name: g.name }));
}

function extractPosts(html, groupId) {
  const re = /\/groups\/[^/]+\/permalink\/(\d+)\//g;
  const seen = new Set(); const posts = []; let m;
  while ((m = re.exec(html)) !== null) {
    const fbPostId = m[1];
    if (seen.has(fbPostId)) continue; seen.add(fbPostId);
    const searchStr = `/groups/${groupId}/permalink/${fbPostId}/`;
    const idx = html.indexOf(searchStr);
    if (idx === -1) continue;
    const block = html.substring(Math.max(0, idx - 2000), Math.min(html.length, idx + 3000));
    let author = '';
    const am = block.match(/<a[^>]*href="[^"]*profile[^"]*"[^>]*>(?:<strong>)?([^<]{2,40})(?:<\/strong>)?<\/a>/);
    if (am) author = am[1].replace(/<[^>]+>/g, '').trim();
    let content = block.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(new RegExp(`permalink/${fbPostId}[^\\s]*`, 'g'), '')
      .substring(0, 10000).trim()
      .replace(/Full Story|See more|Ver más|Comment|Comentar|Like|Me gusta|Share|Compartir|Send|Enviar|ago[\s\S]{0,20}$/gi, '').trim();
    const imgs = []; const ig = /<img[^>]+src="([^"]+)"[^>]*>/g; let im;
    while ((im = ig.exec(block)) !== null) { const s = im[1]; if (s.includes('fbcdn')) imgs.push(s); }
    posts.push({
      fb_post_id: fbPostId, fb_post_url: `https://www.facebook.com/groups/${groupId}/permalink/${fbPostId}/`,
      author_name: author, content, image_urls: imgs.slice(0, 5), posted_at: null,
    });
  }
  return posts;
}

async function scrapeGroup(groupId) {
  console.log(`[FB Scraper] Scrapeando grupo ${groupId}...`);
  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  const cookieStr = cookiesToHeader(cookies);
  const ua = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
  const r = await httpsGet(`/groups/${groupId}`, 'mbasic.facebook.com', {
    'User-Agent': ua, 'Accept': 'text/html,*/*', 'Cookie': cookieStr,
  });
  console.log(`[FB Scraper] HTTP ${r.status}, HTML ${r.body.length} chars`);

  const debugPath = path.join(__dirname, 'mbasic_debug.html');
  fs.writeFileSync(debugPath, r.body);

  if (/input[^>]*(name="email"|type="email")/i.test(r.body)) {
    console.log('[FB Scraper] Login detectado — cookies inválidas');
    return { posts: [], expired: true };
  }

  if (r.body.includes('solicitar') || r.body.includes('private group') || r.body.includes('grupo privado')) {
    console.log('[FB Scraper] Grupo privado detectado');
  }

  const posts = extractPosts(r.body, groupId);
  console.log(`[FB Scraper] ${posts.length} post(s)`);

  if (posts.length === 0) {
    console.log('[FB Scraper] Primeros 500 chars HTML:', r.body.substring(0, 500));
    console.log(`[FB Scraper] 'permalink' aparece ${(r.body.match(/permalink/g) || []).length} veces`);
  }

  return { posts, expired: false };
}

async function sendPosts(posts) {
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    try {
      await httpsPost('/api/facebook/webhook', { posts: batch }, { Authorization: `Bearer ${TOKEN}` });
      console.log(`[FB Scraper] Batch ${i / BATCH_SIZE + 1} enviado`);
    } catch (e) { console.error('[FB Scraper] Error:', e.message); }
  }
}

async function scrapeAllGroups(groups) {
  if (!loadCookies() && !(await downloadCookies())) { console.error('[FB Scraper] Sin cookies'); return; }
  for (const g of groups) {
    try {
      const { posts, expired } = await scrapeGroup(g.id);
      if (expired) { await downloadCookies(); continue; }
      if (posts.length > config.max_posts) posts.length = config.max_posts;
      if (posts.length > 0) await sendPosts(posts);
    } catch (e) { console.error(`[FB Scraper] Error ${g.name}:`, e.message); }
  }
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
    const { posts, expired } = await scrapeGroup(g);
    if (expired) { await downloadCookies(); const r2 = await scrapeGroup(g); if (r2.posts.length) await sendPosts(r2.posts); }
    else if (posts.length) await sendPosts(posts);
    else console.log('[FB Scraper] 0 posts');
  } else { main().catch(e => { console.error('[FB Scraper] Error fatal:', e); process.exit(1); }); }
})();
