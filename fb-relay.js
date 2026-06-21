import { chromium } from 'playwright-core';
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
  browser = await chromium.launch({
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

async function postToGroup(b, fbGroupId, message) {
  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  const context = await b.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });
  await context.addCookies(cookies);

  const page = await context.newPage();

  try {
    console.log(`[FB Relay] Navegando al grupo ${fbGroupId}...`);
    await page.goto(`https://www.facebook.com/groups/${fbGroupId}`, {
      waitUntil: 'networkidle',
      timeout: 45000,
    });

    if (page.url().includes('login') || page.url().includes('checkpoint')) {
      throw new Error('session expired');
    }

    await page.waitForTimeout(2000);

    // Tomar screenshot inicial para debug
    await page.screenshot({ path: path.join(__dirname, `fb_debug_${fbGroupId}.png`) });

    // Click en "Write something..." / "Escribe algo..." / "Comparte..."
    const composerTrigger = page.locator('span, div[role="button"]').filter({
      hasText: /Write something|Escribe algo|Qué estás pensando|Comparte|Publicar en/i,
    }).first();
    await composerTrigger.waitFor({ timeout: 15000 });
    await composerTrigger.click();

    // Esperar que aparezca el editor de texto
    await page.waitForTimeout(2000);
    const editor = page.locator('div[role="textbox"][contenteditable="true"]').first();
    await editor.waitFor({ timeout: 10000 });
    await editor.click();
    await page.waitForTimeout(500);

    // Escribir el contenido del post
    await editor.fill(message);
    await page.waitForTimeout(1000);

    // Click en botón Post/Publicar
    const postBtn = page.getByRole('button', { name: /Post|Publicar/ }).last();
    await postBtn.waitFor({ timeout: 8000 });
    await postBtn.click();

    // Esperar que se cierre el diálogo del composer
    await page.waitForFunction(
      () => !document.querySelector('div[role="dialog"] div[role="textbox"]'),
      { timeout: 30000 }
    ).catch(() => {});
    await page.waitForTimeout(3000);

    // Verificar si hay pendiente de aprobación
    const bodyText = await page.textContent('body').catch(() => '');
    if (/pending|pendiente|aprobación/i.test(bodyText)) {
      console.log('[FB Relay] Post pendiente de aprobación en el grupo');
    }

    console.log(`[FB Relay] Publicado en grupo ${fbGroupId}`);
    return true;
  } finally {
    await page.close();
    await context.close();
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
  console.log('[FB Relay] Iniciando Facebook relay (Playwright + Chromium)...');
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

// Modo test: node fb-relay.js --test <groupId> "mensaje"
if (process.argv.includes('--test')) {
  const idx = process.argv.indexOf('--test');
  const testGroup = process.argv[idx + 1];
  const testMsg = process.argv[idx + 2] || 'Test automático - ' + new Date().toISOString();
  if (!testGroup) {
    console.error('Uso: node fb-relay.js --test <groupId> "mensaje opcional"');
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
