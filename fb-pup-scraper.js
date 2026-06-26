const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());
const VPS_URL = 'https://sigotuhuella.online';
const TOKEN = process.env.RELAY_TOKEN;
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/data/data/com.termux/files/usr/bin/chromium-browser';
const COOKIES_PATH = path.join(__dirname, 'fb_scraper_cookies.json');
const BATCH_SIZE = 10;

// Defaults (overridden by API config)
let config = {
  hour_start: 8,
  hour_end: 22,
  interval_hours: 3,
  jitter_minutes: 15,
  max_posts: 50,
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

async function launchBrowser() {
  console.log('[FB Scraper] Lanzando Chromium...');
  if (!fs.existsSync(CHROMIUM_PATH)) {
    console.error(`[FB Scraper] Chromium no encontrado en ${CHROMIUM_PATH}`);
    console.error('[FB Scraper] Ejecutá: pkg install x11-repo && pkg install chromium');
    process.exit(1);
  }
  const b = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });
  return b;
}

async function closeBrowser(b) {
  if (b) {
    try { await b.close(); } catch {}
  }
}

async function downloadCookies() {
  try {
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

function ensureValidCookies(cookies) {
  return cookies.map(c => {
    if (!c.domain) c.domain = '.facebook.com';
    if (!c.path) c.path = '/';
    return c;
  });
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

async function setupSession(page) {
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1440, height: 900 });

  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  await page.goto('about:blank');
  await page.setCookie(...ensureValidCookies(cookies));
  await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2000);

  if (!(await checkSession(page))) {
    throw new Error('session expired');
  }
}

async function extractPostsFromPage(page, groupId) {
  return await page.evaluate((groupId) => {
    const posts = [];
    // Buscar todos los links que contengan permalink
    const permalinkLinks = document.querySelectorAll('a[href*="/permalink/"]');
    const seen = new Set();

    permalinkLinks.forEach((link) => {
      const href = link.getAttribute('href') || '';
      const match = href.match(/\/permalink\/(\d+)\//);
      if (!match) return;
      const fbPostId = match[1];
      if (seen.has(fbPostId)) return;
      seen.add(fbPostId);

      // Subir hasta el contenedor del post
      let container = link;
      for (let i = 0; i < 6; i++) {
        if (container?.parentElement) container = container.parentElement;
      }

      // Autor: buscar link con perfil dentro del contenedor
      let authorName = '';
      const profileLink = container?.querySelector('a[href*="/user/"], a[href*="/profile.php"]');
      if (profileLink) {
        const strong = profileLink.querySelector('strong');
        authorName = strong ? strong.textContent.trim() : profileLink.textContent.trim();
      } else {
        // Buscar cualquier strong con texto
        const strongs = container?.querySelectorAll('strong');
        if (strongs) {
          for (const s of strongs) {
            const t = s.textContent.trim();
            if (t.length > 2 && t.length < 50) { authorName = t; break; }
          }
        }
      }

      // Contenido: texto del contenedor excluyendo enlaces de permalink
      let content = '';
      if (container) {
        // Clonar para manipular sin afectar la página real
        const clone = container.cloneNode(true);
        // Remover elementos que no son contenido
        clone.querySelectorAll('a[href*="/permalink/"], a[href*="/groups/"], script, style').forEach(el => el.remove());
        content = (clone.textContent || '').trim().substring(0, 10000);
      }

      // Imágenes
      const imageUrls = [];
      const imgs = container?.querySelectorAll('img[src*="fbcdn"]');
      if (imgs) {
        imgs.forEach((img) => {
          let src = img.getAttribute('src') || '';
          if (src.startsWith('//')) src = 'https:' + src;
          if (src && imageUrls.length < 5) imageUrls.push(src);
        });
      }

      // Fecha: <abbr title="..."> o <span> con timestamp
      let postedAt = '';
      const abbr = container?.querySelector('abbr');
      if (abbr) {
        postedAt = abbr.getAttribute('title') || '';
      } else {
        // Buscar spans con texto de fecha
        const spans = container?.querySelectorAll('span');
        if (spans) {
          const dateRegex = /(?:ayer|hoy|hace|\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic))/i;
          for (const s of spans) {
            if (dateRegex.test(s.textContent)) {
              postedAt = s.textContent.trim();
              break;
            }
          }
        }
      }

      posts.push({
        fb_post_id: fbPostId,
        fb_post_url: `https://www.facebook.com/groups/${groupId}/permalink/${fbPostId}/`,
        author_name: authorName,
        content,
        image_urls: imageUrls,
        posted_at: postedAt || null,
      });
    });

    return posts;
  }, groupId);
}

async function scrapeGroup(page, groupId) {
  console.log(`[FB Scraper] Scrapeando grupo ${groupId}...`);
  await page.goto(`https://www.facebook.com/groups/${groupId}`, {
    waitUntil: 'networkidle2', timeout: 60000,
  });
  await sleep(5000);

  if (!(await checkSession(page))) {
    throw new Error('session expired');
  }

  // Hacer scroll para cargar más posts
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await sleep(2000);
  }

  const posts = await extractPostsFromPage(page, groupId);
  console.log(`[FB Scraper] Grupo ${groupId}: ${posts.length} posts extraídos`);
  return posts;
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

  const b = await launchBrowser();
  let page = null;

  try {
    page = await b.newPage();
    await setupSession(page);
    for (const group of groups) {
      try {
        let posts = await scrapeGroup(page, group.id);
        if (posts.length > config.max_posts) {
          console.log(`[FB Scraper] Limitando a ${config.max_posts} posts (encontrados ${posts.length})`);
          posts = posts.slice(0, config.max_posts);
        }
        if (posts.length > 0) {
          await sendPosts(posts);
        }
      } catch (err) {
        if (err.message === 'session expired') {
          console.error('[FB Scraper] Sesión expirada, descargando cookies nuevas...');
          await downloadCookies();
          throw err;
        }
        console.error(`[FB Scraper] Error en grupo ${group.id} (${group.name}):`, err.message);
      }
    }
  } finally {
    if (page) await page.close().catch(() => {});
    await closeBrowser(b);
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

    try {
      await scrapeAllGroups(groups);
    } catch (err) {
      console.error('[FB Scraper] Error en ciclo:', err.message);
    }

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

    const b = await launchBrowser();
    const page = await b.newPage();

    try {
      console.log('[FB Scraper] Step 1: setupSession...');
      await setupSession(page);

      console.log('[FB Scraper] Step 2: navegando al grupo...');
      await page.goto(`https://www.facebook.com/groups/${testGroup}`, {
        waitUntil: 'networkidle2', timeout: 60000,
      });
      await sleep(5000);

      const currentUrl = page.url();
      const title = await page.title();
      console.log(`[FB Scraper] URL: ${currentUrl}`);
      console.log(`[FB Scraper] Title: ${title}`);

      const isValid = await checkSession(page);
      console.log(`[FB Scraper] Sesión válida: ${isValid}`);

      // Scroll para cargar posts
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await sleep(2000);
      }

      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
      console.log('[FB Scraper] Texto visible (primeros 3000 chars):');
      console.log(bodyText);

      const linkCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/permalink/"]').length;
      });
      console.log(`[FB Scraper] Links con permalink encontrados: ${linkCount}`);

      console.log('[FB Scraper] Step 3: scrapeGroup...');
      const posts = await scrapeGroup(page, testGroup);
      if (posts.length > 0) {
        console.log(`[FB Scraper] ${posts.length} post(s) encontrados. Enviando...`);
        await sendPosts(posts);
      } else {
        console.log('[FB Scraper] No se encontraron posts');
      }
    } catch (err) {
      console.error('[FB Scraper] Test falló:', err.message);
      process.exit(1);
    } finally {
      await page.close().catch(() => {});
      await closeBrowser(b);
    }
  } else {
    main().catch(err => {
      console.error('[FB Scraper] Error fatal:', err);
      process.exit(1);
    });
  }
})();
