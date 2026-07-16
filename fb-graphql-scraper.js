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
const FALLBACK_DOC_IDS = [
  '26577462205242925',
  '25716860671307636',
];
const FALLBACK_DOC_ID = FALLBACK_DOC_IDS[0];
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
      'User-Agent': pickUA(),
      'Cookie': cookieStr,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

    const feedQueryPattern = /GroupsCometFeedRegularStoriesPaginationQuery[^}]*?"doc_id"\s*:\s*"?(\d{10,})"?/g;
    const feedMatches = [...html.matchAll(feedQueryPattern)];
    if (feedMatches.length > 0) {
      const id = feedMatches[0][1];
      console.log(`[Scraper] doc_id para feed encontrado: ${id}`);
      return id;
    }

    const feedQueryPattern2 = /"doc_id"\s*:\s*"?(\d{10,})"?[^}]*?GroupsCometFeedRegularStoriesPaginationQuery/g;
    const feedMatches2 = [...html.matchAll(feedQueryPattern2)];
    if (feedMatches2.length > 0) {
      const id = feedMatches2[0][1];
      console.log(`[Scraper] doc_id para feed encontrado (reversed): ${id}`);
      return id;
    }

    const feedQueryPattern3 = /GroupsCometFeedRegularStories[^"]*"[^}]*?doc_id[^}]*?(\d{15,})/g;
    const feedMatches3 = [...html.matchAll(feedQueryPattern3)];
    if (feedMatches3.length > 0) {
      const id = feedMatches3[0][1];
      console.log(`[Scraper] doc_id para feed encontrado (flex): ${id}`);
      return id;
    }

    const feedQueryPattern4 = /"doc_id"\s*:\s*(\d{15,})/g;
    const allDocIds = [...html.matchAll(feedQueryPattern4)].map(m => m[1]);
    if (allDocIds.length > 0) {
      console.log(`[Scraper] doc_ids encontrados en HTML: ${allDocIds.join(', ')}`);
      const groupIdPrefix = groupId.substring(0, 6);
      const match = allDocIds.find(id => id.startsWith(groupIdPrefix));
      if (match) {
        console.log(`[Scraper] doc_id seleccionado (por prefijo de grupo): ${match}`);
        return match;
      }
      console.log(`[Scraper] Usando primer doc_id encontrado: ${allDocIds[0]}`);
      return allDocIds[0];
    }

    console.warn('[Scraper] No se encontró ningún doc_id en HTML, guardando debug...');
    try {
      const debugHtml = path.join(__dirname, 'debug-group-page.html');
      fs.writeFileSync(debugHtml, html.substring(0, 200000));
      console.log(`[Scraper] HTML guardado en debug-group-page.html (${html.length} bytes)`);
    } catch (e) {}
    return FALLBACK_DOC_ID;
  } catch (err) {
    console.error('[Scraper] Error descubriendo doc_id:', err.message);
    return FALLBACK_DOC_ID;
  }
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
  params.append('__ccg', 'EXCELLENT');
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
  const media = att.media || att.style_type_renderer?.attachment?.media || att.styles?.attachment?.media || att.styles?.style_type_renderer?.attachment?.media;
  if (media?.__typename === 'Photo') {
    if (media.photo_image?.uri) imgs.push(media.photo_image.uri);
    else if (media.image?.uri) imgs.push(media.image.uri);
  }
  if (att.__typename === 'Photo') {
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

  const message = contentStory.message?.text || '';

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
    const as = node.attached_story;
    console.log('[Scraper] attached_story keys:', Object.keys(as));
    console.log('[Scraper] attached_story.comet_sections keys:', Object.keys(as.comet_sections || {}));

    console.log('[Scraper] OUTER node.comet_sections keys:', Object.keys(node.comet_sections || {}));
    const outerContent = node.comet_sections?.content?.story;
    if (outerContent) {
      console.log('[Scraper] OUTER content.story keys:', Object.keys(outerContent));
      console.log('[Scraper] OUTER content.story.attachments count:', (outerContent.attachments || []).length);
      const outerAttachedStory = outerContent.attached_story;
      if (outerAttachedStory) {
        console.log('[Scraper] OUTER content.story.attached_story keys:', Object.keys(outerAttachedStory));
        const oasFull = JSON.stringify(outerAttachedStory);
        console.log('[Scraper] outerAttachedStory size:', oasFull.length);
        const oasAtts = outerAttachedStory.attachments || outerAttachedStory.comet_sections?.content?.story?.attachments;
        console.log('[Scraper] outerAttachedStory attachments count:', (oasAtts || []).length);
        if (oasAtts?.[0]) {
          console.log('[Scraper] outerAttachedStory att[0] snippet:', JSON.stringify(oasAtts[0]).substring(0, 2000));
        }
        const oasFbcdn = [...oasFull.matchAll(/https?:\/\/[^"]*fbcdn[^"]*/g)];
        console.log('[Scraper] outerAttachedStory fbcdn URLs:', oasFbcdn.length);
        if (oasFbcdn.length > 0) {
          console.log('[Scraper] outerAttachedStory fbcdn[0]:', oasFbcdn[0][0].substring(0, 200));
        }
      }
      if (outerContent.message?.text) {
        console.log('[Scraper] OUTER content.story.message:', outerContent.message.text.substring(0, 200));
      }
      if (outerContent.wwwURL) console.log('[Scraper] OUTER content.story.wwwURL:', outerContent.wwwURL);
      if (outerContent.post_id) console.log('[Scraper] OUTER content.story.post_id:', outerContent.post_id);
    }
    console.log('[Scraper] OUTER node.attachments count:', (node.attachments || []).length);

    const outerMeta = node.comet_sections?.context_layout?.story?.comet_sections?.metadata;
    if (outerMeta) {
      for (const m of outerMeta) {
        if (m.story?.url) console.log('[Scraper] metadata URL:', m.story.url);
        if (m.story?.creation_time) console.log('[Scraper] metadata creation_time:', m.story.creation_time);
      }
    }

    const attachedMeta = as.comet_sections?.context_layout?.story?.comet_sections?.metadata;
    if (attachedMeta) {
      for (const m of attachedMeta) {
        if (m.story?.url) console.log('[Scraper] attached_story URL:', m.story.url);
      }
    }
    if (as.permalink_url) console.log('[Scraper] attached_story permalink_url:', as.permalink_url);
  }

  const images = [];
  const attSources = [
    node.attachments,
    node.attached_story?.attachments,
    node.attached_story?.comet_sections?.content?.story?.attachments,
    node.comet_sections?.content?.story?.attachments,
    node.comet_sections?.content?.story?.attached_story?.attachments,
  ];
  for (const attList of attSources) {
    if (!attList || images.length > 0) continue;
    for (const att of attList) {
      const fromAtt = extractImagesFromAttachment(att);
      images.push(...fromAtt);
      if (images.length > 0) break;
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
    const debugFile = path.join(__dirname, 'debug-attachments.json');
    try {
      const existing = fs.existsSync(debugFile) ? JSON.parse(fs.readFileSync(debugFile, 'utf-8')) : [];
      existing.push({ postId, attachedStory: !!node.attached_story, nodeAttachments: (node.attachments || []).length });
      fs.writeFileSync(debugFile, JSON.stringify(existing.slice(-10), null, 2));
      console.log(`[Scraper] Post ${postId}: 0 images (attached_story=${!!node.attached_story})`);
    } catch (e) {}
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

  let docId = await discoverDocId(session.cookies, groupId);

  const tokens = await bootstrapSession(session.cookies, groupId);
  if (!tokens.fbDtsg) {
    console.error('[Scraper] No se pudo obtener fb_dtsg del bootstrap');
    return [];
  }
  console.log(`[Scraper] Bootstrap OK: fb_dtsg=${tokens.fbDtsg.substring(0, 10)}..., lsd=${tokens.lsd ? 'ok' : 'MISSING'}, rev=${tokens.rev || 'MISSING'}`);

  const docIdCandidates = [docId, ...FALLBACK_DOC_IDS.filter(id => id !== docId)];

  for (const candidateDocId of docIdCandidates) {
    docId = candidateDocId;
    console.log(`[Scraper] Intentando doc_id: ${docId}`);
    allPosts = [];
    cursor = null;
    pageNum = 1;
    let gotPosts = false;

    while (allPosts.length < maxPosts && pageNum <= maxPages) {
      console.log(`[Scraper] ${groupName} - GraphQL page ${pageNum}...`);

      const payload = buildPayload(groupId, cursor, 8, userId, tokens, docId);

      let resp = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          resp = await axios.post(GRAPHQL_URL, payload, {
            headers: {
              'User-Agent': pickUA(),
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
          console.error(`[Scraper] Intento ${attempt}/3 falló: ${err.message}`);
          if (attempt < 3) await sleep(attempt * 3000);
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
      console.log(`[Scraper] doc_id ${docId} devolvió ${allPosts.length} posts, usando este.`);
      break;
    }
    console.warn(`[Scraper] doc_id ${docId} devolvió 0 posts, probando siguiente...`);
    await sleep(2000);
  }

  return allPosts.slice(0, maxPosts);
}

// ==================== IMAGE DOWNLOAD ====================

async function fetchReshareOgImage(reshareUrl, cookies) {
  const cookieStr = cookiesToHeader(cookies);
  try {
    const resp = await axios.get(reshareUrl, {
      headers: {
        'User-Agent': pickUA(),
        'Cookie': cookieStr,
        'Accept': 'text/html',
        'Sec-Fetch-Mode': 'navigate',
      },
      timeout: 15000,
      maxRedirects: 5,
    });
    const html = typeof resp.data === 'string' ? resp.data : '';
    const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)
      || html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/i);
    if (ogMatch && ogMatch[1]) {
      const url = ogMatch[1].replace(/&amp;/g, '&');
      console.log(`[Scraper] Reshare og:image: ${url.substring(0, 100)}`);
      return url;
    }
    const fbImageMatch = html.match(/"image_src"\s*:\s*"([^"]+fbcdn[^"]+)"/);
    if (fbImageMatch && fbImageMatch[1]) {
      const url = fbImageMatch[1].replace(/\\u0025/g, '%');
      console.log(`[Scraper] Reshare image_src: ${url.substring(0, 100)}`);
      return url;
    }
    console.log(`[Scraper] No og:image found for reshare: ${reshareUrl}`);
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
      const ogUrl = await fetchReshareOgImage(post.reshare_url, cookies);
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
            'User-Agent': pickUA(),
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

// ==================== MAIN ====================

async function testMode() {
  console.log('[Scraper] Modo TEST (GraphQL, sin Chromium)');

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
  console.log('[Scraper] Daemon GraphQL (sin Chromium)');
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
