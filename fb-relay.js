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

const api = axios.create({
  baseURL: API_BASE,
  headers: { Authorization: `Bearer ${TOKEN}` },
  timeout: 30000,
});

let browser = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  console.log('[FB Relay] Lanzando Chromium...');
  if (!fs.existsSync(CHROMIUM_PATH)) {
    console.error(`[FB Relay] Chromium no encontrado en ${CHROMIUM_PATH}`);
    console.error('[FB Relay] Ejecutá: pkg install x11-repo && pkg install chromium');
    process.exit(1);
  }
  browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  return browser;
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

async function postToGroup(b, fbGroupId, message) {
  const cookies = ensureValidCookies(JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8')));
  const page = await b.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });

    // Ir a Facebook primero para establecer dominio
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.setCookie(...cookies);
    await sleep(1000);

    console.log(`[FB Relay] Navegando al grupo ${fbGroupId}...`);
    await page.goto(`https://www.facebook.com/groups/${fbGroupId}`, {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });

    if (page.url().includes('login') || page.url().includes('checkpoint')) {
      const loginText = await page.evaluate(() => document.body.textContent.substring(0, 500)).catch(() => '');
      console.log('[FB Relay] Login/checkpoint detectado. Texto:', loginText.substring(0, 300));
      throw new Error('session expired');
    }

    await sleep(3000);

    // Dump texto de la página para debug
    const pageText = await page.evaluate(() => document.body.textContent.substring(0, 2000)).catch(() => 'sin texto');
    console.log('[FB Relay] Texto visible en la página:');
    console.log(pageText.substring(0, 1000));

    // Screenshot de debug
    await page.screenshot({ path: path.join(__dirname, `fb_debug_${fbGroupId}.png`) });

    // Intentar navegar al composer directamente si existe
    const composerUrl = `https://www.facebook.com/groups/${fbGroupId}/composer/`;
    const composerResult = await page.evaluate(async (url) => {
      try {
        const r = await fetch(url, { credentials: 'include' });
        return r.url;
      } catch { return ''; }
    }, composerUrl);
    console.log('[FB Relay] Composer URL check:', composerResult);

    // Buscar el trigger del composer (varios intentos)
    const clicked = await page.evaluate(() => {
      const candidates = document.querySelectorAll('span[role="button"], div[role="button"], a[role="button"], button, a');
      for (const el of candidates) {
        const t = el.textContent.trim();
        if (/Write something|Escribe algo|Qué estás pensando|Comparte|Publicar en|Create post|Crear publicación|Start a post/i.test(t)) {
          el.click();
          return 'trigger:' + t.substring(0, 50);
        }
      }
      // Buscar cualquier elemento que parezca un composer visible
      const composer = document.querySelector('div[contenteditable="true"], div[role="textbox"]');
      if (composer) {
        composer.focus();
        return 'composer_direct';
      }
      return '';
    });
    console.log('[FB Relay] Click result:', clicked);

    if (!clicked) {
      // Intentar con /composer/ directamente
      await page.goto(`https://www.facebook.com/groups/${fbGroupId}/composer/`, {
        waitUntil: 'networkidle2', timeout: 30000,
      }).catch(() => {});
      await sleep(3000);
      console.log('[FB Relay] Después de composer/ URL:', page.url());

      const clicked2 = await page.evaluate(() => {
        const composer = document.querySelector('div[contenteditable="true"], div[role="textbox"]');
        if (composer) {
          composer.focus();
          return 'found_after_composer';
        }
        return '';
      });
      if (!clicked2) {
        await page.screenshot({ path: path.join(__dirname, 'fb_debug_composer.png') });
        throw new Error('composer trigger not found');
      }
    }

    // Esperar editor
    await sleep(2000);
    await page.waitForSelector('div[role="textbox"][contenteditable="true"]', { timeout: 10000 });
    await page.click('div[role="textbox"][contenteditable="true"]');
    await sleep(500);

    // Insertar texto
    await page.evaluate(text => {
      const el = document.querySelector('div[role="textbox"][contenteditable="true"]');
      el.focus();
      document.execCommand('insertText', false, text);
    }, message);
    await sleep(1000);

    // Click botón Publicar
    const posted = await page.evaluate(() => {
      const btns = document.querySelectorAll('div[role="button"], button, span[role="button"], [aria-label]');
      for (const btn of btns) {
        const t = btn.textContent.trim();
        const al = btn.getAttribute('aria-label') || '';
        if (/^Post$/i.test(t) || /^Publicar$/i.test(t) || /^Compartir$/i.test(t) ||
            /^Post$/i.test(al) || /^Publicar$/i.test(al)) {
          btn.click();
          return 'clicked:' + t.substring(0, 50);
        }
      }
      return '';
    });
    console.log('[FB Relay] Post button click:', posted);

    if (!posted) throw new Error('Post button not found');

    // Esperar cierre del diálogo
    await sleep(5000);
    const bodyText = await page.evaluate(() => document.body.textContent || '').catch(() => '');
    if (/pending|pendiente|aprobación/i.test(bodyText)) {
      console.log('[FB Relay] Post pendiente de aprobación en el grupo');
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
  await postToGroup(b, task.fb_group_id, task.message);
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
      await postToGroup(b, testGroup, testMsg);
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
