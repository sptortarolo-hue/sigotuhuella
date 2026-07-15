import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync, execSync } from 'child_process';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = process.env.API_BASE_URL || 'https://sigotuhuella.online/api';
const TOKEN = process.env.SCRAPER_TOKEN || 'sihuella';
const HEADED = process.env.FB_SCRAPER_HEADED === 'true' || process.argv.includes('--headed');
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/data/data/com.termux/files/usr/bin/chromium-browser';
const PROFILE_DIR = process.env.FB_SCRAPER_PROFILE_DIR || path.join(__dirname, 'fb_scraper_profile');
const SEEN_PATH = path.join(__dirname, 'fb_scraper_seen.json');
const SESSION_PATH = path.join(PROFILE_DIR, 'graphql-session.json');

let INTERVAL_HOURS = parseInt(process.env.FB_SCRAPER_INTERVAL || '4');
let MAX_POSTS_PER_GROUP = parseInt(process.env.FB_SCRAPER_MAX_POSTS || '20');

const GRAPHQL_URL = 'https://www.facebook.com/api/graphql/';
const FALLBACK_DOC_ID = '25716860671307636';
const DEBUG_PATH = path.join(__dirname, 'debug-graphql-response.json');

const USER_AGENTS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
];

function pickUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ==================== LOGGING ====================

function remoteLog(level, message) {
  axios.post(`${API_BASE}/facebook/scraper-log`, { level, message, ts: new Date().toISOString() }, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 10000,
  }).catch(() => {});
}

// ==================== SESSION MANAGEMENT ====================

function loadSession() {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveSession(session) {
  try {
    if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });
    fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
  } catch {}
}

function loadSeen() {
  try { return fs.existsSync(SEEN_PATH) ? JSON.parse(fs.readFileSync(SEEN_PATH, 'utf-8')) : {}; } catch { return {}; }
}
function saveSeen(seen) { fs.writeFileSync(SEEN_PATH, JSON.stringify(seen, null, 2)); }

// ==================== FB DTSG EXTRACTION ====================

async function extractFbDtsg(cookies) {
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  const resp = await axios.get('https://www.facebook.com/', {
    headers: {
      'User-Agent': pickUA(),
      'Cookie': cookieStr,
      'Accept': 'text/html,application/xhtml+xml',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    },
    timeout: 30000,
    maxRedirects: 5,
  });

  const html = typeof resp.data === 'string' ? resp.data : '';

  const patterns = [
    /\\"fb_dtsg\\":\{\\"token\\":\\"([^"\\]+)\\"/,
    /"fb_dtsg":"([^"]+)"/,
    /fb_dtsg.*?value="([^"]+)"/,
    /DTSGInitialData.*?"token":"([^"]+)"/,
    /\["DTSGInitialData",\[\],\{"token":"([^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }

  return null;
}

// ==================== COOKIE HELPERS ====================

function loadCookiesFromProfile() {
  try {
    const cookiesPath = path.join(PROFILE_DIR, 'cookies.json');
    if (fs.existsSync(cookiesPath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
      if (Array.isArray(cookies) && cookies.length > 0) return cookies;
    }
  } catch {}
  return [];
}

function cookiesToHeader(cookies) {
  return cookies
    .filter(c => c.domain && (c.domain.includes('facebook.com') || c.domain.includes('.facebook.com')))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

// ==================== BROWSER LOGIN (ONE TIME) ====================

async function doLogin() {
  console.log('[Scraper] Iniciando login manual...');
  if (execSync('which termux-wake-lock', { stdio: 'pipe' }).toString().trim()) {
    try { execSync('termux-wake-lock', { stdio: 'pipe' }); } catch {}
  }

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: CHROMIUM_PATH,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--window-size=1366,768',
      `--user-data-dir=${PROFILE_DIR}`,
    ],
    defaultViewport: { width: 1366, height: 768 },
  });

  const page = await browser.newPage();
  await page.setUserAgent(pickUA());
  await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 60000 });

  console.log('[Scraper] Logueate en Facebook en la ventana del navegador.');
  console.log('[Scraper] Esperando login (hasta 120s)...');

  for (let i = 0; i < 60; i++) {
    const url = page.url();
    const loggedIn = !url.includes('login') && !url.includes('checkpoint') && !url.includes('captcha')
      && await page.evaluate(() => !document.querySelector('input[name="email"], input[name="pass"], input[type="email"], input[type="password"]'));
    if (loggedIn) {
      console.log('[Scraper] Login detectado!');
      break;
    }
    await sleep(2000);
  }

  await sleep(3000);

  const cookies = await page.cookies();

  const fbDtsg = await page.evaluate(() => {
    const patterns = [
      /\\"fb_dtsg\\":\{\\"token\\":\\"([^"\\]+)\\"/,
      /"fb_dtsg":"([^"]+)"/,
      /DTSGInitialData.*?"token":"([^"]+)"/,
    ];
    const html = document.documentElement.innerHTML;
    for (const p of patterns) {
      const m = html.match(p);
      if (m) return m[1];
    }
    return null;
  });

  saveSession({ cookies, fbDtsg, savedAt: new Date().toISOString() });
  console.log(`[Scraper] Sesión guardada. Cookies: ${cookies.length}, fb_dtsg: ${fbDtsg ? 'ok' : 'no extraído (se buscará al scrapear)'}`);

  await browser.close();
}

// ==================== DOC_ID AUTO-DISCOVERY ====================

async function discoverDocId(cookies, groupId) {
  const cookieStr = cookiesToHeader(cookies);

  try {
    console.log(`[Scraper] Descubriendo doc_id para grupo ${groupId}...`);
    const resp = await axios.get(`https://www.facebook.com/groups/${groupId}/`, {
      headers: {
        'User-Agent': pickUA(),
        'Cookie': cookieStr,
        'Accept': 'text/html,application/xhtml+xml',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
      },
      timeout: 30000,
      maxRedirects: 5,
    });

    const html = typeof resp.data === 'string' ? resp.data : '';

    const docPatterns = [
      /"doc_id"\s*:\s*"(?:1452240142610665|(\d+))"/g,
      /doc_id.*?(\d{15,})/g,
      /\{"groupFeedQueryRenderer":\{"query":\{"doc_id":\s*"?(\d+)/,
      /GroupsCometFeedRegularStoriesPaginationQuery.*?doc_id.*?(\d{15,})/,
      /"queryID"\s*:\s*"(\d+)"/,
      /"pageID"\s*:\s*"(\d+)"/,
    ];

    for (const pattern of docPatterns) {
      const matches = [...html.matchAll(pattern)];
      for (const match of matches) {
        const id = match[1] || match[0].match(/\d{15,}/)?.[0];
        if (id && /^\d{10,}$/.test(id)) {
          console.log(`[Scraper] doc_id encontrado: ${id}`);
          return id;
        }
      }
    }

    console.warn('[Scraper] No se encontró doc_id en HTML, usando fallback');
    return FALLBACK_DOC_ID;
  } catch (err) {
    console.error('[Scraper] Error descubriendo doc_id:', err.message);
    return FALLBACK_DOC_ID;
  }
}

// ==================== GRAPHQL SCRAPING ====================

function buildPayload(groupId, cursor, count, userId, fbDtsg, docId) {
  const variables = {
    count: count || 8,
    cursor: cursor || null,
    feedLocation: 'GROUP',
    feedType: 'DISCUSSION',
    feedbackSource: 0,
    filterTopicId: null,
    focusCommentID: null,
    privacySelectorRenderLocation: 'COMET_STREAM',
    renderLocation: 'group',
    scale: 2,
    sortingSetting: 'CHRONOLOGICAL',
    stream_initial_count: 1,
    useDefaultActor: false,
    id: groupId,
  };

  const params = new URLSearchParams();
  params.append('av', userId || '0');
  params.append('__user', userId || '0');
  params.append('__a', '1');
  params.append('fb_dtsg', fbDtsg || '');
  params.append('doc_id', docId);
  params.append('variables', JSON.stringify(variables));

  return params.toString();
}

function parseFbResponse(text) {
  text = text.replace('for (;;);', '').trim();
  const blocks = [];
  let i = 0;

  while (true) {
    const idx = text.indexOf('"data"', i);
    if (idx === -1) break;
    const braceStart = text.indexOf('{', idx);
    if (braceStart === -1) break;

    let depth = 0;
    for (let j = braceStart; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') {
        depth--;
        if (depth === 0) {
          try {
            const block = JSON.parse(text.substring(braceStart, j + 1));
            if (block.errors) delete block.errors;
            if (block.extensions) delete block.extensions;
            blocks.push(block);
          } catch {}
          i = j + 1;
          break;
        }
      }
    }
    if (i <= braceStart) break;
  }

  return blocks;
}

function extractPostFromNode(node) {
  if (!node || node.__typename !== 'Story') return null;

  const contentStory = node.comet_sections?.content?.story || {};
  const message = contentStory.message?.text || '';
  const postId = node.post_id;
  if (!postId) return null;

  let commentCount = 0;
  try {
    commentCount =
      node.feedback?.comment_rendering_instance?.comments?.total_count ||
      node.comet_sections?.feedback?.story?.story_ufi_container?.story?.feedback_context?.feedback_target_with_context?.comment_rendering_instance?.comments?.total_count || 0;
  } catch {}

  const images = [];
  const attachments = node.attachments || [];
  for (const att of attachments) {
    if (att.media?.__typename === 'Photo') {
      const photoData = att.styles?.attachment?.media?.photo_image;
      if (photoData?.uri) images.push(photoData.uri);
    }
    if (att.all_subattachments?.nodes) {
      for (const sub of att.all_subattachments.nodes) {
        if (sub.media?.__typename === 'Photo' && sub.media.image?.uri) {
          images.push(sub.media.image.uri);
        }
      }
    }
  }

  const author = contentStory.comet_sections?.title?.story?.actors?.[0] || {};
  const authorName = author.name || 'Unknown';

  const permalink = node.permalink_url || '';
  const timestamp = contentStory.comet_sections?.context_layout?.story?.comet_sections?.metadata?.[0]?.story?.creation_time || null;

  return {
    fb_post_id: postId,
    fb_post_url: permalink || `https://www.facebook.com/groups/${node.comet_sections?.context_layout?.story?.comet_sections?.title?.story?.to?.id || ''}/posts/${postId}`,
    author_name: authorName,
    content: message.substring(0, 5000),
    image_urls: images,
    posted_at: timestamp ? new Date(timestamp * 1000).toISOString() : '',
    comments_count: commentCount,
  };
}

function extractPostsFromResponse(data) {
  const posts = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;

    const node = item.node || {};

    if (node.__typename === 'Story') {
      const post = extractPostFromNode(node);
      if (post) posts.push(post);
    }

    if (node.__typename === 'Group' && node.group_feed?.edges) {
      for (const edge of node.group_feed.edges) {
        const edgeNode = edge.node;
        if (edgeNode?.__typename === 'Story') {
          const post = extractPostFromNode(edgeNode);
          if (post) posts.push(post);
        }
      }
    }
  }
  return posts;
}

async function scrapeGroupGraphQL(session, groupId, groupName, maxPosts) {
  const cookieStr = cookiesToHeader(session.cookies);
  const userId = session.cookies.find(c => c.name === 'c_user')?.value || '0';
  let allPosts = [];
  let cursor = null;
  let pageNum = 1;
  const maxPages = 5;

  const docId = await discoverDocId(session.cookies, groupId);

  while (allPosts.length < maxPosts && pageNum <= maxPages) {
    console.log(`[Scraper] ${groupName} - GraphQL page ${pageNum}...`);

    const payload = buildPayload(groupId, cursor, 8, userId, session.fbDtsg, docId);

    try {
      const resp = await axios.post(GRAPHQL_URL, payload, {
        headers: {
          'User-Agent': pickUA(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieStr,
          'Origin': 'https://www.facebook.com',
          'Referer': `https://www.facebook.com/groups/${groupId}/`,
        },
        timeout: 30000,
      });

      const rawText = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);

      if (pageNum === 1) {
        try {
          fs.writeFileSync(DEBUG_PATH, JSON.stringify({
            groupId,
            docId,
            status: resp.status,
            first500: rawText.substring(0, 500),
            last500: rawText.substring(rawText.length - 500),
            fullLength: rawText.length,
            timestamp: new Date().toISOString(),
          }, null, 2));
          console.log(`[Scraper] Debug guardado en ${DEBUG_PATH} (${rawText.length} bytes)`);
        } catch (e) {
          console.error('[Scraper] Error guardando debug:', e.message);
        }
      }

      if (resp.status !== 200) {
        console.error(`[Scraper] GraphQL returned ${resp.status}`);
        break;
      }

      const data = parseFbResponse(rawText);
      if (!data || data.length === 0) {
        console.log(`[Scraper] ${groupName}: sin datos en page ${pageNum}. Response first 300: ${rawText.substring(0, 300)}`);
        break;
      }

      console.log(`[Scraper] ${groupName}: ${data.length} bloques en page ${pageNum}`);
      const posts = extractPostsFromResponse(data);
      console.log(`[Scraper] ${groupName}: ${posts.length} posts en page ${pageNum}`);

      if (posts.length === 0) break;

      allPosts.push(...posts);

      let nextCursor = null;
      for (const item of data) {
        if (item?.page_info?.has_next_page && item.page_info.end_cursor) {
          nextCursor = item.page_info.end_cursor;
        }
        if (item?.node?.group_feed?.page_info?.has_next_page) {
          nextCursor = item.node.group_feed.page_info.end_cursor;
        }
      }

      if (!nextCursor) break;
      cursor = nextCursor;
      pageNum++;
      await sleep(randomInt(2000, 5000));
    } catch (err) {
      console.error(`[Scraper] GraphQL error:`, err.message);
      break;
    }
  }

  return allPosts.slice(0, maxPosts);
}

// ==================== WEBHOOK ====================

async function sendPosts(posts, groupName) {
  if (posts.length === 0) return { inserted: 0, updated: 0, errors: 0 };

  try {
    const resp = await axios.post(`${API_BASE}/facebook/webhook`, { posts }, {
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      params: { token: TOKEN },
      timeout: 120000,
    });
    const result = resp.data;
    console.log(`[Scraper] ${groupName}: ${result.inserted || 0} nuevos, ${result.updated || 0} actualizados, ${result.errors || 0} errores`);
    return result;
  } catch (err) {
    console.error(`[Scraper] Error enviando posts de ${groupName}:`, err.message);
    return { inserted: 0, updated: 0, errors: posts.length };
  }
}

// ==================== GROUP CONFIG ====================

async function getActiveGroups() {
  try {
    const resp = await axios.get(`${API_BASE}/facebook/scraper-groups`, {
      params: { token: TOKEN },
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 30000,
    });
    if (Array.isArray(resp.data)) return resp.data;
    if (resp.data?.groups) return resp.data.groups;
    console.error('[Scraper] Respuesta inesperada:', typeof resp.data === 'string' ? resp.data.substring(0, 200) : JSON.stringify(resp.data).substring(0, 200));
    return [];
  } catch (err) {
    console.error('[Scraper] Error obteniendo grupos:', err.message);
    return [];
  }
}

async function fetchConfig() {
  try {
    const resp = await axios.get(`${API_BASE}/facebook/scraper-config`, {
      params: { token: TOKEN },
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 15000,
    });
    if (resp.data) {
      if (resp.data.interval_hours) INTERVAL_HOURS = resp.data.interval_hours;
      if (resp.data.max_posts_per_group) MAX_POSTS_PER_GROUP = resp.data.max_posts_per_group;
      console.log(`[Scraper] Config VPS: intervalo=${INTERVAL_HOURS}h, max_posts=${MAX_POSTS_PER_GROUP}`);
    }
  } catch {}
}

// ==================== MAIN ====================

async function testMode() {
  console.log('[Scraper] Modo TEST (GraphQL, sin Chromium)');

  const session = loadSession();
  if (!session || !session.fbDtsg) {
    console.error('[Scraper] Sin sesión GraphQL. Ejecutá: node fb-graphql-scraper.js --login');
    return;
  }
  console.log(`[Scraper] Sesión cargada, fb_dtsg: ${session.fbDtsg.substring(0, 10)}...`);
  console.log(`[Scraper] Cookies: ${session.cookies.length}`);
  const cUser = session.cookies.find(c => c.name === 'c_user');
  const xs = session.cookies.find(c => c.name === 'xs');
  console.log(`[Scraper] c_user: ${cUser ? cUser.value.substring(0, 8) + '...' : 'MISSING'}, xs: ${xs ? 'present' : 'MISSING'}`);

  const groups = await getActiveGroups();
  if (groups.length === 0) {
    console.error('[Scraper] No hay grupos activos');
    return;
  }

  const group = groups[0];
  const groupId = group.fb_group_id || group.url?.match(/groups\/(\d+)/)?.[1];
  const groupName = group.name || groupId;
  console.log(`[Scraper] Test: scrapeando "${groupName}" (${groupId})`);

  const posts = await scrapeGroupGraphQL(session, groupId, groupName, 5);
  console.log(`[Scraper] ${groupName}: ${posts.length} posts extraídos`);

  if (posts.length > 0) {
    for (const p of posts.slice(0, 3)) {
      console.log(`  - [${p.fb_post_id}] ${p.author_name}: ${p.content.substring(0, 80)}...`);
    }
    console.log(`  Enviando al webhook...`);
    await sendPosts(posts, groupName);
  } else {
    console.log('[Scraper] Revisá debug-graphql-response.json para ver qué devolvió Facebook');
  }
}

async function runDaemon() {
  console.log('[Scraper] Daemon GraphQL (sin Chromium)');
  remoteLog('info', 'Daemon GraphQL iniciado');

  await fetchConfig();

  const session = loadSession();
  if (!session || !session.fbDtsg) {
    console.error('[Scraper] Sin sesión GraphQL. Ejecutá: node fb-graphql-scraper.js --login');
    return;
  }
  console.log(`[Scraper] Sesión cargada`);

  while (true) {
    console.log(`[Scraper] Iniciando ciclo de scraping...`);

    const groups = await getActiveGroups();
    if (groups.length === 0) {
      console.log('[Scraper] No hay grupos activos');
    } else {
      const seen = loadSeen();
      let totalPosts = 0;

      for (const group of groups) {
        const groupId = group.fb_group_id || group.url?.match(/groups\/(\d+)/)?.[1];
        const groupName = group.name || groupId;
        const lastSeenId = seen[groupId] || null;

        const posts = await scrapeGroupGraphQL(session, groupId, groupName, MAX_POSTS_PER_GROUP);

        const newPosts = [];
        for (const post of posts) {
          if (lastSeenId && post.fb_post_id === lastSeenId) break;
          newPosts.push(post);
        }

        if (newPosts.length > 0) {
          const limited = newPosts.slice(0, MAX_POSTS_PER_GROUP);
          console.log(`[Scraper] ${groupName}: ${limited.length} posts nuevos`);
          await sendPosts(limited, groupName);
          seen[groupId] = limited[0].fb_post_id;
          totalPosts += limited.length;
        } else {
          console.log(`[Scraper] ${groupName}: sin posts nuevos`);
        }

        await sleep(randomInt(5000, 15000));
      }

      saveSeen(seen);
      console.log(`[Scraper] Ciclo completado. ${totalPosts} posts totales.`);
    }

    const sleepMinutes = INTERVAL_HOURS * 60;
    console.log(`[Scraper] Durmiendo ${sleepMinutes} min`);
    await sleep(sleepMinutes * 60 * 1000);

    await fetchConfig();
  }
}

// ==================== ENTRY POINT ====================

const args = process.argv.slice(2);

if (args.includes('--login')) {
  await doLogin();
} else if (args.includes('--debug')) {
  if (fs.existsSync(DEBUG_PATH)) {
    console.log(fs.readFileSync(DEBUG_PATH, 'utf-8'));
  } else {
    console.log('No hay debug guardado. Corré --test primero.');
  }
} else if (args.includes('--test')) {
  await testMode();
} else {
  try { execSync('termux-wake-lock', { stdio: 'pipe' }); } catch {}
  await runDaemon();
}
