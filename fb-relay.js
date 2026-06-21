import { chromium } from 'playwright';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE_URL || 'https://sigotuhuella.online/api/relay';
const TOKEN = process.env.RELAY_TOKEN || process.env.FB_RELAY_TOKEN;
const POLL_INTERVAL = parseInt(process.env.FB_POLL_INTERVAL || '60000');
const STORAGE_PATH = process.env.FB_STORAGE_PATH || path.join(__dirname, 'fb_storage_state.json');

const api = axios.create({
  baseURL: API_BASE,
  headers: { Authorization: `Bearer ${TOKEN}` },
  timeout: 30000,
});

async function downloadSession() {
  try {
    const { data } = await api.get('/fb/session-file');
    if (data?.data) {
      fs.writeFileSync(STORAGE_PATH, Buffer.from(data.data, 'base64'));
      console.log('[FB Relay] Session file downloaded');
      return true;
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error('[FB Relay] Error downloading session:', err.message);
    }
  }
  return false;
}

async function clearLocalSession() {
  try {
    if (fs.existsSync(STORAGE_PATH)) fs.unlinkSync(STORAGE_PATH);
    console.log('[FB Relay] Local session cleared');
  } catch (e) {
    console.error('[FB Relay] Error clearing local session:', e.message);
  }
}

async function ensureSession(context) {
  if (!fs.existsSync(STORAGE_PATH)) {
    console.log('[FB Relay] No session file, downloading...');
    const ok = await downloadSession();
    if (!ok) {
      console.log('[FB Relay] No session on server either. Waiting for admin upload.');
      return false;
    }
  }
  try {
    const storageState = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf-8'));
    await context.addCookies(storageState.cookies || []);
    return true;
  } catch (e) {
    console.error('[FB Relay] Error loading session:', e.message);
    return false;
  }
}

async function saveSession(context) {
  try {
    const storageState = await context.storageState();
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(storageState));
  } catch (e) {
    console.error('[FB Relay] Error saving session:', e.message);
  }
}

async function isLoggedIn(page) {
  await page.goto('https://mbasic.facebook.com/', { waitUntil: 'networkidle', timeout: 30000 });
  const url = page.url();
  return !url.includes('login') && !url.includes('checkpoint');
}

async function postToGroup(page, fbGroupId, message, imageUrls) {
  const groupUrl = `https://mbasic.facebook.com/groups/${fbGroupId}`;
  console.log(`[FB Relay] Posting to group ${fbGroupId}...`);
  await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const isLoginPage = page.url().includes('login');
  if (isLoginPage) {
    throw new Error('session expired');
  }
  if (imageUrls && imageUrls.length > 0) {
    const photoTab = await page.$('a[href*="/photos/"]');
    if (photoTab) {
      await photoTab.click();
      await page.waitForTimeout(2000);
    }
    const photoInput = await page.$('input[type="file"]');
    if (photoInput) {
      for (const url of imageUrls.slice(0, 5)) {
        try {
          const response = await fetch(url);
          const buffer = Buffer.from(await response.arrayBuffer());
          const tmpFile = path.join(__dirname, `fb_upload_${Date.now()}.jpg`);
          fs.writeFileSync(tmpFile, buffer);
          await photoInput.setInputFiles(tmpFile);
          fs.unlinkSync(tmpFile);
          await page.waitForTimeout(1000);
        } catch (e) {
          console.error(`[FB Relay] Error downloading image ${url}:`, e.message);
        }
      }
      const doneBtn = await page.$('input[value="Listo"]');
      if (doneBtn) await doneBtn.click();
      await page.waitForTimeout(2000);
    }
  }
  const textarea = await page.$('textarea, [contenteditable="true"]');
  if (textarea) {
    await textarea.fill(message.substring(0, 5000));
    await page.waitForTimeout(500);
  }
  const submitBtn = await page.$('input[type="submit"], button[type="submit"]');
  if (submitBtn) {
    await submitBtn.click();
    await page.waitForTimeout(3000);
    console.log(`[FB Relay] Successfully posted to group ${fbGroupId}`);
    return true;
  }
  throw new Error('Could not find submit button');
}

async function executeTask(context, task) {
  const page = await context.newPage();
  try {
    await postToGroup(page, task.fb_group_id, task.message, task.image_urls);
    await api.post('/fb/completed', { task_ids: [task.id] });
    console.log(`[FB Relay] Task ${task.id} completed`);
  } catch (err) {
    const errorMsg = err.message;
    console.error(`[FB Relay] Task ${task.id} failed:`, errorMsg);
    if (errorMsg === 'session expired' || errorMsg.includes('login')) {
      await api.post('/fb/failed', { task_id: task.id, error: errorMsg });
      await clearLocalSession();
      await api.post('/fb/clear-session');
      console.log('[FB Relay] Session expired, cleared. Waiting for admin upload.');
    } else {
      await api.post('/fb/failed', { task_id: task.id, error: errorMsg });
    }
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('[FB Relay] Starting Facebook relay...');
  if (!TOKEN) {
    console.error('[FB Relay] FATAL: RELAY_TOKEN not set');
    process.exit(1);
  }
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  let context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36',
  });
  let sessionChecked = false;
  while (true) {
    try {
      if (!sessionChecked) {
        const hasSession = await ensureSession(context);
        if (hasSession) {
          const loggedIn = await isLoggedIn(await context.newPage());
          if (!loggedIn) {
            console.log('[FB Relay] Session invalid, downloading fresh...');
            await clearLocalSession();
            const ok = await downloadSession();
            if (!ok) {
              console.log('[FB Relay] No valid session. Waiting for admin upload.');
              await new Promise(r => setTimeout(r, POLL_INTERVAL));
              continue;
            }
            context = await browser.newContext();
            if (!(await ensureSession(context))) {
              await new Promise(r => setTimeout(r, POLL_INTERVAL));
              continue;
            }
          }
        }
        sessionChecked = true;
      }
      const { data } = await api.get('/fb/pending?limit=5');
      const tasks = data?.tasks || [];
      if (tasks.length === 0) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        continue;
      }
      console.log(`[FB Relay] Processing ${tasks.length} tasks...`);
      for (const task of tasks) {
        await executeTask(context, task);
      }
      await saveSession(context);
    } catch (err) {
      console.error('[FB Relay] Loop error:', err.message);
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
  }
}

main().catch(err => {
  console.error('[FB Relay] Fatal error:', err);
  process.exit(1);
});
