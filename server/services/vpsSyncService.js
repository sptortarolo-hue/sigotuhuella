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
        try {
          classification = await classifyPost(post.content || '', post.image_urls || [], post.comments || []);
        } catch (err) {
          console.error('Classification error:', err.message);
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
  const segments = url.split('/');
  const last = segments[segments.length - 1];
  if (/^\d+$/.test(last)) return { postId: last };
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

async function fetchOembedViaGraph(url, token) {
  const GRAPH_API = 'https://graph.facebook.com/v22.0';
  const resp = await fetch(
    `${GRAPH_API}/oembed_post?url=${encodeURIComponent(url)}&access_token=${token}&fields=author_name,title,thumbnail_url`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(`oEmbed error: ${err.error?.message || JSON.stringify(err)}`);
  }
  return await resp.json();
}

export async function fetchFbPost(url) {
  try {
    const ids = extractIdsFromUrl(url);
    if (!ids) throw new Error('No se pudo extraer el ID de la publicación');

    // 1. Try Graph API post lookup with Page Token (full data)
    const tokenRes = await pool.query(
      "SELECT value FROM settings WHERE key = 'instagram_access_token'"
    );
    const pageToken = tokenRes.rows[0]?.value;

    if (pageToken) {
      try {
        return await fetchGraphApiData(ids.postId, ids.groupId, pageToken, url);
      } catch (err) {
        console.warn('fetchFbPost: Graph API post falló:', err.message);
      }
    }

    // 2. Try oEmbed via Graph API (Page Token first, then App Token)
    let oembedToken = pageToken;
    if (!oembedToken) oembedToken = await getAppToken();

    if (oembedToken) {
      try {
        const data = await fetchOembedViaGraph(url, oembedToken);
        const pId = ids.postId || '';
        return {
          fb_post_id: pId,
          fb_post_url: url,
          author_name: data.author_name || '',
          content: data.title || '',
          image_urls: data.thumbnail_url ? [data.thumbnail_url] : [],
          posted_at: '',
          comments: [],
        };
      } catch (err) {
        console.warn('fetchFbPost: oEmbed falló:', err.message);
        if (!pageToken) throw err;
      }
    }

    // 3. Retry oEmbed with App Token if Page Token was used in step 2
    if (pageToken) {
      const appToken = await getAppToken();
      if (appToken) {
        const data = await fetchOembedViaGraph(url, appToken);
        const pId = ids.postId || '';
        return {
          fb_post_id: pId,
          fb_post_url: url,
          author_name: data.author_name || '',
          content: data.title || '',
          image_urls: data.thumbnail_url ? [data.thumbnail_url] : [],
          posted_at: '',
          comments: [],
        };
      }
    }

    throw new Error('No se pudo acceder a la publicación');
  } catch (err) {
    console.error('fetchFbPost error:', err.message);
    throw err;
  }
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
