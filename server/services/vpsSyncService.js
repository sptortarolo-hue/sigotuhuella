import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import pool from '../db.js';
import { classifyPost } from './geminiClassifier.js';
import { matchPostToPet, detectReunion } from './geminiMatching.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VPS_HOST = process.env.VPS_HOST || 'http://138.36.236.69:3001';
const COOKIES_PATH = join(__dirname, '..', '..', 'external', 'scraper', 'cookies.txt');
let lastSync = null;
let geminiTodayCount = 0;
let geminiTodayDate = new Date().toDateString();

export async function pushConfig() {
  try {
    const groupsRes = await pool.query(
      "SELECT name, url FROM facebook_groups WHERE is_active = true"
    );
    const settingsRes = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('fb_scraper_interval_hours', 'fb_scraper_max_posts')"
    );
    const s = {};
    settingsRes.rows.forEach(r => (s[r.key] = r.value));
    let cookies_txt = '';
    try {
      if (existsSync(COOKIES_PATH)) {
        cookies_txt = readFileSync(COOKIES_PATH, 'utf-8');
      }
    } catch {}
    const body = {
      groups: groupsRes.rows,
      scrape_interval_hours: parseInt(s.fb_scraper_interval_hours, 10) || 6,
      max_posts_per_group: parseInt(s.fb_scraper_max_posts, 10) || 50,
      cookies_txt,
    };
    const resp = await fetch(`${VPS_HOST}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.ok) console.log(`Config pushed to VPS: ${groupsRes.rows.length} groups${cookies_txt ? ` + cookies (${cookies_txt.length}B)` : ''}`);
  } catch (err) {
    console.error('Error pushing config to VPS:', err.message);
  }
}

export async function syncFromVps() {
  const since = lastSync || new Date(0).toISOString();
  const url = `${VPS_HOST}/sync?since=${encodeURIComponent(since)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`VPS sync HTTP ${resp.status}: ${resp.statusText}`);
      return { error: `HTTP ${resp.status}` };
    }
    const data = await resp.json();
    if (!data.posts || data.posts.length === 0) return { newPosts: 0 };

    let inserted = 0;
    for (const post of data.posts) {
      try {
        if (!post.fb_post_id) continue;

        let classification = { classification: 'unknown', species: null, color: null, location_hint: null, phone: null, location_lat: null, location_lng: null, comments: [] };
        const today = new Date().toDateString();
        if (today !== geminiTodayDate) { geminiTodayDate = today; geminiTodayCount = 0; }
        if (geminiTodayCount < 1000) {
          geminiTodayCount++;
          try {
            classification = await classifyPost(post.content || '', post.image_urls || [], post.comments || []);
          } catch (err) {
            console.error('Classification error:', err.message);
          }
        } else {
          console.log(`syncFromVps: skipping Gemini (${geminiTodayCount}/1000 daily limit)`);
        }

        const postResult = await pool.query(
          `INSERT INTO facebook_posts
             (group_id, fb_post_id, fb_post_url, author_name, content, image_urls, posted_at,
              classification, species, color, location_hint, phone, latitude, longitude)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (fb_post_id) DO UPDATE SET
             content = EXCLUDED.content,
             image_urls = EXCLUDED.image_urls,
             author_name = EXCLUDED.author_name,
             scraped_at = NOW()
           RETURNING id`,
          [
            post.group_id || null, post.fb_post_id, post.fb_post_url || null,
            post.author_name || null, post.content || '', post.image_urls || [],
            post.posted_at ? new Date(post.posted_at) : null,
            classification.classification, classification.species, classification.color,
            classification.location_hint, classification.phone,
            classification.location_lat, classification.location_lng,
          ]
        );

        const postId = postResult.rows[0]?.id;

        if (postId && post.comments && post.comments.length > 0) {
          for (const cmt of post.comments.slice(0, 20)) {
            const cmtClass = classification.comments?.find(c => c.text === cmt.text)?.classification || 'info';
            await pool.query(
              `INSERT INTO facebook_comments (post_id, fb_comment_id, author_name, text, posted_at, classification)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (post_id, fb_comment_id) DO NOTHING`,
              [postId, cmt.id || null, cmt.author_name || cmt.author || null, cmt.text || '',
               cmt.posted_at || cmt.timestamp ? new Date(cmt.posted_at || cmt.timestamp) : null, cmtClass]
            );
          }
        }

        // Keyword-based resolution detection (no Gemini cost)
        if (postId && (classification.classification === 'lost' || classification.classification === 'found' || classification.classification === 'sighted')) {
          detectReunion(postId).catch(err => console.error('Resolution check error:', err));
        }

        if (postId && (classification.classification === 'found' || classification.classification === 'lost')) {
          const matchedCheck = await pool.query('SELECT is_matched FROM facebook_posts WHERE id = $1', [postId]);
          if (matchedCheck.rows.length > 0 && !matchedCheck.rows[0].is_matched) {
            matchPostToPet(postId).catch(err => console.error('Auto-matching error:', err));
          }
        }

        inserted++;
      } catch (err) {
        console.error('Error processing post from VPS:', err.message);
      }
    }

    lastSync = new Date().toISOString();
    console.log(`VPS sync: ${inserted} new/updated posts`);
    return { newPosts: inserted };
  } catch (err) {
    console.error('VPS sync error:', err);
    return { error: err.message };
  }
}

function extractIdsFromUrl(url) {
  url = url.replace(/\/+$/, '');
  let m = url.match(/\/groups\/(\d+)\/posts\/(\d+)/);
  if (m) return { postId: m[2], groupId: m[1] };
  m = url.match(/\/posts\/(\d+)/);
  if (m) return { postId: m[1] };
  m = url.match(/\/videos\/(\d+)/);
  if (m) return { postId: m[1] };
  m = url.match(/story_fbid=(\d+).*?id=(\d+)/);
  if (m) return { postId: m[1], groupId: m[2] };
  m = url.match(/fbid=(\d+)/);
  if (m) return { postId: m[1] };
  m = url.match(/\/share\/p\/([^/?]+)/);
  if (m) return { postId: m[1] };
  m = url.match(/\/share\/r\/([^/?]+)/);
  if (m) return { postId: m[1] };
  m = url.match(/\/share\/v\/([^/?]+)/);
  if (m) return { postId: m[1] };
  const segments = url.split('/');
  const last = segments[segments.length - 1];
  if (/^[\w-]+$/.test(last) && last.length > 5) return { postId: last };
  return null;
}

async function fetchGraphApiData(postId, groupId, token, url) {
  const GRAPH_API = 'https://graph.facebook.com/v22.0';
  const fields = 'message,full_picture,permalink_url,created_time,from{id,name},comments.limit(20){message,from{name},created_time}';

  const variants = groupId ? [`${groupId}_${postId}`, postId] : [postId];
  let lastErr = null;

  for (const id of variants) {
    const resp = await fetch(
      `${GRAPH_API}/${id}?fields=${encodeURIComponent(fields)}&access_token=${token}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (resp.ok) {
      const data = await resp.json();
      return {
        fb_post_id: data.id || postId,
        fb_post_url: data.permalink_url || url,
        author_name: data.from?.name || '',
        content: data.message || '',
        image_urls: data.full_picture ? [data.full_picture] : [],
        posted_at: data.created_time || '',
        comments: (data.comments?.data || []).map(c => ({
          id: c.id,
          author_name: c.from?.name || '',
          text: c.message || '',
          posted_at: c.created_time || '',
        })),
      };
    }
    const err = await resp.json();
    lastErr = err.error?.message || JSON.stringify(err);
  }
  throw new Error(`Graph API error: ${lastErr}`);
}

async function getAppToken() {
  const id = process.env.FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!id || !secret) return null;
  return `${id}|${secret}`;
}

function generateEmbedHtml(url) {
  const encoded = encodeURIComponent(url);
  return `<iframe src="https://www.facebook.com/plugins/post.php?href=${encoded}&show_text=true&width=500&height=458" width="500" height="458" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>`;
}

async function fetchFbPostOG(url) {
  console.log(`fetchFbPostOG: fetching ${url.slice(0, 100)}`);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  });
  console.log(`fetchFbPostOG: HTTP ${resp.status}, final URL: ${resp.url.slice(0, 100)}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const html = await resp.text();
  console.log(`fetchFbPostOG: HTML length=${html.length}`);
  const ogDescription = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1]
    || html.match(/<meta\s+content="([^"]+)"\s+property="og:description"/i)?.[1] || '';
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1]
    || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i)?.[1] || '';
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1]
    || html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i)?.[1] || '';
  console.log(`fetchFbPostOG: ogDescription=${ogDescription.slice(0, 120)}, ogImage=${!!ogImage}, ogTitle=${ogTitle.slice(0, 80)}`);
  return { content: ogDescription || ogTitle, image_url: ogImage };
}

async function fetchOembedViaGraph(url, token) {
  const GRAPH_API = 'https://graph.facebook.com/v22.0';
  const resp = await fetch(
    `${GRAPH_API}/oembed_post?url=${encodeURIComponent(url)}&access_token=${token}&fields=author_name,title,description,thumbnail_url,html`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`oEmbed error: ${err.error?.message || JSON.stringify(err)}`);
  }
  return await resp.json();
}

async function fetchFbPostBrightData(url, apiKey) {
  const resp = await fetch(
    'https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_lyclm1571iy3mv57zw&format=json&include_errors=true',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: [{ url }] }),
      signal: AbortSignal.timeout(60000),
    }
  );
  if (resp.status === 202) {
    const body = await resp.text();
    console.error(`fetchFbPostBrightData: Got 202 (timeout), body: ${body.slice(0, 500)}`);
    throw new Error(`Bright Data: synchronous scrape timed out (202)`);
  }
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Bright Data API error (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  console.log(`fetchFbPostBrightData: response type=${typeof data}, isArray=${Array.isArray(data)}, length=${Array.isArray(data) ? data.length : 'N/A'}`);
  if (Array.isArray(data) && data.length > 0) {
    const record = data[0];
    if (record._error || record.error) {
      console.error(`fetchFbPostBrightData: error record:`, JSON.stringify(record).slice(0, 500));
      throw new Error(`Bright Data: ${record.error || record._error || 'unknown error'}`);
    }
    const content = record.content || record.text || record.message || record.body || '';
    const image_urls = (record.attachments || [])
      .filter(a => {
        const t = (a.type || '').toLowerCase();
        return t === 'photo' || t === 'image' || !!a.attachment_url;
      })
      .map(a => a.attachment_url || a.url || '')
      .filter(Boolean);
    console.log(`fetchFbPostBrightData: SUCCESS content_length=${content.length}, image_urls=${image_urls.length}`);
    if (content.length > 0) {
      console.log(`fetchFbPostBrightData: content_preview=${content.slice(0, 120)}`);
    }
    return {
      fb_post_id: record.post_id || record.url || url,
      fb_post_url: record.url || url,
      author_name: record.user_username_raw || record.user_url || '',
      content,
      image_urls,
      embed_html: '',
      posted_at: record.date_posted || '',
      comments: [],
    };
  }
  console.error(`fetchFbPostBrightData: unexpected response:`, JSON.stringify(data).slice(0, 500));
  throw new Error('Bright Data: unexpected response format');
}

async function fetchFbPostApify(url) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not configured');

  console.log(`fetchFbPostApify: scraping ${url.slice(0, 100)}`);
  const resp = await fetch(
    `https://api.apify.com/v2/acts/apify~facebook-posts-scraper/runs?token=${token}&waitForFinish=60`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startUrls: [{ url }] }),
      signal: AbortSignal.timeout(70000),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Apify HTTP ${resp.status}: ${err.slice(0, 200)}`);
  }

  const run = await resp.json();

  if (run.status !== 'SUCCEEDED') {
    throw new Error(`Apify run ${run.status}: ${run.statusMessage || ''}`);
  }

  const datasetResp = await fetch(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${token}`,
    { signal: AbortSignal.timeout(15000) }
  );

  if (!datasetResp.ok) throw new Error(`Apify dataset HTTP ${datasetResp.status}`);

  const items = await datasetResp.json();
  if (!items || items.length === 0) throw new Error('Apify returned empty dataset');

  const item = items[0];
  const text = item.text || item.caption || item.description || '';
  const images = (item.images || []).filter(Boolean).map(i => typeof i === 'string' ? i : i.url || '');
  const author = item.authorName || item.username || item.pageName || '';

  console.log(`fetchFbPostApify: success, content_length=${text.length}, images=${images.length}`);
  if (text) console.log(`fetchFbPostApify: preview=${text.slice(0, 120)}`);

  return { content: text, image_urls: images, author_name: author };
}

export async function fetchFbPost(url) {
  const ids = extractIdsFromUrl(url);
  const fallbackId = ids?.postId || Buffer.from(url).toString('base64').slice(0, 30);
  const embed_html = generateEmbedHtml(url);

  let content = '';
  let image_urls = [];
  let author_name = '';

  try {
    // 1. Apify (token ya en .env, más confiable)
    const apifyToken = process.env.APIFY_TOKEN;
    if (apifyToken) {
      try {
        const apify = await fetchFbPostApify(url);
        if (apify.content) content = apify.content;
        if (apify.image_urls?.length) image_urls = apify.image_urls;
        if (apify.author_name) author_name = apify.author_name;
      } catch (err) {
        console.error('fetchFbPost: Apify falló:', err.message);
      }
    }

    // 2. OG scraper (fallback si Apify no dio contenido)
    if (!content) {
      try {
        const og = await fetchFbPostOG(url);
        if (og.content) content = og.content;
        if (og.image_url && !image_urls.length) image_urls = [og.image_url];
        console.log(`fetchFbPost: OG success, content_length=${content.length}, image=${!!og.image_url}`);
      } catch (err) {
        console.error('fetchFbPost: OG falló:', err.message);
      }
    }

    // 3. Bright Data (enriquecer)
    const brightKeyRes = await pool.query(
      "SELECT value FROM settings WHERE key = 'brightdata_api_key'"
    );
    const brightKey = brightKeyRes.rows[0]?.value;
    if (brightKey) {
      try {
        const bd = await fetchFbPostBrightData(url, brightKey);
        if (bd.content) content = bd.content;
        if (bd.image_urls?.length) image_urls = bd.image_urls;
        if (bd.author_name) author_name = bd.author_name;
        console.log(`fetchFbPost: Bright Data enriched, content_length=${bd.content?.length}, images=${bd.image_urls?.length}`);
      } catch (err) {
        console.error('fetchFbPost: Bright Data falló:', err.message);
      }
    }

    // 3. oEmbed (author_name + thumbnail fallback)
    const tokenRes = await pool.query(
      "SELECT value FROM settings WHERE key = 'instagram_access_token'"
    );
    const pageToken = tokenRes.rows[0]?.value;
    for (const t of [pageToken, await getAppToken()].filter(Boolean)) {
      try {
        const data = await fetchOembedViaGraph(url, t);
        if (data.author_name) author_name = data.author_name;
        if (!content && (data.description || data.title)) content = data.description || data.title;
        if (!image_urls.length && data.thumbnail_url) image_urls = [data.thumbnail_url];
        break;
      } catch (err) {
        console.error('fetchFbPost: oEmbed falló:', err.message);
      }
    }

    // 4. Graph API (legacy)
    if (!content && !image_urls.length && pageToken && ids) {
      try {
        const ga = await fetchGraphApiData(ids.postId, ids.groupId, pageToken, url);
        if (ga.content) content = ga.content;
        if (ga.image_urls?.length) image_urls = ga.image_urls;
      } catch (err) {
        console.error('fetchFbPost: Graph API falló:', err.message);
      }
    }
  } catch (err) {
    console.error('fetchFbPost error:', err.message);
  }

  return {
    fb_post_id: fallbackId,
    fb_post_url: url,
    author_name,
    content,
    image_urls,
    embed_html,
    posted_at: '',
    comments: [],
  };
}

export function startSyncTimer(minutes = 5) {
  console.log(`Starting VPS sync every ${minutes} minutes`);
  pushConfig().catch(() => {});
  syncFromVps().catch(() => {});
  setInterval(() => {
    syncFromVps().catch(() => {});
  }, minutes * 60 * 1000);
  setInterval(() => {
    pushConfig().catch(() => {});
  }, 30 * 60 * 1000);
}
