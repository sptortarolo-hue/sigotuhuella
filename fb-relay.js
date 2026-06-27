import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE_URL || 'https://sigotuhuella.online/api/relay';
const TOKEN = process.env.RELAY_TOKEN || process.env.FB_RELAY_TOKEN;
const POLL_INTERVAL = parseInt(process.env.FB_POLL_INTERVAL || '60000');

const PROFILE_DIR = process.env.FB_PROFILE_DIR || path.join(__dirname, 'fb_profile');
const COOKIES_PATH = path.join(PROFILE_DIR, 'cookies.json');
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/data/data/com.termux/files/usr/bin/chromium-browser';
const TMP_DIR = path.join(__dirname, '.fb_img_tmp');

const USER_AGENTS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
];

const api = axios.create({
  baseURL: API_BASE,
  headers: { Authorization: `Bearer ${TOKEN}` },
  timeout: 60000,
});

let browser = null;
let keepAliveActive = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickUA() {
  return randomItem(USER_AGENTS);
}

async function humanType(page, editor, text) {
  await editor.click();
  await sleep(300 + Math.random() * 500);
  for (const char of text) {
    await page.keyboard.type(char, { delay: randomInt(70, 130) });
  }
}

// Bezier curve mouse movement
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

// Simulate human scrolling + waiting before posting
async function prePostBehavior(page) {
  const scrollY = randomInt(100, 400);
  await page.evaluate((y) => window.scrollBy(0, y), scrollY);
  await sleep(randomInt(3000, 8000));
  const vp = page.viewport();
  await bezierMove(page, randomInt(100, vp.width - 100), randomInt(100, vp.height - 100), vp.width / 2, vp.height / 3);
  await sleep(randomInt(1000, 3000));
  const loginFields = await page.$('input[name="email"], input[name="pass"]');
  if (loginFields) throw new Error('session expired');
}

function ensureProfileDir() {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
}

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
  ensureProfileDir();

  const isHeadless = !process.argv.includes('--headed');

  browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: isHeadless ? 'new' : false,
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

async function downloadProfileBackup() {
  try {
    const { data } = await api.get('/fb/download-profile');
    if (data?.data) {
      const buf = Buffer.from(data.data, 'base64');
      const tarPath = path.join(__dirname, '.fb_profile_download.tar.gz');
      fs.writeFileSync(tarPath, buf);
      if (fs.existsSync(PROFILE_DIR)) {
        fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
      }
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
      const result = spawnSync('tar', ['xzf', tarPath, '-C', PROFILE_DIR], { stdio: 'pipe' });
      fs.unlinkSync(tarPath);
      if (result.status !== 0) {
        console.error('[FB Relay] Error extrayendo perfil:', result.stderr.toString());
        return false;
      }
      console.log('[FB Relay] Perfil completo restaurado desde backup');
      return true;
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error('[FB Relay] Error descargando perfil:', err.message);
    }
  }
  return false;
}

async function uploadProfileBackup() {
  try {
    const tarPath = path.join(__dirname, '.fb_profile_upload.tar.gz');
    const cwd = path.dirname(PROFILE_DIR);
    const dirName = path.basename(PROFILE_DIR);
    const result = spawnSync('tar', ['czf', tarPath, '-C', cwd, dirName], { stdio: 'pipe' });
    if (result.status !== 0) {
      console.error('[FB Relay] Error comprimiendo perfil:', result.stderr.toString());
      return;
    }
    const buf = fs.readFileSync(tarPath);
    const base64 = buf.toString('base64');
    await api.post('/fb/upload-profile', { data: base64 });
    fs.unlinkSync(tarPath);
    console.log(`[FB Relay] Perfil respaldado en servidor (${buf.length} bytes)`);
  } catch (err) {
    console.error('[FB Relay] Error subiendo perfil:', err.message);
  }
}

async function downloadSessionData() {
  try {
    const { data } = await api.get('/fb/session-data');
    if (data?.data) {
      return data.data;
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error('[FB Relay] Error descargando session data:', err.message);
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
    console.log('[FB Relay] Session data respaldada en servidor');
  } catch (err) {
    console.error('[FB Relay] Error subiendo session data:', err.message);
  }
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
    console.log('[FB Relay] Session data restaurada en navegador');
  } catch (err) {
    console.error('[FB Relay] Error restaurando session data:', err.message);
  }
}

async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  } catch (err) {
    console.error('[FB Relay] Error guardando cookies:', err.message);
  }
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

function clearProfile() {
  try {
    if (fs.existsSync(PROFILE_DIR)) {
      fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    }
    console.log('[FB Relay] Perfil eliminado');
  } catch (e) {
    console.error('[FB Relay] Error limpiando perfil:', e.message);
  }
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
        console.log(`[FB Relay] ${cookies.length} cookies descargadas del servidor`);
        return cookies;
      }
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error('[FB Relay] Error descargando cookies del servidor:', err.message);
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

  // Fallback 1: restaurar localStorage/sessionStorage desde backup
  const sessionData = await downloadSessionData();
  if (sessionData) {
    await restoreSessionData(page, sessionData);
    await page.goto('https://facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
    if (await checkSession(page)) {
      await saveCookies(page);
      return true;
    }
  }

  // Fallback 2: descargar cookies del servidor (subidas por admin)
  const cookies = await downloadCookiesFromServer();
  if (cookies.length > 0) {
    if (await setCookiesAndCheck(page, cookies)) return true;
  }

  return false;
}

async function postToGroup(b, fbGroupId, message, imageUrls, marker) {
  const page = await b.newPage();

  try {
    await page.setUserAgent(pickUA());
    await page.setViewport({ width: 1366, height: 768 });

    // Verificar sesión (usa profile persistente → cookies + localStorage ya están)
    if (!(await ensureFacebookSession(page))) {
      throw new Error('session expired');
    }

    // Ir al grupo
    console.log(`[FB Relay] Grupo ${fbGroupId}...`);
    await page.goto(`https://facebook.com/groups/${fbGroupId}`, {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    await sleep(3000);

    if (!(await checkSession(page))) {
      throw new Error('session expired');
    }

    // Comportamiento humano previo al post
    await prePostBehavior(page);

    let triggerClicked = false;
    for (let attempt = 0; attempt < 8 && !triggerClicked; attempt++) {
      triggerClicked = await page.evaluate(() => {
        const xpath = '//span[contains(text(), "Write something") or contains(text(), "Escribe algo") or contains(text(), "Qué estás pensando")]';
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const el = result.singleNodeValue;
        if (el && el.offsetParent !== null) { el.click(); return true; }
        return false;
      });
      if (!triggerClicked) await sleep(1000);
    }
    if (!triggerClicked) {
      try {
        const ssBase64 = await page.screenshot({ encoding: 'base64', fullPage: false });
        const html = await page.evaluate(() => document.body.innerHTML.substring(0, 20000));
        const ariaLabels = await page.evaluate(() =>
          [...document.querySelectorAll('[aria-label]')].map(el => el.tagName + ' ' + el.getAttribute('aria-label')).slice(0, 50)
        );
        const lexicalInfo = await page.evaluate(() => ({
          hasLexical: !!document.querySelector('[data-lexical-editor]'),
          count: document.querySelectorAll('[data-lexical-editor]').length,
        }));
        await api.post('/fb-debug', {
          screenshot: ssBase64, ariaLabels, lexicalInfo,
          url: page.url(), html,
        });
        console.log('[FB Relay] Debug dump enviado al servidor');
      } catch (e) {
        console.error('[FB Relay] Error capturando debug:', e.message);
      }
      throw new Error('Write something not found');
    }
    console.log('[FB Relay] Write something clicked');

    const editor = await page.waitForSelector('div[role="dialog"] div[role="textbox"][contenteditable="true"]', { visible: true, timeout: 15000 });
    await sleep(1500);

    if (imageUrls && imageUrls.length > 0) {
      const files = await downloadImages(imageUrls);
      if (files.length > 0) {
        try {
          const fileInput = await page.$('div[role="dialog"] input[type="file"]');
          if (fileInput) {
            await fileInput.uploadFile(files[0]);
            console.log('[FB Relay] Imagen subida, esperando procesamiento...');
            try {
              await page.waitForSelector('div[role="dialog"] img[src*="blob:"], div[role="dialog"] img[src*="data:"]', { timeout: 15000 });
            } catch {}
            await sleep(3000);
          }
        } catch (err) {
          console.error('[FB Relay] Error subiendo imagen:', err.message);
        }
      }
      cleanupImages();
    }

    // Escribir mensaje con tipeo humano
    await humanType(page, editor, message);
    await sleep(2000);

    const postBtn = await page.waitForSelector('div[role="dialog"] [aria-label="Publicar"], div[role="dialog"] [aria-label="Post"]', { visible: true, timeout: 10000 });
    if (!postBtn) throw new Error('Post button not found');
    await postBtn.click();
    console.log('[FB Relay] Post button clicked');

    try {
      await page.waitForSelector('div[role="dialog"]', { hidden: true, timeout: 15000 });
    } catch {
      console.log('[FB Relay] Fallback Enter...');
      await page.keyboard.press('Enter');
      await sleep(3000);
    }

    console.log(`[FB Relay] Publicado en grupo ${fbGroupId}`);
    await sleep(3000);
    const currentUrl = page.url();
    console.log(`[FB Relay] URL actual: ${currentUrl}`);

    // Guardar cookies + session data después de post exitoso
    await saveCookies(page);
    await uploadSessionData(page);

    return { success: true, fb_post_url: currentUrl };
  } finally {
    await page.close();
  }
}

async function commentOnPost(b, targetUrl, text) {
  const page = await b.newPage();

  try {
    await page.setUserAgent(pickUA());
    await page.setViewport({ width: 1366, height: 768 });

    if (!(await ensureFacebookSession(page))) {
      throw new Error('session expired');
    }

    console.log(`[FB Relay] Navegando a post: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(3000);

    if (!(await checkSession(page))) {
      throw new Error('session expired');
    }

    // Comportamiento humano previo
    await prePostBehavior(page);

    const commentBtn = await page.waitForSelector('[aria-label="Comentar"]', { visible: true, timeout: 15000 }).catch(() => null);
    if (!commentBtn) {
      console.log('[FB Relay] Botón Comentar no encontrado, intentando scroll...');
      await page.evaluate(() => window.scrollBy(0, 500));
      await sleep(2000);
    }
    if (commentBtn) await commentBtn.click();
    await sleep(1000);

    const editor = await page.waitForSelector('div[role="textbox"][contenteditable="true"]', { visible: true, timeout: 15000 });
    await humanType(page, editor, text);
    await sleep(1500);

    console.log('[FB Relay] Presionando Enter para comentar...');
    await page.keyboard.press('Enter');
    await sleep(3000);

    console.log('[FB Relay] Comentario publicado');
    await saveCookies(page);
    return true;
  } finally {
    await page.close();
  }
}

async function executeTask(task) {
  const b = await getBrowser();

  if (task.action === 'comment' && task.target_url) {
    await commentOnPost(b, task.target_url, task.message);
    await api.post('/fb/completed', { task_updates: [{ task_id: task.id }] });
    console.log(`[FB Relay] Comentario tarea ${task.id} completada`);
  } else {
    const result = await postToGroup(b, task.fb_group_id, task.message, task.image_urls || [], task.marker || '');
    const fbPostUrl = result?.fb_post_url || '';
    await api.post('/fb/completed', { task_updates: [{ task_id: task.id, fb_post_url: fbPostUrl }] });
    console.log(`[FB Relay] Tarea ${task.id} completada (post)`);
  }

  // Delay humano entre tareas: 90-180s aleatorio
  const delay = 90000 + Math.floor(Math.random() * 90000);
  console.log(`[FB Relay] Esperando ${Math.round(delay / 1000)}s antes de siguiente tarea...`);
  await sleep(delay);
}

async function startKeepAlive(b) {
  if (keepAliveActive) return;
  keepAliveActive = true;
  console.log('[FB Relay] Keep-alive iniciado (cada 5 min)');

  (async () => {
    while (keepAliveActive) {
      await sleep(5 * 60 * 1000);
      if (!keepAliveActive) break;
      try {
        if (!browser) {
          try { await browser.version(); } catch { continue; }
        }
        const page = await b.newPage();
        await page.setUserAgent(pickUA());
        await page.setViewport({ width: 1366, height: 768 });
        await page.goto('https://facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2000);
        await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 500 + 100)));
        await sleep(2000);
        await page.close();
        console.log('[FB Relay] Keep-alive ping');
      } catch (err) {
        console.log('[FB Relay] Keep-alive error (non-fatal):', err.message);
      }
    }
  })();
}

async function main() {
  console.log('[FB Relay] Iniciando Facebook relay (Puppeteer + Chromium)');
  console.log(`[FB Relay] Chromium: ${CHROMIUM_PATH}`);
  console.log(`[FB Relay] Perfil persistente: ${PROFILE_DIR}`);
  if (!TOKEN) {
    console.error('[FB Relay] FATAL: RELAY_TOKEN no configurado');
    process.exit(1);
  }

  ensureProfileDir();

  // Si el profile está vacío, intentar restaurar desde backup
  const hasLocalCookies = loadCookies();
  if (!hasLocalCookies) {
    console.log('[FB Relay] Sin perfil local. Intentando descargar backup...');
    const restored = await downloadProfileBackup();
    if (restored) {
      console.log('[FB Relay] Backup de perfil restaurado exitosamente');
    } else {
      console.log('[FB Relay] Sin backup de perfil. Usando solo cookies.');
    }
  }

  const b = await getBrowser();
  startKeepAlive(b);

  while (true) {
    try {
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
            console.log('[FB Relay] Sesión expirada. Intentando restaurar...');

            // Estrategia de recuperación escalonada:
            // 1. Limpiar perfil
            // 2. Intentar restaurar desde backup de perfil
            // 3. Si no hay backup, esperar admin
            const b2 = await getBrowser();

            // Primer intento: session data backup
            const sessionData = await downloadSessionData();
            if (sessionData) {
              const testPage = await b2.newPage();
              try {
                await testPage.goto('https://facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
                await sleep(2000);
                await restoreSessionData(testPage, sessionData);
                await testPage.goto('https://facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });
                await sleep(3000);
                if (await checkSession(testPage)) {
                  await saveCookies(testPage);
                  console.log('[FB Relay] Sesión restaurada desde session data backup');
                  await testPage.close();
                  continue;
                }
                await testPage.close();
              } catch { await testPage.close().catch(() => {}); }
            }

            // Segundo intento: perfil completo
            console.log('[FB Relay] Session data no funcionó. Intentando perfil completo...');
            clearProfile();
            ensureProfileDir();
            const profileRestored = await downloadProfileBackup();
            if (profileRestored) {
              // Re-lanzar browser con nuevo perfil
              try { await browser.close(); } catch {}
              browser = null;
              const b3 = await getBrowser();
              startKeepAlive(b3);
              console.log('[FB Relay] Perfil restaurado, reintentando...');
              continue;
            }

            // Tercer intento: cookies del servidor (subidas por admin)
            console.log('[FB Relay] Perfil no disponible. Intentando cookies del servidor...');
            const cookies = await downloadCookiesFromServer();
            if (cookies.length > 0) {
              const b4 = await getBrowser();
              const testPage = await b4.newPage();
              try {
                await testPage.setUserAgent(pickUA());
                await testPage.setViewport({ width: 1366, height: 768 });
                if (await setCookiesAndCheck(testPage, cookies)) {
                  console.log('[FB Relay] Sesión restaurada desde cookies del servidor');
                  await testPage.close();
                  continue;
                }
                await testPage.close();
              } catch { await testPage.close().catch(() => {}); }
            }

            // Fallback final: esperar admin
            console.log('[FB Relay] No se pudo restaurar sesión. Esperando intervención del admin.');
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
    ensureProfileDir();
    const b = await getBrowser();
    try {
      await postToGroup(b, testGroup, testMsg, [], '');
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
