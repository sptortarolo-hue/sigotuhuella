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
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/data/data/com.termux/files/usr/bin/chromium-browser';
const PROFILE_DIR = process.env.FB_SCRAPER_PROFILE_DIR || path.join(__dirname, 'fb_scraper_profile');
const SEEN_PATH = path.join(__dirname, 'fb_scraper_seen.json');
const SESSION_PATH = path.join(PROFILE_DIR, 'graphql-session.json');

let INTERVAL_HOURS = parseInt(process.env.FB_SCRAPER_INTERVAL || '4');
let MAX_POSTS_PER_GROUP = parseInt(process.env.FB_SCRAPER_MAX_POSTS || '20');

const GRAPHQL_URL = 'https://www.facebook.com/api/graphql/';
const HARDCODED_DOC_IDS = [
  '25716860671307636',
  '26577462205242925',
];
const DEBUG_PATH = path.join(__dirname, 'debug-graphql-response.json');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
];

function pickUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function realHeaders() {
  return {
    'User-Agent': pickUA(),
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
}

function remoteLog(level, message) {
  axios.post(`${API_BASE}/facebook/scraper-log`, { level, message, ts: new Date().toISOString() }, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 10000,
  }).catch(() => {});
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    const clicks = [];
    const selectors = [
      'div[aria-label="Close"]', 'div[aria-label="Cerrar"]',
      'button[aria-label="Close"]', 'button[aria-label="Cerrar"]',
      '[data-cookiebanner="accept_button"]',
      'div[role="dialog"] button:first-child',
      'div[role="dialog"] div[role="button"]',
      'div[aria-label="Accept all"]', 'div[aria-label="Aceptar todo"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { try { el.click(); } catch {} }
    }
    document.querySelectorAll('div[role="dialog"]').forEach(d => d.remove());
  });
  await sleep(1000);
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

  const resp = await axios.get('https://www.facebook.com/groups/', {
    headers: {
      ...realHeaders(),
      'Cookie': cookieStr,
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

  console.error('[Scraper] No se pudo extraer fb_dtsg del HTML');
  return null;
}

// ==================== COOKIE HELPERS ====================

function cookiesToHeader(cookies) {
  return cookies
    .filter(c => c.domain && (c.domain.includes('facebook.com') || c.domain.includes('.facebook.com')))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

// ==================== LOGIN (ONE TIME) ====================

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
    const html = document.documentElement.innerHTML;
    const patterns = [
      /\\"fb_dtsg\\":\{\\"token\\":\\"([^"\\]+)\\"/,
      /"fb_dtsg":"([^"]+)"/,
      /DTSGInitialData.*?"token":"([^"]+)"/,
    ];
    for (const p of patterns) { const m = html.match(p); if (m && m[1]) return m[1]; }
    return null;
  });

  saveSession({ cookies, fbDtsg, savedAt: new Date().toISOString() });
  console.log(`[Scraper] Sesión guardada. Cookies: ${cookies.length}, fb_dtsg: ${fbDtsg ? 'ok' : 'FALLO'}`);

  await browser.close();
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
  params.append('__user', userId || '0');
  params.append('__a', '1');
  params.append('dpr', '2');
  params.append('fb_dtsg', fbDtsg || '');
  params.append('fb_api_caller_class', 'RelayModern');
  params.append('fb_api_req_friendly_name', 'GroupsCometFeedRegularStoriesPaginationQuery');
  params.append('variables', JSON.stringify(variables));
  params.append('doc_id', docId);

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

// ==================== GRAPHQL SCRAPE (RAPIDO) ====================

async function scrapeGroupGraphQL(session, groupId, groupName, maxPosts) {
  const cookieStr = cookiesToHeader(session.cookies);
  const userId = session.cookies.find(c => c.name === 'c_user')?.value || '0';

  const fbDtsg = session.fbDtsg || await extractFbDtsg(session.cookies);
  if (!fbDtsg) {
    console.error('[Scraper] No se pudo obtener fb_dtsg');
    return [];
  }

  const docId = HARDCODED_DOC_IDS[0];
  console.log(`[Scraper] ${groupName} - GraphQL con doc_id=${docId}...`);

  let allPosts = [];
  let cursor = null;
  let pageNum = 1;
  const maxPages = 3;

  while (allPosts.length < maxPosts && pageNum <= maxPages) {
    const payload = buildPayload(groupId, cursor, 8, userId, fbDtsg, docId);

    try {
      const resp = await axios.post(GRAPHQL_URL, payload, {
        headers: {
          ...realHeaders(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieStr,
          'Origin': 'https://www.facebook.com',
          'Referer': `https://www.facebook.com/groups/${groupId}/`,
        },
        timeout: 30000,
      });

      if (resp.status !== 200) {
        console.error(`[Scraper] GraphQL returned ${resp.status}`);
        break;
      }

      const rawText = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
      const blocks = parseFbResponse(rawText);

      if (!blocks || blocks.length === 0) {
        console.log(`[Scraper] ${groupName}: sin datos en page ${pageNum}`);
        break;
      }

      const posts = extractPostsFromResponse(blocks);
      console.log(`[Scraper] ${groupName}: ${posts.length} posts en page ${pageNum}`);

      if (posts.length === 0) break;

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
      await sleep(randomInt(2000, 4000));
    } catch (err) {
      console.error(`[Scraper] GraphQL error: ${err.message}`);
      break;
    }
  }

  return allPosts.slice(0, maxPosts);
}

// ==================== PUPPETEER DOM SCRAPING (PRINCIPAL) ====================

async function scrapeGroupPuppeteer(groupId, groupName, maxPosts, cookies) {
  console.log(`[Scraper] [Puppeteer] Scrapeando "${groupName}" (${groupId}) via DOM...`);
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setDefaultNavigationTimeout(90000);
    await page.setUserAgent(pickUA());

    const fbCookies = (cookies || []).filter(c => c.domain?.includes('facebook'));
    if (fbCookies.length > 0) {
      await page.setCookie(...fbCookies.map(c => ({
        name: c.name, value: c.value, domain: c.domain || '.facebook.com',
        path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly
      })));
    }

    await page.goto(`https://www.facebook.com/groups/${groupId}/`, { waitUntil: 'networkidle2', timeout: 90000 });
    console.log(`[Scraper] [Puppeteer] URL after goto: ${page.url()}`);

    await dismissOverlays(page);
    await sleep(4000);

    await page.waitForFunction(() => {
      return document.querySelector('[role="feed"]') ||
             document.querySelector('[data-pagelet="GroupFeed"]') ||
             document.querySelector('[data-pagelet="Feed"]');
    }, { timeout: 20000 });
    console.log('[Scraper] [Puppeteer] Feed container detected');

    if (process.env.DEBUG_SCREENSHOT) {
      await page.screenshot({ path: `debug-group-${groupId}.png`, fullPage: true });
      console.log(`[Scraper] [Puppeteer] Debug screenshot saved: debug-group-${groupId}.png`);
    }

    const UI_TEXTS = new Set(['Seguir', 'Follow', 'Invitar', 'Invite', 'Compartir', 'Share', 'Más', 'More', 'Like', 'Comment', 'Me gusta', 'Comentar', 'Reaccionar', 'React', 'Enviar', 'Send', 'Reply', 'Responder', 'Miembro', 'Member']);

    const posts = [];
    let scrollAttempts = 0;
    const maxScrolls = 12;

    while (posts.length < maxPosts && scrollAttempts < maxScrolls) {
      const currentCount = posts.length;

      await page.evaluate(() => {
        document.querySelectorAll('div[role="button"]').forEach(btn => {
          const text = (btn.textContent || '').trim().toLowerCase();
          if (text === 'see more' || text === 'ver más' || text.startsWith('see more') || text.startsWith('ver más')) {
            try { btn.click(); } catch {}
          }
        });
      });
      await sleep(1500);

      const newPosts = await page.evaluate((maxToCollect, scrollNum, uiTextsArr) => {
        const uiTexts = new Set(uiTextsArr);
        const results = [];

        const feed = document.querySelector('[role="feed"]') ||
                     document.querySelector('[data-pagelet="GroupFeed"]') ||
                     document.querySelector('[data-pagelet="Feed"]');

        let candidates = [];
        if (feed && feed.children.length > 0) {
          for (const child of feed.children) {
            const text = (child.textContent || '').trim();
            const cls = (child.className || '').toLowerCase();
            if (text.length < 50) continue;
            if (cls.includes('sponsor') || cls.includes('suggested') || text.includes('Sponsored') || text.includes('Publicidad')) continue;
            candidates.push(child);
          }
        }

        if (candidates.length === 0) {
          candidates.push(...document.querySelectorAll('[role="article"]'));
        }

        if (candidates.length === 0) {
          const allDivs = document.querySelectorAll('div[style*="transform"]');
          for (const div of allDivs) {
            const t = (div.textContent || '').trim();
            if (t.length > 100) candidates.push(div);
          }
        }

        for (const el of candidates) {
          if (results.length >= maxToCollect) break;
          const fullText = el.textContent || '';
          if (fullText.length < 30) continue;

          const link = el.querySelector('a[href*="/posts/"], a[href*="?story_fbid="]');
          const permalink = link ? link.getAttribute('href') : '';
          const postId = (permalink.match(/\/posts\/(\d+)/) || [])[1]
            || (permalink.match(/story_fbid=(\d+)/) || [])[1]
            || '';

          let authorName = 'Unknown';

          const h4 = el.querySelector('h4, h4 span, h4 a');
          if (h4) {
            const t = (h4.textContent || '').trim();
            if (t.length > 0 && t.length < 50) authorName = t;
          }

          if (authorName === 'Unknown') {
            for (const a of el.querySelectorAll('a[role="link"]')) {
              const t = (a.textContent || '').trim();
              if (t.length > 2 && t.length < 50 && !uiTexts.has(t)) { authorName = t; break; }
            }
          }

          if (authorName === 'Unknown') {
            const imgs = el.querySelectorAll('img[alt]:not([alt=""])');
            for (const img of imgs) {
              const alt = (img.getAttribute('alt') || '').trim();
              if (alt.length > 2 && alt.length < 50 && !alt.includes('profile')) { authorName = alt; break; }
            }
          }

          if (authorName === 'Unknown') {
            const strongInLink = el.querySelector('a strong, strong a, a[role="link"] strong');
            if (strongInLink) {
              const t = (strongInLink.textContent || '').trim();
              if (t.length > 0 && t.length < 50) authorName = t;
            }
          }

          if (authorName === 'Unknown') {
            for (const a of el.querySelectorAll('a[href*="/user/"], a[href*="/profile/"], a[href*="?__tn"]')) {
              const t = (a.textContent || '').trim();
              if (t.length > 2 && t.length < 50 && !uiTexts.has(t)) { authorName = t; break; }
            }
          }

          if (authorName === 'Unknown') {
            const allLinks = el.querySelectorAll('a');
            for (const a of allLinks) {
              const t = (a.textContent || '').trim();
              if (t.length > 2 && t.length < 50 && !uiTexts.has(t)) { authorName = t; break; }
            }
          }

          if (authorName === 'Unknown') {
            const strong = el.querySelector('strong');
            if (strong) {
              const t = (strong.textContent || '').trim();
              if (t.length > 2 && t.length < 50) authorName = t;
            }
          }

          if (authorName === 'Unknown') {
            const firstImg = el.querySelector('img[alt]:not([alt=""])');
            if (firstImg) {
              const alt = firstImg.getAttribute('alt') || '';
              if (alt.length > 2 && alt.length < 60) authorName = alt;
            }
          }

          let content = '';
          const dirDivs = el.querySelectorAll('div[dir="auto"]');
          const contentParts = [];
          for (const dd of dirDivs) {
            const t = (dd.textContent || '').trim();
            if (t.length >= 10 && t !== authorName && !uiTexts.has(t)) contentParts.push(t);
          }
          content = contentParts.slice(0, 3).join('\n');

          if (!content || content.length < 5) {
            const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
            const filtered = lines.filter(l => {
              if (l === authorName || l.length < 10) return false;
              if (uiTexts.has(l) || /^\d+$/.test(l)) return false;
              return true;
            });
            content = filtered.slice(0, 3).join('\n');
          }

          const images = [];
          const imgEls = el.querySelectorAll('img');
          for (const img of imgEls) {
            const src = img.getAttribute('src') || '';
            const cls = img.getAttribute('class') || '';
            if (cls.includes('profile') || cls.includes('avatar') || cls.includes('emoji')) continue;
            if (src.includes('rsrc.php') || src.includes('p40x40') || src.includes('p50x50') || src.includes('badge')) continue;
            if ((src.includes('scontent') || src.includes('fbcdn')) && !images.includes(src)) {
              images.push(src);
            }
          }

          if (content.length < 5 && images.length === 0) continue;
          if (postId && postId.length < 10 && !postId.includes('_')) continue;

          results.push({
            fb_post_id: postId || `${groupId}_dom_${scrollNum}_${results.length}`,
            fb_post_url: permalink ? `https://www.facebook.com${permalink}` : '',
            author_name: authorName,
            content: content.substring(0, 5000),
            image_urls: images,
            reshare_url: null,
            posted_at: '',
            comments_count: 0,
          });
        }
        return results;
      }, maxPosts - posts.length, scrollAttempts, [...UI_TEXTS]);

      console.log(`[Scraper] [Puppeteer] Scroll ${scrollAttempts + 1}: ${newPosts.length} candidates`);

      for (const p of newPosts) {
        if (!posts.find(ex => ex.fb_post_id === p.fb_post_id && p.fb_post_id)) {
          posts.push(p);
        }
      }

      console.log(`[Scraper] [Puppeteer] Scroll ${scrollAttempts + 1}: ${newPosts.length} new, ${posts.length} unique`);

      if (posts.length >= maxPosts) break;

      await page.evaluate(() => { window.scrollBy(0, window.innerHeight * 1.5); });
      await sleep(2000);
      await page.keyboard.press('PageDown');
      await sleep(2000);

      try {
        await page.waitForFunction((prevCount) => {
          const feed = document.querySelector('[role="feed"], [data-pagelet="GroupFeed"], [data-pagelet="Feed"]');
          if (!feed) return false;
          return feed.querySelectorAll(':scope > div').length > prevCount;
        }, { timeout: 10000 }, currentCount);
      } catch {}

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
        return url;
      }
    }

    const photoIdPatterns = [
      /"photo_id"\s*:\s*"?(\d{10,})"?/g,
      /"fbid"\s*:\s*"?(\d{10,})"?/g,
    ];
    for (const pat of photoIdPatterns) {
      const matches = [...html.matchAll(pat)];
      for (const m of matches) {
        const id = m[1];
        if (cUserId && id.startsWith(cUserId.substring(0, 7))) continue;
        if (id.length < 10 || id.length > 20) continue;
        return `https://www.facebook.com/photo/?fbid=${id}`;
      }
    }

    const allFbcdnUrls = [...html.matchAll(/https?:\/\/scontent[^"'\s\\]+\.(?:jpg|png|webp)(?:\?[^"'\s\\]*)?/gi)];
    if (allFbcdnUrls.length > 0) {
      const goodUrls = allFbcdnUrls
        .map(m => m[0].replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/&amp;/g, '&'))
        .filter(url => !BAD_URL_PATTERNS.some(p => url.includes(p)));
      if (goodUrls.length > 0) return goodUrls[0];
    }

    return null;
  } catch (e) {
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

// ==================== MAIN ====================

async function testMode() {
  console.log('[Scraper] Modo TEST (Puppeteer DOM)');

  const session = loadSession();
  if (!session || !session.cookies) {
    console.error('[Scraper] Sin sesión. Ejecutá: node fb-graphql-scraper.js --login');
    return;
  }
  const cUser = session.cookies.find(c => c.name === 'c_user');
  const xs = session.cookies.find(c => c.name === 'xs');
  console.log(`[Scraper] Sesión: Cookies=${session.cookies.length}, c_user=${cUser ? cUser.value.substring(0, 8) + '...' : 'MISSING'}, xs=${xs ? 'present' : 'MISSING'}`);

  const groups = await getActiveGroups();
  if (groups.length === 0) {
    console.error('[Scraper] No hay grupos activos');
    return;
  }

  const group = groups[0];
  const groupId = group.fb_group_id || group.url?.match(/groups\/(\d+)/)?.[1];
  const groupName = group.name || groupId;
  console.log(`[Scraper] Test: scrapeando "${groupName}" (${groupId})`);

  const posts = await scrapeGroupPuppeteer(groupId, groupName, 5, session.cookies);
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
  }
}

async function runDaemon() {
  console.log('[Scraper] Daemon iniciado — Puppeteer DOM + GraphQL rápido');
  remoteLog('info', 'Daemon iniciado');

  await fetchConfig();

  const session = loadSession();
  if (!session || !session.cookies) {
    console.error('[Scraper] Sin sesión. Ejecutá: node fb-graphql-scraper.js --login');
    return;
  }
  console.log(`[Scraper] Sesión cargada. Cookies: ${session.cookies.length}`);

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

        // Primero GraphQL (rápido), si da 0 posts -> Puppeteer DOM
        let posts = await scrapeGroupGraphQL(session, groupId, groupName, MAX_POSTS_PER_GROUP);
        if (posts.length === 0) {
          console.log(`[Scraper] GraphQL sin posts, usando Puppeteer DOM...`);
          posts = await scrapeGroupPuppeteer(groupId, groupName, MAX_POSTS_PER_GROUP, session.cookies);
        }

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

    const sleepMinutes = INTERVAL_HOURS * 60 + randomInt(-45, 45);
    console.log(`[Scraper] Durmiendo ~${sleepMinutes} min`);
    await sleep(sleepMinutes * 60 * 1000);

    await fetchConfig();
  }
}

// ==================== DEBUG PAGE MODE ====================

async function debugPageMode() {
  console.log('[Scraper] Modo DEBUG — capturando estructura del feed');
  const session = loadSession();
  if (!session || !session.cookies) {
    console.error('[Scraper] Sin sesión. Ejecutá: node fb-graphql-scraper.js --login');
    return;
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  await page.setUserAgent(pickUA());

  const fbCookies = (session.cookies || []).filter(c => c.domain?.includes('facebook'));
  if (fbCookies.length > 0) {
    await page.setCookie(...fbCookies.map(c => ({
      name: c.name, value: c.value, domain: c.domain || '.facebook.com',
      path: c.path || '/', secure: !!c.secure, httpOnly: !!c.httpOnly
    })));
  }

  const groups = await getActiveGroups();
  if (groups.length === 0) {
    console.error('[Scraper] No hay grupos activos');
    await browser.close();
    return;
  }

  const group = groups[0];
  const groupId = group.fb_group_id || group.url?.match(/groups\/(\d+)/)?.[1];

  await page.goto(`https://www.facebook.com/groups/${groupId}/`, { waitUntil: 'networkidle2', timeout: 90000 });
  await dismissOverlays(page);
  await sleep(5000);

  await page.screenshot({ path: 'debug-feed.png', fullPage: false });
  console.log('[Debug] Screenshot guardado: debug-feed.png');

  const structure = await page.evaluate(() => {
    const r = {};
    r.url = window.location.href;
    r.title = document.title;
    r.dialogs = document.querySelectorAll('div[role="dialog"]').length;
    r.cookieBanner = !!document.querySelector('[data-cookiebanner]');
    r.feed = !!document.querySelector('[role="feed"]');
    r.articles = document.querySelectorAll('[role="article"]').length;
    r.dataPageletFeed = !!document.querySelector('[data-pagelet="Feed"]');
    r.dataPageletGroupFeed = !!document.querySelector('[data-pagelet="GroupFeed"]');
    r.dataPagelet = [...document.querySelectorAll('[data-pagelet]')].map(e => e.getAttribute('data-pagelet'));
    r.main = !!document.querySelector('[role="main"]');
    const feed = document.querySelector('[role="feed"]');
    if (feed) {
      r.feedTag = feed.tagName;
      r.feedChildCount = feed.children.length;
      r.feedFirstChild = feed.children[0] ? { tag: feed.children[0].tagName, cls: (feed.children[0].className || '').substring(0, 200), role: feed.children[0].getAttribute('role') } : null;
      r.feedHTML = feed.innerHTML.substring(0, 8000);
    }
    return r;
  });

  fs.writeFileSync('debug-feed-structure.json', JSON.stringify(structure, null, 2));
  console.log('[Debug] Estructura guardada: debug-feed-structure.json');
  console.log(JSON.stringify(structure, null, 2));

  const feedChildren = await page.evaluate(() => {
    const feed = document.querySelector('[role="feed"]');
    if (!feed || feed.children.length === 0) return [];
    return Array.from(feed.children).map((c, i) => ({
      i, tag: c.tagName, cls: (c.className || '').substring(0, 120),
      role: c.getAttribute('role'), len: (c.textContent || '').length,
      hasPostLink: !!c.querySelector('a[href*="/posts/"]'),
      text: (c.textContent || '').replace(/\s+/g, ' ').substring(0, 300),
    })).filter(c => c.len > 20);
  });

  fs.writeFileSync('debug-feed-children.json', JSON.stringify(feedChildren, null, 2));
  console.log(`[Debug] ${feedChildren.length} children en feed`);
  if (feedChildren.length > 0) {
    for (const ch of feedChildren.slice(0, 5)) {
      console.log(`  #${ch.i} <${ch.tag}> role="${ch.role}" len=${ch.len} hasPostLink=${ch.hasPostLink}`);
      console.log(`    text: ${ch.text.substring(0, 120)}`);
    }
  }

  await browser.close();
  console.log('[Debug] Modo DEBUG completado.');
}

// ==================== ENTRY POINT ====================

const args = process.argv.slice(2);

if (args.includes('--login')) {
  await doLogin();
} else if (args.includes('--test')) {
  await testMode();
} else if (args.includes('--debug-page')) {
  await debugPageMode();
} else {
  try { execSync('termux-wake-lock', { stdio: 'pipe' }); } catch {}
  await runDaemon();
}