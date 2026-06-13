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
let geminiCooldownUntil = 0;

function isGeminiAvailable() {
  if (Date.now() < geminiCooldownUntil) return false;
  return true;
}

function handleGeminiError(err) {
  if (err?.status === 429 || err?.error?.code === 429) {
    const cooldownMs = 5 * 60 * 1000;
    geminiCooldownUntil = Date.now() + cooldownMs;
    console.log(`Gemini quota exhausted — entering cooldown for ${cooldownMs / 1000}s`);
    return true;
  }
  return false;
}

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
        if (isGeminiAvailable()) {
          try {
            classification = await classifyPost(post.content || '', post.image_urls || [], post.comments || []);
          } catch (err) {
            if (handleGeminiError(err)) classification = { ...classification };
            else throw err;
          }
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

        if (postId && (classification.classification === 'found' || classification.classification === 'lost') && isGeminiAvailable()) {
          matchPostToPet(postId).catch(err => { if (!handleGeminiError(err)) console.error('Auto-matching error:', err); });
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
