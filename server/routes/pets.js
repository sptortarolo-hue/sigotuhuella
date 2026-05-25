import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, verifyToken, sendAdminNotificationEmail, sendLostPetConfirmationEmail } from '../auth.js';
import { findMatches } from '../services/matchingService.js';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

async function smartCropImage(imageData, mimeType, size = 800) {
  try {
    const buffer = Buffer.from(imageData, 'base64');
    const processed = await sharp(buffer)
      .resize(size, size, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data: processed.toString('base64'), mimeType: 'image/jpeg' };
  } catch (err) {
    console.warn('Smart crop failed, using original:', err.message);
    return { data: imageData, mimeType };
  }
}

async function createCollage(images) {
  const imgs = images.slice(0, 3);
  const buffers = imgs.map(img => Buffer.from(img.image_data, 'base64'));

  if (imgs.length === 2) {
    const resized = await Promise.all(
      buffers.map(buf => sharp(buf).resize(400, 400, { fit: 'cover', position: 'attention' }).toBuffer())
    );
    const collage = await sharp({
      create: { width: 800, height: 400, channels: 3, background: { r: 240, g: 240, b: 240 } }
    })
    .composite([
      { input: resized[0], top: 0, left: 0 },
      { input: resized[1], top: 0, left: 400 },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
    return { data: collage.toString('base64'), mimeType: 'image/jpeg' };
  }

  if (imgs.length >= 3) {
    const resized = await Promise.all(
      buffers.map(buf => sharp(buf).resize(300, 300, { fit: 'cover', position: 'attention' }).toBuffer())
    );
    const collage = await sharp({
      create: { width: 600, height: 600, channels: 3, background: { r: 240, g: 240, b: 240 } }
    })
    .composite([
      { input: resized[0], top: 0, left: 0 },
      { input: resized[1], top: 0, left: 300 },
      { input: resized[2], top: 300, left: 150 },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
    return { data: collage.toString('base64'), mimeType: 'image/jpeg' };
  }

  if (imgs.length === 1) {
    return { data: imgs[0].image_data, mimeType: imgs[0].mime_type };
  }

  return { data: null, mimeType: null };
}

function generateCelebrationText(pet, type) {
  const name = pet.name || 'una mascota';
  const species = pet.species === 'dog' ? 'perro' : pet.species === 'cat' ? 'gato' : 'mascota';
  const location = pet.location || 'nuestra zona';
  const isFemale = pet.gender === 'female';

  if (type === 'reunited') {
    const action = isFemale ? 'reencontrada' : 'reencontrado';
    const lostAction = isFemale ? 'perdida' : 'perdido';
    const messages = [
      `¡Qué alegría! 🎉 ${name} ya está de vuelta en casa. Este ${species} que buscábamos en ${location} fue ${action} con su familia. ¡Gracias a toda la comunidad que difundió y ayudó! Juntos hacemos la diferencia. 🐾💚`,
      `¡Final feliz! 🥳 ${name}, el ${species} que estaba ${lostAction} en ${location}, ya se reencontró con su familia. Gracias a la red de vecinos que compartieron su publicación. ¡Sigo Tu Huella sigue sumando reencuentros! 🐾❤️`,
      `¡Buenas noticias! ✨ ¡${name} apareció! Este ${species} que buscábamos en ${location} ya está con los suyos. La comunidad de Sicardi/Garibaldi una vez más demostró su solidaridad. 🙌🐾`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (type === 'adopted') {
    const action = isFemale ? 'adoptada' : 'adoptado';
    const messages = [
      `¡Nuevo hogar! 🏡 ${name} encontró una familia. Este ${species} fue ${action} y ahora tiene un hogar lleno de amor. ¡Gracias a todos los que compartieron y ayudaron a difundir! 🐾💚`,
      `¡Feliz adopción! 🎊 ${name} ya tiene familia. Después de esperar, este ${species} fue ${action}. Deseamos que sea muy feliz en su nuevo hogar. ¡Sigo Tu Huella celebra! 🐾❤️`,
      `¡Un final feliz más! 🌟 ${name} fue ${action}. Este ${species} encontró un hogar lleno de amor. Gracias a la red de adopción por hacer esto posible. 🐾💕`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  return '';
}

async function autoCreateNews(pet, newsType) {
  try {
    let title = '';
    const isFemale = pet.gender === 'female';
    if (newsType === 'reunited') {
      if (pet.name) {
        const action = isFemale ? 'reencontrada' : 'reencontrado';
        title = `¡${pet.name} fue ${action}! 🎉`;
      } else {
        title = `¡Una mascota fue reencontrada! 🎉`;
      }
    } else { // adopted
      if (pet.name) {
        const action = isFemale ? 'adoptada' : 'adoptado';
        title = `¡${pet.name} fue ${action}! 🏡`;
      } else {
        title = `¡Una mascota fue adoptada! 🏡`;
      }
    }
    const content = generateCelebrationText(pet, newsType);
    // Fetch pet images for news image
    const imagesResult = await pool.query(
      'SELECT image_data, mime_type FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 3',
      [pet.id]
    );
    const { data: imageData, mimeType } = await createCollage(imagesResult.rows);
    if (imageData && mimeType) {
      await pool.query(
        `INSERT INTO news (title, content, image_data, mime_type, type, related_pet_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [title, content, imageData, mimeType, newsType, pet.id, pet.created_by]
      );
    } else {
      await pool.query(
        `INSERT INTO news (title, content, type, related_pet_id, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [title, content, newsType, pet.id, pet.created_by]
      );
    }
  } catch (err) {
    console.error('Auto-create news error:', err);
  }
}

// ── Gamification helper ──────────────────────────────────────────────────────
async function awardBadgeIfMissing(userId, code) {
  if (!userId) return;
  try {
    const userRes = await pool.query('SELECT badges, volunteer_status FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return;
    const { badges, volunteer_status } = userRes.rows[0];
    if (volunteer_status === 'none' || !volunteer_status) return; // only members earn auto-badges
    const existing = Array.isArray(badges) ? badges : [];
    if (existing.find(b => b.code === code)) return;
    const updated = JSON.stringify([...existing, { code, awarded_at: new Date().toISOString() }]);
    await pool.query('UPDATE users SET badges = $1::jsonb WHERE id = $2', [updated, userId]);
  } catch (err) {
    console.error('awardBadgeIfMissing error:', err);
  }
}

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { status, isPublic, limit } = req.query;
    let query = `
      SELECT p.*, 
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
    `;
    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
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
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pet not found' });
    }
    res.json({ pet: result.rows[0] });
  } catch (err) {
    console.error('Get pet error:', err);
    res.status(500).json({ error: 'Failed to fetch pet' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { name, species, breed, color, status, gender, age, size, isVaccinated, isSterilized, description, location, latitude, longitude, contactInfo, images } = req.body;
  if (!species || !status || !location) {
    return res.status(400).json({ error: 'Species, status, and location are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const petResult = await client.query(
      `INSERT INTO pets (name, species, breed, color, status, gender, age, size, is_vaccinated, is_sterilized, is_dewormed, description, location, latitude, longitude, contact_info, created_by, is_admin_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [name || null, species, breed || null, color || null, status, gender || 'unknown',
       age || null, size || null, isVaccinated || false, isSterilized || false, req.body.isDewormed || false,
       description || null, location, latitude || null, longitude || null,
       contactInfo || null, req.user.id, false]
    );
    const pet = petResult.rows[0];
    if (images && images.length > 0) {
      for (const img of images) {
        await client.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type) VALUES ($1, $2, $3)',
          [pet.id, img.data, img.mimeType || 'image/jpeg']
        );
      }
    }
    const imagesResult = await client.query(
      `SELECT json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type) ORDER BY pi.created_at) as images
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
    if (pet.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const fields = ['name', 'species', 'breed', 'color', 'status', 'gender', 'age', 'size', 'is_vaccinated', 'is_sterilized', 'is_dewormed', 'description', 'location', 'contact_info'];
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
        const processed = await smartCropImage(img.data, img.mimeType);
        await pool.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type) VALUES ($1, $2, $3)',
          [petId, processed.data, processed.mimeType]
        );
      }
    } else if (req.body.images && req.body.images.length > 0) {
      // Fallback for legacy behavior
      await pool.query('DELETE FROM pet_images WHERE pet_id = $1', [petId]);
      for (const img of req.body.images) {
        const processed = await smartCropImage(img.data, img.mimeType);
        await pool.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type) VALUES ($1, $2, $3)',
          [petId, processed.data, processed.mimeType]
        );
      }
    }
    // Auto-generate news on status change to REUNITED or ADOPTED
    const isReunited = pet.status !== 'reunited' && req.body.status === 'reunited';
    const isAdopted = pet.status !== 'adopted' && req.body.status === 'adopted';
    // Re-fetch pet with updated data for news generation
    if (isReunited || isAdopted) {
      const updatedPet = await pool.query('SELECT * FROM pets WHERE id = $1', [petId]);
      const newsType = isReunited ? 'reunited' : 'adopted';
      await autoCreateNews(updatedPet.rows[0], newsType);
    }
    // Auto-badge: reunited_hero (first reunion)
    if (isReunited && pet.created_by) {
      const reunitedCount = await pool.query(
        "SELECT COUNT(*) as cnt FROM pets WHERE created_by = $1 AND status = 'reunited'",
        [pet.created_by]
      );
      const rc = parseInt(reunitedCount.rows[0].cnt);
      if (rc >= 1) await awardBadgeIfMissing(pet.created_by, 'reunited_hero');
      if (rc >= 5) await awardBadgeIfMissing(pet.created_by, 'reunited_legend');
    }
    // Return pet with images
    const updated = await pool.query(
      `SELECT p.*, 
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
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
  try {
    const existing = await pool.query('SELECT * FROM pets WHERE id = $1', [petId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Pet not found' });
    }
    const pet = existing.rows[0];
    if (pet.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await pool.query('DELETE FROM pets WHERE id = $1', [petId]);
    res.json({ message: 'Pet deleted' });
  } catch (err) {
    console.error('Delete pet error:', err);
    res.status(500).json({ error: 'Failed to delete pet' });
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
    if (pet.rows[0].created_by !== req.user.id && req.user.role !== 'admin') {
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
    const pet = await pool.query('SELECT created_by FROM pets WHERE id = $1', [record.pet_id]);
    if (pet.rows[0].created_by !== req.user.id && req.user.role !== 'admin') {
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
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
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

    const statusLabels = { lost: 'Perdido', retained: 'Retenido', sighted: 'Avistado', accidented: 'Accidentado', needs_attention: 'Necesita Atención', for_adoption: 'En Adopción', adopted: 'Adoptado', reunited: 'Reencuentro' };
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
  const { species, description, location, latitude, longitude, contact_info, status, images } = req.body;
  if (!species || !description || !location) {
    return res.status(400).json({ error: 'Species, description, and location are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const petResult = await client.query(
      `INSERT INTO pets (species, description, location, latitude, longitude, contact_info, status, created_by, is_admin_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
       [species, description, location, latitude || null, longitude || null, contact_info || null, status || 'sighted', null, false]
    );
    const pet = petResult.rows[0];
    if (images && images.length > 0) {
      for (const img of images) {
        const processed = await smartCropImage(img.data, img.mimeType);
        await client.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type) VALUES ($1, $2, $3)',
          [pet.id, processed.data, processed.mimeType]
        );
      }
    }
    const imagesResult = await client.query(
      `SELECT json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type) ORDER BY pi.created_at) as images
       FROM pet_images pi WHERE pi.pet_id = $1`,
      [pet.id]
    );
    await client.query('COMMIT');
    pet.images = imagesResult.rows[0]?.images || [];

    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
    sendAdminNotificationEmail(
      '🐾 Nuevo reporte público recibido',
      `<p style="font-size:16px;margin-bottom:16px;">Se recibió un nuevo reporte a través del formulario público.</p>
       <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Especie</td><td style="padding:8px;border:1px solid #e2e8f0;">${species}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Descripción</td><td style="padding:8px;border:1px solid #e2e8f0;">${description}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Ubicación</td><td style="padding:8px;border:1px solid #e2e8f0;">${location}${latitude && longitude ? ` (${latitude}, ${longitude})` : ''}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Contacto</td><td style="padding:8px;border:1px solid #e2e8f0;">${contact_info || 'No informado'}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Tipo</td><td style="padding:8px;border:1px solid #e2e8f0;">${status === 'sighted' ? 'Avistado' : status === 'retained' ? 'Retenido' : status || 'Avistado'}</td></tr>
       </table>
       <p style="text-align:center;margin-top:16px;">
         <a href="${frontendUrl}/pet/${pet.id}" style="background-color:#3b82f6;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver publicación</a>
       </p>`
    ).catch(err => console.error('Failed to send admin notification:', err));

    // Run matching in background
    findMatches(pet).catch(err => console.error('Matching error:', err));

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
  const { species, name, breed, color, gender, age, size, description, location, latitude, longitude, email, phone, images } = req.body;
  if (!species || !description || !location || !email) {
    return res.status(400).json({ error: 'Species, description, location, and email are required' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
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
        `INSERT INTO users (email, password_hash, display_name, role, registration_pending, registration_token)
         VALUES ($1, '', $2, 'user', TRUE, $3)
         RETURNING id`,
        [email, displayName, registrationToken]
      );
      userId = userInsert.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
      if (userResult.rows[0].registration_pending) {
        registrationToken = uuidv4().replace(/-/g, '') + crypto.randomBytes(16).toString('hex');
        await client.query('UPDATE users SET registration_token = $1 WHERE id = $2', [registrationToken, userId]);
      }
    }

    const petResult = await client.query(
      `INSERT INTO pets (species, name, breed, color, gender, age, size, description, location, latitude, longitude, contact_info, status, created_by, is_admin_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [species, name || null, breed || null, color || null, gender || 'unknown', age || null, size || null, description, location, latitude || null, longitude || null, email, 'lost', userId, false]
    );
    const pet = petResult.rows[0];

    // Process images
    for (const img of images) {
      const processed = await smartCropImage(img.data, img.mimeType);
      await client.query(
        'INSERT INTO pet_images (pet_id, image_data, mime_type) VALUES ($1, $2, $3)',
        [pet.id, processed.data, processed.mimeType]
      );
    }

    const imagesResult = await client.query(
      `SELECT json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type) ORDER BY pi.created_at) as images
       FROM pet_images pi WHERE pi.pet_id = $1`,
      [pet.id]
    );
    await client.query('COMMIT');
    pet.images = imagesResult.rows[0]?.images || [];

    // Send confirmation email to reporter
    sendLostPetConfirmationEmail(email, { species, name, breed, color, description, location, phone }, registrationToken)
      .catch(err => console.error('Failed to send lost pet confirmation email:', err));

    // Notify admin
    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
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

    // Run matching in background
    findMatches(pet).catch(err => console.error('Matching error:', err));

    res.status(201).json({ pet, registrationPending: !!registrationToken });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create lost pet report error:', err);
    res.status(500).json({ error: 'Failed to create lost pet report' });
  } finally {
    client.release();
  }
});

export default router;
