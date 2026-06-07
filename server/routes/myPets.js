import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from '../services/pushService.js';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = Router();

const SPECIES_LABELS = { dog: 'Perro', cat: 'Gato', other: 'Otro' };
const PERSONALITY_TAG_OPTIONS = [
  'juguetón', 'tranquilo', 'cariñoso', 'miedoso', 'explorador',
  'dormilón', 'guardián', 'sociable', 'independiente', 'travieso',
  'leal', 'curioso', 'mimoso', 'atlético', 'glotón',
];
const EVENT_TYPES = [
  'vaccine', 'deworm', 'vet', 'surgery', 'birthday',
  'adoption', 'milestone', 'weight', 'grooming', 'other',
];
const EVENT_TYPE_ICONS = {
  vaccine: '💉', deworm: '💊', vet: '🩺', surgery: '🏥',
  birthday: '🎂', adoption: '🏠', milestone: '⭐', weight: '⚖️',
  grooming: '✂️', other: '📋',
};

async function compressAvatar(imageData, mimeType, cropX = 0.5, cropY = 0.5) {
  try {
    const buffer = Buffer.from(imageData, 'base64');
    const pipeline = sharp(buffer);
    const meta = await pipeline.metadata();
    const w = meta.width || 400;
    const h = meta.height || 400;
    const size = 400;

    const scale = Math.max(size / w, size / h);
    const scaledW = Math.round(w * scale);
    const scaledH = Math.round(h * scale);
    const focusX = Math.round(cropX * scaledW);
    const focusY = Math.round(cropY * scaledH);
    const left = Math.max(0, Math.min(focusX - size / 2, scaledW - size));
    const top = Math.max(0, Math.min(focusY - size / 2, scaledH - size));

    const [thumb, original] = await Promise.all([
      sharp(buffer)
        .resize(scaledW, scaledH)
        .extract({ left, top, width: size, height: size })
        .jpeg({ quality: 80 })
        .toBuffer(),
      sharp(buffer)
        .jpeg({ quality: 85 })
        .toBuffer(),
    ]);
    return { data: thumb.toString('base64'), original_data: original.toString('base64'), mimeType: 'image/jpeg' };
  } catch {
    return { data: imageData, mimeType, original_data: imageData };
  }
}

async function compressPhoto(imageData, mimeType, cropX = 0.5, cropY = 0.5) {
  try {
    const buffer = Buffer.from(imageData, 'base64');
    const pipeline = sharp(buffer);
    const meta = await pipeline.metadata();
    const w = meta.width || 1200;
    const h = meta.height || 1200;
    const size = 1200;

    const scale = Math.max(size / w, size / h);
    const scaledW = Math.round(w * scale);
    const scaledH = Math.round(h * scale);
    const focusX = Math.round(cropX * scaledW);
    const focusY = Math.round(cropY * scaledH);
    const left = Math.max(0, Math.min(focusX - size / 2, scaledW - size));
    const top = Math.max(0, Math.min(focusY - size / 2, scaledH - size));

    const [thumb, original] = await Promise.all([
      sharp(buffer)
        .resize(scaledW, scaledH)
        .extract({ left, top, width: size, height: size })
        .jpeg({ quality: 85 })
        .toBuffer(),
      sharp(buffer)
        .jpeg({ quality: 85 })
        .toBuffer(),
    ]);
    return { data: thumb.toString('base64'), original_data: original.toString('base64'), mimeType: 'image/jpeg' };
  } catch {
    return { data: imageData, mimeType, original_data: imageData };
  }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mp.*,
        (SELECT count(*) FROM my_pet_photos WHERE my_pet_id = mp.id) as photo_count,
        (SELECT count(*) FROM my_pet_events WHERE my_pet_id = mp.id) as event_count,
        (SELECT count(*) FROM pet_records WHERE my_pet_id = mp.id) as record_count
       FROM my_pets mp WHERE mp.user_id = $1 ORDER BY mp.created_at DESC`,
      [req.user.id]
    );
    res.json({ myPets: result.rows });
  } catch (err) {
    console.error('my-pets list error:', err);
    res.status(500).json({ error: 'Error al obtener mascotas' });
  }
});

router.get('/featured', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mp.id, mp.name, mp.species, mp.breed, mp.bio, mp.personality_tags, mp.avatar_image IS NOT NULL as has_avatar
       FROM my_pets mp WHERE mp.is_featured = true LIMIT 1`
    );
    if (result.rows.length === 0) return res.json({ pet: null });
    res.json({ pet: result.rows[0] });
  } catch (err) {
    console.error('featured list error:', err);
    res.status(500).json({ error: 'Error al obtener mascota del mes' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM my_pets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    const pet = result.rows[0];

    const photosResult = await pool.query(
      'SELECT id, caption, taken_at, created_at, mime_type FROM my_pet_photos WHERE my_pet_id = $1 ORDER BY COALESCE(taken_at, created_at) DESC',
      [pet.id]
    );
    const eventsResult = await pool.query(
      'SELECT * FROM my_pet_events WHERE my_pet_id = $1 ORDER BY event_date DESC',
      [pet.id]
    );
    const recordsResult = await pool.query(
      'SELECT * FROM pet_records WHERE my_pet_id = $1 ORDER BY COALESCE(record_date, created_at) DESC',
      [pet.id]
    );

    pet.photos = photosResult.rows;
    pet.events = eventsResult.rows;
    pet.records = recordsResult.rows;
    res.json({ myPet: pet });
  } catch (err) {
    console.error('my-pet get error:', err);
    res.status(500).json({ error: 'Error al obtener mascota' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      name, species, breed, color, gender, birth_date, chip_id,
      bio, personality_tags, is_vaccinated, is_sterilized, is_dewormed,
      weight_kg, avatar_image, avatar_mime_type, crop_x, crop_y,
    } = req.body;

    if (!name || !species) return res.status(400).json({ error: 'Nombre y especie son requeridos' });

    let avatarData = null;
    let avatarMime = null;
    let avatarOriginal = null;
    if (avatar_image) {
      const compressed = await compressAvatar(avatar_image, avatar_mime_type || 'image/jpeg', crop_x || 0.5, crop_y || 0.5);
      avatarData = compressed.data;
      avatarMime = compressed.mimeType;
      avatarOriginal = compressed.original_data;
    }

    const result = await pool.query(
      `INSERT INTO my_pets (user_id, name, species, breed, color, gender, birth_date, chip_id,
        bio, personality_tags, is_vaccinated, is_sterilized, is_dewormed, weight_kg,
        avatar_image, avatar_mime_type, crop_x, crop_y, original_avatar_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        req.user.id, name, species, breed || null, color || null, gender || 'unknown',
        birth_date || null, chip_id || null, bio || null,
        JSON.stringify(personality_tags || []),
        is_vaccinated || false, is_sterilized || false, is_dewormed || false,
        weight_kg || null, avatarData, avatarMime,
        crop_x ?? 0.5, crop_y ?? 0.5, avatarOriginal,
      ]
    );
    res.status(201).json({ myPet: result.rows[0] });
  } catch (err) {
    console.error('my-pet create error:', err);
    res.status(500).json({ error: 'Error al crear mascota' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await pool.query(
      'SELECT id FROM my_pets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const {
      name, species, breed, color, gender, birth_date, chip_id,
      bio, personality_tags, is_vaccinated, is_sterilized, is_dewormed,
      weight_kg, avatar_image, avatar_mime_type, crop_x, crop_y,
    } = req.body;

    const sets = [];
    const values = [];
    let idx = 1;

    const addField = (col, val) => { sets.push(`${col} = $${idx}`); values.push(val); idx++; };

    if (name !== undefined) addField('name', name);
    if (species !== undefined) addField('species', species);
    if (breed !== undefined) addField('breed', breed);
    if (color !== undefined) addField('color', color);
    if (gender !== undefined) addField('gender', gender);
    if (birth_date !== undefined) addField('birth_date', birth_date || null);
    if (chip_id !== undefined) addField('chip_id', chip_id || null);
    if (bio !== undefined) addField('bio', bio || null);
    if (personality_tags !== undefined) addField('personality_tags', JSON.stringify(personality_tags));
    if (is_vaccinated !== undefined) addField('is_vaccinated', is_vaccinated);
    if (is_sterilized !== undefined) addField('is_sterilized', is_sterilized);
    if (is_dewormed !== undefined) addField('is_dewormed', is_dewormed);
    if (weight_kg !== undefined) addField('weight_kg', weight_kg || null);

    if (avatar_image !== undefined) {
      const compressed = await compressAvatar(avatar_image, avatar_mime_type || 'image/jpeg', crop_x || 0.5, crop_y || 0.5);
      addField('avatar_image', compressed.data);
      addField('avatar_mime_type', compressed.mimeType);
      addField('crop_x', crop_x ?? 0.5);
      addField('crop_y', crop_y ?? 0.5);
      addField('original_avatar_data', compressed.original_data);
    }

    if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

    sets.push(`updated_at = NOW()`);
    values.push(req.params.id, req.user.id);

    const result = await pool.query(
      `UPDATE my_pets SET ${sets.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
      values
    );
    res.json({ myPet: result.rows[0] });
  } catch (err) {
    console.error('my-pet update error:', err);
    res.status(500).json({ error: 'Error al actualizar mascota' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM my_pets WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    res.json({ success: true });
  } catch (err) {
    console.error('my-pet delete error:', err);
    res.status(500).json({ error: 'Error al eliminar mascota' });
  }
});

router.post('/:id/photos', requireAuth, async (req, res) => {
  try {
    const petCheck = await pool.query(
      'SELECT id FROM my_pets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (petCheck.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const { image_data, mime_type, caption, taken_at, crop_x, crop_y } = req.body;
    if (!image_data) return res.status(400).json({ error: 'Imagen requerida' });

    const compressed = await compressPhoto(image_data, mime_type || 'image/jpeg', crop_x || 0.5, crop_y || 0.5);

    const result = await pool.query(
      `INSERT INTO my_pet_photos (my_pet_id, image_data, mime_type, caption, taken_at, crop_x, crop_y, original_image_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, caption, taken_at, created_at, mime_type`,
      [req.params.id, compressed.data, compressed.mimeType, caption || null, taken_at || null,
       crop_x ?? 0.5, crop_y ?? 0.5, compressed.original_data]
    );
    res.status(201).json({ photo: result.rows[0] });
  } catch (err) {
    console.error('my-pet photo create error:', err);
    res.status(500).json({ error: 'Error al subir foto' });
  }
});

router.get('/:id/photos', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, caption, taken_at, created_at, mime_type FROM my_pet_photos WHERE my_pet_id = $1 ORDER BY COALESCE(taken_at, created_at) DESC',
      [req.params.id]
    );
    res.json({ photos: result.rows });
  } catch (err) {
    console.error('my-pet photos list error:', err);
    res.status(500).json({ error: 'Error al obtener fotos' });
  }
});

router.delete('/:id/photos/:photoId', requireAuth, async (req, res) => {
  try {
    const petCheck = await pool.query(
      'SELECT id FROM my_pets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (petCheck.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const result = await pool.query(
      'DELETE FROM my_pet_photos WHERE id = $1 AND my_pet_id = $2 RETURNING id',
      [req.params.photoId, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Foto no encontrada' });
    res.json({ success: true });
  } catch (err) {
    console.error('my-pet photo delete error:', err);
    res.status(500).json({ error: 'Error al eliminar foto' });
  }
});

router.get('/:id/photo/:photoId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mp.image_data, mp.mime_type FROM my_pet_photos mp
       JOIN my_pets p ON p.id = mp.my_pet_id
       WHERE mp.id = $1 AND p.user_id = $2`,
      [req.params.photoId, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).end();
    const img = result.rows[0];
    const buffer = Buffer.from(img.image_data, 'base64');
    res.set('Content-Type', img.mime_type);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(buffer);
  } catch {
    res.status(500).end();
  }
});

router.get('/:id/avatar', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT avatar_image, avatar_mime_type FROM my_pets WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0 || !result.rows[0].avatar_image) return res.status(404).end();
    const img = result.rows[0];
    const buffer = Buffer.from(img.avatar_image, 'base64');
    res.set('Content-Type', img.avatar_mime_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(buffer);
  } catch {
    res.status(500).end();
  }
});

router.post('/:id/events', requireAuth, async (req, res) => {
  try {
    const petCheck = await pool.query(
      'SELECT id FROM my_pets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (petCheck.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const { event_type, title, description, event_date, next_date, photo_id } = req.body;
    if (!event_type || !title || !event_date) {
      return res.status(400).json({ error: 'Tipo, título y fecha son requeridos' });
    }
    if (!EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({ error: 'Tipo de evento inválido' });
    }

    const result = await pool.query(
      `INSERT INTO my_pet_events (my_pet_id, event_type, title, description, event_date, next_date, photo_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.id, event_type, title, description || null, event_date, next_date || null, photo_id || null]
    );

    try {
      const { awardPoints, checkChallenge } = await import('./gamification.js');
      awardPoints(req.user.id, 10, 'Agregó evento al timeline');
      checkChallenge(req.user.id, 'add_event');
      checkChallenge(req.user.id, 'five_events');
    } catch {}

    res.status(201).json({ event: result.rows[0] });
  } catch (err) {
    console.error('my-pet event create error:', err);
    res.status(500).json({ error: 'Error al crear evento' });
  }
});

router.get('/:id/events', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM my_pet_events WHERE my_pet_id = $1 ORDER BY event_date DESC',
      [req.params.id]
    );
    res.json({ events: result.rows });
  } catch (err) {
    console.error('my-pet events list error:', err);
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
});

router.delete('/:id/events/:eventId', requireAuth, async (req, res) => {
  try {
    const petCheck = await pool.query(
      'SELECT id FROM my_pets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (petCheck.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const result = await pool.query(
      'DELETE FROM my_pet_events WHERE id = $1 AND my_pet_id = $2 RETURNING id',
      [req.params.eventId, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json({ success: true });
  } catch (err) {
    console.error('my-pet event delete error:', err);
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
});

router.post('/:id/request-qr', requireAuth, async (req, res) => {
  try {
    const petResult = await pool.query(
      'SELECT * FROM my_pets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    if (petResult.rows[0].qr_id) return res.status(400).json({ error: 'Esta mascota ya tiene QR asignado' });
    if (petResult.rows[0].qr_requested) return res.status(400).json({ error: 'Ya solicitaste QR para esta mascota' });

    await pool.query('UPDATE my_pets SET qr_requested = true WHERE id = $1', [req.params.id]);

    const pet = petResult.rows[0];
    const userResult = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
    const userName = userResult.rows[0]?.display_name || 'Usuario';

    sendPushToAdmins({
      title: 'Solicitud de identificación QR',
      body: `${userName} solicita QR para ${pet.name}`,
      tag: `qr-request-${pet.id}`,
    }).catch(() => {});

    sendAdminNotificationEmail(
      'Nueva solicitud de identificación QR',
      `<p><strong>${userName}</strong> solicita un código QR para <strong>${pet.name}</strong> (${pet.species}${pet.breed ? ' - ' + pet.breed : ''}).</p>
       <p><a href="https://sigotuhuella.online/admin" style="background:#5A5A40;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Ir al panel admin</a></p>`
    ).catch(() => {});

    res.json({ success: true, message: 'Solicitud de QR enviada' });
  } catch (err) {
    console.error('request-qr error:', err);
    res.status(500).json({ error: 'Error al solicitar QR' });
  }
});

router.post('/:id/vet-share', requireAuth, async (req, res) => {
  try {
    const petResult = await pool.query(
      'SELECT * FROM my_pets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) es requerido' });

    let vet_share_token = petResult.rows[0].vet_share_token;
    if (enabled && !vet_share_token) {
      vet_share_token = uuidv4();
    }

    await pool.query(
      'UPDATE my_pets SET vet_share_enabled = $1, vet_share_token = $2 WHERE id = $3',
      [enabled, enabled ? vet_share_token : null, req.params.id]
    );

    res.json({ success: true, vet_share_token: enabled ? vet_share_token : null });
  } catch (err) {
    console.error('vet-share error:', err);
    res.status(500).json({ error: 'Error al configurar compartir con veterinario' });
  }
});

router.post('/:id/featured', requireAdmin, async (req, res) => {
  try {
    const petResult = await pool.query('SELECT * FROM my_pets WHERE id = $1', [req.params.id]);
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    if (petResult.rows[0].is_featured) {
      await pool.query('UPDATE my_pets SET is_featured = false WHERE id = $1', [req.params.id]);
      res.json({ success: true, is_featured: false });
    } else {
      await pool.query('UPDATE my_pets SET is_featured = false WHERE is_featured = true');
      await pool.query('UPDATE my_pets SET is_featured = true WHERE id = $1', [req.params.id]);
      res.json({ success: true, is_featured: true });
    }
  } catch (err) {
    console.error('featured error:', err);
    res.status(500).json({ error: 'Error al cambiar mascota del mes' });
  }
});

router.post('/:id/records', requireAuth, async (req, res) => {
  try {
    const petCheck = await pool.query(
      'SELECT id FROM my_pets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (petCheck.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const {
      record_type, title, description, amount, record_date, next_date,
      vet_name, clinic_name, medication_name, dosage, photo_ids, link_url,
    } = req.body;

    if (!record_type || !title) return res.status(400).json({ error: 'Tipo y título son requeridos' });

    const result = await pool.query(
      `INSERT INTO pet_records (pet_id, my_pet_id, record_type, title, description, amount,
      record_date, next_date, vet_name, clinic_name, medication_name, dosage, photo_ids, link_url, created_by)
      VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        req.params.id, record_type, title, description || null, amount || null,
        record_date || null, next_date || null, vet_name || null, clinic_name || null,
        medication_name || null, dosage || null, photo_ids || [], link_url || null, req.user.id,
      ]
    );

    if (record_type === 'weight' && amount) {
      const weightVal = parseFloat(amount);
      if (!isNaN(weightVal) && weightVal > 0 && weightVal < 500) {
        await pool.query('UPDATE my_pets SET weight_kg = $1 WHERE id = $2', [weightVal, req.params.id]);
      }
    }

    res.status(201).json({ record: result.rows[0] });
  } catch (err) {
    console.error('my-pet record create error:', err);
    res.status(500).json({ error: 'Error al crear registro médico' });
  }
});

router.post('/convert/:petId', requireAuth, async (req, res) => {
  try {
    const petResult = await pool.query(
      'SELECT * FROM pets WHERE id = $1 AND created_by = $2 AND status = $3',
      [req.params.petId, req.user.id, 'reunited']
    );
    if (petResult.rows.length === 0) {
      return res.status(404).json({ error: 'Mascota reunida no encontrada o no te pertenece' });
    }

    const pet = petResult.rows[0];
    const { bio, birth_date, weight_kg, personality_tags } = req.body || {};

    const imagesResult = await pool.query(
      'SELECT image_data, mime_type, original_image_data, crop_x, crop_y FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1',
      [pet.id]
    );

    let avatarData = null;
    let avatarMime = null;
    let avatarOriginal = null;
    let cropX = 0.5, cropY = 0.5;
    if (imagesResult.rows.length > 0) {
      const img = imagesResult.rows[0];
      const compressed = await compressAvatar(
        img.image_data,
        img.mime_type,
        img.crop_x ?? 0.5,
        img.crop_y ?? 0.5
      );
      avatarData = compressed.data;
      avatarMime = compressed.mimeType;
      avatarOriginal = compressed.original_data;
      cropX = img.crop_x ?? 0.5;
      cropY = img.crop_y ?? 0.5;
    }

    const finalBio = bio !== undefined ? bio : pet.description;
    const finalTags = personality_tags || null;
    const finalBirthDate = birth_date || null;
    const finalWeight = weight_kg || null;

    const myPetResult = await pool.query(
      `INSERT INTO my_pets (user_id, name, species, breed, color, gender,
        is_vaccinated, is_sterilized, is_dewormed, bio, avatar_image, avatar_mime_type,
        birth_date, weight_kg, personality_tags, crop_x, crop_y, original_avatar_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        req.user.id, pet.name || 'Mi mascota', pet.species, pet.breed, pet.color,
        pet.gender, pet.is_vaccinated, pet.is_sterilized, pet.is_dewormed,
        finalBio, avatarData, avatarMime, finalBirthDate, finalWeight, finalTags,
        cropX, cropY, avatarOriginal,
      ]
    );

    await pool.query(
      `INSERT INTO my_pet_events (my_pet_id, event_type, title, description, event_date)
      VALUES ($1, 'milestone', 'Reencontrado', 'Se reencontró con su familia gracias a Sigo Tu Huella', CURRENT_DATE)`,
      [myPetResult.rows[0].id]
    );

    const recordsResult = await pool.query(
      'SELECT id FROM pet_records WHERE pet_id = $1',
      [pet.id]
    );
    if (recordsResult.rows.length > 0) {
      const recordIds = recordsResult.rows.map(r => r.id);
      await pool.query(
        `UPDATE pet_records SET my_pet_id = $1 WHERE id = ANY($2::uuid[])`,
        [myPetResult.rows[0].id, recordIds]
      );
    }

    res.status(201).json({ myPet: myPetResult.rows[0] });
  } catch (err) {
    console.error('my-pet convert error:', err);
    res.status(500).json({ error: 'Error al convertir mascota' });
  }
});

router.get('/:id/pasaporte', requireAuth, async (req, res) => {
  try {
    const petResult = await pool.query(
      `SELECT mp.*, u.display_name as owner_name, u.phone as owner_phone
       FROM my_pets mp JOIN users u ON u.id = mp.user_id WHERE mp.id = $1 AND mp.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    const pet = petResult.rows[0];

    const photosResult = await pool.query(
      'SELECT id, image_data, mime_type, caption FROM my_pet_photos WHERE my_pet_id = $1 ORDER BY COALESCE(taken_at, created_at) ASC',
      [pet.id]
    );
    const eventsResult = await pool.query(
      'SELECT * FROM my_pet_events WHERE my_pet_id = $1 ORDER BY event_date DESC, created_at DESC',
      [pet.id]
    );
    const recordsResult = await pool.query(
      'SELECT * FROM pet_records WHERE my_pet_id = $1 ORDER BY record_date DESC, created_at DESC',
      [pet.id]
    );

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const dateStr = new Date().toLocaleDateString('es-AR').replace(/\//g, '-');
    const safeName = (pet.name || 'mascota').replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, '').trim().replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pasaporte-${safeName}-${dateStr}.pdf"`);
    doc.pipe(res);

    const watermarkText = 'SIGO TU HUELLA';
    const addWatermark = () => {
      doc.save();
      doc.fontSize(60).font('Helvetica-Bold').fillColor('#e0e0e0');
      for (let x = 0; x < 600; x += 200) {
        for (let y = 0; y < 900; y += 200) {
          doc.save();
          doc.translate(x + 100, y + 100);
          doc.rotate(-30);
          doc.text(watermarkText, -doc.widthOfString(watermarkText) / 2, 0);
          doc.restore();
        }
      }
      doc.restore();
    };

    const speciesLabel = pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otro';

    // Cover page
    doc.fontSize(24).font('Helvetica-Bold').fillColor('#5A5A40')
      .text('PASAPORTE DIGITAL', { align: 'center' });
    doc.fontSize(12).font('Helvetica').fillColor('#666')
      .text(`Sigo Tu Huella — ${pet.name}`, { align: 'center' });
    doc.moveDown(2);

    addWatermark();

    // Pet photo on cover
    if (photosResult.rows.length > 0) {
      try {
        const coverPhoto = Buffer.from(photosResult.rows[0].image_data, 'base64');
        doc.image(coverPhoto, doc.page.width / 2 - 75, doc.y, { width: 150, height: 150 });
        doc.y += 170;
      } catch { }
    }

    doc.moveDown(2);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#5A5A40')
      .text(pet.name, { align: 'center' });
    doc.fontSize(11).font('Helvetica').fillColor('#333')
      .text(`${speciesLabel}${pet.breed ? ` — ${pet.breed}` : ''}${pet.color ? ` — ${pet.color}` : ''}`, { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(9).fillColor('#666');
    const infoLines = [
      ['Sexo', pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : '-'],
      ['Fecha de nacimiento', pet.birth_date ? new Date(pet.birth_date).toLocaleDateString('es-AR') : '-'],
      ['Peso', pet.weight_kg ? `${pet.weight_kg} kg` : '-'],
      ['Microchip', pet.chip_id || '-'],
      ['Dueño', pet.owner_name],
      ['Contacto', pet.owner_phone || '-'],
    ];
    for (const [label, value] of infoLines) {
      doc.text(`  ${label}: ${value}`);
    }

    doc.addPage();

    // Health badges
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#5A5A40').text('SALUD').moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text(`✓ Vacunado: ${pet.is_vaccinated ? 'Sí' : 'No'}`);
    doc.text(`✓ Esterilizado: ${pet.is_sterilized ? 'Sí' : 'No'}`);
    doc.text(`✓ Desparasitado: ${pet.is_dewormed ? 'Sí' : 'No'}`);
    if (pet.bio) { doc.moveDown(0.3); doc.fontSize(9).fillColor('#666').text(`"${pet.bio}"`); }
    doc.moveDown(0.5);

    // Personality tags
    if (pet.personality_tags?.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#5A5A40').text('PERSONALIDAD').moveDown(0.3);
      doc.fontSize(9).font('Helvetica').fillColor('#333')
        .text(pet.personality_tags.join(' · '));
      doc.moveDown(0.5);
    }

    // Events
    if (eventsResult.rows.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#5A5A40').text('EVENTOS').moveDown(0.3);
      for (const ev of eventsResult.rows) {
        if (doc.y > 700) doc.addPage();
        const date = ev.event_date ? new Date(ev.event_date).toLocaleDateString('es-AR') : '-';
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333').text(`${date} — ${ev.title}`);
        if (ev.description) doc.fontSize(8).font('Helvetica').fillColor('#666').text(`   ${ev.description}`);
        doc.moveDown(0.2);
      }
      doc.moveDown(0.3);
    }

    // Records
    if (recordsResult.rows.length > 0) {
      if (doc.y > 650) doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#5A5A40').text('REGISTROS MÉDICOS').moveDown(0.3);
      for (const rec of recordsResult.rows) {
        if (doc.y > 700) doc.addPage();
        const date = rec.record_date ? new Date(rec.record_date).toLocaleDateString('es-AR') : '-';
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333').text(`${date} — ${rec.title || rec.record_type}`);
        doc.fontSize(8).font('Helvetica').fillColor('#555');
        if (rec.vet_name) doc.text(`   Veterinario: ${rec.vet_name}`);
        if (rec.description) doc.text(`   ${rec.description}`);
        if (rec.next_date) doc.text(`   Próximo: ${new Date(rec.next_date).toLocaleDateString('es-AR')}`);
        doc.moveDown(0.2);
      }
    }

    // Footer
    doc.moveDown(1);
    doc.fontSize(7).fillColor('#aaa').text('Sigo Tu Huella — Identificación Digital · sigotuhuella.com', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('pasaporte pdf error:', err);
    res.status(500).json({ error: 'Error al generar pasaporte' });
  }
});

// Health tips pre-escritos por especie
const TIPS_DB = {
  dog: [
    { title: '🐶 Vacunación anual', tip: 'Mantené al día las vacunas de tu perro. La triple (polivalente) se refuerza cada año y la antirrábica según calendario local.' },
    { title: '🐶 Desparasitación', tip: 'Desparasitá a tu perro cada 3 meses (cada mes si es cachorro). La prevención es clave contra parásitos intestinales y pulgas.' },
    { title: '🐶 Paseos diarios', tip: 'Los perros necesitan al menos 30 minutos de ejercicio diario. Los paseos regulares previenen obesidad y problemas de conducta.' },
    { title: '🐶 Salud dental', tip: 'Cepillale los dientes a tu perro 2-3 veces por semana. La acumulación de sarro puede causar enfermedades cardíacas y renales.' },
    { title: '🐶 Alimentación adecuada', tip: 'Elegí un alimento balanceado según su edad, tamaño y nivel de actividad. Evitá darle comida humana, especialmente chocolate y uvas.' },
    { title: '🐶 Corte de uñas', tip: 'Revisá las uñas de tu perro cada mes. Si escuchás que hacen ruido al caminar sobre el piso, es momento de cortarlas.' },
    { title: '🐶 Hidratación', tip: 'Asegurate que siempre tenga agua fresca y limpia. Los perros necesitan entre 50-100ml de agua por kg de peso al día.' },
  ],
  cat: [
    { title: '🐱 Esterilización', tip: 'Esterilizar a tu gato previene camadas no deseadas, reduce el marcaje territorial y disminuye el riesgo de cáncer en hembras.' },
    { title: '🐱 Alimentación húmeda', tip: 'Incorporá alimento húmedo en la dieta de tu gato. Ayuda a prevenir problemas urinarios y aporta hidratación adicional.' },
    { title: '🐱 Rascadores', tip: 'Proveé rascadores a tu gato para que pueda afilarse las uñas. Esto evita que dañe muebles y lo ayuda a marcar territorio de forma saludable.' },
    { title: '🐱 Caja de arena', tip: 'Mantené la caja de arena siempre limpia. Los gatos son muy limpios y pueden estresarse si la caja está sucia.' },
    { title: '🐱 Control de peso', tip: 'La obesidad felina es un problema grave. Controlá las porciones y fomentá el juego activo al menos 15-20 minutos al día.' },
    { title: '🐱 Visitas al veterinario', tip: 'Llevá a tu gato al veterinario al menos una vez al año. Los gatos son expertos en ocultar síntomas de enfermedad.' },
  ],
  other: [
    { title: '🐾 Visita regular al vet', tip: 'Todas las mascotas necesitan controles veterinarios periódicos. La prevención es la mejor medicina.' },
    { title: '🐾 Alimentación balanceada', tip: 'Investigá la dieta específica para tu especie de mascota. Cada animal tiene necesidades nutricionales únicas.' },
    { title: '🐾 Identificación', tip: 'Asegurate de que tu mascota tenga identificación visible. El QR de Sigo Tu Huella es una excelente opción.' },
  ],
};

router.get('/:id/health-tips', requireAuth, async (req, res) => {
  try {
    const pet = await pool.query('SELECT species, age, is_vaccinated FROM my_pets WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const species = pet.rows[0].species;
    const tips = TIPS_DB[species] || TIPS_DB.other;

    res.json(tips);
  } catch (err) {
    console.error('health tips error:', err);
    res.status(500).json({ error: 'Error al obtener tips' });
  }
});

import { generateVideo } from '../lib/videoAssembler.js';

router.post('/:id/generate-video', requireAuth, async (req, res) => {
  try {
    const pet = await pool.query(
      'SELECT id, name FROM my_pets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const { photo_ids, title, music = 'emotional', format = 'vertical', per_photo_dur = 2 } = req.body;
    if (!photo_ids || photo_ids.length < 3)
      return res.status(400).json({ error: 'Seleccioná al menos 3 fotos' });

    const photos = await pool.query(
      'SELECT id, image_data FROM my_pet_photos WHERE my_pet_id = $1 AND id = ANY($2::uuid[]) ORDER BY created_at ASC',
      [req.params.id, photo_ids]
    );
    if (photos.rows.length === 0) return res.status(400).json({ error: 'Fotos no encontradas' });

    const scenes = photos.rows.map(p => ({
      type: 'photo',
      imageBase64: p.image_data,
      overlayText: title || '',
    }));

    const numScenes = scenes.length;
    const fixedDur = 8;
    const totalTransDur = (numScenes + 1) * 0.5;
    const duration = Math.round(numScenes * per_photo_dur + fixedDur - totalTransDur);

    const result = await generateVideo({
      style: 'emotive',
      duration: Math.max(duration, 15),
      music,
      includeVoice: false,
      format,
      scenes,
      frame: 'none',
      stickers: true,
      confetti: false,
    });

    const videoUrl = `/generated/videos/${result.filename}`;
    const thumbUrl = result.thumbnail ? `/generated/videos/${result.thumbnail}` : null;

    await pool.query(
      `INSERT INTO promotional_videos (title, video_data, thumbnail_data, format, status, created_by)
       VALUES ($1, $2, $3, $4, 'ready', $5)`,
      [title || `Video de ${pet.rows[0].name}`, videoUrl, result.thumbnail, format, req.user.id]
    );

    res.json({ videoUrl, thumbnailUrl: thumbUrl, message: 'Video generado correctamente' });
  } catch (err) {
    console.error('generate video error:', err);
    res.status(500).json({ error: 'Error al generar video' });
  }
});

export default router;
