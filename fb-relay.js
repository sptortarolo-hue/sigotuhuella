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
  const baseHeaders = {
    Cookie: cookieHeader(),
    'User-Agent': 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36',
  };

  // Step 1: Visit the group page to see what's there
  const groupUrl = `https://mbasic.facebook.com/groups/${fbGroupId}`;
  console.log(`[FB Relay] Visiting ${groupUrl}`);
  const groupRes = await axios.get(groupUrl, { headers: baseHeaders, timeout: 30000 });
  const html = groupRes.data;

  if (html.includes('login_form') || html.includes('Logueate')) throw new Error('session expired');

  // Log stripped HTML snippet for diagnosis
  const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`[FB Relay] Group page HTML (${html.length} bytes): ${stripped.substring(0, 800)}`);

  // Strategy 1: Find form with xc_message
  let formStart = html.search(/<form[^>]*>[\s\S]*?<textarea[^>]*name="xc_message"/i);
  if (formStart !== -1) console.log('[FB Relay] Found form via xc_message textarea');

  // Strategy 2: Find mbasic_inline_feed_composer
  if (formStart === -1) {
    formStart = html.search(/id="mbasic_inline_feed_composer"/i);
    if (formStart !== -1) {
      // Go back to find the form tag
      const before = html.substring(0, formStart);
      const formTagStart = before.lastIndexOf('<form');
      if (formTagStart !== -1) formStart = formTagStart;
      console.log('[FB Relay] Found form via mbasic_inline_feed_composer id');
    }
  }

  // Strategy 3: Look for a link to the composer page
  let composerAction = null;
  let composerFormHtml = null;

  if (formStart === -1) {
    const composerLink = html.match(/<a[^>]*href="([^"]*composer[^"]*)"[^>]*>/i);
    if (composerLink) {
      let linkUrl = composerLink[1].replace(/&amp;/g, '&');
      if (!linkUrl.startsWith('http')) linkUrl = `https://mbasic.facebook.com${linkUrl}`;
      console.log(`[FB Relay] Found composer link: ${linkUrl}`);
      const composerRes = await axios.get(linkUrl, { headers: baseHeaders, timeout: 30000 });
      const composerHtml = composerRes.data;
      // Look for form in composer page
      const cMatch = composerHtml.match(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i);
      if (cMatch) {
        composerAction = cMatch[1].replace(/&amp;/g, '&');
        if (!composerAction.startsWith('http')) composerAction = `https://mbasic.facebook.com${composerAction}`;
        composerFormHtml = cMatch[2];
        formStart = 0; // signal found
        console.log('[FB Relay] Got form from composer page');
      }
    }
  }

  if (formStart === -1) {
    // Log what we DID find on the page to debug
    const forms = html.match(/<form[^>]*>/gi);
    console.log(`[FB Relay] Forms found on page: ${forms ? forms.length : 0}`);
    const links = html.match(/<a[^>]*>/gi);
    console.log(`[FB Relay] Links on page: ${links ? links.length : 0}`);
    throw new Error('Could not find any posting method on group page');
  }

  // Extract form data
  const formData = new URLSearchParams();
  let actionUrl;

  if (composerFormHtml) {
    actionUrl = composerAction;
    // Extract inputs from the composer page form
    const inputRe = /<input[^>]*name="([^"]*)"[^>]*\/?>/gi;
    let m;
    while ((m = inputRe.exec(composerFormHtml)) !== null) {
      const vMatch = m[0].match(/value="([^"]*)"/);
      formData.append(m[1], vMatch ? vMatch[1] : '');
    }
  } else {
    // Extract action from the group page form
    const formTag = html.substring(formStart);
    const actionMatch = formTag.match(/action="([^"]+)"/);
    if (!actionMatch) throw new Error('Could not find form action');
    actionUrl = actionMatch[1].replace(/&amp;/g, '&');
    if (!actionUrl.startsWith('http')) actionUrl = `https://mbasic.facebook.com${actionUrl}`;

    // Extract form body
    const formOpenEnd = formTag.indexOf('>') + 1;
    const formContent = formTag.substring(formOpenEnd);
    const formEnd = formContent.indexOf('</form>');
    const formBody = formContent.substring(0, formEnd);

    // Extract all inputs
    const inputRe = /<input[^>]*name="([^"]*)"[^>]*\/?>/gi;
    let m;
    while ((m = inputRe.exec(formBody)) !== null) {
      const vMatch = m[0].match(/value="([^"]*)"/);
      formData.append(m[1], vMatch ? vMatch[1] : '');
    }
  }

  // Override with our message
  formData.set('xc_message', message.substring(0, 5000));
  // Ensure submit button
  if (!formData.has('view_post')) formData.append('view_post', 'Post');

  console.log(`[FB Relay] Posting to ${actionUrl} fields=${Array.from(formData.keys()).join(',')}`);

  const postRes = await axios.post(actionUrl, formData.toString(), {
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: groupUrl,
    },
    maxRedirects: 5,
    timeout: 30000,
    validateStatus: () => true,
  });

  const body = typeof postRes.data === 'string' ? postRes.data : '';
  const finalUrl = postRes.request?.res?.responseUrl || postRes.request?.responseURL || '';
  console.log(`[FB Relay] HTTP ${postRes.status} -> ${finalUrl || '(no redirect)'}`);

  const bodySnippet = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`[FB Relay] Response (${body.length} bytes): ${bodySnippet.substring(0, 600)}`);

  if (body.includes('class="_50f7"') || body.includes('class="error"') || body.includes('try again later')) {
    throw new Error('Facebook returned an error');
  }
  if (body.toLowerCase().includes('join') || body.toLowerCase().includes('not a member')) {
    throw new Error('Account is not a member of this group');
  }
  if (body.toLowerCase().includes('pending') || body.toLowerCase().includes('approval')) {
    console.warn('[FB Relay] Post may need approval');
  }

  if (body.length < 8000) console.log(`[FB Relay] Full body: ${bodySnippet.substring(0, 1500)}`);

  console.log(`[FB Relay] Posted to group ${fbGroupId}`);
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
