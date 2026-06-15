import { Router } from 'express';
import multer from 'multer';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { requireAdmin } from '../auth.js';
import { classifyPost } from '../services/geminiClassifier.js';
import { matchPostToPet, matchPetToPosts, runFullMatching, detectReunion } from '../services/geminiMatching.js';
import { pushConfig } from '../services/vpsSyncService.js';
import { publishToPage, replicateInstagramToFacebook, replicateLatestInstagramPosts, retryFailedFacebookPosts, publishPetToGroups } from '../services/facebookPublisher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIES_PATH = join(__dirname, '..', '..', 'external', 'scraper', 'cookies.txt');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 } }); // 512KB max

const router = Router();

async function getScraperToken() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'fb_scraper_token'");
  return result.rows[0]?.value || process.env.FB_SCRAPER_TOKEN || 'sihuella-scraper-2024';
}

async function isScrapingEnabled() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'fb_scraping_enabled'");
  return result.rows[0]?.value === 'true';
}

// ==================== GROUPS ====================

router.get('/groups', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM facebook_groups ORDER BY name ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({ error: 'Error al obtener grupos' });
  }
});

router.post('/groups', requireAdmin, async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'Nombre y URL son requeridos' });
    }
    const result = await pool.query(
      'INSERT INTO facebook_groups (name, url) VALUES ($1, $2) RETURNING *',
      [name.trim(), url.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El grupo ya existe' });
    console.error('Error creating group:', err);
    res.status(500).json({ error: 'Error al crear grupo' });
  }
});

router.put('/groups/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, is_active } = req.body;
    const result = await pool.query(
      `UPDATE facebook_groups SET
        name = COALESCE($1, name),
        url = COALESCE($2, url),
        is_active = COALESCE($3, is_active),
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [name, url, is_active, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating group:', err);
    res.status(500).json({ error: 'Error al actualizar grupo' });
  }
});

router.delete('/groups/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM facebook_groups WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('Error deleting group:', err);
    res.status(500).json({ error: 'Error al eliminar grupo' });
  }
});

// ==================== SCRAPER CONFIG ====================

router.get('/scraper-config', async (req, res) => {
  const auth = req.headers.authorization;
  const token = await getScraperToken();
  if (!auth || auth !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const enabled = await isScrapingEnabled();
  if (!enabled) {
    return res.status(403).json({ error: 'Scraping deshabilitado' });
  }

  try {
    const groupsRes = await pool.query(
      "SELECT name, url FROM facebook_groups WHERE is_active = true ORDER BY name"
    );

    const settingsRes = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('fb_scraper_token', 'fb_scraper_interval_hours', 'fb_scraper_max_posts')"
    );
    const s = {};
    settingsRes.rows.forEach(r => (s[r.key] = r.value));

    res.json({
      webhook_url: `${req.protocol}://${req.get('host')}/api/facebook/webhook`,
      webhook_token: s.fb_scraper_token || token,
      groups: groupsRes.rows,
      scrape_interval_hours: parseInt(s.fb_scraper_interval_hours, 10) || 6,
      max_posts_per_group: parseInt(s.fb_scraper_max_posts, 10) || 50,
    });
  } catch (err) {
    console.error('Error fetching scraper config:', err);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// ==================== POSTS ====================

router.get('/posts', requireAdmin, async (req, res) => {
  try {
    const { group_id, classification, species, search, limit = 50, offset = 0 } = req.query;

    let sql = 'SELECT fp.*, fg.name as group_name FROM facebook_posts fp LEFT JOIN facebook_groups fg ON fp.group_id = fg.id WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (group_id) {
      sql += ` AND fp.group_id = $${paramIndex++}`;
      params.push(group_id);
    }
    if (classification && classification !== 'all') {
      sql += ` AND fp.classification = $${paramIndex++}`;
      params.push(classification);
    }
    if (species && species !== 'all') {
      sql += ` AND fp.species = $${paramIndex++}`;
      params.push(species);
    }
    if (search) {
      sql += ` AND (fp.content ILIKE $${paramIndex} OR fp.author_name ILIKE $${paramIndex} OR fp.location_hint ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (req.query.has_images === 'true') {
      sql += ` AND fp.image_urls IS NOT NULL AND array_length(fp.image_urls, 1) > 0`;
    }
    if (req.query.has_images === 'false') {
      sql += ` AND (fp.image_urls IS NULL OR array_length(fp.image_urls, 1) = 0)`;
    }
    if (req.query.is_spam === 'true') {
      sql += ` AND fp.classification = 'other' AND (fp.image_urls IS NULL OR array_length(fp.image_urls, 1) = 0)`;
    }

    sql += ' ORDER BY fp.posted_at DESC NULLS LAST, fp.created_at DESC';
    sql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await pool.query(sql, params);
    res.json({ posts: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Error fetching posts:', err);
    res.status(500).json({ error: 'Error al obtener publicaciones' });
  }
});

router.get('/posts/:id', requireAdmin, async (req, res) => {
  try {
    const postRes = await pool.query(
      'SELECT fp.*, fg.name as group_name FROM facebook_posts fp LEFT JOIN facebook_groups fg ON fp.group_id = fg.id WHERE fp.id = $1',
      [req.params.id]
    );
    if (postRes.rows.length === 0) return res.status(404).json({ error: 'Publicación no encontrada' });
    const post = postRes.rows[0];

    let matchesRes;
    try {
      matchesRes = await pool.query(
        `SELECT fm.*,
          CASE
            WHEN fm.target_type = 'app_pet' THEN (SELECT name FROM pets WHERE id = fm.target_id::uuid)
            WHEN fm.target_type = 'fb_post' THEN (SELECT content FROM facebook_posts WHERE id = fm.target_id::uuid)
            ELSE NULL
          END as target_name
         FROM facebook_matches fm
         WHERE (fm.source_type = 'fb_post' AND fm.source_id = $1::text)
            OR (fm.target_type = 'fb_post' AND fm.target_id = $1::text)
         ORDER BY fm.score DESC`,
        [req.params.id]
      );
    } catch (matchErr) {
      console.error('Error fetching matches for post:', req.params.id, matchErr.message);
      matchesRes = { rows: [] };
    }

    res.json({ ...post, matches: matchesRes.rows });
  } catch (err) {
    console.error('Error fetching post detail:', req.params.id, err.message, err.stack);
    res.status(500).json({ error: 'Error al obtener publicación', detail: err.message });
  }
});

router.put('/posts/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { classification, species, color, location_hint, phone, notes } = req.body;
    const result = await pool.query(
      `UPDATE facebook_posts SET
        classification = COALESCE($1, classification),
        species = COALESCE($2, species),
        color = COALESCE($3, color),
        location_hint = COALESCE($4, location_hint),
        phone = COALESCE($5, phone),
        notes = COALESCE($6, notes),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [classification, species, color, location_hint, phone, notes, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Publicación no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating post:', err);
    res.status(500).json({ error: 'Error al actualizar publicación' });
  }
});

router.delete('/posts/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM facebook_matches WHERE (source_type = $1 AND source_id = $2) OR (target_type = $1 AND target_id = $2)',
      ['fb_post', req.params.id]);
    await pool.query('DELETE FROM facebook_posts WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).json({ error: 'Error al eliminar publicación' });
  }
});

router.post('/posts/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de IDs' });
    }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await pool.query(
      `DELETE FROM facebook_matches WHERE (source_type = 'fb_post' AND source_id IN (${placeholders})) OR (target_type = 'fb_post' AND target_id IN (${placeholders}))`,
      [...ids, ...ids]
    );
    await pool.query(`DELETE FROM facebook_posts WHERE id IN (${placeholders})`, ids);
    res.json({ deleted: ids.length });
  } catch (err) {
    console.error('Error bulk-deleting posts:', err);
    res.status(500).json({ error: 'Error al eliminar publicaciones' });
  }
});

// ==================== WEBHOOK (scraper → app) ====================

router.post('/webhook', async (req, res) => {
  const auth = req.headers.authorization;
  const token = await getScraperToken();
  if (!auth || auth !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const enabled = await isScrapingEnabled();
  if (!enabled) {
    return res.status(403).json({ error: 'Scraping deshabilitado' });
  }

  try {
    const { posts } = req.body;
    if (!posts || !Array.isArray(posts)) {
      return res.status(400).json({ error: 'Se requiere un array de posts' });
    }

    const results = { inserted: 0, updated: 0, errors: 0 };

    for (const post of posts) {
      try {
        const { group_id, fb_post_id, fb_post_url, author_name, content, image_urls, posted_at, comments } = post;
        if (!fb_post_id) { results.errors++; continue; }

        const classification = await classifyPost(content || '', image_urls || [], comments || []);
        const cmtClassified = classification.comments || [];

        const postResult = await pool.query(
          `INSERT INTO facebook_posts (group_id, fb_post_id, fb_post_url, author_name, content, image_urls, posted_at, classification, species, color, location_hint, phone, latitude, longitude)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (fb_post_id) DO UPDATE SET
             content = EXCLUDED.content,
             image_urls = EXCLUDED.image_urls,
             author_name = EXCLUDED.author_name,
             scraped_at = NOW()
           RETURNING id`,
          [
            group_id || null, fb_post_id, fb_post_url || null, author_name || null,
            content || '', image_urls || [], posted_at ? new Date(posted_at) : null,
            classification.classification, classification.species, classification.color,
            classification.location_hint, classification.phone,
            classification.location_lat, classification.location_lng,
          ]
        );

        const postId = postResult.rows[0]?.id;

        if (postId && comments && comments.length > 0) {
          const rawComments = comments.slice(0, 20);
          for (let i = 0; i < rawComments.length; i++) {
            const cmt = rawComments[i];
            const cmtClass = cmtClassified[i]?.classification || 'info';
            await pool.query(
              `INSERT INTO facebook_comments (post_id, fb_comment_id, author_name, text, posted_at, classification)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                postId, cmt.id || null, cmt.author || null, cmt.text || '',
                cmt.timestamp ? new Date(cmt.timestamp) : null, cmtClass,
              ]
            );
          }
        }

        if (postId && classification.classification === 'lost') {
          detectReunion(postId).catch(err => console.error('Reunion detection error:', err));
        }

        if (postId && (classification.classification === 'found' || classification.classification === 'lost')) {
          const matchedCheck = await pool.query('SELECT is_matched FROM facebook_posts WHERE id = $1', [postId]);
          if (matchedCheck.rows.length > 0 && !matchedCheck.rows[0].is_matched) {
            matchPostToPet(postId).catch(err => console.error('Auto-matching error:', err));
          }
        }

        results.inserted++;
      } catch (err) {
        console.error('Error processing webhook post:', err);
        results.errors++;
      }
    }

    res.json({ ok: true, ...results });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Error al procesar webhook' });
  }
});

// ==================== MATCHING ====================

router.post('/run-matching', requireAdmin, async (req, res) => {
  try {
    const { post_id } = req.body;
    let matches;

    if (post_id) {
      matches = await matchPostToPet(post_id);
    } else {
      const result = await runFullMatching();
      matches = result;
    }

    res.json({ ok: true, matches });
  } catch (err) {
    console.error('Error running matching:', err);
    res.status(500).json({ error: 'Error al ejecutar matching' });
  }
});

// ==================== MATCHES ====================

router.get('/matches', requireAdmin, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let sql = `SELECT fm.*,
      CASE
        WHEN fm.source_type = 'fb_post' THEN (SELECT content FROM facebook_posts WHERE id = fm.source_id::uuid)
        WHEN fm.source_type = 'app_pet' THEN (SELECT name FROM pets WHERE id = fm.source_id::uuid)
        ELSE NULL
      END as source_label,
      CASE
        WHEN fm.target_type = 'fb_post' THEN (SELECT content FROM facebook_posts WHERE id = fm.target_id::uuid)
        WHEN fm.target_type = 'app_pet' THEN (SELECT name FROM pets WHERE id = fm.target_id::uuid)
        ELSE NULL
      END as target_label
      FROM facebook_matches fm WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (status && status !== 'all') {
      sql += ` AND fm.status = $${idx++}`;
      params.push(status);
    }

    sql += ' ORDER BY fm.created_at DESC';
    sql += ` LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await pool.query(sql, params);

    const countRes = await pool.query('SELECT COUNT(*) as total FROM facebook_matches');
    const total = parseInt(countRes.rows[0].total, 10);

    res.json({ matches: result.rows, total });
  } catch (err) {
    console.error('Error fetching matches:', err);
    res.status(500).json({ error: 'Error al obtener matches' });
  }
});

router.post('/matches/:id/confirm', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE facebook_matches SET status = 'confirmed', confirmed_by = $1, confirmed_at = NOW() WHERE id = $2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Match no encontrado' });

    const match = result.rows[0];

    if (match.source_type === 'fb_post') {
      await pool.query('UPDATE facebook_posts SET is_matched = true WHERE id = $1', [match.source_id]);
    }
    if (match.target_type === 'fb_post') {
      await pool.query('UPDATE facebook_posts SET is_matched = true WHERE id = $1', [match.target_id]);
    }

    res.json(match);
  } catch (err) {
    console.error('Error confirming match:', err);
    res.status(500).json({ error: 'Error al confirmar match' });
  }
});

router.post('/matches/:id/reject', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE facebook_matches SET status = 'rejected', confirmed_by = $1, confirmed_at = NOW() WHERE id = $2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Match no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error rejecting match:', err);
    res.status(500).json({ error: 'Error al rechazar match' });
  }
});

// ==================== PUBLIC SEARCH ====================

router.get('/search', async (req, res) => {
  try {
    const { species, color, location, classification, limit = 30 } = req.query;

    let sql = `SELECT fp.id, fp.fb_post_url, fp.author_name, fp.content, fp.image_urls,
      fp.classification, fp.species, fp.color, fp.location_hint, fp.phone, fp.posted_at,
      fg.name as group_name
      FROM facebook_posts fp
      LEFT JOIN facebook_groups fg ON fp.group_id = fg.id
      WHERE fp.classification IN ('lost', 'found')`;
    const params = [];
    let idx = 1;

    if (species && species !== 'all') {
      sql += ` AND fp.species = $${idx++}`;
      params.push(species);
    }
    if (classification && classification !== 'all') {
      sql += ` AND fp.classification = $${idx++}`;
      params.push(classification);
    }
    if (color) {
      sql += ` AND fp.color ILIKE $${idx++}`;
      params.push(`%${color}%`);
    }
    if (location) {
      sql += ` AND fp.location_hint ILIKE $${idx++}`;
      params.push(`%${location}%`);
    }

    sql += ' ORDER BY fp.posted_at DESC NULLS LAST LIMIT $' + idx++;
    params.push(parseInt(limit, 10));

    const result = await pool.query(sql, params);
    res.json({ posts: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Error searching posts:', err);
    res.status(500).json({ error: 'Error al buscar publicaciones' });
  }
});

// ==================== CLASSIFY (manual trigger) ====================

router.post('/classify/:id', requireAdmin, async (req, res) => {
  try {
    const postRes = await pool.query('SELECT * FROM facebook_posts WHERE id = $1', [req.params.id]);
    if (postRes.rows.length === 0) return res.status(404).json({ error: 'Publicación no encontrada' });

    const post = postRes.rows[0];
    const result = await classifyAndExtract(post.content || '', post.image_urls || []);

    await pool.query(
      `UPDATE facebook_posts SET
        classification = $1, species = $2, color = $3,
        location_hint = $4, phone = $5, latitude = $6, longitude = $7, updated_at = NOW()
       WHERE id = $8`,
      [result.classification, result.species, result.color, result.location_hint, result.phone, result.location_lat, result.location_lng, req.params.id]
    );

    res.json({ ok: true, classification: result });
  } catch (err) {
    console.error('Error classifying post:', err);
    res.status(500).json({ error: 'Error al clasificar publicación' });
  }
});

// ==================== COOKIES ====================

function parseCookiesInfo(filepath) {
  if (!existsSync(filepath)) return { exists: false, count: 0, expires: null };
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('HttpOnly'));
  const parsed = lines.map(l => l.split('\t')).filter(p => p.length >= 7);
  const expires = parsed
    .map(p => parseInt(p[4], 10))
    .filter(e => e > 0)
    .sort((a, b) => a - b);
  return {
    exists: true,
    count: parsed.length,
    expires: expires.length > 0 ? new Date(expires[0] * 1000).toISOString() : null,
  };
}

router.get('/cookies-status', requireAdmin, (_req, res) => {
  try {
    res.json(parseCookiesInfo(COOKIES_PATH));
  } catch (err) {
    console.error('Error reading cookies status:', err);
    res.status(500).json({ error: 'Error al leer cookies' });
  }
});

router.post('/upload-cookies', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' });
    const content = req.file.buffer.toString('utf-8');
    // Validate basic Netscape format: must contain .facebook.com
    if (!content.includes('.facebook.com') && !content.includes('facebook.com')) {
      return res.status(400).json({ error: 'Formato inválido: no se encontraron cookies de facebook.com' });
    }
    const dir = dirname(COOKIES_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(COOKIES_PATH, content, 'utf-8');
    pushConfig().catch(() => {});
    const info = parseCookiesInfo(COOKIES_PATH);
    res.json({ ok: true, count: info.count, expires: info.expires });
  } catch (err) {
    console.error('Error uploading cookies:', err);
    res.status(500).json({ error: 'Error al guardar cookies' });
  }
});

// ==================== STATS ====================

router.get('/stats', requireAdmin, async (_req, res) => {
  try {
    const totalPosts = await pool.query('SELECT COUNT(*) FROM facebook_posts');
    const byClassification = await pool.query(
      "SELECT classification, COUNT(*) FROM facebook_posts GROUP BY classification"
    );
    const totalMatches = await pool.query('SELECT COUNT(*) FROM facebook_matches');
    const pendingMatches = await pool.query("SELECT COUNT(*) FROM facebook_matches WHERE status = 'pending'");
    const confirmedMatches = await pool.query("SELECT COUNT(*) FROM facebook_matches WHERE status = 'confirmed'");
    const totalGroups = await pool.query('SELECT COUNT(*) FROM facebook_groups');
    const activeGroups = await pool.query('SELECT COUNT(*) FROM facebook_groups WHERE is_active = true');

    const classificationMap = {};
    byClassification.rows.forEach(r => { classificationMap[r.classification] = parseInt(r.count, 10); });

    res.json({
      totalPosts: parseInt(totalPosts.rows[0].count, 10),
      byClassification: classificationMap,
      totalMatches: parseInt(totalMatches.rows[0].count, 10),
      pendingMatches: parseInt(pendingMatches.rows[0].count, 10),
      confirmedMatches: parseInt(confirmedMatches.rows[0].count, 10),
      totalGroups: parseInt(totalGroups.rows[0].count, 10),
      activeGroups: parseInt(activeGroups.rows[0].count, 10),
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ==================== PUBLISHER (Instagram → Facebook Page + Groups) ====================

router.post('/publish', requireAdmin, async (req, res) => {
  try {
    const { petId } = req.body;
    if (!petId) return res.status(400).json({ error: 'petId requerido' });
    const result = await publishToPage(petId);
    if (result.success) {
      await pool.query(
        `INSERT INTO facebook_page_posts (pet_id, page_post_id, message, status, published_at)
         VALUES ($1, $2, $3, 'published', NOW())`,
        [petId, result.pagePostId, result.message || '']
      );
    }
    if (result.error) return res.status(500).json(result);
    res.json(result);
  } catch (err) {
    console.error('Error publishing to Facebook Page:', err);
    res.status(500).json({ error: 'Error al publicar en Facebook' });
  }
});

router.post('/publish-instagram/:id', requireAdmin, async (req, res) => {
  try {
    const result = await replicateInstagramToFacebook(req.params.id);
    if (result.error) return res.status(500).json(result);
    res.json(result);
  } catch (err) {
    console.error('Error replicating Instagram post:', err);
    res.status(500).json({ error: 'Error al replicar post de Instagram' });
  }
});

router.post('/replicate-latest', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const results = await replicateLatestInstagramPosts(limit);
    res.json({ results });
  } catch (err) {
    console.error('Error replicating latest posts:', err);
    res.status(500).json({ error: 'Error al replicar posts recientes' });
  }
});

router.post('/retry-failed', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const results = await retryFailedFacebookPosts(limit);
    res.json({ results });
  } catch (err) {
    console.error('Error retrying failed posts:', err);
    res.status(500).json({ error: 'Error al reintentar posts fallidos' });
  }
});

router.post('/publish-pet-to-groups/:petId', requireAdmin, async (req, res) => {
  try {
    const result = await publishPetToGroups(req.params.petId);
    if (result.alreadyPublished) return res.status(409).json(result);
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    console.error('Error publishing pet to groups:', err);
    res.status(500).json({ error: 'Error al publicar mascota a grupos' });
  }
});

router.post('/extract-group-ids', requireAdmin, async (req, res) => {
  try {
    const groups = await pool.query(
      `SELECT id, url FROM facebook_groups
       WHERE url IS NOT NULL AND (fb_group_id IS NULL OR fb_group_id = '')`
    );
    let updated = 0;
    for (const g of groups.rows) {
      const match = g.url.match(/facebook\.com\/groups\/(\d+)/);
      if (match) {
        await pool.query(
          'UPDATE facebook_groups SET fb_group_id = $1, updated_at = NOW() WHERE id = $2',
          [match[1], g.id]
        );
        updated++;
      }
    }
    res.json({ updated });
  } catch (err) {
    console.error('Error extracting group IDs:', err);
    res.status(500).json({ error: 'Error al extraer IDs de grupos' });
  }
});

router.get('/page-posts', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await pool.query(
      `SELECT fpp.*, ip.ig_permalink, ip.status as ig_status,
              p.name as pet_name, p.status as pet_status, p.species
       FROM facebook_page_posts fpp
       LEFT JOIN instagram_posts ip ON ip.id = fpp.instagram_post_id
       LEFT JOIN pets p ON p.id = fpp.pet_id
       ORDER BY fpp.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit, 10), parseInt(offset, 10)]
    );
    const countRes = await pool.query('SELECT COUNT(*) as total FROM facebook_page_posts');
    res.json({ posts: result.rows, total: parseInt(countRes.rows[0].total, 10) });
  } catch (err) {
    console.error('Error fetching page posts:', err);
    res.status(500).json({ error: 'Error al obtener publicaciones de Page' });
  }
});

router.put('/groups/:id/page-member', requireAdmin, async (req, res) => {
  try {
    const { page_is_member, fb_group_id, publish_on_create } = req.body;
    const result = await pool.query(
      `UPDATE facebook_groups SET
        page_is_member = COALESCE($1, page_is_member),
        fb_group_id = COALESCE($2, fb_group_id),
        publish_on_create = COALESCE($3, publish_on_create),
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [page_is_member, fb_group_id, publish_on_create, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating group page membership:', err);
    res.status(500).json({ error: 'Error al actualizar membresía del grupo' });
  }
});

router.post('/groups/verify-memberships', requireAdmin, async (_req, res) => {
  try {
    const { verifyAllGroupMemberships } = await import('../services/facebookPublisher.js');
    const result = await verifyAllGroupMemberships();
    res.json(result);
  } catch (err) {
    console.error('Error verifying group memberships:', err);
    res.status(500).json({ error: 'Error al verificar membresías de grupos' });
  }
});

router.post('/groups/:id/verify-membership', requireAdmin, async (req, res) => {
  try {
    const groupResult = await pool.query(
      'SELECT id, name, fb_group_id FROM facebook_groups WHERE id = $1',
      [req.params.id]
    );
    if (groupResult.rows.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
    const group = groupResult.rows[0];

    if (!group.fb_group_id) {
      return res.json({ groupId: group.id, name: group.name, isMember: false, error: 'Grupo sin fb_group_id configurado' });
    }

    const { checkPageMembershipInGroup } = await import('../services/facebookPublisher.js');
    const result = await checkPageMembershipInGroup(group.fb_group_id);

    if (result.error && result.error.includes('Token')) {
      return res.status(401).json({ error: result.error });
    }

    if (result.isMember !== undefined) {
      await pool.query(
        'UPDATE facebook_groups SET page_is_member = $1, updated_at = NOW() WHERE id = $2',
        [result.isMember, group.id]
      );
    }

    res.json({
      groupId: group.id,
      name: group.name,
      fbGroupId: group.fb_group_id,
      isMember: result.isMember || false,
      membersCount: result.members,
      pageIdUsed: result.pageId || null,
      error: result.error || null,
      changed: false,
    });
  } catch (err) {
    console.error('Error verifying group membership:', err);
    res.status(500).json({ error: 'Error al verificar membresía del grupo' });
  }
});

router.get('/publish-status', requireAdmin, async (_req, res) => {
  try {
    const enabled = await pool.query("SELECT value FROM settings WHERE key = 'facebook_page_publisher_enabled'");
    const pageIdSetting = await pool.query("SELECT value FROM settings WHERE key = 'facebook_page_id'");
    const tokenSetting = await pool.query("SELECT value FROM settings WHERE key = 'instagram_access_token'");
    const groupsRes = await pool.query(
      "SELECT id, name, fb_group_id, page_is_member FROM facebook_groups WHERE is_active = true ORDER BY name"
    );
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'published') as published,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
      FROM facebook_page_posts
    `);

    let tokenHasPages = false;
    let actualPages = [];
    if (tokenSetting.rows[0]?.value) {
      try {
        const pagesRes = await fetch(
          `https://graph.facebook.com/v22.0/me/accounts?access_token=${encodeURIComponent(tokenSetting.rows[0].value)}&fields=id,name`
        );
        const pagesData = await pagesRes.json();
        actualPages = pagesData?.data || [];
        tokenHasPages = actualPages.length > 0;
      } catch { }
    }

    res.json({
      enabled: enabled.rows[0]?.value === 'true',
      storedPageId: pageIdSetting.rows[0]?.value || '',
      tokenHasPages,
      actualPages,
      groups: groupsRes.rows,
      stats: stats.rows[0],
    });
  } catch (err) {
    console.error('Error fetching publish status:', err);
    res.status(500).json({ error: 'Error al obtener estado del publisher' });
  }
});

export default router;
