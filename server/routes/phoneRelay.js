import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { getPending, markSent, markFailed, enqueue, getStatus, setEnabled, getAllGroups, saveQR, clearQR, getQR, getPetForBroadcast, getLatestPet, generateBroadcastCaption, searchPets } from '../services/phoneRelayService.js';
import { broadcastAdoptionPet } from '../services/whatsappService.js';
import { requireAdmin } from '../auth.js';
import { classifyWhatsAppMessage } from '../services/geminiClassifier.js';
import { matchScrapedToAppPets, matchScrapedToScraped } from '../services/geminiMatching.js';
import { detectAnimal } from '../services/animalDetector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = Router();

function relayAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token && token === process.env.RELAY_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

router.get('/pending', relayAuth, async (req, res) => {
  try {
    const messages = await getPending(parseInt(req.query.limit) || 10);
    res.json({ messages });
  } catch (err) {
    console.error('[Relay] pending error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/sent', relayAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    await markSent(ids);
    res.json({ success: true });
  } catch (err) {
    console.error('[Relay] markSent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/failed', relayAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || ids.length === 0) return res.json({ success: true });

    const messages = await pool.query(
      "SELECT wa_to, text, created_at FROM relay_messages WHERE id = ANY($1::uuid[])",
      [ids]
    );
    const adminPhone = (await pool.query(
      "SELECT value FROM settings WHERE key = 'relay_admin_phone'"
    )).rows[0]?.value;

    if (adminPhone && messages.rows.length > 0) {
      for (const msg of messages.rows) {
        const text = (msg.text || '(sin texto)').substring(0, 200);
        const ts = msg.created_at ? new Date(msg.created_at).toLocaleString('es-AR') : '';
        const notif = `❌ No se pudo enviar por relay\n\n📱 Destino: ${msg.wa_to}\n🕐 ${ts}\n\n${text}`;
        await enqueue(adminPhone, notif);
      }
    }

    await markFailed(ids);
    res.json({ success: true });
  } catch (err) {
    console.error('[Relay] failed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/relay-failed', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, wa_to, text, image_url, created_at FROM relay_messages WHERE status = 'failed' ORDER BY created_at DESC LIMIT 20"
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[Relay] failed list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/groups', relayAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, group_id, scrape_enabled FROM whatsapp_groups WHERE is_active = true ORDER BY name ASC'
    );
    res.json({ groups: result.rows });
  } catch (err) {
    console.error('[Relay] groups error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/pending-list', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, wa_to, text, image_url, created_at FROM relay_messages WHERE status = 'pending' ORDER BY created_at ASC LIMIT 50"
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[Relay] pending-list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/recent-sent', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, wa_to, text, image_url, sent_at FROM relay_messages WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 10"
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[Relay] recent-sent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/message/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM relay_messages WHERE id = $1 AND status = 'pending' RETURNING id",
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Mensaje no encontrado o ya no está pendiente' });
    res.json({ success: true, deleted: id });
  } catch (err) {
    console.error('[Relay] delete message error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/qr', relayAuth, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'image required' });
    await saveQR(image);
    res.json({ success: true });
  } catch (err) {
    console.error('[Relay] qr save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/qr/clear', relayAuth, async (req, res) => {
  try {
    await clearQR();
    res.json({ success: true });
  } catch (err) {
    console.error('[Relay] qr clear error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/qr', requireAdmin, async (req, res) => {
  try {
    const b64 = await getQR();
    if (!b64) return res.status(404).json({ error: 'No QR available' });
    res.setHeader('Content-Type', 'image/png');
    res.send(Buffer.from(b64, 'base64'));
  } catch (err) {
    console.error('[Relay] qr get error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/send', requireAdmin, async (req, res) => {
  try {
    const { to, text, image_url } = req.body;
    if (!to) return res.status(400).json({ error: 'to required' });
    if (!text && !image_url) return res.status(400).json({ error: 'text or image_url required' });
    const id = await enqueue(to, text || '', image_url || null);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[Relay] send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin-status', requireAdmin, async (req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err) {
    console.error('[Relay] status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin-toggle', requireAdmin, async (req, res) => {
  try {
    const status = await getStatus();
    await setEnabled(!status.enabled);
    res.json({ enabled: !status.enabled });
  } catch (err) {
    console.error('[Relay] toggle error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/groups-broadcast', requireAdmin, async (req, res) => {
  try {
    const { text, image_url } = req.body;
    if (!text && !image_url) return res.status(400).json({ error: 'text or image_url required' });

    const groups = await getAllGroups();
    if (groups.length === 0) return res.status(404).json({ error: 'No hay grupos activos' });

    const results = [];
    for (const group of groups) {
      try {
        const id = await enqueue(group.group_id, text || '', image_url || null);
        results.push({ group: group.name, status: 'queued', id });
      } catch (err) {
        results.push({ group: group.name, status: 'error', error: err.message });
      }
    }
    res.json({ results });
  } catch (err) {
    console.error('[Relay] broadcast error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/test-broadcast', requireAdmin, async (req, res) => {
  try {
    const { petId, to } = req.body;
    if (!to) return res.status(400).json({ error: 'to required' });

    const pet = petId ? await getPetForBroadcast(petId) : await getLatestPet();
    if (!pet) return res.status(404).json({ error: 'No hay mascotas disponibles' });

    const { caption, coverUrl } = generateBroadcastCaption(pet);
    const id = await enqueue(to, caption, coverUrl);

    res.json({ success: true, id, petId: pet.id, petName: pet.name, caption, coverUrl });
  } catch (err) {
    console.error('[Relay] test-broadcast error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/pets', requireAdmin, async (req, res) => {
  try {
    const { category, search } = req.query;
    const pets = await searchPets(category || 'reportados', search || '');
    res.json({ pets });
  } catch (err) {
    console.error('[Relay] pets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/broadcast-pet', requireAdmin, async (req, res) => {
  try {
    const { petId, groupIds } = req.body;
    if (!petId) return res.status(400).json({ error: 'petId required' });
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0)
      return res.status(400).json({ error: 'groupIds array required' });

    const pet = await getPetForBroadcast(petId);
    if (!pet) return res.status(404).json({ error: 'Mascota no encontrada' });

    const { caption, coverUrl } = generateBroadcastCaption(pet);
    const results = [];

    for (const groupId of groupIds) {
      try {
        const id = await enqueue(groupId, caption, coverUrl);
        results.push({ groupId, status: 'queued', id });
      } catch (err) {
        results.push({ groupId, status: 'error', error: err.message });
      }
    }

    res.json({ results, caption, coverUrl });
  } catch (err) {
    console.error('[Relay] broadcast-pet error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/broadcast-adoptions', requireAdmin, async (req, res) => {
  try {
    await broadcastAdoptionPet();
    res.json({ success: true, message: 'Broadcast de adopciones ejecutado (WA + FB)' });
  } catch (err) {
    console.error('[Relay] broadcast-adoptions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/clear-queue', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM relay_messages WHERE status = 'pending'");
    res.json({ deleted: result.rowCount });
  } catch (err) {
    console.error('[Relay] clear-queue error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/script', (req, res) => {
  res.download(path.join(__dirname, '../../relay.js'), 'relay.js');
});

router.post('/log-428', relayAuth, async (req, res) => {
  try {
    const { code, message, reconnect_count } = req.body;
    await pool.query(
      `INSERT INTO relay_428_log (code, message, reconnect_count) VALUES ($1, $2, $3)`,
      [code || 428, message || null, reconnect_count || 0]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Relay] log-428 error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


const WA_KEYWORDS = /perdido|perdida|encontré|encontre|encontrada|encontrado|perro|perra|gato|gata|mascota|apareció|aparecio|extraviado|extraviada|adopción|adopcion|callejero|abandonado|busco|busca|rescate|rescaté|rescatado/i;

router.get('/scraped-messages', (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token && token === process.env.RELAY_TOKEN) return next();
  return requireAdmin(req, res, next);
}, async (req, res) => {
  try {
    const { classification, species, search, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (classification && classification !== 'all') {
      conditions.push(`combined.classification = $${idx++}`);
      params.push(classification);
    }
    if (species && species !== 'all') {
      conditions.push(`combined.species = $${idx++}`);
      params.push(species);
    }
    if (search) {
      conditions.push(`(combined.content ILIKE $${idx} OR combined.author_name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const sql = `
      SELECT * FROM (
        SELECT fp.id, 'fb' as source, fg.name as group_name, fp.author_name, fp.content,
          fp.classification, fp.species, fp.color, fp.location_hint, fp.phone, fp.is_matched, fp.created_at,
          fp.image_urls, fp.fb_post_url,
          (fp.image_data IS NOT NULL) as has_image, 0 as image_count,
          null::text as wa_message_id, null::text as image_data, null::text as image_mime,
          null::text as author_jid, null::text as author_phone,
          fp.animal_detected, fp.animal_species, fp.animal_confidence
        FROM facebook_posts fp
        LEFT JOIN facebook_groups fg ON fg.id = fp.group_id
        WHERE fp.classification IS NOT NULL

        UNION ALL

        SELECT wsm.id, 'wa' as source, wg.name as group_name, wsm.author_name, wsm.content,
          wsm.classification, wsm.species, wsm.color, wsm.location_hint, wsm.phone, wsm.is_matched, wsm.created_at,
          null::text[] as image_urls, null::text as fb_post_url,
          ((wsm.image_data IS NOT NULL) OR EXISTS(SELECT 1 FROM whatsapp_message_images WHERE message_id = wsm.id)) as has_image,
          (SELECT COUNT(*)::int FROM whatsapp_message_images WHERE message_id = wsm.id) as image_count,
          wsm.wa_message_id, null::text as image_data, wsm.image_mime,
          wsm.author_jid, wsm.author_phone,
          wsm.animal_detected, wsm.animal_species, wsm.animal_confidence
        FROM whatsapp_scraped_messages wsm
        JOIN whatsapp_groups wg ON wg.id = wsm.group_id
        WHERE wsm.classification IS NOT NULL
      ) combined ${whereClause}
      ORDER BY combined.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(sql, params);
    res.json({ messages: result.rows });
  } catch (err) {
    console.error('[Relay] scraped-messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/scraped-messages/:id', (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token && token === process.env.RELAY_TOKEN) return next();
  return requireAdmin(req, res, next);
}, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM whatsapp_scraped_messages WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    const msg = result.rows[0];
    // Include images from new table
    try {
      const imgs = await pool.query(
        'SELECT image_data, image_mime, position FROM whatsapp_message_images WHERE message_id = $1 ORDER BY position',
        [req.params.id]
      );
      msg.images = imgs.rows;
      if (!msg.image_data && imgs.rows.length > 0) {
        msg.image_data = imgs.rows[0].image_data;
        msg.image_mime = imgs.rows[0].image_mime;
      }
    } catch (e) {
      msg.images = [];
    }
    res.json(msg);
  } catch (err) {
    console.error('[Relay] scraped-message detail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/scraped-messages/:id/image', async (req, res) => {
  try {
    const position = parseInt(req.query.position) || 0;
    // Try new images table first
    let imgResult;
    try {
      imgResult = await pool.query(
        'SELECT image_data, image_mime FROM whatsapp_message_images WHERE message_id = $1 AND position = $2',
        [req.params.id, position]
      );
    } catch (e) {
      imgResult = { rows: [] };
    }
    if (imgResult.rows.length > 0 && imgResult.rows[0].image_data) {
      const buf = Buffer.from(imgResult.rows[0].image_data, 'base64');
      res.writeHead(200, {
        'Content-Type': imgResult.rows[0].image_mime || 'image/jpeg',
        'Content-Length': buf.length,
      });
      return res.end(buf);
    }
    // Fallback to legacy column
    const result = await pool.query('SELECT image_data, image_mime FROM whatsapp_scraped_messages WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0 || !result.rows[0].image_data) return res.status(404).json({ error: 'No image' });
    const buf = Buffer.from(result.rows[0].image_data, 'base64');
    res.writeHead(200, {
      'Content-Type': result.rows[0].image_mime || 'image/jpeg',
      'Content-Length': buf.length,
    });
    res.end(buf);
  } catch (err) {
    console.error('[Relay] scraped-message image error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/resolve-group', relayAuth, async (req, res) => {
  try {
    const { jid, name } = req.body;
    if (!jid) return res.status(400).json({ error: 'jid required' });
    const result = await pool.query('SELECT id FROM whatsapp_groups WHERE group_id = $1', [jid]);
    if (result.rows.length > 0) return res.json({ id: result.rows[0].id });
    // Auto-register group with scrape enabled
    const insert = await pool.query(
      `INSERT INTO whatsapp_groups (name, group_id, is_active, auto_broadcast, scrape_enabled)
       VALUES ($1, $2, true, false, true) RETURNING id`,
      [name || jid, jid]
    );
    console.log(`[Relay] Auto-registered group ${jid} as ${insert.rows[0].id}`);
    res.json({ id: insert.rows[0].id });
  } catch (err) {
    console.error('[Relay] resolve-group error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/scraped-message', relayAuth, async (req, res) => {
  try {
    const { group_id, wa_message_id, author_jid, author_name, content, image_data, image_mime } = req.body;
    if (!group_id || !wa_message_id) return res.status(400).json({ error: 'group_id and wa_message_id required' });

    const groupRes = await pool.query('SELECT scrape_enabled FROM whatsapp_groups WHERE id = $1', [group_id]);
    if (groupRes.rows.length === 0) return res.status(404).json({ error: 'Group not found' });
    if (!groupRes.rows[0].scrape_enabled) return res.json({ skipped: true, reason: 'scrape disabled' });

    const existing = await pool.query('SELECT id FROM whatsapp_scraped_messages WHERE wa_message_id = $1', [wa_message_id]);
    if (existing.rows.length > 0) return res.json({ skipped: true, reason: 'duplicate' });

    const authorPhone = author_jid ? author_jid.replace(/@s\.whatsapp\.net$/i, '').replace(/[^0-9]/g, '') : null;

    // Check for recent message from same author in same group (last 1 minute)
    const recentRes = await pool.query(
      `SELECT id, content, image_data FROM whatsapp_scraped_messages
       WHERE group_id = $1 AND author_jid = $2
         AND created_at > NOW() - INTERVAL '1 minute'
       ORDER BY created_at DESC LIMIT 1`,
      [group_id, author_jid || '']
    );

    let messageId;
    let mergedContent = content || '';
    let isMerged = recentRes.rows.length > 0;

    if (isMerged) {
      // Merge into existing message: combine content, reset classification
      const prev = recentRes.rows[0];
      const prevContent = prev.content || '';
      mergedContent = prevContent ? `${prevContent}\n${content || ''}` : (content || '');
      messageId = prev.id;
      try {
        await pool.query(
          `UPDATE whatsapp_scraped_messages SET content = $1, classification = NULL, author_phone = $2, author_name = COALESCE($3, author_name) WHERE id = $4`,
          [mergedContent, authorPhone, author_name || null, messageId]
        );
      } catch (e) {
        await pool.query(
          `UPDATE whatsapp_scraped_messages SET content = $1, classification = NULL, author_name = COALESCE($2, author_name) WHERE id = $3`,
          [mergedContent, author_name || null, messageId]
        );
      }
      // Save new image to images table if present
      if (image_data) {
        const maxPos = await pool.query(
          `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM whatsapp_message_images WHERE message_id = $1`,
          [messageId]
        );
        const pos = maxPos.rows[0].next_pos;
        try {
          await pool.query(
            `INSERT INTO whatsapp_message_images (message_id, image_data, image_mime, position) VALUES ($1, $2, $3, $4)`,
            [messageId, image_data, image_mime || 'image/jpeg', pos]
          );
        } catch (e) {
          console.error('[Relay] failed to save merged image:', e.message);
        }
      }
    } else {
      // Insert new message
      let insertRes;
      try {
        insertRes = await pool.query(
          `INSERT INTO whatsapp_scraped_messages (group_id, wa_message_id, author_jid, author_name, author_phone, content, image_data, image_mime)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (wa_message_id) DO NOTHING
           RETURNING id`,
          [group_id, wa_message_id, author_jid || null, author_name || null, authorPhone, content || null, image_data || null, image_mime || null]
        );
      } catch (e) {
        insertRes = await pool.query(
          `INSERT INTO whatsapp_scraped_messages (group_id, wa_message_id, author_jid, author_name, content, image_data, image_mime)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (wa_message_id) DO NOTHING
           RETURNING id`,
          [group_id, wa_message_id, author_jid || null, author_name || null, content || null, image_data || null, image_mime || null]
        );
      }
      if (insertRes.rows.length === 0) return res.json({ skipped: true, reason: 'duplicate after insert' });
      messageId = insertRes.rows[0].id;
      // Save image to images table if present
      if (image_data) {
        try {
          await pool.query(
            `INSERT INTO whatsapp_message_images (message_id, image_data, image_mime, position) VALUES ($1, $2, $3, 0)`,
            [messageId, image_data, image_mime || 'image/jpeg']
          );
        } catch (e) {
          console.error('[Relay] failed to save image:', e.message);
        }
      }
    }

    res.json({ id: messageId, status: 'pending_classification', merged: isMerged });

    // Pre-filter: only for NEW (non-merged) messages. Merged messages already passed the filter.
    let hasImage = image_data || false;
    if (!hasImage && !isMerged) {
      const imgCheck = await pool.query(
        `SELECT EXISTS(SELECT 1 FROM whatsapp_message_images WHERE message_id = $1) AS has_img`,
        [messageId]
      );
      hasImage = imgCheck.rows[0]?.has_img || false;
    }

    const PET_KEYWORDS = /\b(perro|gato|mascota|puppy|kitten|pet|encontrad[oa]|perdid[oa]|avist[eé]|lo vi|lo encontr|busc[aá]ndo|rewards|recompensa|collar|chucho|canino|felino|ave|loro|conejo|hamster|hurto|robo)\b/i;
    const trimmedContent = (mergedContent || '').trim();
    if (!isMerged && hasImage && trimmedContent && !PET_KEYWORDS.test(trimmedContent)) {
      await pool.query('UPDATE whatsapp_scraped_messages SET animal_detected = false WHERE id = $1', [messageId]);
      console.log(`[Relay] ${messageId}: sin keywords de mascota (animal_detected=false)`);
      return;
    }

    // Get best image for classification: prefer the new image, fallback to first image in table
    let classImage = image_data || null;
    let classMime = image_mime || null;
    if (!classImage) {
      const imgRow = await pool.query(
        `SELECT image_data, image_mime FROM whatsapp_message_images WHERE message_id = $1 ORDER BY position ASC LIMIT 1`,
        [messageId]
      );
      if (imgRow.rows.length > 0) {
        classImage = imgRow.rows[0].image_data;
        classMime = imgRow.rows[0].image_mime;
      }
    }

    // Classify in background (non-blocking)
    classifyWhatsAppMessage(mergedContent || '', classImage, classMime)
      .then(async (classification) => {
        if (classImage && classification.species === 'other' && (classification.confidence || 0) > 30) {
          await pool.query('UPDATE whatsapp_scraped_messages SET animal_detected = false WHERE id = $1', [messageId]);
          console.log(`[Relay] ${messageId}: clasificado como 'other' (animal_detected=false)`);
          return;
        }
        await pool.query(
          `UPDATE whatsapp_scraped_messages
           SET classification = $1, species = $2, color = $3, location_hint = $4, phone = $5
           WHERE id = $6`,
          [classification.classification, classification.species, classification.color, classification.location_hint, classification.phone, messageId]
        );

        // YOLO detection: store result (non-blocking)
        if (classImage) {
          const detection = await detectAnimal(classImage, classMime || 'image/jpeg');
          await pool.query(
            `UPDATE whatsapp_scraped_messages
             SET animal_detected = $1, animal_species = $2, animal_confidence = $3
             WHERE id = $4`,
            [detection.detected, detection.species, detection.confidence, messageId]
          );
        }

        // Run matching only if classified as lost/found/sighting
        if (['lost', 'found', 'sighting'].includes(classification.classification)) {
          // Phase 1: match against app DB (pets + pet_images)
          const appMatches = await matchScrapedToAppPets(messageId);

          // Phase 2: match against other scraped messages
          if (appMatches.length === 0) {
            matchScrapedToScraped(messageId).catch(e => console.error('WA scraped-to-scraped matching error:', e));
          }
        }
      })
      .catch(e => console.error('[Relay] background classification error:', e.message));
  } catch (err) {
    console.error('[Relay] scraped-message error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/scraped-messages/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de items [{id, source}]' });
    }
    let deleted = 0;
    const fbIds = items.filter(i => i.source === 'fb').map(i => i.id);
    const waIds = items.filter(i => i.source === 'wa').map(i => i.id);
    if (fbIds.length > 0) {
      const ph = fbIds.map((_, i) => `$${i + 1}`).join(',');
      const r = await pool.query(`DELETE FROM facebook_posts WHERE id IN (${ph}) RETURNING id`, fbIds);
      deleted += r.rows.length;
    }
    if (waIds.length > 0) {
      const ph = waIds.map((_, i) => `$${i + 1}`).join(',');
      const r = await pool.query(`DELETE FROM whatsapp_scraped_messages WHERE id IN (${ph}) RETURNING id`, waIds);
      deleted += r.rows.length;
    }
    res.json({ deleted });
  } catch (err) {
    console.error('Bulk delete error:', err.message);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

export default router;
