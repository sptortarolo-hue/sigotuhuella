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
  const headers = {
    Cookie: cookieHeader(),
    'User-Agent': 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36',
  };

  // Get fb_dtsg and the composer form from the homepage (always available)
  const homeRes = await axios.get('https://mbasic.facebook.com/home.php', { headers, timeout: 30000 });
  const html = homeRes.data;

  if (html.includes('login_form') || html.includes('Logueate')) {
    throw new Error('session expired');
  }

  // Extract fb_dtsg
  const dtsgMatch = html.match(/name="fb_dtsg"\s+value="([^"]+)"/);
  if (!dtsgMatch) throw new Error('Could not find fb_dtsg');
  const fb_dtsg = dtsgMatch[1];

  // Get __user from c_user cookie
  const c_user = jar.find(c => c.name === 'c_user');
  const __user = c_user ? c_user.value : '';
  if (!__user) throw new Error('Could not find c_user cookie (not logged in)');

  // POST directly to m.facebook.com group posting endpoint (mobile web)
  const postUrl = `https://m.facebook.com/a/group/post/add/?gid=${fbGroupId}&refid=18`;
  const waterfall_id = Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');

  const formData = new URLSearchParams();
  formData.append('fb_dtsg', fb_dtsg);
  formData.append('__user', __user);
  formData.append('message', message.substring(0, 5000));
  formData.append('target', fbGroupId);
  formData.append('source_loc', 'composer_group');
  formData.append('waterfall_source', 'composer_group');
  formData.append('waterfall_id', waterfall_id);
  // Empty fields Facebook expects
  for (const f of ['[0]','[1]','__ajax__','__dyn__','__req__','album_fbid','appid','at',
    'backdated_day','backdated_month','backdated_year','ch','csid',
    'freeform_tag_place','fs','internal_extra','is_backdated','iscurrent',
    'linkUrl','link_no_change','loc','m_sess','npa','npc','npn','npp',
    'npw','npz','ogaction','oghideattachment','ogicon','ogobj','ogphrase',
    'ogsuggestionmechanism','rating','scheduled_am_pm','scheduled_day',
    'scheduled_hours','scheduled_minutes','scheduled_month','scheduled_year',
    'sid','text_[0]','text_[1]','unpublished_content_type']) {
    formData.append(f, '');
  }

  console.log(`[FB Relay] Posting to ${postUrl} with fb_dtsg=${fb_dtsg.substring(0,10)}..., target=${fbGroupId}`);

  const postRes = await axios.post(postUrl, formData.toString(), {
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `https://mbasic.facebook.com/groups/${fbGroupId}`,
    },
    maxRedirects: 5,
    timeout: 30000,
    validateStatus: () => true, // don't throw on any status
  });

  const body = typeof postRes.data === 'string' ? postRes.data : '';
  const finalUrl = postRes.request?.res?.responseUrl || postRes.request?.responseURL || '';
  console.log(`[FB Relay] HTTP ${postRes.status} -> ${finalUrl || '(no redirect)'}`);

  const bodySnippet = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`[FB Relay] Post response (${body.length} bytes): ${bodySnippet.substring(0, 500)}`);
  console.log(`[FB Relay] Final URL: ${finalUrl}`);

  // Check for various Facebook responses
  const lowerBody = body.toLowerCase();
  if (body.includes('class="_50f7"') || body.includes('class="error"') || body.includes('try again later')) {
    const snippet = body.substring(0, 500).replace(/<[^>]+>/g, ' ').trim().substring(0, 200);
    console.error(`[FB Relay] Error response:`, snippet);
    throw new Error('Facebook returned an error');
  }

  if (lowerBody.includes('pending') || lowerBody.includes('review') || lowerBody.includes('approval')) {
    console.warn(`[FB Relay] Post may be pending approval: redirect=${finalUrl}`);
    // Not throwing error - post was accepted but needs approval
  }

  if (lowerBody.includes('join') || lowerBody.includes('not a member')) {
    console.error(`[FB Relay] Account is not a member of group ${fbGroupId}`);
    throw new Error('Account is not a member of this group');
  }

  // Full body log for diagnosis when response is small
  if (body.length > 0 && body.length < 5000) {
    console.log(`[FB Relay] Full response body: ${bodySnippet.substring(0, 1000)}`);
  }

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
