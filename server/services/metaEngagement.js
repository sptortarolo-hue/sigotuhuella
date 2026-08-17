import axios from 'axios';
import pool from '../db.js';
import { getStoredToken, getComments, getMediaInsights, getInstagramOEmbed } from './instagramService.js';
import { createCaseEvent } from './caseService.js';

const GRAPH_API = 'https://graph.facebook.com/v22.0';
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 400;

const syncState = { running: false, source: null, startedAt: null, finishedAt: null, result: null, error: null };

// Set de IDs de media IG que ya logueamos como inexistentes (evita spam en cada ciclo)
const loggedIgMissing = new Set();
function logIgError(postId, mediaId, err) {
  const message = err?.response?.data?.error?.message || err.message || String(err);
  const isMissing = err?.response?.data?.error?.code === 100 || /does not exist|no longer exist|Unsupported get request/i.test(message);
  if (isMissing) {
    if (loggedIgMissing.has(mediaId)) return;
    loggedIgMissing.add(mediaId);
    if (loggedIgMissing.size > 200) loggedIgMissing.clear();
    console.error(`[MetaEngagement] IG post ${postId} (${mediaId}): ${message}`);
  } else {
    console.error(`[MetaEngagement] IG post ${postId}: ${message}`);
  }
}

// Lanza un sync en background (sin bloquear la request) con lock anti-concurrencia.
// Devuelve { queued: true } si ya hay uno corriendo, o { started: true } si lo arranca.
export function runSyncInBackground(syncFn, source) {
  if (syncState.running) return { queued: true };
  syncState.running = true;
  syncState.source = source;
  syncState.startedAt = new Date().toISOString();
  syncState.result = null;
  syncState.error = null;
  Promise.resolve()
    .then(() => syncFn())
    .then(result => { syncState.result = result; })
    .catch(err => { syncState.error = err?.message || String(err); })
    .finally(() => {
      syncState.finishedAt = new Date().toISOString();
      syncState.running = false;
    });
  return { started: true };
}

export function getSyncState() {
  return syncState;
}

async function getSetting(key) {
  const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0]?.value || '';
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function metricValue(insights, name) {
  const m = (insights || []).find(i => i.name === name);
  return m ? parseInt(m.values?.[0]?.value, 10) || 0 : 0;
}

// ---- Instagram ----

export async function syncInstagramEngagement() {
  const token = await getStoredToken();
  if (!token) return { posts: 0, comments: 0, embeds: 0 };

  const postsRes = await pool.query(
    `SELECT id, pet_id, ig_media_id, ig_permalink, embed_html FROM instagram_posts
     WHERE status = 'published' AND ig_media_id IS NOT NULL
     ORDER BY published_at DESC NULLS LAST LIMIT 100`
  );

  let posts = 0, comments = 0, embeds = 0;
  for (let i = 0; i < postsRes.rows.length; i += BATCH_SIZE) {
    const batch = postsRes.rows.slice(i, i + BATCH_SIZE);
    for (const post of batch) {
      try {
        const { data } = await axios.get(`${GRAPH_API}/${post.ig_media_id}`, {
          params: { fields: 'id,like_count,comments_count,permalink', access_token: token },
        });
        const insights = await getMediaInsights(post.ig_media_id);
        const likeCount = parseInt(data.like_count, 10) || 0;
        const commentCount = parseInt(data.comments_count, 10) || 0;
        const shareCount = metricValue(insights, 'shares');
        const reach = metricValue(insights, 'reach') || metricValue(insights, 'impressions');
        const permalink = data.permalink || post.ig_permalink || null;

        await pool.query(
          `UPDATE instagram_posts SET
             like_count = $1, comment_count = $2, share_count = $3, reach = $4,
             ig_permalink = COALESCE($5, ig_permalink),
             metrics_updated_at = NOW()
           WHERE id = $6`,
          [likeCount, commentCount, shareCount, reach, permalink, post.id]
        );
        posts++;

        // Buscar case_id para este post
        let caseId = null;
        if (post.pet_id) {
          const caseRes = await pool.query('SELECT id FROM pet_cases WHERE pet_id = $1 LIMIT 1', [post.pet_id]);
          caseId = caseRes.rows[0]?.id || null;
        }

        // Backfill de comentarios (upsert, vincula ig_post_id)
        const cmts = await getComments(post.ig_media_id);
        for (const c of cmts) {
          const result = await pool.query(
            `INSERT INTO instagram_comments (ig_comment_id, ig_media_id, ig_post_id, username, text, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (ig_comment_id) DO NOTHING`,
            [c.id, post.ig_media_id, post.id, c.username || 'unknown', c.text || '', new Date(c.timestamp).toISOString()]
          ).catch(() => ({ rowCount: 0 }));
          if (result.rowCount > 0) {
            comments++;
            if (caseId) {
              await createCaseEvent(caseId, 'ig_comment_received', {
                username: c.username || 'unknown',
                text: c.text || '',
              });
            }
          }
        }

        // Cache del embed (oEmbed) si todavía no se generó
        if (permalink && !post.embed_html) {
          try {
            const oembed = await getInstagramOEmbed(permalink);
            if (oembed?.html) {
              await pool.query('UPDATE instagram_posts SET embed_html = $1 WHERE id = $2', [oembed.html, post.id]);
              embeds++;
            }
          } catch {
            // oEmbed puede fallar si el post no es público; no es crítico
          }
        }
      } catch (err) {
        logIgError(post.id, post.ig_media_id, err);
      }
      await sleep(BATCH_DELAY_MS);
    }
  }

  return { posts, comments, embeds };
}

// Polling liviano de comentarios IG: revisa solo los últimos posts publicados, sin
// actualizar el resto de métricas. Corre cada ~5 min como complemento al sync pesado
// de 30 min, para acercar los comentarios a "tiempo real" sin App Review.
export async function syncRecentIgComments(limit = 10) {
  const token = await getStoredToken();
  if (!token) return { posts: 0, comments: 0 };

  const postsRes = await pool.query(
    `SELECT id, pet_id, ig_media_id FROM instagram_posts
     WHERE status = 'published' AND ig_media_id IS NOT NULL
     ORDER BY published_at DESC NULLS LAST LIMIT $1`,
    [limit]
  );

  let posts = 0, comments = 0;
  for (const post of postsRes.rows) {
    try {
      let caseId = null;
      if (post.pet_id) {
        const caseRes = await pool.query('SELECT id FROM pet_cases WHERE pet_id = $1 LIMIT 1', [post.pet_id]);
        caseId = caseRes.rows[0]?.id || null;
      }
      const cmts = await getComments(post.ig_media_id);
      posts++;
      for (const c of cmts) {
        const result = await pool.query(
          `INSERT INTO instagram_comments (ig_comment_id, ig_media_id, ig_post_id, username, text, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (ig_comment_id) DO NOTHING`,
          [c.id, post.ig_media_id, post.id, c.username || 'unknown', c.text || '', new Date(c.timestamp).toISOString()]
        ).catch(() => ({ rowCount: 0 }));
        if (result.rowCount > 0) {
          comments++;
          if (caseId) {
            await createCaseEvent(caseId, 'ig_comment_received', {
              username: c.username || 'unknown',
              text: c.text || '',
            });
          }
        }
      }
    } catch (err) {
      logIgError(post.id, post.ig_media_id, err);
    }
    await sleep(BATCH_DELAY_MS);
  }

  if (posts > 0) {
    console.log(`[MetaEngagement] IG poll: ${posts} posts / ${comments} comentarios nuevos`);
  }
  console.log('[MetaEngagement] FB sync done: ' + posts + ' posts / ' + comments + ' comments / errors: ' + JSON.stringify(errors));
  return { posts, comments };
}

// ---- Facebook (página) ----

function classifyGraphError(err) {
  const e = err.response?.data?.error || {};
  const code = e.code;
  const type = e.type || '';
  const message = e.message || '';
  if (code === 190) return { kind: 'token' };
  if (code === 10 || type === 'OAuthException' && /permission/i.test(message)) return { kind: 'permission' };
  if (code === 100) return { kind: 'invalid_post' };
  return { kind: 'other' };
}

async function saveSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

// Page Insights API fallback: intenta obtener métricas vía insights si el endpoint directo falla
async function tryInsightsFallback(post, token) {
  if (!post.page_post_id) return false;
  // Extract page_id from page_post_id (format: PAGEID_POSTID)
  const parts = post.page_post_id.split('_');
  if (parts.length < 2) return false;
  const pageId = parts[0];
  try {
    const { data } = await axios.get(`${GRAPH_API}/${pageId}/insights`, {
      params: {
        metric: 'post_reactions_by_type_total',
        permalink: 'https://www.facebook.com/' + post.page_post_id,
        access_token: token,
      },
      timeout: 15000,
    });
    const reactionsMetric = (data?.data || []).find(m => m.name === 'post_reactions_by_type_total');
    if (reactionsMetric && reactionsMetric.values?.[0]) {
      const totalReactions = Object.values(reactionsMetric.values[0]).reduce((sum, v) => sum + (parseInt(v, 10) || 0), 0);
      await pool.query(
        `UPDATE facebook_page_posts SET like_count = $1, metrics_updated_at = NOW() WHERE id = $2`,
        [totalReactions, post.id]
      );
      console.log('[MetaEngagement] FB insights fallback OK for ' + post.page_post_id + ': ' + totalReactions + ' reactions');
      return true;
    }
  } catch (err) {
    // Insights fallback is best-effort
  }
  return false;
}

// Fallback sin permisos: engagement de una URL de post de Facebook usando el app token
// ({app_id}|{app_secret}). Solo actualiza contadores (comment_count/like_count); la
// API de URL devuelve valores aproximados y puede dar 0 en posts con <100 interacciones.
async function tryUrlEngagementFallback(post) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) return false;
  if (!post.page_post_id || !/^\d+_\d+$/.test(post.page_post_id)) return false;

  const postUrl = `https://www.facebook.com/${post.page_post_id}`;
  const url = encodeURIComponent(postUrl);
  const appToken = `${appId}|${appSecret}`;
  try {
    const { data } = await axios.get(`${GRAPH_API}/`, {
      params: {
        id: url,
        fields: 'engagement',
        access_token: appToken,
      },
      timeout: 15000,
    });
    const engagement = data?.engagement;
    if (!engagement) return false;
    await pool.query(
      `UPDATE facebook_page_posts SET
         comment_count = COALESCE($1, comment_count),
         like_count = COALESCE($2, like_count),
         metrics_updated_at = NOW()
       WHERE id = $3`,
      [parseInt(engagement.comment_count, 10) || 0, parseInt(engagement.reaction_count, 10) || 0, post.id]
    );
    console.log(`[MetaEngagement] FB fallback URL engagement OK para ${post.page_post_id}: ${engagement.comment_count} comentarios`);
    return true;
  } catch (err) {
    console.error(`[MetaEngagement] FB fallback URL engagement falló para ${post.page_post_id}: ${err.response?.data?.error?.message || err.message}`);
    return false;
  }
}

export async function syncFacebookEngagement() {
  const token = await getStoredToken();
  if (!token) return { posts: 0, comments: 0 };

  const postsRes = await pool.query(
    `SELECT id, pet_id, page_post_id FROM facebook_page_posts
     WHERE status = 'published' AND page_post_id IS NOT NULL
     ORDER BY published_at DESC NULLS LAST LIMIT 100`
  );

  let posts = 0, comments = 0;
  const errors = { permission: 0, invalid_post: 0, token: 0, other: 0 };
  const errorSamples = {};
  console.log('[MetaEngagement] FB sync started: ' + postsRes.rows.length + ' posts to process');
  for (const post of postsRes.rows) {
    try {
      const params = { access_token: token, fields: 'id,reactions.summary(true),comments.summary(true),shares' };
      const { data } = await axios.get(`${GRAPH_API}/${post.page_post_id}`, { params });
      const reactions = data.reactions?.summary?.total_count ?? 'N/A';
      const cmts = data.comments?.summary?.total_count ?? 'N/A';
      const shares = data.shares?.count ?? 'N/A';
      if (posts === 0) console.log('[MetaEngagement] FB first post response sample: reactions=' + reactions + ' comments=' + cmts + ' shares=' + shares);
      await pool.query(
        `UPDATE facebook_page_posts SET
           like_count = $1, comment_count = $2, share_count = $3, metrics_updated_at = NOW()
         WHERE id = $4`,
        [
          parseInt(data.reactions?.summary?.total_count, 10) || 0,
          parseInt(data.comments?.summary?.total_count, 10) || 0,
          parseInt(data.shares?.count, 10) || 0,
          post.id,
        ]
      );
      posts++;

      // Buscar case_id para este post
      let caseId = null;
      if (post.pet_id) {
        const caseRes = await pool.query('SELECT id FROM pet_cases WHERE pet_id = $1 LIMIT 1', [post.pet_id]);
        caseId = caseRes.rows[0]?.id || null;
      }

      const cmtsRes = await axios.get(`${GRAPH_API}/${post.page_post_id}/comments`, {
        params: { access_token: token, fields: 'id,message,from{name},like_count,created_time' },
      });
      for (const c of cmtsRes.data.data || []) {
        const result = await pool.query(
          `INSERT INTO facebook_page_comments (fb_comment_id, page_post_id, author_name, text, like_count, posted_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (fb_comment_id) DO NOTHING`,
          [c.id, post.id, c.from?.name || 'unknown', c.message || '', parseInt(c.like_count, 10) || 0, new Date(c.created_time).toISOString()]
        ).catch(() => ({ rowCount: 0 }));
        if (result.rowCount > 0) {
          comments++;
          if (caseId) {
            await createCaseEvent(caseId, 'fb_comment_received', {
              author_name: c.from?.name || 'unknown',
              text: c.message || '',
            });
          }
        }
      }
    } catch (err) {
      const { kind } = classifyGraphError(err);
      errors[kind]++;
      if (!errorSamples[kind]) {
        errorSamples[kind] = err.response?.data?.error?.message || err.message;
      }
      // Sin pages_read_engagement: intentar fallbacks progresivos.
      if (kind === 'permission' || kind === 'token' || kind === 'invalid_post') {
        let ok = await tryInsightsFallback(post, token);
        if (!ok) ok = await tryUrlEngagementFallback(post);
        if (ok) posts++;
      }
    }
    await sleep(BATCH_DELAY_MS);
  }

  const totalPosts = postsRes.rows.length;
  const massivePermissionFailure = totalPosts > 0 && errors.permission >= totalPosts * 0.5;
  if (errors.token > 0 || massivePermissionFailure) {
    const detail = massivePermissionFailure
      ? 'El token de Facebook no tiene el permiso pages_read_engagement (o la app carece de Page Public Content Access). Reconectar FB desde el admin.'
      : 'El token de Facebook es inválido o expiró. Reconectar FB desde el admin.';
    console.error(`[MetaEngagement] FB sync: ${errors.permission} post(s) bloqueados por permisos / ${errors.token} por token. ${detail} Ej.: ${errorSamples.permission || errorSamples.token || ''}`);
    await saveSetting('fb_sync_auth_error', 'true');
    await saveSetting('fb_sync_auth_error_at', new Date().toISOString());
    await saveSetting('fb_sync_auth_error_detail', detail);
  } else if (totalPosts > 0 && errors.invalid_post + errors.other === 0 && errors.permission === 0 && errors.token === 0) {
    await saveSetting('fb_sync_auth_error', 'false');
  }

  return { posts, comments };
}

export async function runEngagementSync() {
  const enabled = await getSetting('engagement_sync_enabled');
  if (enabled !== 'true') {
    console.log('[MetaEngagement] Sync deshabilitado (engagement_sync_enabled != true)');
    return null;
  }
  const ig = await syncInstagramEngagement();
  const fb = await syncFacebookEngagement();
  const total = {
    instagram: ig, facebook: fb,
  };
  console.log(`[MetaEngagement] IG: ${ig.posts} posts / ${ig.comments} comentarios / ${ig.embeds} embeds · FB: ${fb.posts} posts / ${fb.comments} comentarios`);
  return total;
}
