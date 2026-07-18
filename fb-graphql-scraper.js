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
// Fallback doc_ids (no longer used by default — discovery uses Puppeteer)
const FALLBACK_DOC_IDS = [];
const FALLBACK_DOC_ID = null;
const DEBUG_PATH = path.join(__dirname, 'debug-graphql-response.json');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
];

function pickUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function realHeaders() {
  return {
    'User-Agent': pickUA(),
    'Accept-Language': pick([
      'es-AR,es;q=0.9,en;q=0.8',
      'es-AR,es;q=0.9',
      'es;q=0.9,en;q=0.8',
      'es-419,es;q=0.9,en;q=0.8',
    ]),
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': pick([
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      '*/*',
    ]),
  };
}

// ==================== BROWSING SIMULATION ====================

const FB_IDLE_PAGES = [
  '/',
  '/feed',
  '/gaming/feed',
  '/watch',
  '/marketplace',
  '/memories',
  '/pages',
  '/pages/?category=local_service&subcategory=pet_service',
  '/groups/?category=local_service',
  '/me',
];

async function fetchFbPage(cookies, path) {
  const cookieStr = cookiesToHeader(cookies);
  try {
    await axios.get(`https://www.facebook.com${path}`, {
      headers: {
        ...realHeaders(),
        'Cookie': cookieStr,
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Dest': 'document',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 20000,
      maxRedirects: 5,
    });
  } catch {}
}

async function warmUpBrowsing(cookies) {
  console.log('[Scraper] Warm-up: browsing Facebook...');
  const pages = pick([
    ['/', '/feed'],
    ['/', '/feed', '/watch'],
    ['/', '/groups/'],
  ]);
  for (const p of pages) {
    await fetchFbPage(cookies, p);
    await sleep(randomInt(3000, 8000));
  }
  console.log('[Scraper] Warm-up done');
}

async function coolDownBrowsing(cookies) {
  console.log('[Scraper] Cool-down: browsing Facebook...');
  const count = randomInt(2, 4);
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let p;
    do { p = pick(FB_IDLE_PAGES); } while (used.has(p) && used.size < FB_IDLE_PAGES.length);
    used.add(p);
    await fetchFbPage(cookies, p);
    await sleep(randomInt(8000, 25000));
  }
  console.log('[Scraper] Cool-down done');
}

async function idleBrowsingSession(cookies) {
  const count = randomInt(3, 6);
  console.log(`[Scraper] Idle browsing: ${count} pages...`);
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let p;
    do { p = pick(FB_IDLE_PAGES); } while (used.has(p) && used.size < FB_IDLE_PAGES.length);
    used.add(p);
    await fetchFbPage(cookies, p);
    await sleep(randomInt(15000, 40000));
  }
  console.log('[Scraper] Idle session done');
}

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

// ==================== FULL SESSION BOOTSTRAP ====================

function extractFromHtml(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function computeJazoest(fbDtsg) {
  let sum = 0;
  for (let i = 0; i < fbDtsg.length; i++) sum += fbDtsg.charCodeAt(i);
  return '2' + sum;
}

async function bootstrapSession(cookies, groupId) {
  const cookieStr = cookiesToHeader(cookies);
  const url = groupId
    ? `https://www.facebook.com/groups/${groupId}/`
    : 'https://www.facebook.com/';

  console.log(`[Scraper] Bootstrapping session desde ${url}...`);

  const resp = await axios.get(url, {
    headers: {
      ...realHeaders(),
      'Cookie': cookieStr,
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
    timeout: 30000,
    maxRedirects: 5,
  });

  const html = typeof resp.data === 'string' ? resp.data : '';

  const fbDtsg = extractFromHtml(html, [
    /\\"fb_dtsg\\":\{\\"token\\":\\"([^"\\]+)\\"/,
    /"fb_dtsg":"([^"]+)"/,
    /fb_dtsg.*?value="([^"]+)"/,
    /DTSGInitialData.*?"token":"([^"]+)"/,
    /\["DTSGInitialData",\[\],\{"token":"([^"]+)"/,
  ]);

  const lsd = extractFromHtml(html, [
    /\["LSD",\[\],\{"token":"([^"]+)"/,
    /"LSD",\[\],\{"token":"([^"]+)"/,
    /"lsd"\s*:\s*"([^"]+)"/,
  ]);

  const rev = extractFromHtml(html, [
    /"client_revision"\s*:\s*(\d+)/,
    /"__rev"\s*:\s*(\d+)/,
  ]);

  const hs = extractFromHtml(html, [
    /"haste_session"\s*:\s*"([^"]+)"/,
    /"__hs"\s*:\s*"([^"]+)"/,
  ]);

  const hsi = extractFromHtml(html, [
    /"hsi"\s*:\s*"(\d+)"/,
  ]);

  const spinT = extractFromHtml(html, [
    /"_?_?spin_t"\s*:\s*(\d+)/,
  ]);

  const jazoest = fbDtsg ? computeJazoest(fbDtsg) : null;

  const tokens = { fbDtsg, lsd, rev, hs, hsi, spinT, jazoest };
  console.log('[Scraper] Tokens extraídos:', JSON.stringify(Object.fromEntries(
    Object.entries(tokens).map(([k, v]) => [k, v ? (typeof v === 'string' ? v.substring(0, 15) + '...' : v) : 'NULL'])
  )));

  return tokens;
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

// ==================== DOC ID CACHE ====================

function getDocIdCache(groupId) {
  const session = loadSession();
  return session?.docIdsCache?.[groupId] || null;
}

function setDocIdCache(groupId, docId) {
  const session = loadSession() || {};
  if (!session.docIdsCache) session.docIdsCache = {};
  session.docIdsCache[groupId] = docId;
  saveSession(session);
}

// ==================== PUPPETEER DOC ID DISCOVERY ====================

async function discoverDocIdWithPuppeteer(groupId, cookies) {
  console.log(`[Scraper] Descubriendo doc_id con Puppeteer (headless) para grupo ${groupId}...`);
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--disable-features=site-per-process',
      ],
      defaultViewport: { width: 1366, height: 768 },
    });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent(pickUA());

    // Set cookies before navigation
    const fbCookies = cookies.filter(c => c.domain?.includes('facebook') || c.domain?.includes('.facebook'));
    if (fbCookies.length > 0) await page.setCookie(...fbCookies);

    // Capture GraphQL requests and check responses for actual group feed data
    let foundDocId = null;
    let graphQLCount = 0;
    const graphQLReqs = [];

    page.on('request', (req) => {
      try {
        if (req.url().includes('/api/graphql/') && req.method() === 'POST') {
          graphQLCount++;
          graphQLReqs.push({
            url: req.url(),
            postData: req.postData(),
          });
        }
      } catch {}
    });

    page.on('response', async (resp) => {
      try {
        if (!resp.url().includes('/api/graphql/')) return;
        let rawText = await resp.text();
        rawText = rawText.replace(/^for\s*\(\s*;\s*;\s*\)\s*/, '').trim();
        if (!rawText.startsWith('{')) return;
        const json = JSON.parse(rawText);
        // Check if this response actually contains group feed posts
        const edges = json?.data?.node?.group_feed?.edges;
        if (edges && edges.length > 0) {
          const matchReq = graphQLReqs.find(r => r.url === resp.url());
          if (matchReq?.postData) {
            const m = matchReq.postData.match(/doc_id=(\d+)/);
            if (m) {
              foundDocId = m[1];
              console.log(`[Scraper] Capturado doc_id=${m[1]} de request con ${edges.length} posts`);
            }
          }
        }
      } catch {}
    });

    await page.goto(`https://www.facebook.com/groups/${groupId}/`, {
      waitUntil: 'load',
      timeout: 45000,
    }).catch(err => {
      console.warn(`[Scraper] Navigation warning: ${err.message}`);
    });

    // Try to wait for GraphQL requests (up to 15s)
    for (let i = 0; i < 30 && !foundDocId; i++) {
      await sleep(500);
    }

    if (!foundDocId) {
      console.warn(`[Scraper] No se encontró feed en ${graphQLCount} requests GraphQL`);
      // Fallback: try to capture doc_id from XHR responses too
      foundDocId = await page.evaluate(() => {
        try {
          const perf = performance.getEntriesByType('resource') || [];
          for (const entry of perf) {
            if (entry.name.includes('/api/graphql/')) {
              const m = entry.name.match(/doc_id[=/](\d+)/);
              if (m) return m[1];
            }
          }
        } catch {}
        return null;
      });
      if (foundDocId) console.log(`[Scraper] Doc_id recuperado de Performance API: ${foundDocId}`);
    }

    await browser.close();
    browser = null;

    if (foundDocId) {
      console.log(`[Scraper] Doc_id descubierto con Puppeteer: ${foundDocId}`);
      setDocIdCache(groupId, foundDocId);
      return foundDocId;
    }

    console.warn('[Scraper] Puppeteer no pudo descubrir doc_id');
    return null;
  } catch (err) {
    console.error('[Scraper] Error en Puppeteer discovery:', err.message);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

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

  const allTokens = await page.evaluate(() => {
    const html = document.documentElement.innerHTML;
    function extract(patterns) {
      for (const p of patterns) { const m = html.match(p); if (m && m[1]) return m[1]; }
      return null;
    }
    const fbDtsg = extract([
      /\\"fb_dtsg\\":\{\\"token\\":\\"([^"\\]+)\\"/,
      /"fb_dtsg":"([^"]+)"/,
      /DTSGInitialData.*?"token":"([^"]+)"/,
    ]);
    const lsd = extract([
      /\["LSD",\[\],\{"token":"([^"]+)"/,
      /"LSD",\[\],\{"token":"([^"]+)"/,
      /"lsd"\s*:\s*"([^"]+)"/,
    ]);
    const rev = extract([/"client_revision"\s*:\s*(\d+)/, /"__rev"\s*:\s*(\d+)/]);
    const hs = extract([/"haste_session"\s*:\s*"([^"]+)"/]);
    const hsi = extract([/"hsi"\s*:\s*"(\d+)"/]);
    const spinT = extract([/"_?_?spin_t"\s*:\s*(\d+)/]);
    let jazoest = null;
    if (fbDtsg) { let s = 0; for (let i = 0; i < fbDtsg.length; i++) s += fbDtsg.charCodeAt(i); jazoest = '2' + s; }
    return { fbDtsg, lsd, rev, hs, hsi, spinT, jazoest };
  });

  saveSession({ cookies, ...allTokens, savedAt: new Date().toISOString() });
  console.log(`[Scraper] Sesión guardada. Cookies: ${cookies.length}, fb_dtsg: ${allTokens.fbDtsg ? 'ok' : 'FALLO'}, lsd: ${allTokens.lsd ? 'ok' : 'FALLO'}`);

  await browser.close();
}

// ==================== DOC_ID AUTO-DISCOVERY ====================

async function discoverDocId(cookies, groupId) {
  console.log('[Scraper] discoverDocId() deprecated — usando descubrimiento via Puppeteer');
  return discoverDocIdWithPuppeteer ? await discoverDocIdWithPuppeteer(groupId, cookies) : null;
}

// ==================== GRAPHQL SCRAPING ====================

let reqCounter = 0;

function buildPayload(groupId, cursor, count, userId, tokens, docId) {
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

  reqCounter++;
  const reqHex = reqCounter.toString(16);

  const params = new URLSearchParams();
  params.append('av', userId || '0');
  params.append('__user', userId || '0');
  params.append('__a', '1');
  params.append('__req', reqHex);
  params.append('dpr', '2');
  params.append('__ccg', pick(['EXCELLENT', 'GOOD', 'GOOD', 'MODERATE']));
  params.append('__comet_req', '15');
  params.append('fb_dtsg', tokens.fbDtsg || '');
  params.append('jazoest', tokens.jazoest || '');
  params.append('lsd', tokens.lsd || '');
  params.append('__hs', tokens.hs || '');
  params.append('__hsi', tokens.hsi || '');
  params.append('__rev', tokens.rev || '');
  params.append('__spin_r', tokens.rev || '');
  params.append('__spin_b', 'trunk');
  params.append('__spin_t', tokens.spinT || String(Math.floor(Date.now() / 1000)));
  params.append('server_timestamps', 'true');
  params.append('fb_api_caller_class', 'RelayModern');
  params.append('fb_api_req_friendly_name', 'GroupsCometFeedRegularStoriesPaginationQuery');
  params.append('variables', JSON.stringify(variables));
  params.append('doc_id', docId);

  return params.toString();
}

function parseFbResponse(text) {
  // Strip for(;;); from the beginning only
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

function extractImagesFromAttachment(att) {
  if (!att) return [];
  const imgs = [];
  const mediaCandidates = [
    att.media,
    att.style_type_renderer?.attachment?.media,
    att.styles?.attachment?.media,
    att.styles?.style_type_renderer?.attachment?.media,
  ];
  let media = null;
  for (const m of mediaCandidates) {
    if (m && (m.__typename === 'Photo' || m.typename === 'Photo')) {
      media = m;
      break;
    }
  }
  if (!media) media = att.media || att.styles?.attachment?.media || mediaCandidates.find(Boolean);
  if (media?.photo_image?.uri) imgs.push(media.photo_image.uri);
  else if (media?.image?.uri) imgs.push(media.image.uri);
  if (imgs.length === 0 && (att.__typename === 'Photo' || att.typename === 'Photo')) {
    if (att.photo_image?.uri) imgs.push(att.photo_image.uri);
    else if (att.image?.uri) imgs.push(att.image.uri);
  }
  if (att.all_subattachments?.nodes) {
    for (const sub of att.all_subattachments.nodes) {
      imgs.push(...extractImagesFromAttachment(sub));
    }
  }
  return imgs;
}

function extractPostFromNode(node) {
  if (!node || node.__typename !== 'Story') return null;

  const postId = node.post_id;
  if (!postId) return null;

  const contentStory = node.comet_sections?.content?.story || {};
  const titleStory = node.comet_sections?.title?.story || {};

  let message = contentStory.message?.text
    || node.attached_story?.comet_sections?.content?.story?.message?.text
    || node.attached_story?.message?.text
    || '';

  if (!message && node.attached_story) {
    const fullJson = JSON.stringify(node);
    const candidates = [...fullJson.matchAll(/"text"\s*:\s*"([^"]{30,})"/g)];
    for (const c of candidates) {
      const t = c[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      if (t.length > message.length) message = t;
    }
  }

  message = message.replace(/^.*?Cualquier persona puede ver quién pertenece al grupo.*?\n/gim, '').trim();

  let authorName = 'Unknown';
  const actors = titleStory.actors || [];
  if (actors.length > 0 && actors[0].name) {
    authorName = actors[0].name;
  }
  if (authorName === 'Unknown') {
    authorName = contentStory.comet_sections?.title?.story?.actors?.[0]?.name || 'Unknown';
  }
  if (authorName === 'Unknown') {
    authorName = contentStory.actor?.name || node.comet_sections?.content?.story?.actors?.[0]?.name || 'Unknown';
  }
  if (authorName === 'Unknown') {
    authorName = node.comet_sections?.context_layout?.story?.comet_sections?.title?.story?.actors?.[0]?.name || 'Unknown';
  }

  let commentCount = 0;
  try {
    commentCount =
      node.feedback?.comment_rendering_instance?.comments?.total_count ||
      node.comet_sections?.feedback?.story?.story_ufi_container?.story?.feedback_context?.feedback_target_with_context?.comment_rendering_instance?.comments?.total_count || 0;
  } catch {}

  if (node.attached_story && !extractPostFromNode._debugDumped) {
    extractPostFromNode._debugDumped = true;
    const asCs = Object.keys(node.attached_story?.comet_sections || {});
    const outerAtts = node.comet_sections?.content?.story?.attached_story?.attachments;
    console.log(`[Scraper] Reshare: attached_story.comet_sections=[${asCs}] outer.attached_story.attachments=${(outerAtts || []).length}`);
  }

  const images = [];
  const attSources = [
    node.attachments,
    node.attached_story?.attachments,
    node.attached_story?.comet_sections?.content?.story?.attachments,
    node.comet_sections?.content?.story?.attachments,
    node.comet_sections?.content?.story?.attached_story?.attachments,
  ];
  for (let i = 0; i < attSources.length; i++) {
    const attList = attSources[i];
    if (!attList || images.length > 0) continue;
    for (const att of attList) {
      const fromAtt = extractImagesFromAttachment(att);
      images.push(...fromAtt);
      if (images.length > 0) break;
    }
  }

  if (images.length === 0 && node.attached_story) {
    const fullJson = JSON.stringify(node);
    const BAD_PATTERNS = ['profile', 'p40x40', 'p50x50', 'p80x80', 'p100x100', 's40x40', 's50x50', 's80x80', 's100x100', 'rsrc.php', 'static.xx.fbcdn.net/rsrc', 'badge', 'emoji'];
    const fbcdnMatches = [...fullJson.matchAll(/https?:\/\/scontent[^"]*\.(?:jpg|png|webp)(?:\?[^"]*)?/gi)];
    for (const m of fbcdnMatches) {
      let url = m[0].replace(/\\u0025/g, '%').replace(/\\u0026/g, '&');
      if (BAD_PATTERNS.some(p => url.toLowerCase().includes(p))) continue;
      if (url.includes('40x40') || url.includes('50x50') || url.includes('80x80') || url.includes('100x100')) continue;
      images.push(url);
      console.log(`[Scraper] Reshare image from node scan: ${url.substring(0, 150)}`);
      break;
    }
  }

  let reshareUrl = null;
  if (images.length === 0 && node.attached_story) {
    const attachedMeta = node.attached_story?.comet_sections?.context_layout?.story?.comet_sections?.metadata;
    if (attachedMeta) {
      for (const m of attachedMeta) {
        if (m.story?.url) { reshareUrl = m.story.url; break; }
      }
    }
    if (!reshareUrl) reshareUrl = node.attached_story?.permalink_url || null;
    if (reshareUrl) {
      console.log(`[Scraper] Post ${postId}: reshare, guardando URL para fetch: ${reshareUrl}`);
    }
  }

  if (images.length === 0) {
    console.log(`[Scraper] Post ${postId}: 0 images (attached_story=${!!node.attached_story})`);
  }

  const permalink = node.permalink_url || '';
  const timestamp = contentStory.comet_sections?.context_layout?.story?.comet_sections?.metadata?.[0]?.story?.creation_time || null;

  return {
    fb_post_id: postId,
    fb_post_url: permalink || `https://www.facebook.com/groups/${titleStory.to?.id || ''}/posts/${postId}`,
    author_name: authorName,
    content: message.substring(0, 5000),
    image_urls: images,
    reshare_url: reshareUrl,
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
        if (edge?.node?.__typename === 'Story') {
          const post = extractPostFromNode(edge.node);
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

  // Get cached doc_id or discover with Puppeteer
  let docId = getDocIdCache(groupId);
  if (!docId) {
    console.log(`[Scraper] Sin doc_id cacheado para ${groupName}, descubriendo...`);
    docId = await discoverDocIdWithPuppeteer(groupId, session.cookies);
    if (!docId) {
      console.error(`[Scraper] No se pudo descubrir doc_id para ${groupName}`);
      return [];
    }
  } else {
    console.log(`[Scraper] Usando doc_id cacheado para ${groupName}: ${docId}`);
  }

  await sleep(randomInt(2000, 5000));

  const tokens = await bootstrapSession(session.cookies, groupId);
  if (!tokens.fbDtsg) {
    console.error('[Scraper] No se pudo obtener fb_dtsg del bootstrap');
    return [];
  }
  console.log(`[Scraper] Bootstrap OK: fb_dtsg=${tokens.fbDtsg.substring(0, 10)}..., lsd=${tokens.lsd ? 'ok' : 'MISSING'}, rev=${tokens.rev || 'MISSING'}`);

  // Try with doc_id; if it fails, rediscover with Puppeteer
  for (let attempt = 0; attempt < 2; attempt++) {
    allPosts = [];
    cursor = null;
    pageNum = 1;
    let gotPosts = false;

    while (allPosts.length < maxPosts && pageNum <= maxPages) {
      console.log(`[Scraper] ${groupName} - GraphQL page ${pageNum}...`);

      const payload = buildPayload(groupId, cursor, 8, userId, tokens, docId);

      let resp = null;
      let lastErr = null;
      for (let retry = 1; retry <= 3; retry++) {
        try {
          resp = await axios.post(GRAPHQL_URL, payload, {
            headers: {
              ...realHeaders(),
              'Content-Type': 'application/x-www-form-urlencoded',
              'Cookie': cookieStr,
              'Origin': 'https://www.facebook.com',
              'Referer': `https://www.facebook.com/groups/${groupId}/`,
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'same-origin',
              'X-FB-LSD': tokens.lsd || '',
            },
            timeout: 30000,
          });
          break;
        } catch (err) {
          lastErr = err;
          console.error(`[Scraper] Intento ${retry}/3 falló: ${err.message}`);
          if (retry < 3) await sleep(retry * 3000);
        }
      }

      if (!resp) {
        console.error(`[Scraper] Todos los intentos fallaron para ${groupName}`);
        break;
      }

      const rawText = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);

      if (resp.status !== 200) {
        console.error(`[Scraper] GraphQL returned ${resp.status}`);
        break;
      }

      const blocks = parseFbResponse(rawText);

      if (pageNum === 1) {
        try {
          let sampleStory = null;
          for (const block of blocks) {
            const edges = block?.node?.group_feed?.edges || [];
            for (const edge of edges) {
              if (edge?.node?.__typename === 'Story') { sampleStory = edge.node; break; }
            }
            if (!sampleStory && block?.node?.__typename === 'Story') sampleStory = block.node;
            if (sampleStory) break;
          }
          fs.writeFileSync(DEBUG_PATH, JSON.stringify({
            groupId,
            docId,
            tokens: { fbDtsg: tokens.fbDtsg?.substring(0, 15) + '...', lsd: tokens.lsd, rev: tokens.rev, jazoest: tokens.jazoest },
            status: resp.status,
            fullLength: rawText.length,
            totalBlocks: blocks.length,
            sampleStory: sampleStory ? JSON.stringify(sampleStory).substring(0, 8000) : 'NO STORY FOUND',
            sampleStoryKeys: sampleStory ? Object.keys(sampleStory) : [],
            hasAttachedStory: sampleStory ? !!sampleStory.attached_story : false,
            attachmentsCount: sampleStory?.attachments?.length || 0,
            attachedStoryAttachmentsCount: sampleStory?.attached_story?.attachments?.length || 0,
            timestamp: new Date().toISOString(),
          }, null, 2));
          console.log(`[Scraper] Debug guardado (${rawText.length} bytes, ${blocks.length} blocks)`);
          if (sampleStory) {
            console.log(`[Scraper] Sample keys: ${Object.keys(sampleStory).join(', ')}`);
            console.log(`[Scraper] Sample post_id: ${sampleStory.post_id || 'NONE'}`);
          }
        } catch (e) {
          console.error('[Scraper] Error guardando debug:', e.message);
        }
      }

      if (!blocks || blocks.length === 0) {
        console.log(`[Scraper] ${groupName}: sin datos en page ${pageNum}. Response first 300: ${rawText.substring(0, 300)}`);
        break;
      }

      console.log(`[Scraper] ${groupName}: ${blocks.length} blocks en page ${pageNum}`);
      const posts = extractPostsFromResponse(blocks);
      console.log(`[Scraper] ${groupName}: ${posts.length} posts en page ${pageNum}`);

      if (posts.length === 0) break;

      gotPosts = true;
      allPosts.push(...posts);

      let nextCursor = null;
      for (const block of blocks) {
        const pageInfo = block?.node?.group_feed?.page_info;
        if (pageInfo?.has_next_page && pageInfo.end_cursor) {
          nextCursor = pageInfo.end_cursor;
        }
      }

      if (!nextCursor) break;
      cursor = nextCursor;
      pageNum++;
      await sleep(randomInt(2000, 5000));
    }

    if (gotPosts || allPosts.length > 0) {
      console.log(`[Scraper] doc_id ${docId} devolvió ${allPosts.length} posts para ${groupName}`);
      setDocIdCache(groupId, docId);
      break;
    }

    // If cache failed, rediscover with Puppeteer and retry
    console.warn(`[Scraper] doc_id ${docId} devolvió 0 posts, rediscovering with Puppeteer...`);
    docId = await discoverDocIdWithPuppeteer(groupId, session.cookies);
    if (!docId) {
      console.error(`[Scraper] Rediscovery falló para ${groupName}`);
      // Fallback: Puppeteer DOM scraping
      console.log(`[Scraper] Cayendo a Puppeteer DOM scraping para ${groupName}...`);
      return await scrapeGroupPuppeteer(groupId, groupName, maxPosts, session.cookies);
    }
    await sleep(2000);
  }

  return allPosts.slice(0, maxPosts);
}

// ==================== IMAGE DOWNLOAD ====================

async function fetchReshareOgImage(reshareUrl, cookies, cUserId) {
  const cookieStr = cookiesToHeader(cookies);
  try {
    const resp = await axios.get(reshareUrl, {
      headers: {
        ...realHeaders(),
        'Cookie': cookieStr,
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
      },
      timeout: 20000,
      maxRedirects: 5,
    });
    const html = typeof resp.data === 'string' ? resp.data : '';

    const BAD_URL_PATTERNS = ['profile', 'p40x40', 'p50x50', 'rsrc.php', 'static.xx.fbcdn.net/rsrc', 'badge', 'emoji', ' reactions'];

    const patterns = [
      /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
      /<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i,
      /<meta[^>]*name="twitter:image"[^>]*content="([^"]+)"/i,
      /<meta[^>]*content="([^"]+)"[^>]*name="twitter:image"/i,
      /"image_src"\s*:\s*"([^"]+)"/,
      /"uri"\s*:\s*"(https?:\/\/[^"]*fbcdn[^"]+)"/,
      /src="(https?:\/\/[^"]*fbcdn[^"]*\.(?:jpg|png|webp)[^"]*)"/i,
    ];
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m && m[1]) {
        const url = m[1].replace(/&amp;/g, '&').replace(/\\u0025/g, '%');
        if (BAD_URL_PATTERNS.some(p => url.includes(p))) continue;
        console.log(`[Scraper] Reshare image found via meta: ${url.substring(0, 150)}`);
        return url;
      }
    }

    const photoIdPatterns = [
      /"photo_id"\s*:\s*"?(\d{10,})"?/g,
      /"fbid"\s*:\s*"?(\d{10,})"?/g,
      /"id"\s*:\s*"?(\d{10,})"?/g,
    ];
    for (const pat of photoIdPatterns) {
      const matches = [...html.matchAll(pat)];
      for (const m of matches) {
        const id = m[1];
        if (cUserId && id.startsWith(cUserId.substring(0, 7))) continue;
        if (id.length < 10 || id.length > 20) continue;
        const photoUrl = `https://www.facebook.com/photo/?fbid=${id}`;
        console.log(`[Scraper] Reshare photo_id found: ${id}`);
        return photoUrl;
      }
    }

    const allFbcdnUrls = [...html.matchAll(/https?:\/\/scontent[^"'\s\\]+\.(?:jpg|png|webp)(?:\?[^"'\s\\]*)?/gi)];
    if (allFbcdnUrls.length > 0) {
      const goodUrls = allFbcdnUrls
        .map(m => m[0].replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/&amp;/g, '&'))
        .filter(url => !BAD_URL_PATTERNS.some(p => url.includes(p)));
      if (goodUrls.length > 0) {
        console.log(`[Scraper] Reshare image found via fbcdn scan: ${goodUrls[0].substring(0, 150)}`);
        return goodUrls[0];
      }
    }

    console.log(`[Scraper] No image found for reshare (html ${html.length} bytes)`);
    return null;
  } catch (e) {
    console.warn(`[Scraper] Error fetching reshare URL: ${e.message}`);
    return null;
  }
}

async function downloadImagesAsBuffers(posts, cookies) {
  const cookieStr = cookiesToHeader(cookies);
  const results = [];
  for (const post of posts) {
    if ((!post.image_urls || post.image_urls.length === 0) && post.reshare_url) {
      const cUserId = cookies.find(c => c.name === 'c_user')?.value || '';
      const ogUrl = await fetchReshareOgImage(post.reshare_url, cookies, cUserId);
      if (ogUrl) {
        post.image_urls = [ogUrl];
      }
    }
    if (!post.image_urls || post.image_urls.length === 0) {
      results.push(post);
      continue;
    }
    const buffers = [];
    for (const url of post.image_urls.slice(0, 3)) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const resp = await axios.get(url, {
          headers: {
            'Cookie': cookieStr,
            ...realHeaders(),
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          },
          responseType: 'arraybuffer',
          signal: controller.signal,
          timeout: 15000,
          maxRedirects: 5,
        });
        clearTimeout(timeout);
        const ct = resp.headers['content-type'] || 'image/jpeg';
        buffers.push({
          data: Buffer.from(resp.data).toString('base64'),
          mimeType: ct.split(';')[0].trim(),
        });
      } catch (e) {
        console.warn(`[Scraper] No se pudo descargar imagen: ${e.message}`);
      }
      if (post.image_urls.indexOf(url) < post.image_urls.slice(0, 3).length - 1) {
        await sleep(randomInt(500, 1500));
      }
    }
    results.push({ ...post, image_buffers: buffers.length > 0 ? buffers : undefined });
  }
  return results;
}

// ==================== WEBHOOK ====================

async function sendPosts(posts, groupName, groupUuid) {
  if (posts.length === 0) return { inserted: 0, updated: 0, errors: 0 };

  const payload = posts.map(p => ({ ...p, group_id: groupUuid || null }));

  try {
    const resp = await axios.post(`${API_BASE}/facebook/webhook`, { posts: payload }, {
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

// ==================== PUPPETEER DOM SCRAPING (FALLBACK) ====================

async function scrapeGroupPuppeteer(groupId, groupName, maxPosts, cookies) {
  console.log(`[Scraper] [Puppeteer] Scrapeando "${groupName}" (${groupId}) via DOM...`);
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      defaultViewport: { width: 1366, height: 768 },
    });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(90000);
    await page.setUserAgent(pickUA());

    const fbCookies = cookies.filter(c => c.domain?.includes('facebook'));
    if (fbCookies.length > 0) await page.setCookie(...fbCookies);

    await page.goto(`https://www.facebook.com/groups/${groupId}/`, { waitUntil: 'networkidle2', timeout: 90000 });
    console.log(`[Scraper] [Puppeteer] URL after goto: ${page.url()}`);

    // Wait for posts to render
    await sleep(6000);

    const posts = [];
    let scrollAttempts = 0;
    const maxScrolls = 6;

    while (posts.length < maxPosts && scrollAttempts < maxScrolls) {
      const newPosts = await page.evaluate((maxToCollect, scrollNum) => {
        const results = [];

        // Try multiple selectors for post containers
        const postSelectors = [
          ...document.querySelectorAll('[role="article"]'),
          ...document.querySelectorAll('[data-pagelet*="Feed"]'),
          ...document.querySelectorAll('[data-pagelet*="feed"]'),
        ];

        // Deduplicate by reference
        const seen = new Set();
        const containers = postSelectors.filter(el => {
          if (seen.has(el)) return false;
          seen.add(el);
          return true;
        });

        for (const art of containers) {
          if (results.length >= maxToCollect) break;
          const fullText = art.textContent || '';
          if (fullText.length < 20) continue;

          // Skip group header / compose areas by checking for known senders
          const innerHTML = art.innerHTML || '';

          // Extract post ID from permalink
          const link = art.querySelector('a[href*="/posts/"], a[href*="/photo/"]');
          const permalink = link ? link.getAttribute('href') : '';
          const postId = (permalink.match(/\/posts\/(\d+)/) || [])[1] || '';

          // Extract author name from links
          const authorEl = art.querySelector('a[href*="/user/"], a[href*="?__tn"], a[role="link"]');
          let authorName = 'Unknown';
          if (authorEl && authorEl.textContent.trim().length > 0 && authorEl.textContent.trim().length < 60) {
            authorName = authorEl.textContent.trim();
          }

          // Extract images (skip profile/icon images)
          const imgs = [];
          const imgEls = art.querySelectorAll('img');
          for (const img of imgEls) {
            const src = img.getAttribute('src') || '';
            const cls = img.getAttribute('class') || '';
            const w = img.getAttribute('width') || '0';
            const h = img.getAttribute('height') || '0';
            if (cls.includes('profile') || cls.includes('avatar') || cls.includes('emoji')) continue;
            if (src.includes('rsrc.php') || src.includes('p40x40') || src.includes('p50x50') || src.includes('p100x100') || src.includes('badge')) continue;
            if (parseInt(w) < 80 && parseInt(h) < 80) continue;
            if ((src.includes('scontent') || src.includes('fbcdn')) && !imgs.includes(src)) {
              imgs.push(src);
            }
          }

          // Clean the text: remove scattered single chars that appear in Facebook's obfuscated DOM
          let content = fullText
            // Remove scattered single non-letter chars
            .replace(/\b[a-z]\s+(?=[a-z]\s+)/gi, '')
            // Remove repetitive "Facebook" noise
            .replace(/(Facebook\s*){2,}/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          // Skip if content is too short and no images
          if (content.length < 15 && imgs.length === 0) continue;

          results.push({
            fb_post_id: postId || `${groupId}_puppeteer_${scrollNum}_${results.length}`,
            fb_post_url: permalink ? `https://www.facebook.com${permalink}` : '',
            author_name: authorName,
            content: content.substring(0, 5000),
            image_urls: imgs,
            reshare_url: null,
            posted_at: '',
            comments_count: 0,
          });
        }
        return results;
      }, maxPosts - posts.length, scrollAttempts);

      // Debug: log what we found
      console.log(`[Scraper] [Puppeteer] Scroll ${scrollAttempts + 1}: raw ${newPosts.length} candidates`);

      // Deduplicate by postId
      for (const p of newPosts) {
        if (!posts.find(ex => ex.fb_post_id === p.fb_post_id && p.fb_post_id)) {
          posts.push(p);
        }
      }

      console.log(`[Scraper] [Puppeteer] Scroll ${scrollAttempts + 1}: ${newPosts.length} new, ${posts.length} unique total`);

      if (posts.length >= maxPosts) break;

      // Scroll down
      await page.evaluate(() => window.scrollBy(0, 1200));
      await sleep(3000 + randomInt(0, 2000));
      scrollAttempts++;
    }

    await browser.close();
    browser = null;

    if (posts.length > 0) {
      console.log(`[Scraper] [Puppeteer] ${posts.length} posts extraídos de "${groupName}"`);
      for (const p of posts.slice(0, 3)) {
        console.log(`  - ${p.author_name}: ${p.content.substring(0, 80)}`);
      }
    } else {
      console.warn(`[Scraper] [Puppeteer] 0 posts para "${groupName}"`);
    }

    return posts;
  } catch (err) {
    console.error(`[Scraper] [Puppeteer] Error: ${err.message}`);
    if (browser) await browser.close().catch(() => {});
    return [];
  }
}

// ==================== MAIN ====================

async function testMode() {
  console.log('[Scraper] Modo TEST (GraphQL + Puppeteer fallback)');

  const session = loadSession();
  if (!session || !session.cookies) {
    console.error('[Scraper] Sin sesión GraphQL. Ejecutá: node fb-graphql-scraper.js --login');
    return;
  }
  const cUser = session.cookies.find(c => c.name === 'c_user');
  const xs = session.cookies.find(c => c.name === 'xs');
  console.log(`[Scraper] Sesión: Cookies=${session.cookies.length}, c_user=${cUser ? cUser.value.substring(0, 8) + '...' : 'MISSING'}, xs=${xs ? 'present' : 'MISSING'}`);
  console.log(`[Scraper] Tokens saved: fb_dtsg=${session.fbDtsg ? 'ok' : 'will bootstrap'}, lsd=${session.lsd ? 'ok' : 'will bootstrap'}, rev=${session.rev || 'will bootstrap'}`);

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
    console.log(`  Descargando imágenes...`);
    const withBuffers = await downloadImagesAsBuffers(posts, session.cookies);
    const imgCount = withBuffers.filter(p => p.image_buffers && p.image_buffers.length > 0).length;
    console.log(`  ${imgCount}/${withBuffers.length} posts con imágenes`);
    console.log(`  Enviando al webhook...`);
    await sendPosts(withBuffers, groupName, group.id);
  } else {
    console.log('[Scraper] Revisá debug-graphql-response.json para ver qué devolvió Facebook');
  }
}

async function runDaemon() {
  console.log('[Scraper] Daemon GraphQL + Puppeteer fallback');
  remoteLog('info', 'Daemon GraphQL iniciado');

  await fetchConfig();

  const session = loadSession();
  if (!session || !session.cookies) {
    console.error('[Scraper] Sin sesión GraphQL. Ejecutá: node fb-graphql-scraper.js --login');
    return;
  }
  console.log(`[Scraper] Sesión cargada (tokens se refrescan por grupo)`);

  while (true) {
    console.log(`[Scraper] Iniciando ciclo de scraping...`);

    await warmUpBrowsing(session.cookies);

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
          const withBuffers = await downloadImagesAsBuffers(limited, session.cookies);
          console.log(`[Scraper] ${groupName}: ${limited.length} posts nuevos`);
          await sendPosts(withBuffers, groupName, group.id);
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

    await coolDownBrowsing(session.cookies);

    const sleepMinutes = INTERVAL_HOURS * 60 + randomInt(-45, 45);
    const IDLE_INTERVAL = randomInt(25, 45) * 60 * 1000;
    const idleSessions = Math.ceil((sleepMinutes * 60 * 1000) / IDLE_INTERVAL);
    console.log(`[Scraper] Durmiendo ~${sleepMinutes} min (${idleSessions} idle sessions)`);

    for (let i = 0; i < idleSessions; i++) {
      await sleep(IDLE_INTERVAL);
      try { await idleBrowsingSession(session.cookies); } catch {}
    }

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
