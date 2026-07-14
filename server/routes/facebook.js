import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../auth.js';
import { classifyPost } from '../services/geminiClassifier.js';
import { getSessionFile } from '../services/facebookRelayService.js';
import { enqueue } from '../services/phoneRelayService.js';
import { normalizePhone } from '../services/phoneUtils.js';

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
    const trimmed = url.trim();
    if (!/^https?:\/\/(www\.)?(facebook\.com|fb\.com)\/groups\//i.test(trimmed)) {
      return res.status(400).json({ error: 'La URL debe ser de un grupo de Facebook (facebook.com/groups/...)' });
    }
    const result = await pool.query(
      'INSERT INTO facebook_groups (name, url) VALUES ($1, $2) RETURNING *',
      [name.trim(), trimmed]
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
    const { name, url, is_active, scrape_enabled } = req.body;
    const result = await pool.query(
      `UPDATE facebook_groups SET
        name = COALESCE($1, name),
        url = COALESCE($2, url),
        is_active = COALESCE($3, is_active),
        scrape_enabled = COALESCE($4, scrape_enabled),
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, url, is_active, scrape_enabled, id]
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
    try {
      await pool.query('DELETE FROM facebook_matches WHERE (source_type = $1 AND source_id = $2) OR (target_type = $1 AND target_id = $2)',
        ['fb_post', req.params.id]);
    } catch (matchErr) {
      console.error('Error deleting matches (non-fatal):', matchErr.message);
    }
    const result = await pool.query('DELETE FROM facebook_posts WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Publicación no encontrada' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('Error deleting post:', err.message);
    res.status(500).json({ error: `Error al eliminar publicación: ${err.message}` });
  }
});

router.post('/posts/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de IDs' });
    }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    try {
      await pool.query(
        `DELETE FROM facebook_matches WHERE (source_type = 'fb_post' AND source_id IN (${placeholders})) OR (target_type = 'fb_post' AND target_id IN (${placeholders}))`,
        [...ids, ...ids]
      );
    } catch (matchErr) {
      console.error('Error bulk-deleting matches (non-fatal):', matchErr.message);
    }
    const result = await pool.query(`DELETE FROM facebook_posts WHERE id IN (${placeholders}) RETURNING id`, ids);
    res.json({ deleted: result.rows.length });
  } catch (err) {
    console.error('Error bulk-deleting posts:', err.message);
    res.status(500).json({ error: `Error al eliminar publicaciones: ${err.message}` });
  }
});

// ==================== WEBHOOK (scraper → app) ====================

router.post('/webhook', async (req, res) => {
  const auth = req.headers.authorization;
  const scraperToken = await getScraperToken();
  const relayToken = process.env.RELAY_TOKEN;
  const validTokens = [scraperToken, relayToken].filter(Boolean);
  const isValid = auth && validTokens.some(t => auth === `Bearer ${t}`);
  if (!isValid) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const isRelay = auth === `Bearer ${process.env.RELAY_TOKEN}`;
  if (!isRelay) {
    const enabled = await isScrapingEnabled();
    if (!enabled) {
      return res.status(403).json({ error: 'Scraping deshabilitado' });
    }
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

        let classification;
        try {
          classification = await classifyPost(content || '', image_urls || [], comments || []);
        } catch (e) {
          classification = { classification: 'unclassified', species: null, color: null, location_hint: null, phone: null, location_lat: null, location_lng: null, comments: [] };
        }
        const cmtClassified = classification.comments || [];

        const existing = await pool.query('SELECT id FROM facebook_posts WHERE fb_post_id = $1', [fb_post_id]);
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
        if (existing.rows.length > 0) results.updated++; else results.inserted++;

        const postId = postResult.rows[0]?.id;

        if (postId && comments && comments.length > 0) {
          const rawComments = comments.slice(0, 20);
          for (let i = 0; i < rawComments.length; i++) {
            const cmt = rawComments[i];
            const cmtClass = (cmtClassified && cmtClassified[i]?.classification) || 'info';
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

      } catch (err) {
        console.error('Error processing webhook post:', err.message);
        results.errors++;
      }
    }

    process.stdout.write(`[Webhook] ${results.inserted} inserted, ${results.updated} updated, ${results.errors} errors\n`);
    res.json({ ok: true, ...results });
  } catch (err) {
    process.stderr.write(`Webhook error: ${err.message}\n`);
    res.status(500).json({ error: 'Error al procesar webhook' });
  }
});

// ==================== SCRAPER GROUPS (para el scraper del VPS) ====================

router.get('/scraper-groups', async (req, res) => {
  const token = await getScraperToken();
  const relayToken = process.env.RELAY_TOKEN;
  const qToken = req.query.token;
  const authHeader = req.headers.authorization;
  const isRelay = relayToken && authHeader === `Bearer ${relayToken}`;
  if (!isRelay && (!qToken || qToken !== token)) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  const enabled = await isScrapingEnabled();
  if (!enabled) {
    return res.status(403).json({ error: 'Scraping deshabilitado' });
  }
  try {
    const result = await pool.query(
      "SELECT id, name, url, fb_group_id FROM facebook_groups WHERE is_active = true AND scrape_enabled = true ORDER BY name ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching scraper groups:', err);
    res.status(500).json({ error: 'Error al obtener grupos' });
  }
});

// ==================== SCRAPER CONFIG (para fb-pup-scraper) ====================

router.get('/scraper-config', async (req, res) => {
  const relayToken = process.env.RELAY_TOKEN;
  const authHeader = req.headers.authorization;
  if (!relayToken || authHeader !== `Bearer ${relayToken}`) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  try {
    const keys = ['fb_scraper_from', 'fb_scraper_to', 'fb_scraper_interval', 'fb_scraping_enabled'];
    const placeholders = keys.map((_, i) => '$' + (i + 1)).join(',');
    const result = await pool.query(`SELECT key, value FROM settings WHERE key IN (${placeholders})`, keys);
    const data = { hour_start: '8', hour_end: '20', interval_hours: '4', scraping_enabled: 'false' };
    result.rows.forEach(r => {
      if (r.key === 'fb_scraper_from') data.hour_start = r.value;
      else if (r.key === 'fb_scraper_to') data.hour_end = r.value;
      else if (r.key === 'fb_scraper_interval') data.interval_hours = r.value;
      else if (r.key === 'fb_scraping_enabled') data.scraping_enabled = r.value;
    });
    res.json(data);
  } catch (err) {
    console.error('Error fetching scraper config:', err);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// ==================== SESSION FILE (para el scraper Python) ====================

router.get('/session-file', async (req, res) => {
  const token = await getScraperToken();
  const qToken = req.query.token;
  if (!qToken || qToken !== token) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  try {
    const data = await getSessionFile();
    if (!data) return res.status(404).json({ error: 'No hay sesión guardada' });
    res.json({ data });
  } catch (err) {
    console.error('Error obteniendo session file:', err);
    res.status(500).json({ error: 'Error al obtener sesión' });
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
        WHEN fm.source_type IN ('app_pet', 'wa_report', 'wa_group') THEN (SELECT name FROM pets WHERE id = fm.source_id::uuid)
        ELSE NULL
      END as source_label,
      CASE
        WHEN fm.target_type = 'fb_post' THEN (SELECT content FROM facebook_posts WHERE id = fm.target_id::uuid)
        WHEN fm.target_type IN ('app_pet', 'wa_report', 'wa_group') THEN (SELECT name FROM pets WHERE id = fm.target_id::uuid)
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

    // Notify contactable side(s) about the confirmed match
    async function getPetWithPhone(petId) {
      const pet = (await pool.query(
        `SELECT p.*, u.phone as user_phone FROM pets p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = $1`,
        [petId]
      )).rows[0];
      if (!pet) return null;
      const phone = normalizePhone(pet.user_phone);
      if (phone) return { phone, pet };
      const cleaned = (pet.contact_info || '').replace(/\D/g, '');
      if (cleaned.length >= 8) return { phone: normalizePhone(pet.contact_info), pet };
      return null;
    }

    let sourceDesc = '', targetDesc = '';
    if (match.source_type === 'fb_post') {
      const post = (await pool.query('SELECT content, author_name, fb_post_url FROM facebook_posts WHERE id = $1', [match.source_id])).rows[0];
      if (post) sourceDesc = `📝 *Publicación en Facebook*\n${(post.content || '').substring(0, 200)}${post.fb_post_url ? '\n🔗 ' + post.fb_post_url : ''}`;
    } else {
      const info = await getPetWithPhone(match.source_id);
      if (info) sourceDesc = `🐾 *${info.pet.name || info.pet.species}* — ${info.pet.status} (${info.pet.location || 'sin ubicación'})`;
    }
    if (match.target_type === 'fb_post') {
      const post = (await pool.query('SELECT content, author_name, fb_post_url FROM facebook_posts WHERE id = $1', [match.target_id])).rows[0];
      if (post) targetDesc = `📝 *Publicación en Facebook*\n${(post.content || '').substring(0, 200)}${post.fb_post_url ? '\n🔗 ' + post.fb_post_url : ''}`;
    } else {
      const info = await getPetWithPhone(match.target_id);
      if (info) targetDesc = `🐾 *${info.pet.name || info.pet.species}* — ${info.pet.status} (${info.pet.location || 'sin ubicación'})`;
    }

    const notifySide = async (type, id, otherDesc) => {
      if (type === 'fb_post' || !otherDesc) return;
      const info = await getPetWithPhone(id);
      if (!info || !info.phone) return;
      const msg = `🐾 *¡Coincidencia confirmada!*\n\nSu publicación en Sigo Tu Huella coincide con:\n\n${otherDesc}\n\nPara más información ingrese a la plataforma.`;
      enqueue(info.phone, msg).catch(e => console.error('Match notification error:', e));
    };

    notifySide(match.source_type, match.source_id, targetDesc);
    notifySide(match.target_type, match.target_id, sourceDesc);

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
    const dupCheck = await pool.query(
      'SELECT 1 FROM facebook_page_posts WHERE pet_id = $1 AND status = $2 AND group_post_ids IS NOT NULL AND array_length(group_post_ids, 1) > 0',
      [req.params.petId, 'published']
    );
    if (dupCheck.rows.length > 0) return res.status(409).json({ alreadyPublished: true, petId: req.params.petId });

    const publishId = createJob(req.params.petId);
    startJob(publishId, () => publishPetToGroups(req.params.petId));
    res.status(202).json({ publishId });
  } catch (err) {
    console.error('Error starting publish job:', err);
    res.status(500).json({ error: 'Error al iniciar publicacion' });
  }
});

router.get('/publish-status/:publishId', requireAdmin, async (req, res) => {
  const job = getJob(req.params.publishId);
  if (!job) return res.status(404).json({ error: 'Publicacion no encontrada o expirada' });
  res.json(job);
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
              p.name as pet_name, p.status as pet_status, p.species,
              (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as pet_image
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

    if (result.permissionError) {
      return res.status(403).json({ 
        error: result.error,
        isMember: null,
        pageIdUsed: result.pageId,
      });
    }

    if (result.isMember !== null) {
      await pool.query(
        'UPDATE facebook_groups SET page_is_member = $1, updated_at = NOW() WHERE id = $2',
        [result.isMember, group.id]
      );
    }

    res.json({
      groupId: group.id,
      name: group.name,
      fbGroupId: group.fb_group_id,
      isMember: result.isMember,
      membersCount: result.members,
      pageIdUsed: result.pageId,
      error: result.error || null,
      verified: result.isMember !== null,
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

// ==================== TRIGGER SCRAPE ====================

router.post('/trigger-scrape', requireAdmin, async (req, res) => {
  try {
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('fb_scrape_pending', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text"
    );
    const lastRun = await pool.query("SELECT value FROM settings WHERE key = 'apify_last_scrape_at'");
    res.json({ success: true, message: 'Scrape marcado como pendiente', lastScrape: lastRun.rows[0]?.value || null });
  } catch (err) {
    console.error('[Trigger Scrape] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== PENDING SCRAPE (para scraper desde Termux) ====================

router.get('/pending-scrape', async (req, res) => {
  const token = await getScraperToken();
  const qToken = req.query.token;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if ((!qToken || qToken !== token) && bearerToken !== token) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'fb_scrape_pending'");
    if (!result.rows[0]?.value) return res.json({ pending: false });

    const timestamp = result.rows[0].value;
    await pool.query("DELETE FROM settings WHERE key = 'fb_scrape_pending'");
    res.json({ pending: true, timestamp });
  } catch (err) {
    console.error('[Pending Scrape] Error:', err.message);
    res.status(500).json({ error: 'Error al consultar pendiente' });
  }
});

router.post('/scrape-done', async (req, res) => {
  const token = await getScraperToken();
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (bearerToken !== token && req.query.token !== token) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  try {
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('apify_last_scrape_at', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text"
    );
    await pool.query("DELETE FROM settings WHERE key = 'fb_scrape_pending'");
    res.json({ success: true });
  } catch (err) {
    console.error('[Scrape Done] Error:', err.message);
    res.status(500).json({ error: 'Error al marcar completado' });
  }
});

// ==================== SCRAPER SCRIPT (descarga para Termux) ====================

router.get('/scraper-script', async (req, res) => {
  const token = await getScraperToken();
  if (req.query.token !== token) return res.status(401).json({ error: 'Token inválido' });
  try {
    const content = Buffer.from(SCRAPER_SCRIPT_B64, 'base64').toString('utf8');
    res.type('text/plain').send(content);
  } catch (err) {
    console.error('[Scraper Script] Error:', err.message);
    res.status(500).json({ error: 'Error al leer script' });
  }
});

const SCRAPER_SCRIPT_B64 = 'IyEvdXNyL2Jpbi9lbnYgcHl0aG9uMwoiIiIKU2NyYXBlciBkZSBGYWNlYm9vayBHcm91cHMgcGFyYSBTaUh1ZWxsYS4KVXNhIGN1cmxfY2ZmaSBjb24gVExTIGZpbmdlcnByaW50IHJlYWwgZGUgQ2hyb21lIChzaW4gYnJvd3NlcikuCkNvcnJlIGRlc2RlIFRlcm11eCB1c2FuZG8gbGEgSVAgZGVsIGNlbHVsYXIgKHJlc2lkZW5jaWFsKS4KTm8gbmVjZXNpdGEgY29va2llcyBuaSBjdWVudGEgZGUgRmFjZWJvb2suCgpVc286CiAgcHl0aG9uMyBzY3JhcGVyLnB5IC0tdG9rZW4gVFVfVE9LRU4KICBweXRob24zIHNjcmFwZXIucHkgLS10b2tlbiBUVV9UT0tFTiAtLW9uY2UKIiIiCgppbXBvcnQgb3MsIHN5cywgcmUsIGpzb24sIHRpbWUsIGFyZ3BhcnNlLCBzdWJwcm9jZXNzCmZyb20gdXJsbGliLnBhcnNlIGltcG9ydCB1cmxwYXJzZQoKaW1wb3J0IHJlcXVlc3RzCgp0cnk6CiAgICBmcm9tIGN1cmxfY2ZmaSBpbXBvcnQgcmVxdWVzdHMgYXMgY2ZmaV9yZXF1ZXN0cwogICAgSEFTX0NVUkxfQ0ZGSSA9IFRydWUKZXhjZXB0IEltcG9ydEVycm9yOgogICAgSEFTX0NVUkxfQ0ZGSSA9IEZhbHNlCiAgICBwcmludCgiW3NjcmFwZXJdIGN1cmxfY2ZmaSBubyBpbnN0YWxhZG8uIEluc3RhbGFyIGNvbjogcGlwIGluc3RhbGwgY3VybF9jZmZpIikKCkFQSV9CQVNFID0gImh0dHBzOi8vc2lnb3R1aHVlbGxhLm9ubGluZSIKCk1PQklMRV9VQSA9ICgKICAgICJNb3ppbGxhLzUuMCAoTGludXg7IEFuZHJvaWQgMTQ7IFBpeGVsIDgpICIKICAgICJBcHBsZVdlYktpdC81MzcuMzYgKEtIVE1MLCBsaWtlIEdlY2tvKSAiCiAgICAiQ2hyb21lLzEyNS4wLjAuMCBNb2JpbGUgU2FmYXJpLzUzNy4zNiIKKQoKSEVBREVSUyA9IHsKICAgICJVc2VyLUFnZW50IjogTU9CSUxFX1VBLAogICAgIkFjY2VwdCI6ICJ0ZXh0L2h0bWwsYXBwbGljYXRpb24veGh0bWwreG1sLGFwcGxpY2F0aW9uL3htbDtxPTAuOSxpbWFnZS9hdmlmLGltYWdlL3dlYnAsKi8qO3E9MC44IiwKICAgICJBY2NlcHQtTGFuZ3VhZ2UiOiAiZXMtNDE5LGVzO3E9MC45LGVuO3E9MC41IiwKICAgICJBY2NlcHQtRW5jb2RpbmciOiAiZ3ppcCwgZGVmbGF0ZSwgYnIiLAogICAgIlNlYy1GZXRjaC1EZXN0IjogImRvY3VtZW50IiwKICAgICJTZWMtRmV0Y2gtTW9kZSI6ICJuYXZpZ2F0ZSIsCiAgICAiU2VjLUZldGNoLVNpdGUiOiAibm9uZSIsCiAgICAiU2VjLUZldGNoLVVzZXIiOiAiPzEiLAogICAgIlVwZ3JhZGUtSW5zZWN1cmUtUmVxdWVzdHMiOiAiMSIsCn0KCgpkZWYgY2hlY2tfcGVuZGluZyh0b2tlbiwgYXBpKToKICAgIHRyeToKICAgICAgICByID0gcmVxdWVzdHMuZ2V0KGYie2FwaX0vYXBpL2ZhY2Vib29rL3BlbmRpbmctc2NyYXBlIiwgcGFyYW1zPXsidG9rZW4iOiB0b2tlbn0sIHRpbWVvdXQ9MTUpCiAgICAgICAgcmV0dXJuIHIuanNvbigpLmdldCgicGVuZGluZyIsIEZhbHNlKQogICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgIHByaW50KGYiW3NjcmFwZXJdIEVycm9yIGNoZWNrIHBlbmRpbmc6IHtlfSIpCiAgICAgICAgcmV0dXJuIEZhbHNlCgoKZGVmIG1hcmtfZG9uZSh0b2tlbiwgYXBpKToKICAgIHRyeToKICAgICAgICByID0gcmVxdWVzdHMucG9zdChmInthcGl9L2FwaS9mYWNlYm9vay9zY3JhcGUtZG9uZSIsIHBhcmFtcz17InRva2VuIjogdG9rZW59LCB0aW1lb3V0PTE1KQogICAgICAgIGlmIHIuc3RhdHVzX2NvZGUgPT0gMjAwOgogICAgICAgICAgICBwcmludCgiW3NjcmFwZXJdIFNjcmFwZSBtYXJjYWRvIGNvbW8gY29tcGxldGFkbyIpCiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgcHJpbnQoZiJbc2NyYXBlcl0gRXJyb3IgbWFyayBkb25lOiB7ZX0iKQoKCmRlZiBnZXRfZ3JvdXBzKHRva2VuLCBhcGkpOgogICAgciA9IHJlcXVlc3RzLmdldChmInthcGl9L2FwaS9mYWNlYm9vay9zY3JhcGVyLWdyb3VwcyIsIHBhcmFtcz17InRva2VuIjogdG9rZW59LCB0aW1lb3V0PTE1KQogICAgaWYgci5zdGF0dXNfY29kZSAhPSAyMDA6CiAgICAgICAgcHJpbnQoZiJbc2NyYXBlcl0gRXJyb3IgZ3J1cG9zOiBIVFRQIHtyLnN0YXR1c19jb2RlfSIpCiAgICAgICAgc3lzLmV4aXQoMSkKICAgIGdydXBvcyA9IHIuanNvbigpCiAgICBwcmludChmIltzY3JhcGVyXSBHcnVwb3MgYWN0aXZvczoge2xlbihncnVwb3MpfSIpCiAgICByZXR1cm4gZ3J1cG9zCgoKZGVmIGZldGNoX2h0bWwodXJsLCBkZWJ1Zz1GYWxzZSk6CiAgICBpZiBub3QgSEFTX0NVUkxfQ0ZGSToKICAgICAgICBwcmludCgiW3NjcmFwZXJdIGN1cmxfY2ZmaSBubyBkaXNwb25pYmxlIikKICAgICAgICByZXR1cm4gTm9uZQogICAgdHJ5OgogICAgICAgIHIgPSBjZmZpX3JlcXVlc3RzLmdldCh1cmwsIGhlYWRlcnM9SEVBREVSUywgaW1wZXJzb25hdGU9ImNocm9tZSIsIHRpbWVvdXQ9MzApCiAgICAgICAgci5yYWlzZV9mb3Jfc3RhdHVzKCkKICAgICAgICBodG1sID0gci50ZXh0CiAgICAgICAgaWYgZGVidWc6CiAgICAgICAgICAgIGRlYnVnX3BhdGggPSAiL3RtcC9mYl9kZWJ1Zy5odG1sIgogICAgICAgICAgICB3aXRoIG9wZW4oZGVidWdfcGF0aCwgInciLCBlbmNvZGluZz0idXRmLTgiKSBhcyBmOgogICAgICAgICAgICAgICAgZi53cml0ZShodG1sKQogICAgICAgICAgICBwcmludChmIiAgW2RlYnVnXSBIVE1MIGd1YXJkYWRvIGVuIHtkZWJ1Z19wYXRofSAoe2xlbihodG1sKX0gY2hhcnMpIikKICAgICAgICBpZiBub3QgaHRtbCBvciBsZW4oaHRtbCkgPCAxMDA6CiAgICAgICAgICAgIHByaW50KGYiICBIVE1MIHZhY2lvIG8gbXV5IGNvcnRvICh7bGVuKGh0bWwpfSBjaGFycykiKQogICAgICAgICAgICByZXR1cm4gTm9uZQogICAgICAgIHJldHVybiBodG1sCiAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgcHJpbnQoZiIgIEVycm9yIGZldGNoOiB7ZX0iKQogICAgICAgIHJldHVybiBOb25lCgoKZGVmIGRlYnVnX2luZm8oaHRtbCk6CiAgICB0aXRsZSA9IHJlLnNlYXJjaChyJzx0aXRsZT4oLio/KTwvdGl0bGU+JywgaHRtbCwgcmUuRE9UQUxMKQogICAgdGl0bGVfdGV4dCA9IHRpdGxlLmdyb3VwKDEpLnN0cmlwKCkgaWYgdGl0bGUgZWxzZSAiTk8gVElUTEUiCiAgICBoYXNfbG9naW4gPSAnbG9naW4nIGluIGh0bWwubG93ZXIoKQogICAgaGFzX2FydGljbGUgPSAncm9sZT0iYXJ0aWNsZSInIGluIGh0bWwKICAgIGhhc19wb3N0X2xpbmsgPSAnL3Bvc3RzLycgaW4gaHRtbCBvciAnZnRpZD0nIGluIGh0bWwKICAgIGhhc19zZXJ2ZXJqcyA9ICdyZXF1aXJlKCJTZXJ2ZXJKUyIpJyBpbiBodG1sIG9yICdTZXJ2ZXJKUycgaW4gaHRtbAogICAgaGFzX2RhdGFfc3RvcmUgPSAnIl9fYmJveCInIGluIGh0bWwgb3IgJyJyZXF1aXJlIicgaW4gaHRtbAogICAgcHJpbnQoZiIgIFtkZWJ1Z10gVGl0bGU6IHt0aXRsZV90ZXh0fSIpCiAgICBwcmludChmIiAgW2RlYnVnXSBMb2dpbjoge2hhc19sb2dpbn0sIEFydGljbGU6IHtoYXNfYXJ0aWNsZX0sIFBvc3QgbGlua3M6IHtoYXNfcG9zdF9saW5rfSIpCiAgICBwcmludChmIiAgW2RlYnVnXSBTZXJ2ZXJKUzoge2hhc19zZXJ2ZXJqc30sIERhdGFTdG9yZToge2hhc19kYXRhX3N0b3JlfSIpCiAgICBzbmlwcGV0ID0gcmUuc3ViKHInPFtePl0rPicsICcgJywgaHRtbFs6MzAwMF0pLnN0cmlwKClbOjUwMF0KICAgIHByaW50KGYiICBbZGVidWddIFByZXZpZXc6IHtzbmlwcGV0WzozMDBdfS4uLiIpCgoKZGVmIGV4dHJhY3RfcG9zdHNfZnJvbV9qc29uKGh0bWwsIGdpZCwgc2x1Zyk6CiAgICBwb3N0cyA9IFtdCiAgICBzZWVuID0gc2V0KCkKCiAgICBtYXRjaGVzID0gcmUuZmluZGFsbCgKICAgICAgICByJ3JlcXVpcmVcKCJTZXJ2ZXJKUyJcKVwuaGFuZGxlXCgoLio/KVwpO1xzKjwvc2NyaXB0PicsCiAgICAgICAgaHRtbCwgcmUuRE9UQUxMCiAgICApCiAgICBpZiBub3QgbWF0Y2hlczoKICAgICAgICBtYXRjaGVzID0gcmUuZmluZGFsbCgKICAgICAgICAgICAgcicicmVxdWlyZSJccyo6XHMqXFtcWy4qPyJfX2Jib3giXHMqOlxzKihcey4qP1x9KVxzKlxdJywKICAgICAgICAgICAgaHRtbCwgcmUuRE9UQUxMCiAgICAgICAgKQoKICAgIGZvciBtYXRjaCBpbiBtYXRjaGVzOgogICAgICAgIHRyeToKICAgICAgICAgICAgZGF0YSA9IGpzb24ubG9hZHMobWF0Y2gpCiAgICAgICAgZXhjZXB0IChqc29uLkpTT05EZWNvZGVFcnJvciwgVmFsdWVFcnJvcik6CiAgICAgICAgICAgIGNvbnRpbnVlCgogICAgICAgIHRleHQgPSBqc29uLmR1bXBzKGRhdGEpCgogICAgICAgIHBpZHMgPSByZS5maW5kYWxsKHInL3Bvc3RzLyhcZCspJywgdGV4dCkKICAgICAgICBmb3IgcGlkIGluIHBpZHM6CiAgICAgICAgICAgIGlmIHBpZCBpbiBzZWVuIG9yIGxlbihwaWQpIDwgMTA6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICBzZWVuLmFkZChwaWQpCgogICAgICAgICAgICBwb3N0X2RhdGEgPSBOb25lCiAgICAgICAgICAgIGZvciBrZXlfbWF0Y2ggaW4gcmUuZmluZGl0ZXIociciJyArIHBpZCArIHInIlxzKjpccyooXHtbXn1dKiJtZXNzYWdlIlxzKjpccyoiW14iXSoiW159XSpcfSknLCB0ZXh0KToKICAgICAgICAgICAgICAgIHRyeToKICAgICAgICAgICAgICAgICAgICBwb3N0X2RhdGEgPSBqc29uLmxvYWRzKGtleV9tYXRjaC5ncm91cCgxKSkKICAgICAgICAgICAgICAgIGV4Y2VwdCAoanNvbi5KU09ORGVjb2RlRXJyb3IsIFZhbHVlRXJyb3IpOgogICAgICAgICAgICAgICAgICAgIHBhc3MKCiAgICAgICAgICAgIGNvbnRlbnQgPSAiIgogICAgICAgICAgICBpZiBwb3N0X2RhdGE6CiAgICAgICAgICAgICAgICBjb250ZW50ID0gcG9zdF9kYXRhLmdldCgibWVzc2FnZSIsICIiKQogICAgICAgICAgICBpZiBub3QgY29udGVudDoKICAgICAgICAgICAgICAgIG1zZ19tYXRjaCA9IHJlLnNlYXJjaChyJyJtZXNzYWdlIlxzKjpccyoiKFteIl17JyArIHInMTUsJyArIHInfSkiJywgdGV4dCkKICAgICAgICAgICAgICAgIGlmIG1zZ19tYXRjaDoKICAgICAgICAgICAgICAgICAgICBjb250ZW50ID0gbXNnX21hdGNoLmdyb3VwKDEpCiAgICAgICAgICAgICAgICAgICAgY29udGVudCA9IGNvbnRlbnQuZW5jb2RlKCkuZGVjb2RlKCd1bmljb2RlX2VzY2FwZScsIGVycm9ycz0ncmVwbGFjZScpCgogICAgICAgICAgICBhdXRob3IgPSAiIgogICAgICAgICAgICBmb3IgYXV0aG9yX21hdGNoIGluIHJlLmZpbmRpdGVyKHInImF1dGhvciJccyo6XHMqXHtbXn1dKiJuYW1lIlxzKjpccyoiKFteIl0rKSInLCB0ZXh0KToKICAgICAgICAgICAgICAgIGF1dGhvciA9IGF1dGhvcl9tYXRjaC5ncm91cCgxKQogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICAgICAgaWYgbm90IGF1dGhvcjoKICAgICAgICAgICAgICAgIGF1dGhvcl9tYXRjaCA9IHJlLnNlYXJjaChyJyJuYW1lIlxzKjpccyoiKFteIl17Myw1MH0pIltefV0qImlkIlxzKjpccyoiJyArIHJlLmVzY2FwZShnaWQpLCB0ZXh0KQogICAgICAgICAgICAgICAgaWYgYXV0aG9yX21hdGNoOgogICAgICAgICAgICAgICAgICAgIGF1dGhvciA9IGF1dGhvcl9tYXRjaC5ncm91cCgxKQoKICAgICAgICAgICAgaW1hZ2VzID0gcmUuZmluZGFsbChyJyJpbWFnZSJccyo6XHMqXHtbXn1dKiJ1cmkiXHMqOlxzKiIoW14iXSooPzpzY29udGVudHxmYmNkbilbXiJdKikiJywgdGV4dCkKICAgICAgICAgICAgaWYgbm90IGltYWdlczoKICAgICAgICAgICAgICAgIGltYWdlcyA9IHJlLmZpbmRhbGwocicidXJpIlxzKjpccyoiKFteIl0qKD86c2NvbnRlbnR8ZmJjZG4pW14iXSopIicsIHRleHQpCgogICAgICAgICAgICBwb3N0cy5hcHBlbmQoewogICAgICAgICAgICAgICAgImZiX3Bvc3RfaWQiOiBwaWQsCiAgICAgICAgICAgICAgICAiZ3JvdXBfaWQiOiBnaWQsCiAgICAgICAgICAgICAgICAiYXV0aG9yX25hbWUiOiBhdXRob3IsCiAgICAgICAgICAgICAgICAiY29udGVudCI6IGNvbnRlbnRbOjEwMDAwXSBpZiBjb250ZW50IGVsc2UgIiIsCiAgICAgICAgICAgICAgICAiaW1hZ2VfdXJscyI6IGltYWdlc1s6NV0sCiAgICAgICAgICAgICAgICAiZmJfcG9zdF91cmwiOiBmImh0dHBzOi8vd3d3LmZhY2Vib29rLmNvbS9ncm91cHMve3NsdWd9L3Bvc3RzL3twaWR9LyIsCiAgICAgICAgICAgIH0pCgogICAgcmV0dXJuIHBvc3RzCgoKZGVmIGV4dHJhY3RfcG9zdHNfZnJvbV9saW5rcyhodG1sLCBnaWQsIHNsdWcpOgogICAgcG9zdHMgPSBbXQogICAgc2VlbiA9IHNldCgpCgogICAgcGF0dGVybnMgPSBbCiAgICAgICAgcmYnaHJlZj0iW14iXSpmYWNlYm9va1wuY29tL2dyb3Vwcy97cmUuZXNjYXBlKHNsdWcpfS9wb3N0cy8oXGQrKVteIl0qIicsCiAgICAgICAgcmYnaHJlZj0iL2dyb3Vwcy97cmUuZXNjYXBlKHNsdWcpfS9wb3N0cy8oXGQrKVteIl0qIicsCiAgICAgICAgcidocmVmPSJbXiJdKiIvcG9zdHMvKFxkKyknLAogICAgICAgIHInZnRpZD0oXGQrKScsCiAgICBdCgogICAgYWxsX3BpZHMgPSBbXQogICAgZm9yIHBhdCBpbiBwYXR0ZXJuczoKICAgICAgICBhbGxfcGlkcy5leHRlbmQocmUuZmluZGFsbChwYXQsIGh0bWwpKQoKICAgIGJsb2NrcyA9IHJlLnNwbGl0KHInKD89aHJlZj0iW14iXSooPzovcG9zdHMvfGZ0aWQ9KSknLCBodG1sKQoKICAgIGZvciBwaWQgaW4gYWxsX3BpZHM6CiAgICAgICAgaWYgcGlkIGluIHNlZW4gb3IgbGVuKHBpZCkgPCAxMDoKICAgICAgICAgICAgY29udGludWUKICAgICAgICBzZWVuLmFkZChwaWQpCgogICAgICAgIGJsb2NrID0gIiIKICAgICAgICBmb3IgYiBpbiBibG9ja3M6CiAgICAgICAgICAgIGlmIHBpZCBpbiBiOgogICAgICAgICAgICAgICAgYmxvY2sgPSBiWzo1MDAwXQogICAgICAgICAgICAgICAgYnJlYWsKCiAgICAgICAgY29udGVudCA9ICIiCiAgICAgICAgaWYgYmxvY2s6CiAgICAgICAgICAgIHRleHRzID0gcmUuZmluZGFsbChyJz4oW148XXsxNSx9KTwnLCBibG9jaykKICAgICAgICAgICAgY2xlYW5lZCA9IFtdCiAgICAgICAgICAgIGZvciB0IGluIHRleHRzOgogICAgICAgICAgICAgICAgdCA9IHQuc3RyaXAoKQogICAgICAgICAgICAgICAgdCA9IHJlLnN1YihyJ1xkK1xzKltobUhNXVxzKsK3JywgJycsIHQpCiAgICAgICAgICAgICAgICB0ID0gcmUuc3ViKHInKD9pKVNlZSBtb3JlfFZlciBtW2HDoV1zfE1vc3RyYXIgbVthw6FdcycsICcnLCB0KQogICAgICAgICAgICAgICAgdCA9IHQuc3RyaXAoKQogICAgICAgICAgICAgICAgaWYgbGVuKHQpID4gMTUgYW5kIG5vdCB0LnN0YXJ0c3dpdGgoJ3snKSBhbmQgbm90IHQuc3RhcnRzd2l0aCgnIicpOgogICAgICAgICAgICAgICAgICAgIGNsZWFuZWQuYXBwZW5kKHQpCiAgICAgICAgICAgIGNvbnRlbnQgPSAiXG4iLmpvaW4oY2xlYW5lZFs6M10pCgogICAgICAgIGF1dGhvciA9ICIiCiAgICAgICAgaWYgYmxvY2s6CiAgICAgICAgICAgIGZvciBwYXQgaW4gWwogICAgICAgICAgICAgICAgcic8c3Ryb25nW14+XSo+XHMqPGFbXj5dKj4oW148XSspPC9hPlxzKjwvc3Ryb25nPicsCiAgICAgICAgICAgICAgICByJzxoM1tePl0qPlxzKjxhW14+XSo+KFtePF0rKTwvYT4nLAogICAgICAgICAgICAgICAgcicibmFtZSJccyo6XHMqIihbXiJdezMsNTB9KSInLAogICAgICAgICAgICBdOgogICAgICAgICAgICAgICAgbSA9IHJlLnNlYXJjaChwYXQsIGJsb2NrLCByZS5ET1RBTEwpCiAgICAgICAgICAgICAgICBpZiBtOgogICAgICAgICAgICAgICAgICAgIGF1dGhvciA9IG0uZ3JvdXAoMSkuc3RyaXAoKQogICAgICAgICAgICAgICAgICAgIGJyZWFrCgogICAgICAgIGltYWdlcyA9IFtdCiAgICAgICAgaWYgYmxvY2s6CiAgICAgICAgICAgIGltYWdlcyA9IHJlLmZpbmRhbGwocidzcmM9IihbXiJdKig/OnNjb250ZW50fGZiY2RuKVteIl0qKSInLCBibG9jaykKCiAgICAgICAgcG9zdHMuYXBwZW5kKHsKICAgICAgICAgICAgImZiX3Bvc3RfaWQiOiBwaWQsCiAgICAgICAgICAgICJncm91cF9pZCI6IGdpZCwKICAgICAgICAgICAgImF1dGhvcl9uYW1lIjogYXV0aG9yLAogICAgICAgICAgICAiY29udGVudCI6IGNvbnRlbnRbOjEwMDAwXSwKICAgICAgICAgICAgImltYWdlX3VybHMiOiBpbWFnZXNbOjVdLAogICAgICAgICAgICAiZmJfcG9zdF91cmwiOiBmImh0dHBzOi8vd3d3LmZhY2Vib29rLmNvbS9ncm91cHMve3NsdWd9L3Bvc3RzL3twaWR9LyIsCiAgICAgICAgfSkKCiAgICByZXR1cm4gcG9zdHMKCgpkZWYgZXh0cmFjdF9wb3N0cyhodG1sLCBnaWQsIHNsdWcpOgogICAgcG9zdHMgPSBleHRyYWN0X3Bvc3RzX2Zyb21fanNvbihodG1sLCBnaWQsIHNsdWcpCiAgICBpZiBwb3N0czoKICAgICAgICBwcmludChmIiAgSlNPTjoge2xlbihwb3N0cyl9IHBvc3RzIikKICAgICAgICByZXR1cm4gcG9zdHMKCiAgICBwb3N0cyA9IGV4dHJhY3RfcG9zdHNfZnJvbV9saW5rcyhodG1sLCBnaWQsIHNsdWcpCiAgICBpZiBwb3N0czoKICAgICAgICBwcmludChmIiAgTGlua3M6IHtsZW4ocG9zdHMpfSBwb3N0cyIpCiAgICAgICAgcmV0dXJuIHBvc3RzCgogICAgc2VlbiA9IHNldCgpCiAgICBhcnRpY2xlX2Jsb2NrcyA9IHJlLmZpbmRhbGwoCiAgICAgICAgcic8ZGl2W14+XSpyb2xlPSJhcnRpY2xlIltePl0qPiguKj8pPC9kaXY+XHMqKD89PGRpdltePl0qcm9sZT0ifCQpJywKICAgICAgICBodG1sLCByZS5ET1RBTEwKICAgICkKCiAgICBmb3IgYmxvY2sgaW4gYXJ0aWNsZV9ibG9ja3M6CiAgICAgICAgaWRzID0gcmUuZmluZGFsbChyJy9wb3N0cy8oXGQrKScsIGJsb2NrKQogICAgICAgIGlmIG5vdCBpZHM6CiAgICAgICAgICAgIGlkcyA9IHJlLmZpbmRhbGwocidmdGlkPShcZCspJywgYmxvY2spCiAgICAgICAgaWYgbm90IGlkczoKICAgICAgICAgICAgY29udGludWUKICAgICAgICBwaWQgPSBpZHNbMF0KICAgICAgICBpZiBwaWQgaW4gc2VlbiBvciBsZW4ocGlkKSA8IDEwOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIHNlZW4uYWRkKHBpZCkKCiAgICAgICAgY29udGVudCA9ICIiCiAgICAgICAgbXNnID0gcmUuc2VhcmNoKHInPGRpdltePl0qPihbXjxdezE1LH0pPC9kaXY+JywgYmxvY2ssIHJlLkRPVEFMTCkKICAgICAgICBpZiBtc2c6CiAgICAgICAgICAgIHJhdyA9IG1zZy5ncm91cCgxKS5zdHJpcCgpCiAgICAgICAgICAgIHJhdyA9IHJlLnN1YihyJzxbXj5dKz4nLCAnJywgcmF3KQogICAgICAgICAgICByYXcgPSByZS5zdWIocidcZCtccypbaG1ITV1ccyrCtycsICcnLCByYXcpCiAgICAgICAgICAgIHJhdyA9IHJlLnN1YihyJyg/aSlTZWUgbW9yZXxWZXIgbVthw6Fdc3xNb3N0cmFyIG1bYcOhXXMnLCAnJywgcmF3KQogICAgICAgICAgICByYXcgPSByYXcuc3RyaXAoKQogICAgICAgICAgICBpZiBsZW4ocmF3KSA+IDE1OgogICAgICAgICAgICAgICAgY29udGVudCA9IHJhd1s6MTAwMDBdCgogICAgICAgIGF1dGhvciA9ICIiCiAgICAgICAgZm9yIHBhdCBpbiBbCiAgICAgICAgICAgIHInPHN0cm9uZ1tePl0qPlxzKjxhW14+XSo+KFtePF0rKTwvYT5ccyo8L3N0cm9uZz4nLAogICAgICAgICAgICByJzxoM1tePl0qPlxzKjxhW14+XSo+KFtePF0rKTwvYT4nLAogICAgICAgIF06CiAgICAgICAgICAgIG0gPSByZS5zZWFyY2gocGF0LCBibG9jaywgcmUuRE9UQUxMKQogICAgICAgICAgICBpZiBtOgogICAgICAgICAgICAgICAgYXV0aG9yID0gbS5ncm91cCgxKS5zdHJpcCgpCiAgICAgICAgICAgICAgICBicmVhawoKICAgICAgICBpbWFnZXMgPSByZS5maW5kYWxsKHInPGltZ1tePl0rc3JjPSIoW14iXSooPzpzY29udGVudHxmYmNkbilbXiJdKikiJywgYmxvY2spCgogICAgICAgIHBvc3RzLmFwcGVuZCh7CiAgICAgICAgICAgICJmYl9wb3N0X2lkIjogcGlkLAogICAgICAgICAgICAiZ3JvdXBfaWQiOiBnaWQsCiAgICAgICAgICAgICJhdXRob3JfbmFtZSI6IGF1dGhvciwKICAgICAgICAgICAgImNvbnRlbnQiOiBjb250ZW50LAogICAgICAgICAgICAiaW1hZ2VfdXJscyI6IGltYWdlc1s6NV0sCiAgICAgICAgICAgICJmYl9wb3N0X3VybCI6IGYiaHR0cHM6Ly93d3cuZmFjZWJvb2suY29tL2dyb3Vwcy97c2x1Z30vcG9zdHMve3BpZH0vIiwKICAgICAgICB9KQoKICAgIGlmIHBvc3RzOgogICAgICAgIHByaW50KGYiICBIVE1MOiB7bGVuKHBvc3RzKX0gcG9zdHMiKQogICAgcmV0dXJuIHBvc3RzCgoKZGVmIHNlbmRfcG9zdHMocG9zdHMsIHRva2VuLCBhcGkpOgogICAgZm9yIHBvc3QgaW4gcG9zdHM6CiAgICAgICAgdHJ5OgogICAgICAgICAgICByID0gcmVxdWVzdHMucG9zdChmInthcGl9L2FwaS9mYWNlYm9vay93ZWJob29rIiwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAganNvbj17InBvc3RzIjogW3Bvc3RdfSwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVhZGVycz17IkF1dGhvcml6YXRpb24iOiBmIkJlYXJlciB7dG9rZW59In0sCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVvdXQ9MzApCiAgICAgICAgICAgIGlmIHIuc3RhdHVzX2NvZGUgPT0gMjAwOgogICAgICAgICAgICAgICAgcHJpbnQoZiIgIE9LIHtwb3N0WydmYl9wb3N0X2lkJ119IikKICAgICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgIHByaW50KGYiICBGQUlMIHtwb3N0WydmYl9wb3N0X2lkJ119OiBIVFRQIHtyLnN0YXR1c19jb2RlfSIpCiAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgICAgICBwcmludChmIiAgRkFJTCB7cG9zdFsnZmJfcG9zdF9pZCddfToge2V9IikKCgpkZWYgc2NyYXBlKHRva2VuLCBhcGksIGRlYnVnPUZhbHNlKToKICAgIGdydXBvcyA9IGdldF9ncm91cHModG9rZW4sIGFwaSkKICAgIGlmIG5vdCBncnVwb3M6CiAgICAgICAgcHJpbnQoIltzY3JhcGVyXSBObyBoYXkgZ3J1cG9zIikKICAgICAgICByZXR1cm4KCiAgICBmaXJzdF9vayA9IEZhbHNlCiAgICBmb3IgZ3J1cG8gaW4gZ3J1cG9zOgogICAgICAgIGdpZCA9IGdydXBvWyJpZCJdCiAgICAgICAgc2x1ZyA9IHVybHBhcnNlKGdydXBvWyJ1cmwiXSkucGF0aC5yc3RyaXAoIi8iKS5zcGxpdCgiLyIpWy0xXQogICAgICAgIG5hbWUgPSBncnVwby5nZXQoIm5hbWUiLCBnaWQpCgogICAgICAgIHVybHNfdG9fdHJ5ID0gWwogICAgICAgICAgICBmImh0dHBzOi8vd3d3LmZhY2Vib29rLmNvbS9ncm91cHMve3NsdWd9LyIsCiAgICAgICAgICAgIGYiaHR0cHM6Ly9tLmZhY2Vib29rLmNvbS9ncm91cHMve3NsdWd9LyIsCiAgICAgICAgICAgIGYiaHR0cHM6Ly9tYmFzaWMuZmFjZWJvb2suY29tL2dyb3Vwcy97c2x1Z30vIiwKICAgICAgICBdCgogICAgICAgIHByaW50KGYiW3NjcmFwZXJdIFNjcmFwZWFuZG8ge25hbWV9ICh7c2x1Z30pLi4uIikKICAgICAgICBmb3IgdXJsIGluIHVybHNfdG9fdHJ5OgogICAgICAgICAgICBwcmludChmIiAgUHJvYmFuZG8ge3VybH0uLi4iKQogICAgICAgICAgICBodG1sID0gZmV0Y2hfaHRtbCh1cmwsIGRlYnVnPWRlYnVnKQogICAgICAgICAgICBpZiBodG1sIGlzIE5vbmU6CiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICBpZiBkZWJ1ZzoKICAgICAgICAgICAgICAgIGRlYnVnX2luZm8oaHRtbCkKCiAgICAgICAgICAgIGxvd2VyID0gaHRtbC5sb3dlcigpCiAgICAgICAgICAgIGlmICdmYWNlYm9vayBpcyBub3QgYXZhaWxhYmxlJyBpbiBsb3dlcjoKICAgICAgICAgICAgICAgIHByaW50KCIgIEJsb3F1ZWFkbzogJ25vdCBhdmFpbGFibGUgb24gdGhpcyBicm93c2VyJyIpCiAgICAgICAgICAgICAgICBjb250aW51ZQogICAgICAgICAgICBpZiAnbG9nIGluIG9yIHNpZ24gdXAnIGluIGxvd2VyIG9yICgncGxlYXNlIGxvZyBpbicgaW4gbG93ZXIpOgogICAgICAgICAgICAgICAgcHJpbnQoIiAgUmVkaXJpZ2UgYSBsb2dpbiIpCiAgICAgICAgICAgICAgICBjb250aW51ZQoKICAgICAgICAgICAgcG9zdHMgPSBleHRyYWN0X3Bvc3RzKGh0bWwsIGdpZCwgc2x1ZykKICAgICAgICAgICAgcHJpbnQoZiIgIFBvc3RzOiB7bGVuKHBvc3RzKX0iKQogICAgICAgICAgICBpZiBwb3N0czoKICAgICAgICAgICAgICAgIHNlbmRfcG9zdHMocG9zdHMsIHRva2VuLCBhcGkpCiAgICAgICAgICAgICAgICBmaXJzdF9vayA9IFRydWUKICAgICAgICAgICAgICAgIGJyZWFrCgogICAgICAgIGlmIG5vdCBmaXJzdF9vazoKICAgICAgICAgICAgcHJpbnQoZiIgIE5vIHNlIHB1ZGllcm9uIGV4dHJhZXIgcG9zdHMgZGUge25hbWV9IikKCiAgICBtYXJrX2RvbmUodG9rZW4sIGFwaSkKICAgIHByaW50KCJbc2NyYXBlcl0gU2NyYXBlbyBjb21wbGV0YWRvIikKCgpkZWYgYWNxdWlyZV93YWtlbG9jaygpOgogICAgdHJ5OgogICAgICAgIHN1YnByb2Nlc3MucnVuKFsidGVybXV4LXdha2UtbG9jayJdLCBjYXB0dXJlX291dHB1dD1UcnVlLCB0aW1lb3V0PTUpCiAgICAgICAgcHJpbnQoIltzY3JhcGVyXSBXYWtlIGxvY2sgYWRxdWlyaWRvIikKICAgIGV4Y2VwdCBFeGNlcHRpb246CiAgICAgICAgcGFzcwoKCmRlZiByZWxlYXNlX3dha2Vsb2NrKCk6CiAgICB0cnk6CiAgICAgICAgc3VicHJvY2Vzcy5ydW4oWyJ0ZXJtdXgtd2FrZS11bmxvY2siXSwgY2FwdHVyZV9vdXRwdXQ9VHJ1ZSwgdGltZW91dD01KQogICAgZXhjZXB0IEV4Y2VwdGlvbjoKICAgICAgICBwYXNzCgoKZGVmIG1haW4oKToKICAgIHBhcnNlciA9IGFyZ3BhcnNlLkFyZ3VtZW50UGFyc2VyKGRlc2NyaXB0aW9uPSJTY3JhcGVyIGRlIEZhY2Vib29rIEdyb3VwcyBwYXJhIFNpSHVlbGxhIikKICAgIHBhcnNlci5hZGRfYXJndW1lbnQoIi0tdG9rZW4iLCByZXF1aXJlZD1UcnVlLCBoZWxwPSJUb2tlbiBkZWwgc2NyYXBlciAoZmJfc2NyYXBlcl90b2tlbikiKQogICAgcGFyc2VyLmFkZF9hcmd1bWVudCgiLS1hcGkiLCBkZWZhdWx0PUFQSV9CQVNFKQogICAgcGFyc2VyLmFkZF9hcmd1bWVudCgiLS1kZWJ1ZyIsIGFjdGlvbj0ic3RvcmVfdHJ1ZSIsIGhlbHA9Ikd1YXJkYXIgSFRNTCBkZWJ1ZyBlbiAvdG1wL2ZiX2RlYnVnLmh0bWwiKQogICAgcGFyc2VyLmFkZF9hcmd1bWVudCgiLS1kYWVtb24iLCB0eXBlPWludCwgbmFyZ3M9Ij8iLCBjb25zdD0zMCwgbWV0YXZhcj0iTUlOIiwKICAgICAgICAgICAgICAgICAgICAgICAgaGVscD0iTW9kbyBkYWVtb24gKGRlZmF1bHQ6IGNhZGEgMzAgbWluKS4gUC5lajogLS1kYWVtb24gMTAiKQogICAgcGFyc2VyLmFkZF9hcmd1bWVudCgiLS1vbmNlIiwgYWN0aW9uPSJzdG9yZV90cnVlIiwgaGVscD0iRWplY3V0YXIgdW5hIHNvbGEgdmV6IChubyBkYWVtb24pIikKICAgIGFyZ3MgPSBwYXJzZXIucGFyc2VfYXJncygpCgogICAgaWYgbm90IEhBU19DVVJMX0NGRkk6CiAgICAgICAgcHJpbnQoIltzY3JhcGVyXSBJbnN0YWxhciBjdXJsX2NmZmk6IHBpcCBpbnN0YWxsIGN1cmxfY2ZmaSIpCiAgICAgICAgc3lzLmV4aXQoMSkKCiAgICB0b2tlbiA9IGFyZ3MudG9rZW4KICAgIGFwaSA9IGFyZ3MuYXBpLnJzdHJpcCgiLyIpCiAgICBhY3F1aXJlX3dha2Vsb2NrKCkKCiAgICBpZiBhcmdzLm9uY2U6CiAgICAgICAgaWYgbm90IGNoZWNrX3BlbmRpbmcodG9rZW4sIGFwaSk6CiAgICAgICAgICAgIHByaW50KCJbc2NyYXBlcl0gTm8gaGF5IHNjcmFwZSBwZW5kaWVudGUiKQogICAgICAgICAgICByZWxlYXNlX3dha2Vsb2NrKCkKICAgICAgICAgICAgcmV0dXJuCiAgICAgICAgc2NyYXBlKHRva2VuLCBhcGksIGRlYnVnPWFyZ3MuZGVidWcpCiAgICAgICAgcmVsZWFzZV93YWtlbG9jaygpCiAgICAgICAgcmV0dXJuCgogICAgaW50ZXJ2YWwgPSBhcmdzLmRhZW1vbiBvciAzMAogICAgcHJpbnQoZiJbc2NyYXBlcl0gTW9kbyBkYWVtb246IGNhZGEge2ludGVydmFsfSBtaW51dG9zIikKICAgIHdoaWxlIFRydWU6CiAgICAgICAgdHJ5OgogICAgICAgICAgICBpZiBjaGVja19wZW5kaW5nKHRva2VuLCBhcGkpOgogICAgICAgICAgICAgICAgc2NyYXBlKHRva2VuLCBhcGksIGRlYnVnPWFyZ3MuZGVidWcpCiAgICAgICAgICAgIGVsc2U6CiAgICAgICAgICAgICAgICBwcmludCgiW3NjcmFwZXJdIE5vIGhheSBzY3JhcGUgcGVuZGllbnRlLCBlc3BlcmFuZG8uLi4iKQogICAgICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICAgICAgcHJpbnQoZiJbc2NyYXBlcl0gRXJyb3IgZW4gY2ljbG86IHtlfSIpCiAgICAgICAgdGltZS5zbGVlcChpbnRlcnZhbCAqIDYwKQoKCmlmIF9fbmFtZV9fID09ICJfX21haW5fXyI6CiAgICBtYWluKCkK';
export default router;
