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

const api = axios.create({
  baseURL: API_BASE,
  headers: { Authorization: `Bearer ${TOKEN}` },
  timeout: 30000,
});

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
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies));
      console.log('[FB Relay] Cookies downloaded');
      return true;
    }
  } catch (err) {
    if (err.response?.status !== 404) {
      console.error('[FB Relay] Error downloading cookies:', err.message);
    }
  }
  return false;
}

async function clearLocalCookies() {
  try {
    if (fs.existsSync(COOKIES_PATH)) fs.unlinkSync(COOKIES_PATH);
    console.log('[FB Relay] Local cookies cleared');
  } catch (e) {
    console.error('[FB Relay] Error clearing cookies:', e.message);
  }
}

async function loadCookies(page) {
  if (!fs.existsSync(COOKIES_PATH)) {
    console.log('[FB Relay] No cookies file, downloading...');
    const ok = await downloadCookies();
    if (!ok) return false;
  }
  try {
    const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
    if (Array.isArray(cookies)) {
      await page.setCookie(...cookies);
    }
    return true;
  } catch (e) {
    console.error('[FB Relay] Error loading cookies:', e.message);
    return false;
  }
}

async function saveCookies(page) {
  try {
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies));
  } catch (e) {
    console.error('[FB Relay] Error saving cookies:', e.message);
  }
}

async function isLoggedIn(page) {
  await page.goto('https://mbasic.facebook.com/', { waitUntil: 'networkidle0', timeout: 30000 });
  return !page.url().includes('login') && !page.url().includes('checkpoint');
}

async function postToGroup(page, fbGroupId, message, imageUrls) {
  const groupUrl = `https://mbasic.facebook.com/groups/${fbGroupId}`;
  console.log(`[FB Relay] Posting to group ${fbGroupId}...`);
  await page.goto(groupUrl, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForTimeout(2000);
  if (page.url().includes('login')) throw new Error('session expired');

  if (imageUrls && imageUrls.length > 0) {
    const photoLink = await page.$('a[href*="/photos/"]');
    if (photoLink) {
      await photoLink.click();
      await page.waitForTimeout(2000);
    }
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      for (const url of imageUrls.slice(0, 5)) {
        try {
          const response = await fetch(url);
          const buffer = Buffer.from(await response.arrayBuffer());
          const tmpFile = path.join(__dirname, `fb_upload_${Date.now()}.jpg`);
          fs.writeFileSync(tmpFile, buffer);
          await fileInput.uploadFile(tmpFile);
          fs.unlinkSync(tmpFile);
          await page.waitForTimeout(1000);
        } catch (e) {
          console.error(`[FB Relay] Error downloading image ${url}:`, e.message);
        }
      }
      const doneBtn = await page.$('input[value="Listo"], input[value="Done"]');
      if (doneBtn) await doneBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  const textarea = await page.$('textarea, [contenteditable="true"]');
  if (textarea) {
    await textarea.type(message.substring(0, 5000), { delay: 10 });
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

async function executeTask(browser, task) {
  const page = await browser.newPage();
  try {
    const hasCookies = await loadCookies(page);
    if (!hasCookies) throw new Error('No cookies available');
    await postToGroup(page, task.fb_group_id, task.message, task.image_urls);
    await saveCookies(page);
    await api.post('/fb/completed', { task_ids: [task.id] });
    console.log(`[FB Relay] Task ${task.id} completed`);
  } catch (err) {
    console.error(`[FB Relay] Task ${task.id} failed:`, err.message);
    if (err.message === 'session expired' || err.message.includes('login')) {
      await api.post('/fb/failed', { task_id: task.id, error: err.message });
      await clearLocalCookies();
      await api.post('/fb/clear-session');
      console.log('[FB Relay] Session expired, cleared. Waiting for admin upload.');
    } else {
      await api.post('/fb/failed', { task_id: task.id, error: err.message });
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
  const executablePath = process.env.CHROMIUM_PATH || '/data/data/com.termux/files/usr/bin/chromium-browser';
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  let sessionChecked = false;
  while (true) {
    try {
      if (!sessionChecked) {
        const page = await browser.newPage();
        const hasCookies = await loadCookies(page);
        if (hasCookies) {
          const loggedIn = await isLoggedIn(page);
          if (!loggedIn) {
            console.log('[FB Relay] Session invalid, downloading fresh...');
            await clearLocalCookies();
            const ok = await downloadCookies();
            if (!ok) {
              console.log('[FB Relay] No valid cookies. Waiting for admin upload.');
              await page.close();
              await new Promise(r => setTimeout(r, POLL_INTERVAL));
              continue;
            }
          }
        }
        await page.close();
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
        await executeTask(browser, task);
      }
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
