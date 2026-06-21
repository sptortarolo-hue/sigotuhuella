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

let jar = [];

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
      if (Array.isArray(cookies)) jar = cookies;
      else jar = [];
      fs.writeFileSync(COOKIES_PATH, JSON.stringify(jar));
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
  jar = [];
  try {
    if (fs.existsSync(COOKIES_PATH)) fs.unlinkSync(COOKIES_PATH);
    console.log('[FB Relay] Local cookies cleared');
  } catch (e) {
    console.error('[FB Relay] Error clearing cookies:', e.message);
  }
}

function loadCookiesSync() {
  if (jar.length > 0) return true;
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      jar = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      return Array.isArray(jar) && jar.length > 0;
    }
  } catch (e) {
    console.error('[FB Relay] Error loading cookies:', e.message);
  }
  return false;
}

function cookieHeader() {
  return jar.map(c => `${c.name}=${c.value}`).join('; ');
}

async function postToGroup(fbGroupId, message) {
  const groupUrl = `https://mbasic.facebook.com/groups/${fbGroupId}`;
  const headers = {
    Cookie: cookieHeader(),
    'User-Agent': 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36',
  };

  // Page one: grab form tokens
  const pageRes = await axios.get(groupUrl, { headers, timeout: 30000 });
  const html = pageRes.data;

  if (html.includes('login_form') || html.includes('Logueate')) {
    throw new Error('session expired');
  }

  // Log HTML snippet for debugging
  const htmlSnippet = html.substring(0, 2000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`[FB Relay] Page HTML snippet (first 2000 bytes stripped): ${htmlSnippet.substring(0, 500)}...`);

  // Strategy 1: look for mbasic_inline_feed_composer
  let formStartIdx = html.search(/<form[^>]*id="mbasic_inline_feed_composer"[^>]*>/i);

  // Strategy 2: look for any form with xc_message textarea
  if (formStartIdx === -1) {
    formStartIdx = html.search(/<form[^>]*>[\s\S]*?<textarea[^>]*name="xc_message"/i);
    if (formStartIdx !== -1) console.log('[FB Relay] Found form via xc_message textarea');
  }

  if (formStartIdx === -1) throw new Error('Could not find post form on page');

  const formTag = html.substring(formStartIdx);
  const actionMatch = formTag.match(/action="([^"]+)"/);
  if (!actionMatch) throw new Error('Could not find form action');
  let actionUrl = actionMatch[1].replace(/&amp;/g, '&');
  if (!actionUrl.startsWith('http')) actionUrl = `https://mbasic.facebook.com${actionUrl}`;

  // Extract form content between <form> and </form>
  const formOpenTagEnd = formTag.indexOf('>') + 1;
  const formContent = formTag.substring(formOpenTagEnd);
  const formEndIdx = formContent.indexOf('</form>');
  const formBody = formContent.substring(0, formEndIdx);

  // Extract ALL input fields from the form (name + value)
  const formData = new URLSearchParams();
  const inputRegex = /<input[^>]*name="([^"]*)"[^>]*\/?>/gi;
  let inputMatch;
  while ((inputMatch = inputRegex.exec(formBody)) !== null) {
    const name = inputMatch[1];
    const valueMatch = inputMatch[0].match(/value="([^"]*)"/);
    const value = valueMatch ? valueMatch[1] : '';
    formData.append(name, value);
  }

  // Override xc_message with our message
  formData.set('xc_message', message.substring(0, 5000));

  // Ensure view_post param exists (submit button name)
  if (!formData.has('view_post')) formData.append('view_post', 'Post');

  console.log(`[FB Relay] Sending to ${actionUrl} with ${Array.from(formData.keys()).join(', ')}`);

  const postRes = await axios.post(actionUrl, formData.toString(), {
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: groupUrl,
    },
    maxRedirects: 5,
    timeout: 30000,
  });

  const body = typeof postRes.data === 'string' ? postRes.data : '';
  const finalUrl = postRes.request?.res?.responseUrl || postRes.request?.responseURL || '';

  // Log response snippet for debugging
  const bodySnippet = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300);
  console.log(`[FB Relay] Post response (${body.length} bytes): ${bodySnippet.substring(0, 200)}...`);
  console.log(`[FB Relay] Final URL: ${finalUrl}`);

  // Check for explicit Facebook errors
  const hasError = body.includes('class="_50f7"') || body.includes('class="error"') || body.includes('try again later');

  if (hasError) {
    const snippet = body.substring(0, 500).replace(/<[^>]+>/g, ' ').trim().substring(0, 200);
    console.error(`[FB Relay] Error response snippet:`, snippet);
    throw new Error('Facebook returned an error');
  }

  if (finalUrl && !finalUrl.includes('/groups/')) {
    console.warn(`[FB Relay] Redirected to unexpected page: ${finalUrl}`);
  }

  console.log(`[FB Relay] Posted to group ${fbGroupId} (${body.length} bytes)`);
  return true;
}

async function executeTask(task) {
  try {
    if (!loadCookiesSync()) throw new Error('No cookies available');
    await postToGroup(task.fb_group_id, task.message);
    await api.post('/fb/completed', { task_ids: [task.id] });
    console.log(`[FB Relay] Task ${task.id} completed`);
  } catch (err) {
    console.error(`[FB Relay] Task ${task.id} failed:`, err.message);
    if (err.message === 'session expired') {
      await api.post('/fb/failed', { task_id: task.id, error: err.message });
      await clearLocalCookies();
      await api.post('/fb/clear-session');
      console.log('[FB Relay] Session expired. Waiting for admin upload.');
    } else {
      await api.post('/fb/failed', { task_id: task.id, error: err.message });
    }
  }
}

async function main() {
  console.log('[FB Relay] Starting Facebook relay (HTTP)...');
  if (!TOKEN) {
    console.error('[FB Relay] FATAL: RELAY_TOKEN not set');
    process.exit(1);
  }

  let sessionChecked = false;
  while (true) {
    try {
      if (!sessionChecked) {
        if (!loadCookiesSync()) {
          console.log('[FB Relay] No cookies, downloading...');
          const ok = await downloadCookies();
          if (!ok) {
            console.log('[FB Relay] No cookies on server. Waiting for admin upload.');
            await new Promise(r => setTimeout(r, POLL_INTERVAL));
            continue;
          }
        }
        // Quick session check
        try {
          const checkRes = await axios.get('https://mbasic.facebook.com/', {
            headers: { Cookie: cookieHeader(), 'User-Agent': 'Mozilla/5.0 (Linux; Android 16; Pixel 9) Chrome/130.0.6723.58 Mobile Safari/537.36' },
            timeout: 15000,
          });
          if (checkRes.data.includes('login_form') || checkRes.data.includes('Logueate')) {
            throw new Error('session expired');
          }
        } catch (e) {
          if (e.message === 'session expired') {
            console.log('[FB Relay] Cookies invalid, downloading fresh...');
            await clearLocalCookies();
            const ok = await downloadCookies();
            if (!ok) {
              await new Promise(r => setTimeout(r, POLL_INTERVAL));
              continue;
            }
          } else {
            console.log('[FB Relay] Session check warning:', e.message);
          }
        }
        sessionChecked = true;
        console.log('[FB Relay] Session valid. Polling for tasks...');
      }

      const { data } = await api.get('/fb/pending?limit=5');
      const tasks = data?.tasks || [];
      if (tasks.length === 0) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        continue;
      }
      console.log(`[FB Relay] Processing ${tasks.length} tasks...`);
      for (const task of tasks) {
        await executeTask(task);
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
