const axios = require('axios');
const fs = require('fs');
const path = require('path');

const VPS_URL = 'https://sigotuhuella.online';
const TOKEN = process.env.RELAY_TOKEN;
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
      } catch {
        cookies = raw;
      }
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

function cookiesToHeader(cookies) {
  const valid = cookies.filter(c => {
    const domain = (c.domain || '').toLowerCase();
    return domain.includes('facebook.com') || domain.includes('.fbcdn.net');
  });
  return valid.map(c => `${c.name}=${c.value}`).join('; ');
}

async function fetchWithCookies(url) {
  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  const cookieStr = cookiesToHeader(cookies);
  console.log(`[FB Scraper] Cookies en header: ${cookieStr.split(';').length} pares`);
  const { data, status, headers } = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      'Cookie': cookieStr,
    },
    maxRedirects: 5,
    timeout: 30000,
    responseType: 'text',
  });
  return { html: data, status, finalUrl: url, redirected: false };
}

async function fetchConfig() {
  try {
    const { data } = await axios.get(`${VPS_URL}/api/facebook/scraper-config`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 10000,
    });
    if (data) {
      config.hour_start = parseInt(data.hour_start) || 8;
      config.hour_end = parseInt(data.hour_end) || 22;
      config.interval_hours = parseInt(data.interval_hours) || 3;
      config.jitter_minutes = parseInt(data.jitter_minutes) || 15;
      config.max_posts = parseInt(data.max_posts) || 50;
    }
  } catch (e) {
    console.error('[FB Scraper] Error fetching config, usando defaults:', e.message);
  }
}

async function fetchGroups() {
  const { data } = await axios.get(`${VPS_URL}/api/facebook/scraper-groups`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 15000,
  });
  if (!Array.isArray(data) || data.length === 0) {
    console.log('[FB Scraper] No hay grupos activos con scrape habilitado');
    return [];
  }
  const groups = data.map(g => ({ id: g.fb_group_id, name: g.name }));
  console.log(`[FB Scraper] ${groups.length} grupo(s) desde el admin: ${groups.map(g => g.name).join(', ')}`);
  return groups;
}

function extractPosts(html, groupId) {
  const permalinkRegex = /\/groups\/[^/]+\/permalink\/(\d+)\//g;
  const seen = new Set();
  const posts = [];
  let m;

  while ((m = permalinkRegex.exec(html)) !== null) {
    const fbPostId = m[1];
    if (seen.has(fbPostId)) continue;
    seen.add(fbPostId);

    const searchStr = `/groups/${groupId}/permalink/${fbPostId}/`;
    const idx = html.indexOf(searchStr);
    if (idx === -1) continue;
    const block = html.substring(Math.max(0, idx - 2000), Math.min(html.length, idx + 3000));

    let author = '';
    const authorMatch = block.match(/<a[^>]*href="[^"]*profile[^"]*"[^>]*>(?:<strong>)?([^<]{2,40})(?:<\/strong>)?<\/a>/);
    if (authorMatch) author = authorMatch[1].replace(/<[^>]+>/g, '').trim();

    const content = block
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(new RegExp(`permalink/${fbPostId}[^\\s]*`, 'g'), '')
      .substring(0, 10000)
      .trim()
      .replace(/Full Story|See more|Ver más|Comment|Comentar|Like|Me gusta|Share|Compartir|Send|Enviar|ago[\s\S]{0,20}$/gi, '')
      .trim();

    const imgs = [];
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
    let im;
    while ((im = imgRegex.exec(block)) !== null) {
      const src = im[1];
      if (src.includes('fbcdn')) imgs.push(src.startsWith('//') ? 'https:' + src : src);
    }

    posts.push({
      fb_post_id: fbPostId,
      fb_post_url: `https://www.facebook.com/groups/${groupId}/permalink/${fbPostId}/`,
      author_name: author || '',
      content,
      image_urls: imgs.slice(0, 5),
      posted_at: null,
    });
  }

  return posts;
}

async function scrapeGroup(groupId) {
  console.log(`[FB Scraper] Scrapeando grupo ${groupId}...`);
  const url = `https://mbasic.facebook.com/groups/${groupId}`;
  const { html, status } = await fetchWithCookies(url);
  console.log(`[FB Scraper] HTTP ${status}, HTML ${html.length} chars`);

  const debugPath = path.join(__dirname, `mbasic_debug.html`);
  fs.writeFileSync(debugPath, html);
  console.log(`[FB Scraper] HTML guardado en ${debugPath}`);

  // Detectar login
  const isLogin = /<input[^>]*(name="email"|type="email")[^>]*>/i.test(html);
  if (isLogin) {
    console.log('[FB Scraper] Página de login detectada — cookies inválidas');
    return { posts: [], expired: true };
  }

  // Detectar grupo privado / join page
  const isJoinPage = /solicitar|join|unirte|request|private group|grupo privado/i.test(html.substring(0, 3000));
  if (isJoinPage) {
    console.log('[FB Scraper] Página de grupo privado / solicitud detectada');
  }

  const posts = extractPosts(html, groupId);
  console.log(`[FB Scraper] ${posts.length} post(s) extraídos`);

  return { posts, expired: false };
}

async function sendPosts(posts) {
  const api = axios.create({
    baseURL: VPS_URL,
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 60000,
  });
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

async function scrapeAllGroups(groups) {
  if (!loadCookies()) {
    console.log('[FB Scraper] Sin cookies locales, descargando...');
    if (!(await downloadCookies())) {
      console.error('[FB Scraper] No hay cookies en el servidor');
      return;
    }
  }

  for (const group of groups) {
    try {
      const { posts, expired } = await scrapeGroup(group.id);
      if (expired) {
        console.log('[FB Scraper] Cookies expiradas, descargando nuevas...');
        await downloadCookies();
        continue;
      }
      if (posts.length > config.max_posts) {
        posts.length = config.max_posts;
      }
      if (posts.length > 0) await sendPosts(posts);
    } catch (err) {
      console.error(`[FB Scraper] Error en grupo ${group.id} (${group.name}):`, err.message);
    }
  }
}

async function main() {
  if (!TOKEN) {
    console.error('[FB Scraper] FATAL: RELAY_TOKEN no configurado');
    process.exit(1);
  }

  while (true) {
    await fetchConfig();
    const groups = await fetchGroups();

    if (!isWithinSchedule()) {
      const delay = nextScheduleDelay();
      console.log(`[FB Scraper] Fuera de horario (${config.hour_start}:00-${config.hour_end}:00). Próximo ciclo en ${Math.round(delay / 60000)}min`);
      await sleep(delay);
      continue;
    }

    if (groups.length === 0) {
      console.log('[FB Scraper] Sin grupos, esperando al próximo ciclo...');
      await sleep(config.interval_hours * 60 * 60 * 1000);
      continue;
    }

    try { await scrapeAllGroups(groups); }
    catch (err) { console.error('[FB Scraper] Error en ciclo:', err.message); }

    const jitter = randomJitter();
    const delay = config.interval_hours * 60 * 60 * 1000 + jitter;
    const next = new Date(Date.now() + delay);
    console.log(`[FB Scraper] Próximo scrape: ${next.toLocaleTimeString()} (en ${Math.round(delay / 60000)}min, jitter ${Math.round(jitter / 60000)}min)`);
    await sleep(delay);
  }
}

(async () => {
  if (process.argv.includes('--test')) {
    const idx = process.argv.indexOf('--test');
    const testGroup = process.argv[idx + 1];
    if (!testGroup) {
      console.error('Uso: node fb-pup-scraper.js --test <groupId>');
      process.exit(1);
    }

    if (!TOKEN) { console.error('FATAL: RELAY_TOKEN no configurado'); process.exit(1); }
    if (!loadCookies()) {
      console.log('[FB Scraper] Sin cookies locales, descargando...');
      if (!(await downloadCookies())) {
        console.error('[FB Scraper] No hay cookies en el servidor');
        process.exit(1);
      }
    }

    console.log('[FB Scraper] --- TEST MODE ---');
    const { posts, expired } = await scrapeGroup(testGroup);
    if (expired) {
      console.log('[FB Scraper] Cookies expiradas, reintentando con cookies nuevas...');
      await downloadCookies();
      const r2 = await scrapeGroup(testGroup);
      if (r2.posts.length > 0) await sendPosts(r2.posts);
    } else if (posts.length > 0) {
      console.log(`[FB Scraper] ${posts.length} post(s) encontrados. Enviando...`);
      await sendPosts(posts);
    } else {
      console.log('[FB Scraper] No se encontraron posts');
    }
  } else {
    main().catch(err => {
      console.error('[FB Scraper] Error fatal:', err);
      process.exit(1);
    });
  }
})();
