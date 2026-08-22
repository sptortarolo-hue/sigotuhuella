import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, verifyToken, sendAdminNotificationEmail, sendLostPetConfirmationEmail } from '../auth.js';
import { matchPetToPosts, matchWhatsAppToPets, matchPetToPets } from '../services/geminiMatching.js';
import { createPetCase, generateCaseNumber } from '../services/caseService.js';
import { celebrateStatusChange } from '../services/reunionCelebration.js';
import { normalizePhone } from '../services/phoneUtils.js';
import { notifyPetPublication } from '../services/petPublicationNotification.js';
import { notifyVolunteersOfNewPet } from '../services/volunteerNotificationService.js';
import { sendPushToAdmins } from '../services/pushService.js';
import sharp from 'sharp';
import { replyToComment } from '../services/instagramService.js';
import { addPetHistory, awardBadgeIfMissing } from '../services/reunionCelebration.js';
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

async function canEditPet(userId, petId) {
  const result = await pool.query(
    `SELECT p.created_by, ps.user_id IS NOT NULL as is_shared
     FROM pets p
     LEFT JOIN pet_shares ps ON ps.pet_id = p.id AND ps.user_id = $1
     WHERE p.id = $2`,
    [userId, petId]
  );
  if (result.rows.length === 0) return false;
  const row = result.rows[0];
  return row.created_by === userId || row.is_shared;
}

async function processImage(imageData, mimeType, size = 800) {
  try {
    const buffer = Buffer.from(imageData, 'base64');
    const processed = await sharp(buffer)
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return {
      data: processed.toString('base64'),
      mimeType: 'image/jpeg',
    };
  } catch (err) {
    console.error('Image processing failed:', err.message);
    throw err;
  }
}

const statusLabels = {
  lost: '🐾 PERDIDO', retained: '🔄 RETENIDO', sighted: '👀 AVISTADO',
  for_adoption: '❤️ EN ADOPCIÓN', for_adoption_simple: '📢 EN ADOPCIÓN (DIFUSIÓN)',
  adopted: '✅ ADOPTADO',
  reunited: '🎉 REENCUENTRO', accidented: '🚑 ACCIDENTADO',
  needs_attention: '⚠️ NECESITA ATENCIÓN', transitada: '🏠 EN TRÁNSITO',
};
const speciesLabel = { dog: 'Perro', cat: 'Gato', other: 'Otra mascota' };
const genderLabel = { male: 'Macho', female: 'Hembra', unknown: '' };



const router = Router();

router.get('/', async (req, res) => {
  try {
    const { status, isPublic, limit, include_hidden } = req.query;
    const lite = req.query.lite !== '0';
    const imageFields = lite
      ? `json_build_object('id', pi.id, 'has_image', pi.image_data IS NOT NULL, 'mime_type', pi.mime_type, 'external_url', pi.external_url)`
      : `json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL)`;
    let query = `
      SELECT p.*,
        COALESCE(json_agg(${imageFields} ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images,
        EXISTS(SELECT 1 FROM adoption_assignments aa
               WHERE aa.pet_id = p.id
                 AND (aa.status = 'pending_adopter' OR (aa.status = 'completed' AND aa.adopter_id IS NULL))) as has_pending_adoption,
        (SELECT json_build_object('permalink', ip.ig_permalink, 'likes', ip.like_count, 'comments', ip.comment_count, 'shares', ip.share_count)
         FROM instagram_posts ip WHERE ip.pet_id = p.id AND ip.status = 'published' AND ip.is_celebration = FALSE
         ORDER BY ip.published_at DESC NULLS LAST LIMIT 1) as ig_impact,
        (SELECT json_build_object('post_id', fp.page_post_id, 'likes', fp.like_count, 'comments', fp.comment_count, 'shares', fp.share_count)
         FROM facebook_page_posts fp WHERE fp.pet_id = p.id AND fp.status = 'published' AND fp.is_celebration = FALSE
         ORDER BY fp.published_at DESC NULLS LAST LIMIT 1) as fb_impact,
        p.case_number as case_number
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
    `;
    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (include_hidden !== 'true') {
      conditions.push(`(p.is_hidden = FALSE OR p.is_hidden IS NULL)`);
      conditions.push(`p.group_id IS NULL`);
    }
    if (isPublic === 'true') {
      conditions.push(`p.created_by IS NULL`);
    }
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ` GROUP BY p.id ORDER BY p.created_at DESC`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    const result = await pool.query(query, params);
    res.json({ pets: result.rows });
  } catch (err) {
    console.error('Get pets error:', err);
    res.status(500).json({ error: 'Failed to fetch pets' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, 
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images,
        EXISTS(SELECT 1 FROM adoption_assignments aa
               WHERE aa.pet_id = p.id
                 AND (aa.status = 'pending_adopter' OR (aa.status = 'completed' AND aa.adopter_id IS NULL))) as has_pending_adoption
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`,
      [req.params.id]
    );
    if (result.rows.length === 0 || result.rows[0].is_hidden) {
      return res.status(404).json({ error: 'Pet not found' });
    }
    const pet = result.rows[0];

    // Related reports in the same group + history timeline
    const rootId = pet.group_id || pet.id;
    const groupMembersRes = await pool.query(
      `SELECT p.id, p.name, p.species, p.breed, p.color, p.status, p.location, p.created_at,
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE (p.id = $1 OR p.group_id = $1)
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT 50`,
      [rootId]
    );
    const historyRes = await pool.query(
      `SELECT ph.* FROM pet_history ph
       WHERE ph.pet_id = $1 OR ph.related_pet_id = $1
       ORDER BY ph.created_at DESC
       LIMIT 100`,
      [pet.id]
    );

    let myPetEvents = [];
    let myPetRecords = [];
    let myPetPhotos = [];
    if (pet.my_pet_id) {
      const [eventsRes, recordsRes, photosRes] = await Promise.all([
        pool.query(
          'SELECT * FROM my_pet_events WHERE my_pet_id = $1 ORDER BY COALESCE(event_date, created_at) DESC',
          [pet.my_pet_id]
        ),
        pool.query(
          'SELECT * FROM pet_records WHERE my_pet_id = $1 ORDER BY COALESCE(record_date, created_at) DESC',
          [pet.my_pet_id]
        ),
        pool.query(
          'SELECT id, caption, taken_at, created_at, mime_type, image_data FROM my_pet_photos WHERE my_pet_id = $1 ORDER BY COALESCE(taken_at, created_at) DESC',
          [pet.my_pet_id]
        ),
      ]);
      myPetEvents = eventsRes.rows;
      myPetRecords = recordsRes.rows;
      myPetPhotos = photosRes.rows;
    }

    res.json({
      pet,
      group_members: groupMembersRes.rows,
      history: historyRes.rows,
      my_pet_events: myPetEvents,
      my_pet_records: myPetRecords,
      my_pet_photos: myPetPhotos,
    });

    // Track pet view (fire-and-forget)
    pool.query(
      'INSERT INTO pet_views (pet_id, user_id, viewer_ip, user_agent) VALUES ($1, $2, $3, $4)',
      [req.params.id, req.user?.id || null, req.ip, req.headers['user-agent'] || null]
    ).catch(() => {});
    pool.query('UPDATE pets SET view_count = view_count + 1 WHERE id = $1', [req.params.id]).catch(() => {});
  } catch (err) {
    console.error('Get pet error:', err);
    res.status(500).json({ error: 'Failed to fetch pet' });
  }
});

// GET /:id/owner-data — suggest owner data for reunion/adoption
router.get('/:id/owner-data', requireAuth, async (req, res) => {
  try {
    const petResult = await pool.query('SELECT * FROM pets WHERE id = $1', [req.params.id]);
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Pet not found' });
    const pet = petResult.rows[0];

    let ownerName = pet.owner_name || null;
    let ownerPhone = pet.owner_phone || null;
    let ownerEmail = pet.owner_email || null;
    let ownerAddress = pet.owner_address || null;

    if (pet.created_by) {
      const userRes = await pool.query('SELECT display_name, email, phone FROM users WHERE id = $1', [pet.created_by]);
      const user = userRes.rows[0];
      if (user) {
        if (!ownerName && user.display_name) ownerName = user.display_name;
        if (!ownerPhone && user.phone) ownerPhone = user.phone;
        if (!ownerEmail && user.email) ownerEmail = user.email;
      }
    }

    if (!ownerPhone && pet.contact_info && /^\d{8,}$/.test(pet.contact_info.replace(/\D/g, ''))) {
      ownerPhone = pet.contact_info;
    }

    if (!ownerAddress && pet.location) ownerAddress = pet.location;

    if (!ownerAddress && !ownerPhone && !ownerName) {
      try {
        const mpRes = await pool.query(
          'SELECT emergency_phone FROM my_pets WHERE user_id = $1 LIMIT 1',
          [pet.created_by]
        );
        if (mpRes.rows.length > 0 && mpRes.rows[0].emergency_phone && !ownerPhone) {
          ownerPhone = mpRes.rows[0].emergency_phone;
        }
      } catch (_) {}
    }

    res.json({
      owner_name: ownerName,
      owner_phone: ownerPhone,
      owner_email: ownerEmail,
      owner_address: ownerAddress,
      reunited_at: pet.reunited_at || null,
    });
  } catch (err) {
    console.error('Get owner data error:', err);
    res.status(500).json({ error: 'Failed to fetch owner data' });
  }
});

// POST /:id/view — track a pet view without returning data
router.post('/:id/view', async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO pet_views (pet_id, user_id, viewer_ip, user_agent) VALUES ($1, $2, $3, $4)',
      [req.params.id, req.user?.id || null, req.ip, req.headers['user-agent'] || null]
    );
    await pool.query('UPDATE pets SET view_count = view_count + 1 WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Track view error:', err);
    res.status(500).json({ error: 'Error al registrar vista' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { name, species, breed, color, status, gender, age, size, isVaccinated, isSterilized, description, location, latitude, longitude, contactInfo, images, neighborhoods } = req.body;
  if (!species || !status || !location) {
    return res.status(400).json({ error: 'Species, status, and location are required' });
  }
  // for_adoption requiere un perfil vinculado (my_pet_id). Sin él, es un aviso simple.
  const effectiveStatus = status === 'for_adoption' ? 'for_adoption_simple' : status;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const petResult = await client.query(
      `INSERT INTO pets (name, species, breed, color, status, gender, age, size, is_vaccinated, is_sterilized, is_dewormed, description, location, latitude, longitude, contact_info, created_by, is_admin_verified, neighborhoods, privacy_notice_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
      RETURNING *`,
      [name || null, species, breed || null, color || null, effectiveStatus, gender || 'unknown',
       age || null, size || null, isVaccinated || false, isSterilized || false, req.body.isDewormed || false,
       description || null, location, latitude || null, longitude || null,
       contactInfo || null, req.user.id, false, JSON.stringify(neighborhoods || [])]
    );
    const pet = petResult.rows[0];
    if (images && images.length > 0) {
      for (const img of images) {
        const processed = await processImage(img.data, img.mimeType || 'image/jpeg', 800);
        await client.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type, crop_x, crop_y, original_image_data) VALUES ($1, $2, $3, $4, $5, $6)',
          [pet.id, processed.data, processed.mimeType, img.crop_x ?? 0.5, img.crop_y ?? 0.5, null]
        );
      }
    }
    const imagesResult = await client.query(
      `SELECT json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) as images
      FROM pet_images pi WHERE pi.pet_id = $1`,
      [pet.id]
    );
    await client.query('COMMIT');
    pet.images = imagesResult.rows[0]?.images || [];

    // Auto-badge: first_report (first pet ever reported by this user)
    const reportCountRes = await pool.query('SELECT COUNT(*) as cnt FROM pets WHERE created_by = $1', [req.user.id]);
    if (parseInt(reportCountRes.rows[0].cnt) === 1) {
      await awardBadgeIfMissing(req.user.id, 'first_report');
    }
    // Auto-badge: reporter_5 and reporter_15 milestones
    const cnt = parseInt(reportCountRes.rows[0].cnt);
    if (cnt === 5) await awardBadgeIfMissing(req.user.id, 'reporter_5');
    if (cnt === 15) await awardBadgeIfMissing(req.user.id, 'reporter_15');

    notifyPetPublication(pet.id, req.user.phone).catch(e => console.error('Publication notify error:', e));
    notifyVolunteersOfNewPet(pet).catch(e => console.error('Volunteer notify error:', e));
    matchPetToPosts(pet).catch(err => console.error('Matching FB error:', err));
    matchWhatsAppToPets(pet.id).catch(e => console.error('WhatsApp matching error:', e));
    matchPetToPets(pet).catch(e => console.error('Pet↔pet matching error:', e));
    createPetCase(pet, { source: 'app_auth' });

    res.status(201).json({ pet });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create pet error:', err);
    res.status(500).json({ error: 'Failed to create pet' });
  } finally {
    client.release();
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const petId = req.params.id;
  try {
    const existing = await pool.query('SELECT * FROM pets WHERE id = $1', [petId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Pet not found' });
    }
    const pet = existing.rows[0];
    if (req.user.role !== 'admin' && !(await canEditPet(req.user.id, petId))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    // for_adoption requiere un perfil vinculado (my_pet_id). Sin él, es un aviso simple.
    if (req.body.status === 'for_adoption' && !pet.my_pet_id) {
      req.body.status = 'for_adoption_simple';
    }
    const fields = ['name', 'species', 'breed', 'color', 'status', 'gender', 'age', 'size', 'is_vaccinated', 'is_sterilized', 'is_dewormed', 'description', 'location', 'contact_info', 'is_hidden', 'contact_visible', 'owner_name', 'owner_phone', 'owner_email', 'owner_address'];
    const updates = [];
    const values = [];
    let idx = 1;
    for (const field of fields) {
      const key = field === 'contact_info' ? 'contactInfo' : field === 'is_vaccinated' ? 'isVaccinated' : field === 'is_sterilized' ? 'isSterilized' : field === 'is_dewormed' ? 'isDewormed' : field;
      if (req.body[key] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        values.push(req.body[key]);
      }
    }
    if (req.body.latitude !== undefined && req.body.longitude !== undefined) {
      updates.push(`latitude = $${idx++}`);
      values.push(req.body.latitude);
      updates.push(`longitude = $${idx++}`);
      values.push(req.body.longitude);
    }
    if (req.body.neighborhoods !== undefined) {
      updates.push(`neighborhoods = $${idx++}`);
      values.push(JSON.stringify(req.body.neighborhoods));
    }
    if (updates.length === 0 && !req.body.images && !req.body.newImages && req.body.imagesToKeep === undefined) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(petId);
      await pool.query(
        `UPDATE pets SET ${updates.join(', ')} WHERE id = $${idx}`,
        values
      );
    }
    // Handle images explicitly
    if (req.body.imagesToKeep !== undefined) {
      if (req.body.imagesToKeep.length > 0) {
        await pool.query('DELETE FROM pet_images WHERE pet_id = $1 AND id != ALL($2::uuid[])', [petId, req.body.imagesToKeep]);
      } else {
        await pool.query('DELETE FROM pet_images WHERE pet_id = $1', [petId]);
      }
    }
    if (req.body.newImages && req.body.newImages.length > 0) {
      for (const img of req.body.newImages) {
        const processed = await processImage(img.data, img.mimeType, 800);
        await pool.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type, crop_x, crop_y, original_image_data) VALUES ($1, $2, $3, $4, $5, $6)',
          [petId, processed.data, processed.mimeType, img.crop_x ?? 0.5, img.crop_y ?? 0.5, null]
        );
      }
    } else if (req.body.images && req.body.images.length > 0) {
      // Fallback for legacy behavior
      await pool.query('DELETE FROM pet_images WHERE pet_id = $1', [petId]);
      for (const img of req.body.images) {
        const processed = await processImage(img.data, img.mimeType, 800);
        await pool.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type, crop_x, crop_y, original_image_data) VALUES ($1, $2, $3, $4, $5, $6)',
          [petId, processed.data, processed.mimeType, img.crop_x ?? 0.5, img.crop_y ?? 0.5, null]
        );
      }
    }
    // Status change → celebración completa (news, IG/FB, broadcast, badges, etc.)
    if (req.body.status && req.body.status !== pet.status) {
      await celebrateStatusChange({
        petId,
        userId: req.user.id,
        fromStatus: pet.status,
        toStatus: req.body.status,
        ownerFields: {
          owner_name: req.body.owner_name,
          owner_phone: req.body.owner_phone,
          owner_email: req.body.owner_email,
          owner_address: req.body.owner_address,
        },
      });
    }
    // Return pet with images
    const updated = await pool.query(
      `SELECT p.*, 
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`,
      [petId]
    );
    res.json({ pet: updated.rows[0] });
  } catch (err) {
    console.error('Update pet error:', err);
    res.status(500).json({ error: 'Failed to update pet' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const petId = req.params.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM pets WHERE id = $1', [petId]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pet not found' });
    }
    const pet = existing.rows[0];
    if (req.user.role !== 'admin' && pet.created_by !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized' });
    }
    // Cancelar adopciones pendientes vinculadas antes de borrar la mascota
    await client.query(
      `UPDATE adoption_assignments SET status = 'returned', returned_at = NOW(), return_reason = $1
       WHERE pet_id = $2 AND status = 'pending_adopter'`,
      ['Mascota eliminada', petId]
    );
    await client.query('DELETE FROM pets WHERE id = $1', [petId]);
    await client.query('COMMIT');
    res.json({ message: 'Pet deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete pet error:', err);
    res.status(500).json({ error: 'Failed to delete pet' });
  } finally {
    client.release();
  }
});

// ── Admin: group duplicate reports ───────────────────────────────────────────

// GET /pets/:id/similar — reportes similares sugeridos para agrupar
router.get('/:id/similar', requireAdmin, async (req, res) => {
  const petId = req.params.id;
  try {
    const res_ = await pool.query(
      `SELECT pm.score, pm.status, pm.new_event_reason, pm.created_at AS match_created_at,
              p.id, p.name, p.case_number, p.species, p.status AS pet_status,
              p.location, p.created_at, p.reunited_at,
              (SELECT image_data FROM pet_images WHERE pet_id = p.id ORDER BY created_at LIMIT 1) AS image_data,
              (SELECT mime_type FROM pet_images WHERE pet_id = p.id ORDER BY created_at LIMIT 1) AS image_mime
       FROM pet_matches pm
       JOIN pets p ON p.id = CASE
         WHEN pm.source_pet_id = $1 THEN pm.target_pet_id
         ELSE pm.source_pet_id
       END
       WHERE (pm.source_pet_id = $1 OR pm.target_pet_id = $1)
         AND pm.status IN ('pending','new_event')
         AND p.group_id IS NULL
       ORDER BY pm.score DESC LIMIT 10`,
      [petId]
    );
    const matches = res_.rows.map(r => ({
      score: r.score,
      status: r.status,
      new_event_reason: r.new_event_reason,
      match_created_at: r.match_created_at,
      pet: {
        id: r.id, name: r.name, case_number: r.case_number,
        species: r.species, status: r.pet_status, location: r.location,
        created_at: r.created_at, reunited_at: r.reunited_at,
        image_data: r.image_data, image_mime: r.image_mime,
      },
    }));
    res.json({ matches });
  } catch (err) {
    console.error('Get similar pets error:', err);
    res.status(500).json({ error: 'Error al buscar reportes similares' });
  }
});

// POST /pets/:id/match-reject — descartar sugerencia de agrupamiento
router.post('/:id/match-reject', requireAdmin, async (req, res) => {
  const { otherId } = req.body;
  if (!otherId) return res.status(400).json({ error: 'otherId es requerido' });
  try {
    await pool.query(
      `UPDATE pet_matches SET status = 'rejected', updated_at = NOW()
       WHERE (source_pet_id = $1 AND target_pet_id = $2)
          OR (source_pet_id = $2 AND target_pet_id = $1)`,
      [req.params.id, otherId]
    );
    res.json({ message: 'Sugerencia descartada' });
  } catch (err) {
    console.error('Reject match error:', err);
    res.status(500).json({ error: 'Error al descartar sugerencia' });
  }
});

// GET /pets/:id/grouped-members — miembros agrupados bajo este root (para desagrupar)
router.get('/:id/grouped-members', requireAdmin, async (req, res) => {
  try {
    const res_ = await pool.query(
      `SELECT p.id, p.name, p.case_number, p.species, p.status, p.created_at,
              pgh.member_case_id, pgh.member_case_number, pgh.grouped_at
       FROM pets p
       JOIN pet_group_history pgh ON pgh.member_pet_id = p.id
       WHERE pgh.root_pet_id = $1
       ORDER BY pgh.grouped_at DESC`,
      [req.params.id]
    );
    res.json({ members: res_.rows });
  } catch (err) {
    console.error('Get grouped members error:', err);
    res.status(500).json({ error: 'Error al obtener miembros agrupados' });
  }
});

const CASE_STATUSES = ['lost', 'transitada', 'found', 'retained', 'accidented', 'needs_attention'];

// POST /pets/:id/group — agrupar reporte + consolidar caso (transacción)
router.post('/:id/group', requireAdmin, async (req, res) => {
  const reqRootId = req.params.id;
  const { memberId } = req.body;
  try {
    if (!memberId) return res.status(400).json({ error: 'memberId es requerido' });
    if (memberId === reqRootId) return res.status(400).json({ error: 'No se puede agrupar consigo mismo' });

    const [rootRes, memberRes] = await Promise.all([
      pool.query('SELECT id, group_id, created_at, status FROM pets WHERE id = $1', [reqRootId]),
      pool.query('SELECT id, group_id, created_at, status FROM pets WHERE id = $1', [memberId]),
    ]);
    if (rootRes.rows.length === 0 || memberRes.rows.length === 0) {
      return res.status(404).json({ error: 'Mascota no encontrada' });
    }
    const rootRowReq = rootRes.rows[0];
    const memberRow = memberRes.rows[0];

    if (rootRowReq.group_id) return res.status(400).json({ error: 'La mascota raíz no puede ser un reporte agrupado' });
    if (memberRow.group_id) return res.status(400).json({ error: 'Ese reporte ya pertenece a otra agrupación' });

    // Determinar root automático: el que tiene case; si ambos, el más viejo.
    const rootHasCase = CASE_STATUSES.includes(rootRowReq.status);
    const memberHasCase = CASE_STATUSES.includes(memberRow.status);
    let rootId, otherId;
    if (rootHasCase && memberHasCase) {
      if (new Date(rootRowReq.created_at) <= new Date(memberRow.created_at)) {
        rootId = reqRootId; otherId = memberId;
      } else {
        rootId = memberId; otherId = reqRootId; // swap
      }
    } else if (rootHasCase) {
      rootId = reqRootId; otherId = memberId;
    } else if (memberHasCase) {
      rootId = memberId; otherId = reqRootId; // swap
    } else {
      return res.status(400).json({ error: 'Ningún reporte tiene caso activo para consolidar' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Root case activo
      let rootCaseRes = await client.query(
        "SELECT id FROM pet_cases WHERE pet_id = $1 AND status = 'active' LIMIT 1", [rootId]
      );
      let rootCaseId;
      if (rootCaseRes.rows.length === 0) {
        // Crear case para el root
        const rootPetRes = await client.query(
          'SELECT status, created_by FROM pets WHERE id = $1', [rootId]
        );
        const rp = rootPetRes.rows[0];
        const mapping = rp.status === 'lost' || rp.status === 'transitada'
          ? { type: 'lost', caseStatus: 'active' }
          : { type: 'found', caseStatus: 'active' };
        const newCase = await client.query(
          `INSERT INTO pet_cases (pet_id, reporter_id, reporter_source, type, status, active_until)
           VALUES ($1, $2, 'grouped', $3, $4, NOW() + INTERVAL '45 days')
           RETURNING id`,
          [rootId, rp.created_by || null, mapping.type, mapping.caseStatus]
        );
        rootCaseId = newCase.rows[0].id;
      } else {
        rootCaseId = rootCaseRes.rows[0].id;
      }

      // Child case
      const childCaseRes = await client.query(
        "SELECT id, status FROM pet_cases WHERE pet_id = $1 AND status = 'active' LIMIT 1", [otherId]
      );
      let childCaseId = null;
      let memberCaseNumber = null;
      if (childCaseRes.rows.length === 0) {
        // Sin child case activo (sighted sin case, o ya cerrado). Intentamos cualquier case existente.
        const anyCase = await client.query(
          "SELECT id FROM pet_cases WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 1", [otherId]
        );
        childCaseId = anyCase.rows[0]?.id || null;
      } else {
        childCaseId = childCaseRes.rows[0].id;
      }
      const memberCaseNumberRes = await client.query('SELECT case_number FROM pets WHERE id = $1', [otherId]);
      memberCaseNumber = memberCaseNumberRes.rows[0]?.case_number || null;

      // Migrar datos (guardar IDs para desagrupar)
      let migratedSightings = [], migratedAreas = [], migratedFollowers = [], migratedIg = [], migratedFb = [];

      if (childCaseId) {
        const sRes = await client.query(
          `WITH moved AS (
             UPDATE case_sightings SET case_id = $1
             WHERE case_id = $2 RETURNING id
           ) SELECT array_agg(id) FROM moved`,
          [rootCaseId, childCaseId]
        );
        migratedSightings = sRes.rows[0].array_agg || [];

        const aRes = await client.query(
          `WITH moved AS (
             UPDATE case_search_areas SET case_id = $1
             WHERE case_id = $2 RETURNING id
           ) SELECT array_agg(id) FROM moved`,
          [rootCaseId, childCaseId]
        );
        migratedAreas = aRes.rows[0].array_agg || [];

        await client.query(
          'UPDATE neighborhood_alerts SET case_id = $1 WHERE case_id = $2',
          [rootCaseId, childCaseId]
        );
        await client.query(
          'UPDATE facebook_replicas SET case_id = $1 WHERE case_id = $2',
          [rootCaseId, childCaseId]
        );

        const fRes = await client.query(
          `WITH moved AS (
             INSERT INTO case_followers (case_id, user_id)
             SELECT $1, user_id FROM case_followers WHERE case_id = $2
             ON CONFLICT (case_id, user_id) DO NOTHING RETURNING user_id
           ) SELECT array_agg(user_id) FROM moved`,
          [rootCaseId, childCaseId]
        );
        migratedFollowers = fRes.rows[0].array_agg || [];
        await client.query('DELETE FROM case_followers WHERE case_id = $1', [childCaseId]);
      }

      // Publicaciones IG/FB → root pet
      const igRes = await client.query(
        `WITH moved AS (
           UPDATE instagram_posts SET pet_id = $1 WHERE pet_id = $2 RETURNING id
         ) SELECT array_agg(id) FROM moved`,
        [rootId, otherId]
      );
      migratedIg = igRes.rows[0].array_agg || [];

      const fbRes = await client.query(
        `WITH moved AS (
           UPDATE facebook_page_posts SET pet_id = $1 WHERE pet_id = $2 RETURNING id
         ) SELECT array_agg(id) FROM moved`,
        [rootId, otherId]
      );
      migratedFb = fbRes.rows[0].array_agg || [];

      // Set group_id
      await client.query('UPDATE pets SET group_id = $1, updated_at = NOW() WHERE id = $2', [rootId, otherId]);

      // Cerrar child case
      if (childCaseId) {
        const childStatusRes = await client.query('SELECT status FROM pet_cases WHERE id = $1', [childCaseId]);
        const childStatus = childStatusRes.rows[0]?.status;
        if (childStatus === 'active') {
          await client.query("UPDATE pet_cases SET status = 'closed' WHERE id = $1", [childCaseId]);
        }
        await client.query(
          `INSERT INTO case_events (case_id, event_type, payload)
           VALUES ($1, 'case_closed', $2)`,
          [childCaseId, JSON.stringify({ reason: 'grouped', closed_by: req.user.id, merged_into: rootCaseId })]
        );
      }

      // Evento de merge en root case
      await client.query(
        `INSERT INTO case_events (case_id, user_id, event_type, payload)
         VALUES ($1, $2, 'case_merged', $3)`,
        [rootCaseId, req.user.id, JSON.stringify({
          merged_pet_id: otherId,
          merged_case_number: memberCaseNumber,
          sightings_moved: migratedSightings.length,
          followers_moved: migratedFollowers.length,
          search_areas_moved: migratedAreas.length,
        })]
      );

      // Guardar historia para desagrupar
      await client.query(
        `INSERT INTO pet_group_history
          (root_pet_id, member_pet_id, root_case_id, member_case_id, member_case_number, grouped_by,
           migrated_sighting_ids, migrated_search_area_ids, migrated_follower_ids,
           migrated_ig_post_ids, migrated_fb_post_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [rootId, otherId, rootCaseId, childCaseId, memberCaseNumber, req.user.id,
         migratedSightings, migratedAreas, migratedFollowers, migratedIg, migratedFb]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Pet history (fuera de la transacción, tolera fallos)
    await addPetHistory({ petId: rootId, eventType: 'grouped', description: 'Reporte agregado a esta agrupación', relatedPetId: otherId, changedBy: req.user.id });
    await addPetHistory({ petId: otherId, eventType: 'grouped', description: 'Reporte agrupado bajo la ficha principal', relatedPetId: rootId, changedBy: req.user.id });

    // pet_matches → grouped
    await pool.query(
      `UPDATE pet_matches SET status = 'grouped', updated_at = NOW()
       WHERE (source_pet_id = $1 AND target_pet_id = $2)
          OR (source_pet_id = $2 AND target_pet_id = $1)`,
      [rootId, otherId]
    );

    res.json({ message: 'Reporte agrupado y caso consolidado', root_id: rootId, member_id: otherId });
  } catch (err) {
    console.error('Group pet error:', err);
    res.status(500).json({ error: 'Failed to group pet' });
  }
});

// POST /pets/:id/ungroup — desagrupar (reabre child case + migra datos de vuelta)
router.post('/:id/ungroup', requireAdmin, async (req, res) => {
  const rootId = req.params.id;
  const { memberId } = req.body;
  try {
    if (!memberId) return res.status(400).json({ error: 'memberId es requerido' });

    const historyRes = await pool.query(
      `SELECT * FROM pet_group_history
       WHERE root_pet_id = $1 AND member_pet_id = $2
       ORDER BY grouped_at DESC LIMIT 1`,
      [rootId, memberId]
    );
    if (historyRes.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontró registro de agrupamiento' });
    }
    const record = historyRes.rows[0];
    const childCaseId = record.member_case_id;
    const rootCaseId = record.root_case_id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Reabrir child case
      if (childCaseId) {
        await client.query(
          `UPDATE pet_cases SET status = 'active', active_until = NOW() + INTERVAL '45 days', updated_at = NOW()
           WHERE id = $1`, [childCaseId]
        );
      }

      // Devolver sightings
      if (childCaseId && record.migrated_sighting_ids?.length) {
        await client.query(
          'UPDATE case_sightings SET case_id = $1 WHERE id = ANY($2::uuid[])',
          [childCaseId, record.migrated_sighting_ids]
        );
      }
      // Devolver search areas
      if (childCaseId && record.migrated_search_area_ids?.length) {
        await client.query(
          'UPDATE case_search_areas SET case_id = $1 WHERE id = ANY($2::uuid[])',
          [childCaseId, record.migrated_search_area_ids]
        );
      }
      // Devolver seguidores al child
      if (childCaseId && record.migrated_follower_ids?.length) {
        for (const uid of record.migrated_follower_ids) {
          await client.query(
            `INSERT INTO case_followers (case_id, user_id) VALUES ($1, $2)
             ON CONFLICT (case_id, user_id) DO NOTHING`,
            [childCaseId, uid]
          );
        }
      }
      // Devolver IG posts
      if (record.migrated_ig_post_ids?.length) {
        await client.query(
          'UPDATE instagram_posts SET pet_id = $1 WHERE id = ANY($2::uuid[])',
          [memberId, record.migrated_ig_post_ids]
        );
      }
      // Devolver FB posts
      if (record.migrated_fb_post_ids?.length) {
        await client.query(
          'UPDATE facebook_page_posts SET pet_id = $1 WHERE id = ANY($2::uuid[])',
          [memberId, record.migrated_fb_post_ids]
        );
      }

      // Quitar group_id
      await client.query('UPDATE pets SET group_id = NULL, updated_at = NOW() WHERE id = $1', [memberId]);

      // Eventos
      await client.query(
        `INSERT INTO case_events (case_id, user_id, event_type, payload)
         VALUES ($1, $2, 'case_unmerged', $3)`,
        [rootCaseId, req.user.id, JSON.stringify({ separated_pet_id: memberId, separated_case_id: childCaseId })]
      );
      if (childCaseId) {
        await client.query(
          `INSERT INTO case_events (case_id, event_type, payload)
           VALUES ($1, 'case_reopened', $2)`,
          [childCaseId, JSON.stringify({ reason: 'ungrouped', reopened_by: req.user.id })]
        );
      }

      // Eliminar pet_group_history
      await client.query('DELETE FROM pet_group_history WHERE id = $1', [record.id]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Pet history
    await addPetHistory({ petId: rootId, eventType: 'ungrouped', description: 'Reporte removido de la agrupación', relatedPetId: memberId, changedBy: req.user.id });
    await addPetHistory({ petId: memberId, eventType: 'ungrouped', description: 'Reporte separado de la ficha principal', relatedPetId: rootId, changedBy: req.user.id });

    // pet_matches → rejected (no sugerir de vuelta automáticamente)
    await pool.query(
      `UPDATE pet_matches SET status = 'rejected', updated_at = NOW()
       WHERE (source_pet_id = $1 AND target_pet_id = $2)
          OR (source_pet_id = $2 AND target_pet_id = $1)`,
      [rootId, memberId]
    );

    res.json({ message: 'Reporte desagrupado y caso reabierto' });
  } catch (err) {
    console.error('Ungroup pet error:', err);
    res.status(500).json({ error: 'Failed to ungroup pet' });
  }
});

// ── Admin: transit assignment (transitada) ───────────────────────────────────
router.post('/:id/transit', requireAdmin, async (req, res) => {
  const petId = req.params.id;
  const { userId, caregiverName, caregiverPhone, caregiverEmail } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const petRes = await client.query('SELECT * FROM pets WHERE id = $1', [petId]);
    if (petRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pet not found' });
    }
    const pet = petRes.rows[0];

    let myPetId = pet.my_pet_id;
    if (userId) {
      const userRes = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (userRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Usuario no encontrado' });
      }
    }

    if (!myPetId) {
      const imgRes = await client.query(
        `SELECT image_data, mime_type FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1`,
        [petId]
      );
      const img = imgRes.rows[0] || null;
      const ownerId = userId || req.user.id;
      const myPetRes = await client.query(
        `INSERT INTO my_pets (user_id, name, species, breed, color, gender, bio, pet_type, avatar_image, avatar_mime_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'foster',$8,$9)
         RETURNING id`,
        [
          ownerId,
          pet.name || 'Sin nombre',
          pet.species,
          pet.breed || null,
          pet.color || null,
          pet.gender || 'unknown',
          pet.description || null,
          img ? img.image_data : null,
          img ? img.mime_type : null,
        ]
      );
      myPetId = myPetRes.rows[0].id;
    } else {
      await client.query('UPDATE my_pets SET pet_type = $1 WHERE id = $2', ['foster', myPetId]);
    }

    if (!userId) {
      const adminsRes = await client.query(
        "SELECT id FROM users WHERE role = 'admin' AND id <> $1",
        [req.user.id]
      );
      for (const admin of adminsRes.rows) {
        await client.query(
          `INSERT INTO my_pet_shares (pet_id, user_id, role) VALUES ($1, $2, 'editor') ON CONFLICT DO NOTHING`,
          [myPetId, admin.id]
        );
      }
    }

    await client.query(
      `UPDATE pets SET status = 'transitada', transit_caregiver_id = $1, transit_assigned_at = NOW(),
        transit_caregiver_name = $2, transit_caregiver_phone = $3, transit_caregiver_email = $4,
        my_pet_id = $5, updated_at = NOW()
       WHERE id = $6`,
      [userId || null, caregiverName || null, caregiverPhone || null, caregiverEmail || null, myPetId || null, petId]
    );

    const caregiverText = caregiverName
      ? ` (cuidador: ${caregiverName}${caregiverPhone ? `, ${caregiverPhone}` : ''})`
      : '';
    await client.query(
      `INSERT INTO pet_history (pet_id, event_type, description, from_status, to_status, related_user_id, changed_by)
       VALUES ($1, 'transit_assigned', $2, $3, 'transitada', $4, $5)`,
      [
        petId,
        userId
          ? 'Mascota puesta en tránsito y asignada a un usuario'
          : `Mascota puesta en tránsito asignada a la agrupación${caregiverText}`,
        pet.status,
        userId || null,
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.json({ message: 'Mascota puesta en tránsito', my_pet_id: myPetId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Transit pet error:', err);
    res.status(500).json({ error: 'Failed to set pet in transit' });
  } finally {
    client.release();
  }
});

router.post('/:id/exit-transit', requireAdmin, async (req, res) => {
  const petId = req.params.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const petRes = await client.query('SELECT * FROM pets WHERE id = $1', [petId]);
    if (petRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pet not found' });
    }
    const pet = petRes.rows[0];

    if (pet.my_pet_id && !pet.transit_caregiver_id) {
      await client.query('DELETE FROM my_pet_shares WHERE pet_id = $1', [pet.my_pet_id]);
    }

    await client.query(
      `UPDATE pets SET status = 'for_adoption', transit_caregiver_id = NULL, transit_assigned_at = NULL,
        transit_caregiver_name = NULL, transit_caregiver_phone = NULL, transit_caregiver_email = NULL,
        updated_at = NOW()
       WHERE id = $1`,
      [petId]
    );
    await addPetHistory({ petId, eventType: 'transit_exited', description: 'Mascota salió de tránsito y pasó a adopción', fromStatus: pet.status, toStatus: 'for_adoption', changedBy: req.user.id });
    await client.query('COMMIT');
    res.json({ message: 'Mascota fuera de tránsito' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Exit transit error:', err);
    res.status(500).json({ error: 'Failed to exit transit' });
  } finally {
    client.release();
  }
});

router.get('/:id/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ph.*, u.display_name as changed_by_name
       FROM pet_history ph
       LEFT JOIN users u ON u.id = ph.changed_by
       WHERE ph.pet_id = $1
       ORDER BY ph.created_at DESC
       LIMIT 100`,
      [req.params.id]
    );
    res.json({ history: result.rows });
  } catch (err) {
    console.error('Get pet history error:', err);
    res.status(500).json({ error: 'Failed to fetch pet history' });
  }
});

// ── Admin: get pet with all relations ──────────────────────────────────────────
router.get('/:id/relations', requireAdmin, async (req, res) => {
  try {
    const petId = req.params.id;

    const petRes = await pool.query(
      `SELECT p.*,
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL, 'sort_order', pi.sort_order) ORDER BY pi.sort_order, pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`,
      [petId]
    );
    if (petRes.rows.length === 0) return res.status(404).json({ error: 'Pet not found' });
    const pet = petRes.rows[0];
    pet.neighborhoods = typeof pet.neighborhoods === 'string' ? JSON.parse(pet.neighborhoods) : pet.neighborhoods;

    let createdBy = null;
    if (pet.created_by) {
      const userRes = await pool.query(
        'SELECT id, email, display_name, phone, role FROM users WHERE id = $1',
        [pet.created_by]
      );
      createdBy = userRes.rows[0] || null;
    }

    const fbPostsRes = await pool.query(
      `SELECT fp.*, fm.id as match_id, fm.score as match_score, fm.status as match_status, fm.reasons as match_reasons
       FROM facebook_posts fp
       JOIN facebook_matches fm ON (
         (fm.source_type = 'fb_post' AND fm.source_id = fp.id AND fm.target_type = 'app_pet' AND fm.target_id = $1)
         OR
         (fm.target_type = 'fb_post' AND fm.target_id = fp.id AND fm.source_type = 'app_pet' AND fm.source_id = $1)
       )
       ORDER BY fp.posted_at DESC
       LIMIT 20`,
      [petId]
    );

    const igPostsRes = await pool.query(
      'SELECT id, media_type, caption, image_urls, status, ig_media_id, ig_permalink, error_message, scheduled_publish_time, published_at, created_at FROM instagram_posts WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 20',
      [petId]
    );

    const waMessagesRes = await pool.query(
      `SELECT id, wa_from, sender_name, text_body, message_type, direction, created_at
       FROM whatsapp_messages WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [petId]
    );

    const matchesRes = await pool.query(
      `SELECT fm.*,
        CASE
          WHEN fm.target_type = 'fb_post' THEN (SELECT fb_post_id FROM facebook_posts WHERE id = fm.target_id::uuid)
          WHEN fm.source_type = 'fb_post' THEN (SELECT fb_post_id FROM facebook_posts WHERE id = fm.source_id::uuid)
        END as related_fb_post_id,
        CASE
          WHEN fm.target_type = 'fb_post' THEN (SELECT content FROM facebook_posts WHERE id = fm.target_id::uuid)
          WHEN fm.source_type = 'fb_post' THEN (SELECT content FROM facebook_posts WHERE id = fm.source_id::uuid)
        END as related_fb_content,
        CASE
          WHEN fm.target_type = 'fb_post' THEN (SELECT author_name FROM facebook_posts WHERE id = fm.target_id::uuid)
          WHEN fm.source_type = 'fb_post' THEN (SELECT author_name FROM facebook_posts WHERE id = fm.source_id::uuid)
        END as related_fb_author,
        CASE
          WHEN fm.target_type IN ('app_pet', 'wa_report') THEN (SELECT name FROM pets WHERE id = fm.target_id::uuid)
          WHEN fm.source_type IN ('app_pet', 'wa_report') THEN (SELECT name FROM pets WHERE id = fm.source_id::uuid)
        END as related_pet_name
       FROM facebook_matches fm
       WHERE (fm.source_type = 'app_pet' AND fm.source_id = $1)
          OR (fm.target_type = 'app_pet' AND fm.target_id = $1)
          OR (fm.source_type = 'wa_report' AND fm.source_id = $1)
          OR (fm.target_type = 'wa_report' AND fm.target_id = $1)
       ORDER BY fm.created_at DESC
       LIMIT 20`,
      [petId]
    );

    const qrRes = await pool.query(
      `SELECT qi.id, qi.code, qi.share_token, qi.assigned_at, qi.created_at
       FROM qr_identifiers qi
       JOIN my_pets mp ON mp.qr_id = qi.id
       WHERE mp.lost_report_id = $1
       LIMIT 5`,
      [petId]
    );

    let groupMembers = [];
    if (pet.group_id) {
      const groupMembersRes = await pool.query(
        `SELECT p.*,
          COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
        FROM pets p
        LEFT JOIN pet_images pi ON pi.pet_id = p.id
        WHERE p.id = $1 OR p.group_id = $1
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 50`,
        [pet.group_id]
      );
      groupMembers = groupMembersRes.rows;
    } else {
      const groupMembersRes = await pool.query(
        `SELECT p.id, p.name, p.species, p.breed, p.color, p.status, p.location, p.description, p.created_at, p.created_by, p.is_hidden,
          COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
        FROM pets p
        LEFT JOIN pet_images pi ON pi.pet_id = p.id
        WHERE p.group_id = $1
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT 50`,
        [petId]
      );
      groupMembers = groupMembersRes.rows;
    }

    const historyRes = await pool.query(
      `SELECT ph.*, u.display_name as changed_by_name
       FROM pet_history ph
       LEFT JOIN users u ON u.id = ph.changed_by
       WHERE ph.pet_id = $1
       ORDER BY ph.created_at DESC
       LIMIT 100`,
      [petId]
    );

    res.json({
      pet,
      created_by_user: createdBy,
      facebook_posts: fbPostsRes.rows,
      instagram_posts: igPostsRes.rows,
      whatsapp_messages: waMessagesRes.rows,
      facebook_matches: matchesRes.rows,
      qr_identifiers: qrRes.rows,
      group_members: groupMembers,
      history: historyRes.rows,
    });
  } catch (err) {
    console.error('Get pet relations error:', err);
    res.status(500).json({ error: 'Failed to fetch pet relations' });
  }
});

// ── Admin: reorder pet images ─────────────────────────────────────────────────
router.put('/:id/images/reorder', requireAdmin, async (req, res) => {
  const { imageIds } = req.body;
  if (!Array.isArray(imageIds)) return res.status(400).json({ error: 'imageIds array is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < imageIds.length; i++) {
      await client.query('UPDATE pet_images SET sort_order = $1 WHERE id = $2 AND pet_id = $3',
        [i, imageIds[i], req.params.id]);
    }
    await client.query('COMMIT');
    res.json({ message: 'Images reordered' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reorder images error:', err);
    res.status(500).json({ error: 'Failed to reorder images' });
  } finally {
    client.release();
  }
});

// ── Admin: delete single pet image ────────────────────────────────────────────
router.delete('/:petId/images/:imageId', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM pet_images WHERE id = $1 AND pet_id = $2 RETURNING id',
      [req.params.imageId, req.params.petId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Image not found' });
    res.json({ message: 'Image deleted' });
  } catch (err) {
    console.error('Delete image error:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

router.put('/:id/verify', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE pets SET is_admin_verified = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [req.body.verified, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pet not found' });
    }
    res.json({ pet: result.rows[0] });
  } catch (err) {
    console.error('Verify pet error:', err);
    res.status(500).json({ error: 'Failed to verify pet' });
  }
});

// ====== PET RECORDS (Seguimiento) ======

router.get('/:petId/records', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM pet_records WHERE pet_id = $1 ORDER BY record_date DESC, created_at DESC',
      [req.params.petId]
    );
    res.json({ records: result.rows });
  } catch (err) {
    console.error('Get records error:', err);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

router.get('/:petId/records/summary', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int as total, COALESCE(SUM(amount), 0) as total_expenses,
        (SELECT record_date FROM pet_records WHERE pet_id = $1 AND next_date IS NOT NULL AND next_date >= CURRENT_DATE ORDER BY next_date ASC LIMIT 1) as next_date,
        (SELECT MAX(record_date) FROM pet_records WHERE pet_id = $1) as last_date
      FROM pet_records WHERE pet_id = $1`,
      [req.params.petId]
    );
    res.json({ summary: result.rows[0] });
  } catch (err) {
    console.error('Get summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

router.post('/:petId/records', requireAuth, async (req, res) => {
  const { recordType, title, description, amount, recordDate, nextDate, vetName, clinicName, medicationName, dosage, attachmentData, attachmentType, attachmentName } = req.body;
  if (!recordType || !title) {
    return res.status(400).json({ error: 'Record type and title are required' });
  }
  try {
    const pet = await pool.query('SELECT created_by FROM pets WHERE id = $1', [req.params.petId]);
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Pet not found' });
    if (req.user.role !== 'admin' && !(await canEditPet(req.user.id, req.params.petId))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const result = await pool.query(
      `INSERT INTO pet_records (pet_id, record_type, title, description, amount, record_date, next_date, vet_name, clinic_name, medication_name, dosage, attachment_data, attachment_type, attachment_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [req.params.petId, recordType, title, description || null, amount || null, recordDate || new Date(),
       nextDate || null, vetName || null, clinicName || null, medicationName || null, dosage || null,
       attachmentData || null, attachmentType || null, attachmentName || null, req.user.id]
    );
    res.status(201).json({ record: result.rows[0] });
  } catch (err) {
    console.error('Create record error:', err);
    res.status(500).json({ error: 'Failed to create record' });
  }
});

router.put('/:petId/records/:recordId', requireAuth, async (req, res) => {
  const fields = ['record_type', 'title', 'description', 'amount', 'record_date', 'next_date', 'vet_name', 'clinic_name', 'medication_name', 'dosage', 'attachment_data', 'attachment_type', 'attachment_name'];
  const updates = [];
  const values = [];
  let idx = 1;
  for (const field of fields) {
    const mapping = {
      record_type: 'recordType', title: 'title', description: 'description',
      amount: 'amount', record_date: 'recordDate', next_date: 'nextDate',
      vet_name: 'vetName', clinic_name: 'clinicName', medication_name: 'medicationName',
      dosage: 'dosage', attachment_data: 'attachmentData', attachment_type: 'attachmentType',
      attachment_name: 'attachmentName'
    };
    const key = mapping[field] || field;
    if (req.body[key] !== undefined) {
      updates.push(`${field} = $${idx++}`);
      values.push(req.body[key]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(req.params.recordId);
  try {
    await pool.query(`UPDATE pet_records SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    const updated = await pool.query('SELECT * FROM pet_records WHERE id = $1', [req.params.recordId]);
    res.json({ record: updated.rows[0] });
  } catch (err) {
    console.error('Update record error:', err);
    res.status(500).json({ error: 'Failed to update record' });
  }
});

router.delete('/:petId/records/:recordId', requireAuth, async (req, res) => {
  try {
    const rec = await pool.query('SELECT pr.* FROM pet_records pr JOIN pets p ON p.id = pr.pet_id WHERE pr.id = $1', [req.params.recordId]);
    if (rec.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
    const record = rec.rows[0];
    if (req.user.role !== 'admin' && !(await canEditPet(req.user.id, record.pet_id))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await pool.query('DELETE FROM pet_records WHERE id = $1', [req.params.recordId]);
    res.json({ message: 'Record deleted' });
  } catch (err) {
    console.error('Delete record error:', err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

router.get('/:petId/records/report', async (req, res) => {
  // Auth via Authorization header (from fetch) or query token (legacy)
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;
  if (token && token !== 'null' && token !== '') {
    try {
      const decoded = verifyToken(token);
      if (decoded.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
  }
  try {
    const petResult = await pool.query(
      `SELECT p.*, 
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`,
      [req.params.petId]
    );
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Pet not found' });
    const pet = petResult.rows[0];

    const recordsResult = await pool.query(
      'SELECT * FROM pet_records WHERE pet_id = $1 ORDER BY record_date DESC, created_at DESC',
      [req.params.petId]
    );
    const records = recordsResult.rows;

    const summary = await pool.query(
      `SELECT COUNT(*)::int as total, COALESCE(SUM(amount), 0) as total_expenses,
        (SELECT record_date FROM pet_records WHERE pet_id = $1 AND next_date IS NOT NULL AND next_date >= CURRENT_DATE ORDER BY next_date ASC LIMIT 1) as next_date,
        (SELECT MAX(record_date) FROM pet_records WHERE pet_id = $1) as last_date
      FROM pet_records WHERE pet_id = $1`,
      [req.params.petId]
    );

    const statusLabels = { lost: 'Perdido', retained: 'Retenido', sighted: 'Avistado', accidented: 'Accidentado', needs_attention: 'Necesita Atención', for_adoption: 'En Adopción', adopted: 'Adoptado', reunited: 'Reencuentro', transitada: 'En Tránsito' };
    const typeLabels = { appointment: 'Turno', study: 'Estudio', expense: 'Gasto', medication: 'Medicación', vaccine: 'Vacuna', surgery: 'Cirugía', note: 'Nota' };

    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const safeName = (pet.name || 'mascota').replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, '').trim().replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="seguimiento-${safeName}-${dateStr}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('SIGO TU HUELLA', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Informe de Seguimiento', { align: 'center' });
    doc.fontSize(8).fillColor('#999').text(`Generado el ${new Date().toLocaleDateString('es-AR')}`, { align: 'center' });
    doc.fillColor('#000').moveDown(0.5);

    // Separator
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd').moveDown(0.8);

    // Pet info
    doc.fontSize(12).font('Helvetica-Bold').text(`${pet.name || 'Mascota'}`, { underline: true }).moveDown(0.3);
    doc.fontSize(9).font('Helvetica');
    doc.text('Especie: ' + (pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otra') + ' | Estado: ' + (statusLabels[pet.status] || pet.status) + ' | Sexo: ' + (pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : 'No especificado'));
    doc.text(`Ubicación: ${pet.location || '-'}`);
    doc.text(`Contacto: ${pet.contact_info || '-'}`);
    if (pet.breed) doc.text(`Raza: ${pet.breed}`);
    if (pet.color) doc.text(`Color: ${pet.color}`);
    doc.moveDown(0.5);

    // Summary
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd').moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').text('RESUMEN').moveDown(0.3);
    doc.fontSize(9).font('Helvetica');
    const s = summary.rows[0];
    doc.text(`Registros: ${s.total}  |  Gastos totales: $${parseFloat(s.total_expenses || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);
    doc.text(`Último registro: ${s.last_date ? new Date(s.last_date).toLocaleDateString('es-AR') : '-'}  |  Próximo: ${s.next_date ? new Date(s.next_date).toLocaleDateString('es-AR') : '-'}`);
    doc.moveDown(0.5);

    // Records
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd').moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').text('REGISTROS').moveDown(0.5);

    for (const rec of records) {
      const typeLabel = typeLabels[rec.record_type] || rec.record_type;
      const date = new Date(rec.record_date).toLocaleDateString('es-AR');

      // Check page break
      if (doc.y > 680) { doc.addPage(); }

      doc.fontSize(9).font('Helvetica-Bold');
      var amountStr = rec.amount ? ' - $' + parseFloat(rec.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '';
      doc.text(date + ' - ' + typeLabel + amountStr);
      doc.fontSize(8.5).font('Helvetica');
      doc.text('   ' + rec.title);
      if (rec.description) doc.text('   ' + rec.description);
      if (rec.vet_name || rec.clinic_name) doc.text('   Veterinario: ' + [rec.vet_name, rec.clinic_name].filter(Boolean).join(' - '));
      if (rec.medication_name || rec.dosage) doc.text('   Medicacion: ' + [rec.medication_name, rec.dosage].filter(Boolean).join(' - '));
      if (rec.next_date) doc.text('   Proximo: ' + new Date(rec.next_date).toLocaleDateString('es-AR'));
      doc.moveDown(0.3);

      // Separator
      const y = doc.y;
      doc.moveTo(70, y).lineTo(525, y).stroke('#eee');
      doc.moveDown(0.3);
    }

    // Footer
    if (doc.y > 720) doc.addPage();
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd').moveDown(0.5);
    doc.fontSize(7).fillColor('#999').text('Sigo Tu Huella - Red Vecinal / Villa Garibaldi - Sicardi - Correas', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('PDF report error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Public endpoint (no auth) for quick anonymous reports
router.post('/public', async (req, res) => {
  const { species, description, location, latitude, longitude, contact_info, status, images, neighborhoods, name, instagram } = req.body;
  if (!species || !description || !location) {
    return res.status(400).json({ error: 'Species, description, and location are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generate sequential case number STH00001 (función compartida con caseService)
    const caseNumber = await generateCaseNumber(client);

    const petResult = await client.query(
      `INSERT INTO pets (species, description, location, latitude, longitude, contact_info, status, created_by, is_admin_verified, neighborhoods, name, instagram, case_number, privacy_notice_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       RETURNING *`,
       [species, description, location, latitude || null, longitude || null, contact_info || null, status || 'sighted', null, false, JSON.stringify(neighborhoods || []), name || null, instagram || null, caseNumber]
    );
    const pet = petResult.rows[0];
    if (images && images.length > 0) {
      for (const img of images) {
        const processed = await processImage(img.data, img.mimeType, 800);
        await client.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type, crop_x, crop_y, original_image_data) VALUES ($1, $2, $3, $4, $5, $6)',
          [pet.id, processed.data, processed.mimeType, img.crop_x ?? 0.5, img.crop_y ?? 0.5, null]
        );
      }
    }
    const imagesResult = await client.query(
      `SELECT json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) as images
       FROM pet_images pi WHERE pi.pet_id = $1`,
      [pet.id]
    );
    await client.query('COMMIT');
    pet.images = imagesResult.rows[0]?.images || [];

    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
    sendAdminNotificationEmail(
      `🐾 Nuevo reporte público (${caseNumber})`,
      `<p style="font-size:16px;margin-bottom:16px;">Se recibió un nuevo reporte a través del formulario público.</p>
       <p style="font-size:14px;margin-bottom:12px;"><strong>Caso:</strong> ${caseNumber}</p>
       <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Especie</td><td style="padding:8px;border:1px solid #e2e8f0;">${species}</td></tr>
         ${name ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Nombre</td><td style="padding:8px;border:1px solid #e2e8f0;">${name}</td></tr>` : ''}
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Descripción</td><td style="padding:8px;border:1px solid #e2e8f0;">${description}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Ubicación</td><td style="padding:8px;border:1px solid #e2e8f0;">${location}${latitude && longitude ? ` (${latitude}, ${longitude})` : ''}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Contacto</td><td style="padding:8px;border:1px solid #e2e8f0;">${contact_info || 'No informado'}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Tipo</td><td style="padding:8px;border:1px solid #e2e8f0;">${status === 'sighted' ? 'Avistado' : status === 'retained' ? 'Retenido' : status || 'Avistado'}</td></tr>
         ${instagram ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Instagram</td><td style="padding:8px;border:1px solid #e2e8f0;">${instagram}</td></tr>` : ''}
       </table>
       <p style="text-align:center;margin-top:16px;">
         <a href="${frontendUrl}/pet/${pet.id}" style="background-color:#3b82f6;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver publicación</a>
</p>`
        ).catch(err => console.error('Failed to send admin notification:', err));

        sendPushToAdmins({
          title: `🐾 ${caseNumber} — ${status === 'sighted' ? 'Avistado' : 'Retenido'}`,
          body: `${name ? name + ' — ' : ''}${species} en ${location}`,
          url: `${frontendUrl}/pet/${pet.id}`,
        }).catch(err => console.error('Push error:', err));

        // Run matching in background
        matchPetToPosts(pet).catch(err => console.error('Matching FB error:', err));
        matchWhatsAppToPets(pet.id).catch(e => console.error('Matching WhatsApp->pets error:', e));
        matchPetToPets(pet).catch(e => console.error('Pet↔pet matching error:', e));
        notifyVolunteersOfNewPet(pet).catch(e => console.error('Volunteer notify error:', e));
        await createPetCase(pet, { source: 'app_anon' });

        // Auto-broadcast to WhatsApp groups for active statuses
        const broadcastStatuses = ['lost', 'for_adoption', 'for_adoption_simple', 'sighted', 'retained', 'accidented', 'needs_attention', 'transitada'];
        if (broadcastStatuses.includes(pet.status)) {
          broadcastPetToGroups(pet.id).catch(e => console.error('Broadcast error:', e));
        }

        notifyPetPublication(pet.id, contact_info).catch(e => console.error('Publication notify error:', e));

        res.status(201).json({ pet });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create public pet error:', err);
    res.status(500).json({ error: 'Failed to create pet report' });
  } finally {
    client.release();
  }
});

// Lost pet report (no auth) for owner reporting a lost pet with full details
router.post('/lost-report', async (req, res) => {
  const { species, name, breed, color, gender, age, size, description, location, latitude, longitude, email, phone, images, neighborhoods, contact_visible } = req.body;
  if (!species || !description || !location || !email) {
    return res.status(400).json({ error: 'Species, description, location, and email are required' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (!phone || !String(phone).replace(/\D/g, '')) {
    return res.status(400).json({ error: 'Phone is required' });
  }
  if (!images || images.length === 0) {
    return res.status(400).json({ error: 'At least one photo is required' });
  }
  if (images.length > 3) {
    return res.status(400).json({ error: 'Maximum 3 photos allowed' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find or create user by email
    let userResult = await client.query('SELECT id, email, display_name, registration_pending FROM users WHERE email = $1', [email]);
    let userId;
    let registrationToken = null;

    if (userResult.rows.length === 0) {
      registrationToken = uuidv4().replace(/-/g, '') + crypto.randomBytes(16).toString('hex');
      const displayName = name || email.split('@')[0];
      const userInsert = await client.query(
        `INSERT INTO users (email, password_hash, display_name, role, registration_pending, registration_token, privacy_notice_at, phone)
         VALUES ($1, '', $2, 'user', TRUE, $3, NOW(), $4)
         RETURNING id`,
        [email, displayName, registrationToken, phone]
      );
      userId = userInsert.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
      if (userResult.rows[0].registration_pending) {
        registrationToken = uuidv4().replace(/-/g, '') + crypto.randomBytes(16).toString('hex');
        await client.query('UPDATE users SET registration_token = $1, phone = COALESCE(NULLIF($2, \'\'), phone) WHERE id = $3', [registrationToken, phone, userId]);
      }
    }

    const petResult = await client.query(
      `INSERT INTO pets (species, name, breed, color, gender, age, size, description, location, latitude, longitude, contact_info, owner_email, contact_visible, status, created_by, is_admin_verified, neighborhoods, privacy_notice_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
       RETURNING *`,
      [species, name || null, breed || null, color || null, gender || 'unknown', age || null, size || null, description, location, latitude || null, longitude || null, phone, email, contact_visible !== false, 'lost', userId, false, JSON.stringify(neighborhoods || [])]
    );
    const pet = petResult.rows[0];

    // Process images
    for (const img of images) {
      const processed = await processImage(img.data, img.mimeType, 800);
      await client.query(
        'INSERT INTO pet_images (pet_id, image_data, mime_type, crop_x, crop_y, original_image_data) VALUES ($1, $2, $3, $4, $5, $6)',
        [pet.id, processed.data, processed.mimeType, img.crop_x ?? 0.5, img.crop_y ?? 0.5, null]
      );
    }

    const imagesResult = await client.query(
      `SELECT json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) as images
       FROM pet_images pi WHERE pi.pet_id = $1`,
      [pet.id]
    );
    await client.query('COMMIT');
    pet.images = imagesResult.rows[0]?.images || [];

    // Genera el caso del reporte (pet_cases + case_created), igual que /api/pets y /api/pets/public.
    await createPetCase(pet, { source: 'lost_report' });

    // Send confirmation email to reporter
    sendLostPetConfirmationEmail(email, { species, name, breed, color, description, location, phone }, registrationToken)
      .catch(err => console.error('Failed to send lost pet confirmation email:', err));

    // Notify admin
    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
    sendAdminNotificationEmail(
      '😢 Reporte de mascota perdida (dueño)',
      `<p style="font-size:16px;margin-bottom:16px;">Una persona reportó su propia mascota como perdida.</p>
       <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Especie</td><td style="padding:8px;border:1px solid #e2e8f0;">${species}</td></tr>
         ${name ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Nombre</td><td style="padding:8px;border:1px solid #e2e8f0;">${name}</td></tr>` : ''}
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Descripción</td><td style="padding:8px;border:1px solid #e2e8f0;">${description}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Ubicación</td><td style="padding:8px;border:1px solid #e2e8f0;">${location}${latitude && longitude ? ` (${latitude}, ${longitude})` : ''}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #e2e8f0;">${email}</td></tr>
         ${phone ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Teléfono</td><td style="padding:8px;border:1px solid #e2e8f0;">${phone}</td></tr>` : ''}
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Registro</td><td style="padding:8px;border:1px solid #e2e8f0;">${registrationToken ? 'Pendiente (sin contraseña aún)' : 'Usuario existente'}</td></tr>
       </table>
       <p style="text-align:center;margin-top:16px;">
         <a href="${frontendUrl}/pet/${pet.id}" style="background-color:#3b82f6;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver publicación</a>
</p>`
        ).catch(err => console.error('Failed to send admin notification:', err));

        sendPushToAdmins({
          title: '😢 Mascota perdida',
          body: `${name || species} perdid${species === 'gato' ? 'a' : 'o'} en ${location}`,
          url: `${frontendUrl}/pet/${pet.id}`,
        }).catch(err => console.error('Push error:', err));

        // Run matching in background
        matchPetToPosts(pet).catch(err => console.error('Matching FB error:', err));
        matchWhatsAppToPets(pet.id).catch(e => console.error('Matching WhatsApp->pets error:', e));

        // Auto-broadcast to WhatsApp groups for active statuses
        const broadcastStatuses = ['lost', 'for_adoption', 'for_adoption_simple', 'sighted', 'retained', 'accidented', 'needs_attention', 'transitada'];
        if (broadcastStatuses.includes(pet.status)) {
          broadcastPetToGroups(pet.id).catch(e => console.error('Broadcast error:', e));
        }

        notifyPetPublication(pet.id, phone).catch(e => console.error('Publication notify error:', e));

        res.status(201).json({ pet, registrationPending: !!registrationToken });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create lost pet report error:', err);
    res.status(500).json({ error: 'Failed to create lost pet report' });
  } finally {
    client.release();
  }
});

// Link an anonymous pet case to a registered user (after registration)
router.put('/link-case', requireAuth, async (req, res) => {
  const { caseNumber } = req.body;
  if (!caseNumber) return res.status(400).json({ error: 'caseNumber is required' });

  try {
    const result = await pool.query(
      'UPDATE pets SET created_by = $1 WHERE case_number = $2 AND created_by IS NULL RETURNING id, case_number',
      [req.user.id, caseNumber]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pet not found' });
    }
    res.json({ pet: result.rows[0] });
  } catch (err) {
    console.error('Link case error:', err);
    res.status(500).json({ error: 'Failed to link case' });
  }
});

// PUT /:id/share - share pet with user (by userId, email, or phone)
router.put('/:id/share', requireAuth, async (req, res) => {
  const petId = req.params.id;
  const { userId, email, phone } = req.body;
  if (!userId && !email && !phone) return res.status(400).json({ error: 'Se requiere userId, email o teléfono' });

  try {
    const pet = await pool.query('SELECT id, name, species FROM pets WHERE id = $1', [petId]);
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    if (req.user.role !== 'admin' && pet.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Solo el dueño puede compartir' });
    }

    // Si ya tenemos userId, compartir directo
    if (userId) {
      await pool.query(
        `INSERT INTO pet_shares (pet_id, user_id, role) VALUES ($1, $2, 'editor') ON CONFLICT DO NOTHING`,
        [petId, userId]
      );
      return res.json({ shared: true });
    }

    // Buscar usuario por email o teléfono
    let targetUser = null;
    if (email) {
      const r = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      targetUser = r.rows[0];
    } else if (phone) {
      const normalized = normalizePhone(phone);
      const r = await pool.query(
        "SELECT id FROM users WHERE phone = $1",
        [normalized]
      );
      targetUser = r.rows[0];
    }

    if (targetUser) {
      await pool.query(
        `INSERT INTO pet_shares (pet_id, user_id, role) VALUES ($1, $2, 'editor') ON CONFLICT DO NOTHING`,
        [petId, targetUser.id]
      );
      const { sendPushToUser } = await import('../services/pushService.js');
      const inviter = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
      const inviterName = inviter.rows[0]?.display_name || 'Alguien';
      sendPushToUser(targetUser.id, {
        title: '🐾 Nuevo acceso compartido',
        body: `${inviterName} te compartió el perfil de ${pet.rows[0].name || 'una mascota'} en Sigo Tu Huella. Ya tenés acceso para ver y editar su ficha.`,
        url: `/pet/${petId}`,
      }).catch(() => {});
      return res.json({ shared: true, userExists: true });
    }

    // No existe — crear invitación
    const crypto = await import('crypto');
    const token = crypto.default.randomBytes(32).toString('hex');
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
    const inviteLink = `${FRONTEND_URL}/login?invite=${token}`;
    const petName = pet.rows[0].name || (pet.rows[0].species === 'dog' ? 'perro' : pet.rows[0].species === 'cat' ? 'gato' : 'mascota');
    const inviter = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
    const inviterName = inviter.rows[0]?.display_name || 'Alguien';

    await pool.query(
      `INSERT INTO share_invites (pet_id, invited_email, invited_phone, token, message, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [petId, email || null, phone || null, token, req.body.message || null, req.user.id]
    );

    const textMsg = `🐾 *${inviterName}* te compartió el perfil de *${petName}* en Sigo Tu Huella, una red de vecinos que cuidamos las mascotas de la comunidad.\n\nRegistrate gratis para sumarte: ${inviteLink}`;

    if (email) {
      const { default: nodemailer } = await import('nodemailer');
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'l0061596.ferozo.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        tls: { rejectUnauthorized: false },
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      t.sendMail({
        from: `"Sigo Tu Huella" <${process.env.SMTP_FROM}>`,
        to: email,
        subject: `${inviterName} te compartió una mascota en Sigo Tu Huella`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;">
            <div style="text-align:center;margin-bottom:20px;">
              <div style="background:#3b82f6;color:white;width:60px;height:60px;line-height:60px;font-size:30px;border-radius:20px;display:inline-block;">🐾</div>
            </div>
            <h2 style="color:#1e293b;text-align:center;font-size:20px;margin-bottom:16px;">${inviterName} te compartió el perfil de ${petName}</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6;text-align:center;">
              En Sigo Tu Huella, una red de vecinos que cuidamos las mascotas de la comunidad.
            </p>
            ${req.body.message ? `<p style="color:#64748b;font-size:14px;text-align:center;font-style:italic;">"${req.body.message}"</p>` : ''}
            <div style="text-align:center;margin:24px 0;">
              <a href="${inviteLink}" style="background:#5A5A40;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block;">
                Registrate gratis
              </a>
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center;">
              Ya tenés acceso para ver y editar su ficha al registrarte.
            </p>
          </div>
        `,
      }).catch(e => console.error('Failed to send invite email:', e));
    }

    if (phone) {
      try {
        const { sendMessage } = await import('../services/whatsappService.js');
        await sendMessage(normalizePhone(phone), textMsg);
      } catch (e) { console.error('Failed to send invite WhatsApp:', e); }
    }

    res.status(201).json({ invited: true, inviteLink });
  } catch (err) {
    console.error('Share pet error:', err);
    res.status(500).json({ error: 'Error al compartir' });
  }
});

// DELETE /:id/share/:userId - remove share access
router.delete('/:id/share/:userId', requireAuth, async (req, res) => {
  const { id: petId, userId } = req.params;

  try {
    const pet = await pool.query('SELECT created_by FROM pets WHERE id = $1', [petId]);
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    if (req.user.role !== 'admin' && pet.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Solo el dueño puede dejar de compartir' });
    }

    await pool.query('DELETE FROM pet_shares WHERE pet_id = $1 AND user_id = $2', [petId, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Unshare pet error:', err);
    res.status(500).json({ error: 'Error al dejar de compartir' });
  }
});

// GET /:id/shares - list users this pet is shared with
router.get('/:id/shares', requireAuth, async (req, res) => {
  const petId = req.params.id;

  try {
    const pet = await pool.query('SELECT created_by FROM pets WHERE id = $1', [petId]);
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    if (req.user.role !== 'admin' && !(await canEditPet(req.user.id, petId))) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const result = await pool.query(
      `SELECT ps.user_id, ps.role, ps.created_at as shared_at,
              u.email, u.display_name, u.avatar_data, u.avatar_mime_type, u.avatar_type
       FROM pet_shares ps
       JOIN users u ON u.id = ps.user_id
       WHERE ps.pet_id = $1
       ORDER BY ps.created_at ASC`,
      [petId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get shares error:', err);
    res.status(500).json({ error: 'Error al obtener usuarios compartidos' });
  }
});

// GET /shared/with-me — pets compartidas conmigo
router.get('/shared/with-me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, ps.role, ps.created_at as shared_since,
              u.display_name as owner_name
       FROM pet_shares ps
       JOIN pets p ON p.id = ps.pet_id
       JOIN users u ON u.id = p.created_by
       WHERE ps.user_id = $1
       ORDER BY ps.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get shared pets error:', err);
    res.status(500).json({ error: 'Error al obtener mascotas compartidas' });
  }
});


// ── Publish pet to multiple channels ──────────────────────────────────────
router.post('/:id/publish', requireAdmin, async (req, res) => {
  try {
    const { platforms } = req.body;
    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return res.status(400).json({ error: 'Seleccioná al menos un canal' });
    }
    const petResult = await pool.query('SELECT * FROM pets WHERE id = $1', [req.params.id]);
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const results = [];

    for (const platform of platforms) {
      try {
        let result;
        switch (platform) {
          case 'facebook_page': {
            const { publishToPage, publishPetToGroups } = await import('../services/facebookPublisher.js');
            const pageResult = await publishToPage(req.params.id);
            if (pageResult.error) throw new Error(pageResult.error);
            let pagePostUrl = null;
            if (pageResult.pagePostId && pageResult.pageId) {
              const cleanPostId = pageResult.pagePostId.includes('_')
                ? pageResult.pagePostId.split('_')[1]
                : pageResult.pagePostId;
              pagePostUrl = 'https://www.facebook.com/' + pageResult.pageId + '/posts/' + cleanPostId;
              await pool.query(
                "INSERT INTO facebook_page_posts (pet_id, page_post_id, message, status, published_at) VALUES ($1, $2, $3, 'published', NOW())",
                [req.params.id, pageResult.pagePostId, pageResult.message || '']
              );
            }
            publishPetToGroups(req.params.id, { skipPagePublish: true, pagePostUrl }).catch(e => console.error('[Publish] FB groups error:', e));
            result = { platform, status: 'published' };
            break;
          }
case 'facebook_groups': {
            const { publishToPage, publishPetToGroups } = await import('../services/facebookPublisher.js');
            const pageResult = await publishToPage(req.params.id);
            if (pageResult.error) throw new Error(pageResult.error);
            let pagePostUrl = null;
            if (pageResult.pagePostId && pageResult.pageId) {
              const cleanPostId = pageResult.pagePostId.includes('_')
                ? pageResult.pagePostId.split('_')[1]
                : pageResult.pagePostId;
              pagePostUrl = 'https://www.facebook.com/' + pageResult.pageId + '/posts/' + cleanPostId;
              await pool.query(
                "INSERT INTO facebook_page_posts (pet_id, page_post_id, message, status, published_at) VALUES ($1, $2, $3, 'published', NOW())",
                [req.params.id, pageResult.pagePostId, pageResult.message || '']
              );
            }
            publishPetToGroups(req.params.id, { skipPagePublish: true, pagePostUrl }).catch(e => console.error('[Publish] FB groups error:', e));
            result = { platform, status: 'published' };
            break;
          }
          case 'instagram': {
            const { publishSinglePost } = await import('../services/instagramPublisher.js');
            await pool.query(
              `INSERT INTO instagram_posts (pet_id, media_type, status, created_at)
               VALUES ($1, 'IMAGE', 'queued', NOW())
               ON CONFLICT DO NOTHING`,
              [req.params.id]
            );
            const igResult = await publishSinglePost(req.params.id);
            if (igResult && igResult.error) throw new Error(igResult.error);
            result = { platform, status: 'published' };
            break;
          }
          case 'whatsapp': {
            const { broadcastPetToGroups } = await import('../services/whatsappService.js');
            await broadcastPetToGroups(req.params.id);
            result = { platform, status: 'published' };
            break;
          }
          case 'whatsapp_status': {
            const { broadcastToStatus } = await import('../services/phoneRelayService.js');
            if (broadcastToStatus) {
              await broadcastToStatus(req.params.id);
            }
            result = { platform, status: 'published' };
            break;
          }
          default:
            result = { platform, status: 'skipped', error: 'Canal no soportado' };
        }
        results.push(result);
      } catch (e) {
        console.error('[Publish] Error on ' + platform + ':', e.message);
        results.push({ platform, status: 'failed', error: e.message });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error('Publish pet error:', err);
    res.status(500).json({ error: 'Error al publicar mascota' });
  }
});

export default router;
