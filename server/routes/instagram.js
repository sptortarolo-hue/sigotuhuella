import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../auth.js';
import {
  getAuthUrl, exchangeCodeForToken, refreshToken, isConnected, getStoredToken,
  createContainer, publishContainer, waitForContainer,
  getComments, replyToComment, sendPrivateReply,
  getUserMedia, getMedia, getMediaInsights,
  verifyWebhook, getInstagramUserId,
} from '../services/instagramService.js';
import { processQueue } from '../services/instagramPublisher.js';

const router = Router();

router.get('/auth-url', requireAdmin, async (_req, res) => {
  try {
    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) {
      return res.status(500).json({ error: 'Falta FACEBOOK_APP_ID en variables de entorno' });
    }
    const url = getAuthUrl();
    res.json({ url });
  } catch (err) {
    console.error('Error getting auth URL:', err);
    res.status(500).json({ error: err.message || 'Error al generar URL de autenticación' });
  }
});

router.get('/callback', async (req, res) => {
  const { code, error, error_reason } = req.query;
  if (error) {
    console.error('OAuth error:', error, error_reason);
    return res.redirect(`/admin?instagram=error&reason=${encodeURIComponent(error)}`);
  }
  if (!code) return res.status(400).send('Missing authorization code');
  try {
    const { accessToken, igUserId } = await exchangeCodeForToken(code);
    console.log(`Instagram connected: user=${igUserId}, token=${accessToken.slice(0, 8)}...`);
    res.redirect('/admin?instagram=connected');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`/admin?instagram=error&reason=${encodeURIComponent(err.message)}`);
  }
});

router.get('/status', requireAdmin, async (_req, res) => {
  try {
    const connected = await isConnected();
    const tokenResult = await pool.query("SELECT value FROM settings WHERE key = 'instagram_token_expires_at'");
    const userResult = await pool.query("SELECT value FROM settings WHERE key = 'instagram_user_id'");
    const usernameResult = await pool.query("SELECT value FROM settings WHERE key = 'instagram_username'");
    res.json({
      connected,
      expiresAt: tokenResult.rows[0]?.value || null,
      userId: userResult.rows[0]?.value || null,
      username: usernameResult.rows[0]?.value || null,
    });
  } catch (err) {
    console.error('Error checking status:', err);
    res.status(500).json({ error: 'Error al verificar estado' });
  }
});

router.post('/disconnect', requireAdmin, async (_req, res) => {
  try {
    await pool.query("DELETE FROM settings WHERE key LIKE 'instagram_%'");
    // Reset failed posts so they can be retried after reconnection
    await pool.query("UPDATE instagram_posts SET status = 'queued', error_message = NULL WHERE status = 'failed'");
    res.json({ success: true });
  } catch (err) {
    console.error('Error disconnecting:', err);
    res.status(500).json({ error: 'Error al desconectar' });
  }
});

router.post('/retry-failed', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      "UPDATE instagram_posts SET status = 'queued', error_message = NULL WHERE status = 'failed' RETURNING id"
    );
    res.json({ success: true, retried: result.rows.length });
  } catch (err) {
    console.error('Error retrying failed posts:', err);
    res.status(500).json({ error: 'Error al reintentar posts fallidos' });
  }
});

router.post('/process-queue', requireAdmin, async (_req, res) => {
  try {
    const results = await processQueue();
    res.json({ success: true, results });
  } catch (err) {
    console.error('Error processing queue:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/publish', requireAdmin, async (req, res) => {
  try {
    const { petId, imageUrls, caption, mediaType } = req.body;
    if (!petId || !imageUrls?.length) {
      return res.status(400).json({ error: 'Faltan datos: petId e imageUrls son requeridos' });
    }
    const mt = mediaType || 'IMAGE';
    const containerId = await createContainer(imageUrls, caption || '', mt);
    await waitForContainer(containerId, mt);
    const result = await publishContainer(containerId);
    await pool.query(
      `INSERT INTO instagram_posts (pet_id, media_type, caption, status, ig_media_id, ig_permalink, published_at, created_at)
       VALUES ($1, $2, $3, 'published', $4, $5, NOW(), NOW())`,
      [petId, mediaType || 'IMAGE', caption || '', result.id || containerId, result.permalink || '']
    );
    if (petId) {
      await pool.query("UPDATE pets SET instagram = $1 WHERE id = $2", [result.permalink || '', petId]);
    }
    res.json({ success: true, mediaId: result.id, permalink: result.permalink });
  } catch (err) {
    console.error('Error publishing:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/publish-async', requireAdmin, async (req, res) => {
  try {
    const { petId, imageUrls, caption, mediaType } = req.body;
    if (!petId || !imageUrls?.length) {
      return res.status(400).json({ error: 'Faltan datos: petId e imageUrls son requeridos' });
    }
    const queueResult = await pool.query(
      `INSERT INTO instagram_posts (pet_id, media_type, caption, status, image_urls, created_at)
       VALUES ($1, $2, $3, 'queued', $4, NOW())
       RETURNING id`,
      [petId, mediaType || 'IMAGE', caption || '', imageUrls]
    );
    res.json({ success: true, queuedId: queueResult.rows[0].id, message: 'Publicación encolada' });
  } catch (err) {
    console.error('Error queueing publish:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/posts', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;
    let sql = `
      SELECT ip.*, p.name as pet_name, p.species,
        (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = ip.pet_id ORDER BY pi.created_at LIMIT 1) as image_data,
        (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = ip.pet_id ORDER BY pi.created_at LIMIT 1) as mime_type
      FROM instagram_posts ip
      LEFT JOIN pets p ON ip.pet_id = p.id
    `;
    const params = [];
    if (status) {
      sql += ' WHERE ip.status = $1';
      params.push(status);
    }
    sql += ' ORDER BY ip.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing posts:', err);
    res.status(500).json({ error: 'Error al listar publicaciones' });
  }
});

router.get('/comments', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, mediaId } = req.query;
    let sql = `
      SELECT ic.*, ip.ig_permalink, ip.caption as post_caption
      FROM instagram_comments ic
      LEFT JOIN instagram_posts ip ON ic.ig_post_id = ip.id
    `;
    const params = [];
    const conditions = [];
    if (mediaId) {
      conditions.push('ic.ig_media_id = $' + (params.length + 1));
      params.push(mediaId);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY ic.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing comments:', err);
    res.status(500).json({ error: 'Error al listar comentarios' });
  }
});

router.post('/comments/:id/reply', requireAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensaje requerido' });
    const comment = await pool.query('SELECT ig_comment_id FROM instagram_comments WHERE id = $1', [req.params.id]);
    if (comment.rows.length === 0) return res.status(404).json({ error: 'Comentario no encontrado' });
    await replyToComment(comment.rows[0].ig_comment_id, message);
    await pool.query('UPDATE instagram_comments SET replied = TRUE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error replying:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/comments/:id/dm', requireAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensaje requerido' });
    const comment = await pool.query('SELECT ig_comment_id FROM instagram_comments WHERE id = $1', [req.params.id]);
    if (comment.rows.length === 0) return res.status(404).json({ error: 'Comentario no encontrado' });
    await sendPrivateReply(comment.rows[0].ig_comment_id, message);
    await pool.query('UPDATE instagram_comments SET dm_sent = TRUE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error sending DM:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const result = verifyWebhook(mode, token, challenge);
  if (result) return res.status(200).send(result);
  res.status(403).send('Verification failed');
});

router.post('/webhook', async (req, res) => {
  res.status(200).send('OK');
  try {
    const connected = await isConnected();
    if (!connected) return;
    const body = req.body;
    if (!body?.entry) return;
    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        if (change.field === 'comments') {
          await handleCommentEvent(change.value);
        } else if (change.field === 'mentions') {
          await handleMentionEvent(change.value);
        }
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

async function handleCommentEvent(value) {
  const { id: commentId, text, from, media_id: mediaId, timestamp } = value;
  const username = from?.username || 'unknown';
  try {
    await pool.query(
      `INSERT INTO instagram_comments (ig_comment_id, ig_media_id, username, text, created_at)
       VALUES ($1, $2, $3, $4, to_timestamp($5::double precision))
       ON CONFLICT (ig_comment_id) DO NOTHING`,
      [commentId, mediaId, username, text, timestamp || Math.floor(Date.now() / 1000)]
    );
    await processAutoReply(commentId, text, username, mediaId);
  } catch (err) {
    console.error('Error saving comment:', err);
  }
}

async function handleMentionEvent(value) {
  console.log('Instagram mention:', value);
}

async function processAutoReply(commentId, commentText, username, mediaId) {
  try {
    const rules = await pool.query(
      'SELECT * FROM instagram_auto_reply_rules WHERE is_active = TRUE'
    );
    if (rules.rows.length === 0) return;
    const text = (commentText || '').toLowerCase();
    for (const rule of rules.rows) {
      const keywords = rule.keywords || [];
      if (!keywords.some(kw => text.includes(kw.toLowerCase()))) continue;
      if (rule.reply_type === 'public_reply' || rule.reply_type === 'both') {
        const reply = (rule.reply_template || '').replace(/{username}/g, `@${username}`);
        await replyToComment(commentId, reply).catch(e => console.error('Auto-reply error:', e));
      }
      if (rule.dm_template && (rule.reply_type === 'private_dm' || rule.reply_type === 'both')) {
        const dm = rule.dm_template.replace(/{username}/g, username);
        await sendPrivateReply(commentId, dm).catch(e => console.error('Auto-DM error:', e));
      }
      break;
    }
  } catch (err) {
    console.error('Auto-reply error:', err);
  }
}

router.get('/auto-reply-rules', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM instagram_auto_reply_rules ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar reglas' });
  }
});

router.post('/auto-reply-rules', requireAdmin, async (req, res) => {
  try {
    const { keywords, reply_type, reply_template, dm_template } = req.body;
    if (!keywords?.length || !reply_template) {
      return res.status(400).json({ error: 'Keywords y reply_template son requeridos' });
    }
    const result = await pool.query(
      `INSERT INTO instagram_auto_reply_rules (keywords, reply_type, reply_template, dm_template)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [keywords, reply_type || 'public_reply', reply_template, dm_template || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear regla' });
  }
});

router.put('/auto-reply-rules/:id', requireAdmin, async (req, res) => {
  try {
    const { keywords, reply_type, reply_template, dm_template, is_active } = req.body;
    const result = await pool.query(
      `UPDATE instagram_auto_reply_rules
       SET keywords = $1, reply_type = $2, reply_template = $3, dm_template = $4, is_active = $5
       WHERE id = $6 RETURNING *`,
      [keywords, reply_type, reply_template, dm_template, is_active, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Regla no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar regla' });
  }
});

router.delete('/auto-reply-rules/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM instagram_auto_reply_rules WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar regla' });
  }
});

router.get('/stats', requireAdmin, async (_req, res) => {
  try {
    const totalPosts = await pool.query("SELECT COUNT(*) FROM instagram_posts");
    const publishedPosts = await pool.query("SELECT COUNT(*) FROM instagram_posts WHERE status = 'published'");
    const totalComments = await pool.query("SELECT COUNT(*) FROM instagram_comments");
    const pendingComments = await pool.query("SELECT COUNT(*) FROM instagram_comments WHERE replied = FALSE AND dm_sent = FALSE");
    const totalPetsPublished = await pool.query("SELECT COUNT(DISTINCT pet_id) FROM instagram_posts WHERE status = 'published' AND pet_id IS NOT NULL");
    res.json({
      totalPosts: parseInt(totalPosts.rows[0].count),
      publishedPosts: parseInt(publishedPosts.rows[0].count),
      totalComments: parseInt(totalComments.rows[0].count),
      pendingComments: parseInt(pendingComments.rows[0].count),
      totalPetsPublished: parseInt(totalPetsPublished.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

export default router;
