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

const SCRAPER_SCRIPT_B64 = 'IyEvdXNyL2Jpbi9lbnYgcHl0aG9uMwoiIiIKU2NyYXBlciBkZSBGYWNlYm9vayBHcm91cHMgcGFyYSBTaUh1ZWxsYS4KVXNhIHB5cHBldGVlciAoQ2hyb21pdW0gaGVhZGxlc3MpICsgcmVxdWVzdHMuCkNvcnJlIGRlc2RlIFRlcm11eCB1c2FuZG8gbGEgSVAgZGVsIGNlbHVsYXIgKHJlc2lkZW5jaWFsKS4KTm8gbmVjZXNpdGEgY29va2llcyBuaSBjdWVudGEgZGUgRmFjZWJvb2suCgpVc286CiAgcHl0aG9uMyBzY3JhcGVyLnB5IC0tdG9rZW4gVFVfVE9LRU4KICBweXRob24zIHNjcmFwZXIucHkgLS10b2tlbiBUVV9UT0tFTiAtLW9uY2UKIiIiCgppbXBvcnQgb3MsIHN5cywgcmUsIGpzb24sIHRpbWUsIGFyZ3BhcnNlLCBhc3luY2lvCmZyb20gdXJsbGliLnBhcnNlIGltcG9ydCB1cmxwYXJzZQoKaW1wb3J0IHJlcXVlc3RzCgpBUElfQkFTRSA9ICJodHRwczovL3NpZ290dWh1ZWxsYS5vbmxpbmUiCgoKZGVmIGNoZWNrX3BlbmRpbmcodG9rZW4sIGFwaSk6CiAgICB0cnk6CiAgICAgICAgciA9IHJlcXVlc3RzLmdldChmInthcGl9L2FwaS9mYWNlYm9vay9wZW5kaW5nLXNjcmFwZSIsIHBhcmFtcz17InRva2VuIjogdG9rZW59LCB0aW1lb3V0PTE1KQogICAgICAgIHJldHVybiByLmpzb24oKS5nZXQoInBlbmRpbmciLCBGYWxzZSkKICAgIGV4Y2VwdCBFeGNlcHRpb24gYXMgZToKICAgICAgICBwcmludChmIltzY3JhcGVyXSBFcnJvciBjaGVjayBwZW5kaW5nOiB7ZX0iKQogICAgICAgIHJldHVybiBGYWxzZQoKCmRlZiBtYXJrX2RvbmUodG9rZW4sIGFwaSk6CiAgICB0cnk6CiAgICAgICAgciA9IHJlcXVlc3RzLnBvc3QoZiJ7YXBpfS9hcGkvZmFjZWJvb2svc2NyYXBlLWRvbmUiLCBwYXJhbXM9eyJ0b2tlbiI6IHRva2VufSwgdGltZW91dD0xNSkKICAgICAgICBpZiByLnN0YXR1c19jb2RlID09IDIwMDoKICAgICAgICAgICAgcHJpbnQoIltzY3JhcGVyXSBTY3JhcGUgbWFyY2FkbyBjb21vIGNvbXBsZXRhZG8iKQogICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgIHByaW50KGYiW3NjcmFwZXJdIEVycm9yIG1hcmsgZG9uZToge2V9IikKCgpkZWYgZ2V0X2dyb3Vwcyh0b2tlbiwgYXBpKToKICAgIHIgPSByZXF1ZXN0cy5nZXQoZiJ7YXBpfS9hcGkvZmFjZWJvb2svc2NyYXBlci1ncm91cHMiLCBwYXJhbXM9eyJ0b2tlbiI6IHRva2VufSwgdGltZW91dD0xNSkKICAgIGlmIHIuc3RhdHVzX2NvZGUgIT0gMjAwOgogICAgICAgIHByaW50KGYiW3NjcmFwZXJdIEVycm9yIGdydXBvczogSFRUUCB7ci5zdGF0dXNfY29kZX0iKQogICAgICAgIHN5cy5leGl0KDEpCiAgICBncnVwb3MgPSByLmpzb24oKQogICAgcHJpbnQoZiJbc2NyYXBlcl0gR3J1cG9zIGFjdGl2b3M6IHtsZW4oZ3J1cG9zKX0iKQogICAgcmV0dXJuIGdydXBvcwoKCmRlZiBleHRyYWN0X3Bvc3RzKGh0bWwsIGdpZCwgc2x1Zyk6CiAgICBwb3N0cyA9IFtdCiAgICBzZWVuID0gc2V0KCkKICAgIGFydGljbGVzID0gcmUuZmluZGFsbChyJzxkaXZbXj5dKnJvbGU9ImFydGljbGUiW14+XSo+KC4qPyk8L2Rpdj5ccyooPz08ZGl2fFxaKScsIGh0bWwsIHJlLkRPVEFMTCkKICAgIGlmIG5vdCBhcnRpY2xlczoKICAgICAgICBhcnRpY2xlcyA9IHJlLmZpbmRhbGwocic8YXJ0aWNsZVtePl0qPiguKj8pPC9hcnRpY2xlPicsIGh0bWwsIHJlLkRPVEFMTCkKICAgIGZvciBhcnQgaW4gYXJ0aWNsZXM6CiAgICAgICAgaWRzID0gcmUuZmluZGFsbChyJy9wb3N0cy8oXGQrKScsIGFydCkKICAgICAgICBpZiBub3QgaWRzOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIHBpZCA9IGlkc1swXQogICAgICAgIGlmIHBpZCBpbiBzZWVuOgogICAgICAgICAgICBjb250aW51ZQogICAgICAgIHNlZW4uYWRkKHBpZCkKICAgICAgICBtc2cgPSByZS5zZWFyY2gocidkYXRhLWFkLWNvbWV0LXByZXZpZXc9Im1lc3NhZ2UiW14+XSo+KC4qPyk8L2Rpdj4nLCBhcnQsIHJlLkRPVEFMTCkKICAgICAgICBjb250ZW50ID0gIiIKICAgICAgICBpZiBtc2c6CiAgICAgICAgICAgIGNvbnRlbnQgPSByZS5zdWIocic8W14+XSs+JywgJycsIG1zZy5ncm91cCgxKSkuc3RyaXAoKQogICAgICAgIGlmIG5vdCBjb250ZW50OgogICAgICAgICAgICBkaXJzID0gcmUuZmluZGFsbChyJzxkaXZbXj5dKmRpcj0iYXV0byJbXj5dKj4oLio/KTwvZGl2PicsIGFydCwgcmUuRE9UQUxMKQogICAgICAgICAgICBwYXJ0cyA9IFtdCiAgICAgICAgICAgIGZvciBkIGluIGRpcnM6CiAgICAgICAgICAgICAgICB0ID0gcmUuc3ViKHInPFtePl0rPicsICcnLCBkKS5zdHJpcCgpCiAgICAgICAgICAgICAgICBpZiBsZW4odCkgPiAxNToKICAgICAgICAgICAgICAgICAgICBwYXJ0cy5hcHBlbmQodCkKICAgICAgICAgICAgY29udGVudCA9ICJcbiIuam9pbihwYXJ0cykKICAgICAgICBjb250ZW50ID0gcmUuc3ViKHInXGQrXHMqW2htXVxzKsK3XHMqJywgJycsIGNvbnRlbnQpCiAgICAgICAgY29udGVudCA9IHJlLnN1YihyJyg/aSlTZWUgbW9yZXxWZXIgbcOhc3xNb3N0cmFyIG3DoXMnLCAnJywgY29udGVudCkuc3RyaXAoKVs6MTAwMDBdCiAgICAgICAgYXV0aG9yID0gIiIKICAgICAgICBmb3Igc2VsIGluIFtyJzxoMltePl0qPi4qPzxhW14+XSo+KC4qPyk8L2E+Jywgcic8aDNbXj5dKj4uKj88YVtePl0qPiguKj8pPC9hPicsIHInPHN0cm9uZ1tePl0qPi4qPzxhW14+XSo+KC4qPyk8L2E+J106CiAgICAgICAgICAgIG0gPSByZS5zZWFyY2goc2VsLCBhcnQsIHJlLkRPVEFMTCkKICAgICAgICAgICAgaWYgbToKICAgICAgICAgICAgICAgIGF1dGhvciA9IHJlLnN1YihyJzxbXj5dKz4nLCAnJywgbS5ncm91cCgxKSkuc3RyaXAoKQogICAgICAgICAgICAgICAgYnJlYWsKICAgICAgICBpbWFnZXMgPSByZS5maW5kYWxsKHInPGltZ1tePl0rc3JjPSIoW14iXSpzY29udGVudFteIl0qKSInLCBhcnQpCiAgICAgICAgaWYgbm90IGltYWdlczoKICAgICAgICAgICAgaW1hZ2VzID0gcmUuZmluZGFsbChyJzxpbWdbXj5dK3NyYz0iKFteIl0qZmJjZG5bXiJdKikiJywgYXJ0KQogICAgICAgIHBvc3RzLmFwcGVuZCh7CiAgICAgICAgICAgICJmYl9wb3N0X2lkIjogcGlkLAogICAgICAgICAgICAiZ3JvdXBfaWQiOiBnaWQsCiAgICAgICAgICAgICJhdXRob3JfbmFtZSI6IGF1dGhvciwKICAgICAgICAgICAgImNvbnRlbnQiOiBjb250ZW50LAogICAgICAgICAgICAiaW1hZ2VfdXJscyI6IGltYWdlc1s6NV0sCiAgICAgICAgICAgICJmYl9wb3N0X3VybCI6IGYiaHR0cHM6Ly93d3cuZmFjZWJvb2suY29tL2dyb3Vwcy97c2x1Z30vcG9zdHMve3BpZH0vIiwKICAgICAgICB9KQogICAgcmV0dXJuIHBvc3RzCgoKZGVmIHNlbmRfcG9zdHMocG9zdHMsIHRva2VuLCBhcGkpOgogICAgZm9yIHBvc3QgaW4gcG9zdHM6CiAgICAgICAgdHJ5OgogICAgICAgICAgICByID0gcmVxdWVzdHMucG9zdChmInthcGl9L2FwaS9mYWNlYm9vay93ZWJob29rIiwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAganNvbj17InBvc3RzIjogW3Bvc3RdfSwKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVhZGVycz17IkF1dGhvcml6YXRpb24iOiBmIkJlYXJlciB7dG9rZW59In0sCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRpbWVvdXQ9MzApCiAgICAgICAgICAgIGlmIHIuc3RhdHVzX2NvZGUgPT0gMjAwOgogICAgICAgICAgICAgICAgcHJpbnQoZiIgIE9LIHtwb3N0WydmYl9wb3N0X2lkJ119IikKICAgICAgICAgICAgZWxzZToKICAgICAgICAgICAgICAgIHByaW50KGYiICBGQUlMIHtwb3N0WydmYl9wb3N0X2lkJ119OiBIVFRQIHtyLnN0YXR1c19jb2RlfSIpCiAgICAgICAgZXhjZXB0IEV4Y2VwdGlvbiBhcyBlOgogICAgICAgICAgICBwcmludChmIiAgRkFJTCB7cG9zdFsnZmJfcG9zdF9pZCddfToge2V9IikKCgphc3luYyBkZWYgc2NyYXBlKHRva2VuLCBhcGkpOgogICAgZ3J1cG9zID0gZ2V0X2dyb3Vwcyh0b2tlbiwgYXBpKQogICAgaWYgbm90IGdydXBvczoKICAgICAgICBwcmludCgiW3NjcmFwZXJdIE5vIGhheSBncnVwb3MiKQogICAgICAgIHJldHVybgoKICAgIGZyb20gcHlwcGV0ZWVyIGltcG9ydCBsYXVuY2gKCiAgICBicm93c2VyID0gYXdhaXQgbGF1bmNoKAogICAgICAgIGhlYWRsZXNzPVRydWUsCiAgICAgICAgZXhlY3V0YWJsZVBhdGg9Ii9kYXRhL2RhdGEvY29tLnRlcm11eC9maWxlcy91c3IvYmluL2Nocm9taXVtIiwKICAgICAgICBhcmdzPVsKICAgICAgICAgICAgIi0tbm8tc2FuZGJveCIsCiAgICAgICAgICAgICItLWRpc2FibGUtZGV2LXNobS11c2FnZSIsCiAgICAgICAgICAgICItLWRpc2FibGUtZ3B1IiwKICAgICAgICAgICAgIi0tZGlzYWJsZS1zZXR1aWQtc2FuZGJveCIsCiAgICAgICAgXQogICAgKQogICAgcGFnZSA9IGF3YWl0IGJyb3dzZXIubmV3UGFnZSgpCiAgICBhd2FpdCBwYWdlLnNldFVzZXJBZ2VudCgKICAgICAgICAiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2ICIKICAgICAgICAiKEtIVE1MLCBsaWtlIEdlY2tvKSBDaHJvbWUvMTI1LjAuMC4wIFNhZmFyaS81MzcuMzYiCiAgICApCiAgICBhd2FpdCBwYWdlLnNldFZpZXdwb3J0KHsid2lkdGgiOiAxNDQwLCAiaGVpZ2h0IjogOTAwfSkKCiAgICBmb3IgZ3J1cG8gaW4gZ3J1cG9zOgogICAgICAgIGdpZCA9IGdydXBvWyJpZCJdCiAgICAgICAgc2x1ZyA9IHVybHBhcnNlKGdydXBvWyJ1cmwiXSkucGF0aC5yc3RyaXAoIi8iKS5zcGxpdCgiLyIpWy0xXQogICAgICAgIG5hbWUgPSBncnVwby5nZXQoIm5hbWUiLCBnaWQpCiAgICAgICAgdXJsID0gZiJodHRwczovL3d3dy5mYWNlYm9vay5jb20vZ3JvdXBzL3tzbHVnfS8iCgogICAgICAgIHByaW50KGYiW3NjcmFwZXJdIFNjcmFwZWFuZG8ge25hbWV9ICh7c2x1Z30pLi4uIikKICAgICAgICB0cnk6CiAgICAgICAgICAgIGF3YWl0IHBhZ2UuZ290byh1cmwsIHdhaXRVbnRpbD0ibmV0d29ya2lkbGUiLCB0aW1lb3V0PTYwMDAwKQogICAgICAgICAgICBhd2FpdCBhc3luY2lvLnNsZWVwKDQpCgogICAgICAgICAgICBpZiAibG9naW4iIGluIHBhZ2UudXJsLmxvd2VyKCkgb3IgImNoZWNrcG9pbnQiIGluIHBhZ2UudXJsLmxvd2VyKCk6CiAgICAgICAgICAgICAgICBwcmludCgiICBSZWRpcmlnZSBhIGxvZ2luIOKAlCBzYWx0YW5kbyIpCiAgICAgICAgICAgICAgICBjb250aW51ZQoKICAgICAgICAgICAgaHRtbCA9IGF3YWl0IHBhZ2UuY29udGVudCgpCiAgICAgICAgICAgIHBvc3RzID0gZXh0cmFjdF9wb3N0cyhodG1sLCBnaWQsIHNsdWcpCiAgICAgICAgICAgIHByaW50KGYiICBQb3N0czoge2xlbihwb3N0cyl9IikKICAgICAgICAgICAgc2VuZF9wb3N0cyhwb3N0cywgdG9rZW4sIGFwaSkKICAgICAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgICAgIHByaW50KGYiICBFcnJvciBlbiB7bmFtZX06IHtlfSIpCgogICAgYXdhaXQgYnJvd3Nlci5jbG9zZSgpCiAgICBtYXJrX2RvbmUodG9rZW4sIGFwaSkKICAgIHByaW50KCJbc2NyYXBlcl0gU2NyYXBlbyBjb21wbGV0YWRvIikKCgpkZWYgYWNxdWlyZV93YWtlbG9jaygpOgogICAgdHJ5OgogICAgICAgIGltcG9ydCBzdWJwcm9jZXNzCiAgICAgICAgc3VicHJvY2Vzcy5ydW4oWyJ0ZXJtdXgtd2FrZS1sb2NrIl0sIGNhcHR1cmVfb3V0cHV0PVRydWUsIHRpbWVvdXQ9NSkKICAgICAgICBwcmludCgiW3NjcmFwZXJdIFdha2UgbG9jayBhZHF1aXJpZG8iKQogICAgZXhjZXB0IEV4Y2VwdGlvbjoKICAgICAgICBwYXNzCgoKZGVmIHJlbGVhc2Vfd2FrZWxvY2soKToKICAgIHRyeToKICAgICAgICBpbXBvcnQgc3VicHJvY2VzcwogICAgICAgIHN1YnByb2Nlc3MucnVuKFsidGVybXV4LXdha2UtdW5sb2NrIl0sIGNhcHR1cmVfb3V0cHV0PVRydWUsIHRpbWVvdXQ9NSkKICAgIGV4Y2VwdCBFeGNlcHRpb246CiAgICAgICAgcGFzcwoKCmRlZiBtYWluKCk6CiAgICBwYXJzZXIgPSBhcmdwYXJzZS5Bcmd1bWVudFBhcnNlcihkZXNjcmlwdGlvbj0iU2NyYXBlciBkZSBGYWNlYm9vayBHcm91cHMgcGFyYSBTaUh1ZWxsYSIpCiAgICBwYXJzZXIuYWRkX2FyZ3VtZW50KCItLXRva2VuIiwgcmVxdWlyZWQ9VHJ1ZSwgaGVscD0iVG9rZW4gZGVsIHNjcmFwZXIgKGZiX3NjcmFwZXJfdG9rZW4pIikKICAgIHBhcnNlci5hZGRfYXJndW1lbnQoIi0tYXBpIiwgZGVmYXVsdD1BUElfQkFTRSkKICAgIHBhcnNlci5hZGRfYXJndW1lbnQoIi0tZGFlbW9uIiwgdHlwZT1pbnQsIG5hcmdzPSI/IiwgY29uc3Q9MzAsIG1ldGF2YXI9Ik1JTiIsCiAgICAgICAgICAgICAgICAgICAgICAgIGhlbHA9Ik1vZG8gZGFlbW9uIChkZWZhdWx0OiBjYWRhIDMwIG1pbikuIFAuZWo6IC0tZGFlbW9uIDEwIikKICAgIHBhcnNlci5hZGRfYXJndW1lbnQoIi0tb25jZSIsIGFjdGlvbj0ic3RvcmVfdHJ1ZSIsIGhlbHA9IkVqZWN1dGFyIHVuYSBzb2xhIHZleiAobm8gZGFlbW9uKSIpCiAgICBhcmdzID0gcGFyc2VyLnBhcnNlX2FyZ3MoKQoKICAgIHRva2VuID0gYXJncy50b2tlbgogICAgYXBpID0gYXJncy5hcGkucnN0cmlwKCIvIikKICAgIGFjcXVpcmVfd2FrZWxvY2soKQoKICAgIGlmIGFyZ3Mub25jZToKICAgICAgICBpZiBub3QgY2hlY2tfcGVuZGluZyh0b2tlbiwgYXBpKToKICAgICAgICAgICAgcHJpbnQoIltzY3JhcGVyXSBObyBoYXkgc2NyYXBlIHBlbmRpZW50ZSIpCiAgICAgICAgICAgIHJlbGVhc2Vfd2FrZWxvY2soKQogICAgICAgICAgICByZXR1cm4KICAgICAgICBhc3luY2lvLnJ1bihzY3JhcGUodG9rZW4sIGFwaSkpCiAgICAgICAgcmVsZWFzZV93YWtlbG9jaygpCiAgICAgICAgcmV0dXJuCgogICAgaW50ZXJ2YWwgPSBhcmdzLmRhZW1vbiBvciAzMAogICAgcHJpbnQoZiJbc2NyYXBlcl0gTW9kbyBkYWVtb246IGNhZGEge2ludGVydmFsfSBtaW51dG9zIikKICAgIHdoaWxlIFRydWU6CiAgICAgICAgdHJ5OgogICAgICAgICAgICBpZiBjaGVja19wZW5kaW5nKHRva2VuLCBhcGkpOgogICAgICAgICAgICAgICAgYXN5bmNpby5ydW4oc2NyYXBlKHRva2VuLCBhcGkpKQogICAgICAgICAgICBlbHNlOgogICAgICAgICAgICAgICAgcHJpbnQoIltzY3JhcGVyXSBObyBoYXkgc2NyYXBlIHBlbmRpZW50ZSwgZXNwZXJhbmRvLi4uIikKICAgICAgICBleGNlcHQgRXhjZXB0aW9uIGFzIGU6CiAgICAgICAgICAgIHByaW50KGYiW3NjcmFwZXJdIEVycm9yIGVuIGNpY2xvOiB7ZX0iKQogICAgICAgIHRpbWUuc2xlZXAoaW50ZXJ2YWwgKiA2MCkKCgppZiBfX25hbWVfXyA9PSAiX19tYWluX18iOgogICAgbWFpbigpCg==';
export default router;
