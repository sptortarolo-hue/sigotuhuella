import puppeteer from 'puppeteer-core';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE_URL || 'https://sigotuhuella.online/api/relay';
const TOKEN = process.env.RELAY_TOKEN || process.env.FB_RELAY_TOKEN;
const POLL_INTERVAL = parseInt(process.env.FB_POLL_INTERVAL || '60000');
const COOKIES_PATH = process.env.FB_COOKIES_PATH || path.join(__dirname, 'fb_cookies.json');
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/data/data/com.termux/files/usr/bin/chromium-browser';
const TMP_DIR = path.join(__dirname, '.fb_img_tmp');

const api = axios.create({
  baseURL: API_BASE,
  headers: { Authorization: `Bearer ${TOKEN}` },
  timeout: 60000,
});

let browser = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getBrowser() {
  if (browser) {
    try { await browser.version(); return browser; }
    catch (e) { browser = null; }
  }
  console.log('[FB Relay] Lanzando Chromium...');
  if (!fs.existsSync(CHROMIUM_PATH)) {
    console.error(`[FB Relay] Chromium no encontrado en ${CHROMIUM_PATH}`);
    console.error('[FB Relay] Ejecutá: pkg install x11-repo && pkg install chromium');
    process.exit(1);
  }
  browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  return browser;
}

async function downloadImages(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return [];
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const files = [];
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const resp = await axios.get(imageUrls[i], { responseType: 'arraybuffer', timeout: 120000 });
      const filePath = path.join(TMP_DIR, `img_${i}.jpg`);
      fs.writeFileSync(filePath, resp.data);
      files.push(filePath);
      console.log(`[FB Relay] Imagen ${i+1}/${imageUrls.length} descargada`);
    } catch (err) {
      console.error(`[FB Relay] Error descargando imagen ${i}:`, err.message);
    }
  }
  return files;
}

function cleanupImages() {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

async function downloadCookies() {
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
      if (Array.isArray(cookies)) {
        fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies));
        console.log('[FB Relay] Cookies descargadas');
        return true;
      }
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error('[FB Relay] Error descargando cookies:', err.message);
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
    console.error('[FB Relay] Error cargando cookies:', e.message);
  }
  return false;
}

function clearCookies() {
  try {
    if (fs.existsSync(COOKIES_PATH)) fs.unlinkSync(COOKIES_PATH);
    console.log('[FB Relay] Cookies eliminadas');
  } catch (e) {
    console.error('[FB Relay] Error limpiando cookies:', e.message);
  }
}

function ensureValidCookies(cookies) {
  return cookies.map(c => {
    if (!c.domain) c.domain = '.facebook.com';
    if (!c.path) c.path = '/';
    return c;
  });
}

async function postToGroup(b, fbGroupId, message, imageUrls) {
  const cookies = ensureValidCookies(JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8')));
  const page = await b.newPage();

  try {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1440, height: 900 });

    // Sesión (como fb-group-auto-post)
    await page.goto('https://facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.setCookie(...cookies);
    await page.goto('https://facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // Ir al grupo
    console.log(`[FB Relay] Grupo ${fbGroupId}...`);
    await page.goto(`https://facebook.com/groups/${fbGroupId}`, {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    await sleep(3000);

    if (page.url().includes('login') || page.url().includes('checkpoint')) {
      throw new Error('session expired');
    }

    // Activar composer inline (Lexical) o legacy dialog
    let triggerClicked = false;
    for (let attempt = 0; attempt < 8 && !triggerClicked; attempt++) {
      triggerClicked = await page.evaluate(() => {
        // 1) Lexical inline editor
        const lexical = document.querySelector('[data-lexical-editor="true"]');
        if (lexical && lexical.offsetParent !== null) { lexical.click(); return true; }
        // 2) Create a post (ARIA estable)
        const create = document.querySelector('[aria-label="Create a post"]');
        if (create && create.offsetParent !== null) { create.click(); return true; }
        // 3) XPath legacy
        const xpath = '//span[contains(., "Write something") or contains(., "Escribe algo") or contains(., "Qué estás pensando")]';
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const el = result.singleNodeValue;
        if (el && el.offsetParent !== null) { el.click(); return true; }
        return false;
      });
      if (!triggerClicked) await sleep(1000);
    }
    if (!triggerClicked) throw new Error('Composer trigger not found');
    console.log('[FB Relay] Composer activated');

    // Esperar editor visible (inline o legacy dialog)
    let editor = await page.waitForSelector('div[role="textbox"][contenteditable="true"]', { visible: true, timeout: 15000 })
      .catch(() => null);
    if (!editor) {
      editor = await page.waitForSelector('[data-lexical-editor="true"] div[contenteditable="true"]', { visible: true, timeout: 10000 })
        .catch(() => null);
    }
    if (!editor) throw new Error('Editor not found');
    await sleep(1500);

    // Subir primera imagen si hay
    if (imageUrls && imageUrls.length > 0) {
      const files = await downloadImages(imageUrls);
      if (files.length > 0) {
        try {
          // Intentar click en Photo/video primero (inline composer), luego file input directo
          const photoBtn = await page.$('[aria-label="Photo/video"], [aria-label="Foto/video"]');
          if (photoBtn) {
            await photoBtn.click();
            await sleep(1000);
          }
          const fileInput = await page.$('input[type="file"]');
          if (fileInput) {
            await fileInput.uploadFile(files[0]);
            console.log('[FB Relay] Imagen subida, esperando procesamiento...');
            try {
              await page.waitForSelector('img[src*="blob:"], img[src*="data:"]', { timeout: 15000 });
            } catch {}
            await sleep(3000);
          } else {
            // Fallback: incluir URL en texto para OG card
            console.log('[FB Relay] Sin file input, incluyendo URL en texto');
            message = message + '\n\n' + imageUrls[0];
          }
        } catch (err) {
          console.error('[FB Relay] Error subiendo imagen:', err.message);
        }
      }
      cleanupImages();
    }

    // Click editor + escribir
    await editor.click();
    await sleep(500);
    await editor.type(message, { delay: 3 });
    await sleep(2000);

    // Click Publicar (sin scope dialog)
    let postBtn = await page.$('[aria-label="Publicar"], [aria-label="Post"]');
    if (!postBtn) {
      postBtn = await page.waitForSelector('div[role="dialog"] [aria-label="Publicar"], div[role="dialog"] [aria-label="Post"]', { visible: true, timeout: 5000 })
        .catch(() => null);
    }
    if (!postBtn) {
      console.log('[FB Relay] Post button not found, intentando Enter...');
      await page.keyboard.press('Enter');
      await sleep(3000);
    } else {
      await postBtn.click();
      console.log('[FB Relay] Post button clicked');
    }

    // Esperar que desaparezca el composer
    try {
      await page.waitForFunction(() => {
        return document.querySelector('div[role="dialog"]') === null
          && (document.querySelector('[data-lexical-editor="true"]') === null
            || document.querySelector('[data-lexical-editor="true"]').offsetParent === null);
      }, { timeout: 15000 });
    } catch {
      console.log('[FB Relay] Enter fallback por si quedó abierto');
      await page.keyboard.press('Enter');
      await sleep(3000);
    }

    console.log(`[FB Relay] Publicado en grupo ${fbGroupId}`);
    return true;
  } finally {
    await page.close();
  }
}

async function executeTask(task) {
  if (!loadCookies()) throw new Error('No hay cookies disponibles');
  const b = await getBrowser();
  await postToGroup(b, task.fb_group_id, task.message, task.image_urls || []);
  await api.post('/fb/completed', { task_ids: [task.id] });
  console.log(`[FB Relay] Tarea ${task.id} completada`);
}

async function main() {
  console.log('[FB Relay] Iniciando Facebook relay (Puppeteer + Chromium)...');
  console.log(`[FB Relay] Chromium: ${CHROMIUM_PATH}`);
  if (!TOKEN) {
    console.error('[FB Relay] FATAL: RELAY_TOKEN no configurado');
    process.exit(1);
  }

  let sessionReady = false;

  while (true) {
    try {
      if (!sessionReady) {
        if (!loadCookies()) {
          console.log('[FB Relay] Sin cookies, descargando...');
          if (!(await downloadCookies())) {
            console.log('[FB Relay] No hay cookies en el servidor. Esperando...');
            await sleep(POLL_INTERVAL);
            continue;
          }
        }
        sessionReady = true;
        console.log('[FB Relay] Sesión lista. Esperando tareas...');
      }

      const { data } = await api.get('/fb/pending?limit=5');
      const tasks = data?.tasks || [];

      if (tasks.length === 0) {
        await sleep(POLL_INTERVAL);
        continue;
      }

      console.log(`[FB Relay] Procesando ${tasks.length} tarea(s)...`);
      for (const task of tasks) {
        try {
          await executeTask(task);
        } catch (err) {
          console.error(`[FB Relay] Tarea ${task.id} falló:`, err.message);
          if (err.message === 'session expired') {
            await api.post('/fb/failed', { task_id: task.id, error: err.message });
            clearCookies();
            await api.post('/fb/clear-session');
            sessionReady = false;
            console.log('[FB Relay] Sesión expirada. Esperando cookies nuevas del admin.');
            break;
          }
          await api.post('/fb/failed', { task_id: task.id, error: err.message });
        }
      }
    } catch (err) {
      console.error('[FB Relay] Error en loop:', err.message);
      await sleep(POLL_INTERVAL);
    }
  }
}

// Modo test: node fb-relay.mjs --test <groupId> "mensaje"
if (process.argv.includes('--test')) {
  const idx = process.argv.indexOf('--test');
  const testGroup = process.argv[idx + 1];
  const testMsg = process.argv[idx + 2] || 'Test automático - ' + new Date().toISOString();
  if (!testGroup) {
    console.error('Uso: node fb-relay.mjs --test <groupId> "mensaje opcional"');
    process.exit(1);
  }
  (async () => {
    if (!TOKEN) { console.error('FATAL: RELAY_TOKEN no configurado'); process.exit(1); }
    if (!loadCookies()) {
      console.log('[FB Relay] Sin cookies locales, descargando...');
      if (!(await downloadCookies())) {
        console.error('[FB Relay] No hay cookies en el servidor');
        process.exit(1);
      }
    }
    const b = await getBrowser();
    try {
      await postToGroup(b, testGroup, testMsg, []);
      console.log('[FB Relay] Test exitoso');
    } catch (err) {
      console.error('[FB Relay] Test falló:', err.message);
      process.exit(1);
    } finally {
      if (browser) await browser.close();
    }
  })();
} else {
  main().catch(err => {
    console.error('[FB Relay] Error fatal:', err);
    process.exit(1);
  });
}
