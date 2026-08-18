import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../auth.js';
import { classifyPost } from '../services/geminiClassifier.js';
import { detectAnimal } from '../services/animalDetector.js';
import { detectReunion, matchPostToPet, runFullMatching } from '../services/geminiMatching.js';
import { getSessionFile } from '../services/facebookRelayService.js';
import { enqueue } from '../services/phoneRelayService.js';
import { normalizePhone } from '../services/phoneUtils.js';
import { publishToPage, publishPetToGroups } from '../services/facebookPublisher.js';
import { createCaseEvent } from '../services/caseService.js';
import { detectReplicaByTask, runReplicaDetection } from '../services/replicaDetectionService.js';
import { runSyncInBackground, getSyncState } from '../services/metaEngagement.js';

const router = Router();

async function getScraperToken() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'fb_scraper_token'");
  return result.rows[0]?.value || process.env.FB_SCRAPER_TOKEN || 'sihuella';
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

router.get('/posts/:id/image', async (req, res) => {
  try {
    const result = await pool.query('SELECT image_data FROM facebook_posts WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0 || !result.rows[0].image_data) return res.status(404).json({ error: 'No image' });
    const buf = Buffer.from(result.rows[0].image_data, 'base64');
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length });
    res.end(buf);
  } catch (err) {
    res.status(500).json({ error: 'Error serving image' });
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
        const { group_id, fb_post_id, fb_post_url, author_name, content, image_urls, posted_at, comments, image_buffers } = post;
        if (!fb_post_id) { results.errors++; continue; }

        let resolvedGroupId = group_id || null;
        if (!resolvedGroupId && fb_post_url) {
          const fbGroupMatch = fb_post_url.match(/groups\/(\d+)/);
          if (fbGroupMatch) {
            const grpRes = await pool.query('SELECT id FROM facebook_groups WHERE fb_group_id = $1', [fbGroupMatch[1]]);
            if (grpRes.rows.length > 0) resolvedGroupId = grpRes.rows[0].id;
          }
        }

        let classification;
        try {
          classification = await classifyPost(content || '', image_urls || [], comments || [], image_buffers || []);
        } catch (e) {
          classification = { classification: 'unclassified', species: null, color: null, location_hint: null, phone: null, location_lat: null, location_lng: null, comments: [] };
        }
        const cmtClassified = classification.comments || [];

        let animalDetection = { detected: false, species: null, confidence: 0 };
        if (image_buffers?.length > 0) {
          try {
            animalDetection = await detectAnimal(image_buffers[0].data, image_buffers[0].mimeType || 'image/jpeg');
          } catch (e) {
            console.warn(`[Webhook] detectAnimal error for ${fb_post_id}: ${e.message}`);
          }
          if (!animalDetection.detected) {
            console.log(`[Webhook] ${fb_post_id}: sin perro/gato en imagen (no bloqueante)`);
          }
        }

        if ((!image_buffers || image_buffers.length === 0) && image_urls?.length > 0) {
          try {
            const resp = await fetch(image_urls[0]);
            if (resp.ok) {
              const buf = await resp.arrayBuffer();
              const base64 = Buffer.from(buf).toString('base64');
              const mime = resp.headers.get('content-type') || 'image/jpeg';
              image_buffers = [{ data: base64, mimeType: mime }];
            }
          } catch (e) {
            console.warn(`[Webhook] No se pudo descargar imagen desde URL para ${fb_post_id}: ${e.message}`);
          }
        }

        const existing = await pool.query('SELECT id FROM facebook_posts WHERE fb_post_id = $1', [fb_post_id]);
        const postResult = await pool.query(
          `INSERT INTO facebook_posts (group_id, fb_post_id, fb_post_url, author_name, content, image_urls, image_data, posted_at, classification, species, color, location_hint, phone, latitude, longitude, animal_detected, animal_species, animal_confidence, breed, pet_name, gender)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
           ON CONFLICT (fb_post_id) DO UPDATE SET
             group_id = COALESCE(EXCLUDED.group_id, facebook_posts.group_id),
             content = EXCLUDED.content,
             image_urls = EXCLUDED.image_urls,
             image_data = COALESCE(EXCLUDED.image_data, facebook_posts.image_data),
             author_name = EXCLUDED.author_name,
             scraped_at = NOW(),
             animal_detected = COALESCE(EXCLUDED.animal_detected, facebook_posts.animal_detected),
             animal_species = COALESCE(EXCLUDED.animal_species, facebook_posts.animal_species),
             animal_confidence = COALESCE(EXCLUDED.animal_confidence, facebook_posts.animal_confidence),
             breed = COALESCE(EXCLUDED.breed, facebook_posts.breed),
             pet_name = COALESCE(EXCLUDED.pet_name, facebook_posts.pet_name),
             gender = COALESCE(EXCLUDED.gender, facebook_posts.gender)
           RETURNING id`,
          [
            resolvedGroupId, fb_post_id, fb_post_url || null, author_name || null,
            content || '', image_urls || [], image_buffers?.[0]?.data || null,
            posted_at ? new Date(posted_at) : null,
            classification.classification, classification.species, classification.color,
            classification.location_hint, classification.phone,
            classification.location_lat, classification.location_lng,
            animalDetection.detected, animalDetection.species, animalDetection.confidence || 0,
            classification.breed || null, classification.name || null, classification.gender || null,
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

        if (postId) {
          detectReplicaByTask({
            id: postId,
            fb_post_id,
            fb_post_url,
            content,
            group_id: resolvedGroupId,
            group_name: null,
          }).catch(err => console.error('Replica detection error:', err));
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
  const isScraper = token && authHeader === `Bearer ${token}`;
  if (!isRelay && !isScraper && (!qToken || qToken !== token)) {
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
  const scraperToken = await getScraperToken();
  const authHeader = req.headers.authorization;
  const isRelay = relayToken && authHeader === `Bearer ${relayToken}`;
  const isScraper = scraperToken && authHeader === `Bearer ${scraperToken}`;
  if (!isRelay && !isScraper) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  try {
    const keys = ['fb_scraper_from', 'fb_scraper_to', 'fb_scraper_interval', 'fb_scraping_enabled', 'fb_scraper_max_posts'];
    const placeholders = keys.map((_, i) => '$' + (i + 1)).join(',');
    const result = await pool.query(`SELECT key, value FROM settings WHERE key IN (${placeholders})`, keys);
    const data = { hour_start: '8', hour_end: '20', interval_hours: '4', scraping_enabled: 'false', max_posts_per_group: '20' };
    result.rows.forEach(r => {
      if (r.key === 'fb_scraper_from') data.hour_start = r.value;
      else if (r.key === 'fb_scraper_to') data.hour_end = r.value;
      else if (r.key === 'fb_scraper_interval') data.interval_hours = r.value;
      else if (r.key === 'fb_scraping_enabled') data.scraping_enabled = r.value;
      else if (r.key === 'fb_scraper_max_posts') data.max_posts_per_group = r.value;
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

router.post('/run-replica-backfill', requireAdmin, async (req, res) => {
  try {
    const { days = 7, limit = 500 } = req.body;
    const result = await runReplicaDetection({ days: Number(days) || 7, limit: Number(limit) || 500 });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Error running replica backfill:', err);
    res.status(500).json({ error: 'Error al detectar réplicas' });
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

    (async () => {
      try {
        const sides = [
          { type: match.source_type, id: match.source_id },
          { type: match.target_type, id: match.target_id },
        ];
        const petSide = sides.find(s => s.type !== 'fb_post');
        if (!petSide) return;
        const caseRes = await pool.query('SELECT id FROM pet_cases WHERE pet_id = $1 LIMIT 1', [petSide.id]);
        if (caseRes.rows.length === 0) return;
        await createCaseEvent(caseRes.rows[0].id, 'match_confirmed', {
          matched_pet_id: petSide.id,
          score: match.score,
          confirmed_by: req.user.id,
        });
      } catch (err) {
        console.error('match_confirmed event error:', err.message);
      }
    })();

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
    const result = await classifyPost(post.content || '', post.image_urls || [], [], []);

    await pool.query(
      `UPDATE facebook_posts SET
        classification = $1, species = $2, color = $3,
        location_hint = $4, phone = $5, latitude = $6, longitude = $7,
        breed = $8, pet_name = $9, gender = $10, updated_at = NOW()
       WHERE id = $11`,
      [result.classification, result.species, result.color, result.location_hint, result.phone, result.location_lat, result.location_lng,
       result.breed || null, result.name || null, result.gender || null, req.params.id]
    );

    res.json({ ok: true, classification: result });
  } catch (err) {
    console.error('Error classifying post:', err);
    res.status(500).json({ error: 'Error al clasificar publicación' });
  }
});

router.post('/reclassify-all', requireAdmin, async (req, res) => {
  try {
    const postRes = await pool.query(
      "SELECT id, content, image_urls FROM facebook_posts WHERE classification IN ('other', 'unclassified') ORDER BY created_at DESC LIMIT 50"
    );
    console.log(`[Reclassify] Re-clasificando ${postRes.rows.length} posts...`);
    let updated = 0, errors = 0;
    for (const post of postRes.rows) {
      try {
        const result = await classifyPost(post.content || '', post.image_urls || [], [], []);
        await pool.query(
          `UPDATE facebook_posts SET classification=$1, species=$2, color=$3, location_hint=$4, phone=$5, breed=$6, pet_name=$7, gender=$8, updated_at=NOW() WHERE id=$9`,
          [result.classification, result.species, result.color, result.location_hint, result.phone, result.breed || null, result.name || null, result.gender || null, post.id]
        );
        updated++;
        console.log(`[Reclassify] ${post.id}: ${result.classification}`);
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        errors++;
        console.error(`[Reclassify] Error ${post.id}:`, e.message);
      }
    }
    res.json({ ok: true, updated, errors, total: postRes.rows.length });
  } catch (err) {
    console.error('Reclassify error:', err);
    res.status(500).json({ error: 'Error al re-clasificar' });
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
    const pageResult = await publishToPage(petId);

    let pagePostUrl = null;
    if (pageResult.success) {
      if (pageResult.pagePostId && pageResult.pageId) {
        pagePostUrl = `https://www.facebook.com/${pageResult.pageId}/posts/${pageResult.pagePostId}`;
      }
      await pool.query(
        `INSERT INTO facebook_page_posts (pet_id, page_post_id, message, status, published_at)
         VALUES ($1, $2, $3, 'published', NOW())`,
        [petId, pageResult.pagePostId, pageResult.message || '']
      );
    }
    if (pageResult.error) return res.status(500).json(pageResult);

    // Share to FB groups after publishing to page
    publishPetToGroups(petId, { skipPagePublish: true, pagePostUrl }).catch(
      e => console.error('[FB Relay] Error sharing to groups:', e)
    );

    res.json(pageResult);
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

router.post('/refresh-metrics', requireAdmin, async (_req, res) => {
  try {
    const { syncFacebookEngagement } = await import('../services/metaEngagement.js');
    const state = runSyncInBackground(syncFacebookEngagement, 'fb');
    res.json({ success: true, ...state });
  } catch (err) {
    console.error('Error refreshing FB metrics:', err);
    res.status(500).json({ error: 'Error al refrescar métricas de Facebook' });
  }
});

router.get('/sync-status', requireAdmin, async (_req, res) => {
  res.json(getSyncState());
});

router.get('/engagement-diagnose', requireAdmin, async (_req, res) => {
  const result = { steps: [], ok: false };
  try {
    const { default: axios } = await import('axios');
    const { getStoredToken } = await import('../services/instagramService.js');
    const token = await getStoredToken();
    if (!token) {
      result.steps.push({ step: 'token', ok: false, detail: 'No hay token almacenado. Conectá Facebook desde el admin.' });
      return res.json(result);
    }
    result.token = token ? `${token.slice(0, 10)}...${token.slice(-6)}` : null;

    let me = null;
    try {
      const meRes = await axios.get('https://graph.facebook.com/v22.0/me', {
        params: { fields: 'id,name', access_token: token },
        timeout: 15000,
      });
      me = meRes.data;
      result.steps.push({ step: 'token', ok: true, detail: `Token válido (page: ${me.name || me.id})` });
    } catch (err) {
      result.steps.push({ step: 'token', ok: false, detail: err.response?.data?.error?.message || err.message });
      return res.json(result);
    }

    const postsRes = await pool.query(
      `SELECT id, page_post_id FROM facebook_page_posts
       WHERE status = 'published' AND page_post_id IS NOT NULL
       ORDER BY published_at DESC NULLS LAST LIMIT 1`
    );
    const post = postsRes.rows[0];
    if (!post) {
      result.steps.push({ step: 'posts', ok: false, detail: 'No hay posts publicados con page_post_id para diagnosticar.' });
      return res.json(result);
    }
    result.page_post_id = post.page_post_id;

    try {
      const pageIdRes = await pool.query("SELECT value FROM settings WHERE key = 'facebook_page_id'");
      const fbPageId = pageIdRes.rows[0]?.value || '';
      const postPageId = post.page_post_id?.split('_')[0] || '';
      if (fbPageId && postPageId) {
        const match = fbPageId === postPageId;
        result.steps.push({
          step: 'page-match', ok: match,
          detail: match
            ? `facebook_page_id=${fbPageId} coincide con el prefijo del post (${postPageId})`
            : `DESMISMATCH: el token es de la página ${fbPageId} pero el post pertenece a la página ${postPageId}. La reconexión eligió otra página.`,
        });
        if (!match) result.ok = false;
      } else {
        result.steps.push({ step: 'page-match', ok: true, detail: 'Sin facebook_page_id guardado para comparar.' });
      }
    } catch (err) {
      result.steps.push({ step: 'page-match', ok: true, detail: 'No se pudo leer facebook_page_id: ' + err.message });
    }

    try {
      const { data } = await axios.get(`https://graph.facebook.com/v22.0/${post.page_post_id}`, {
        params: { fields: 'id,reactions.summary(true),comments.summary(true)', access_token: token },
        timeout: 15000,
      });
      result.steps.push({
        step: 'main', ok: true,
        detail: `reactions=${data.reactions?.summary?.total_count ?? 'N/A'}, comments=${data.comments?.summary?.total_count ?? 'N/A'}`,
      });
      result.ok = true;
    } catch (err) {
      const e = err.response?.data?.error || {};
      result.steps.push({ step: 'main', ok: false, detail: `[${e.code || ''}] ${e.message || err.message}` });

      try {
        const insRes = await axios.get(`https://graph.facebook.com/v22.0/${post.page_post_id}/insights`, {
          params: { metric: 'post_reactions_by_type_total,post_shares', access_token: token },
          timeout: 15000,
        });
        const metrics = insRes.data?.data || [];
        const names = metrics.map(m => m.name);
        result.steps.push({ step: 'insights', ok: names.length > 0, detail: `insights OK (${names.join(', ')})` });
        if (names.length > 0) result.ok = true;
      } catch (insErr) {
        const ie = insErr.response?.data?.error || {};
        result.steps.push({ step: 'insights', ok: false, detail: `[${ie.code || ''}] ${ie.message || insErr.message}` });
      }
    }
  } catch (err) {
    result.steps.push({ step: 'fatal', ok: false, detail: err.message });
  }
  res.json(result);
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



// ==================== SCRAPER LOGS (para monitoreo remoto) ====================

const scraperLogs = [];
const SCRAPER_LOG_MAX = 50;

router.post('/scraper-log', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = req.headers['x-scraper-token'];
  const scraperToken = process.env.SCRAPER_TOKEN || 'sihuella';
  if (token !== scraperToken && authHeader !== `Bearer ${scraperToken}`) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  const { level, message, ts } = req.body;
  scraperLogs.push({ level: level || 'info', message: message || '', ts: ts || new Date().toISOString() });
  if (scraperLogs.length > SCRAPER_LOG_MAX) scraperLogs.shift();
  res.json({ ok: true });
});

router.get('/scraper-log', (req, res) => {
  const token = req.query.token || req.headers['x-scraper-token'];
  const scraperToken = process.env.SCRAPER_TOKEN || 'sihuella';
  if (token !== scraperToken) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  res.json(scraperLogs.slice(-30));
});

export default router;
