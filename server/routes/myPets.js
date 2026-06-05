import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from '../services/pushService.js';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import { readFileSync } from 'fs';
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

async function compressAvatar(imageData, mimeType) {
  try {
    const buffer = Buffer.from(imageData, 'base64');
    const processed = await sharp(buffer)
      .resize(400, 400, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { data: processed.toString('base64'), mimeType: 'image/jpeg' };
  } catch {
    return { data: imageData, mimeType };
  }
}

async function compressPhoto(imageData, mimeType) {
  try {
    const buffer = Buffer.from(imageData, 'base64');
    const processed = await sharp(buffer)
      .resize(1200, 1200, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { data: processed.toString('base64'), mimeType: 'image/jpeg' };
  } catch {
    return { data: imageData, mimeType };
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
      weight_kg, avatar_image, avatar_mime_type,
    } = req.body;

    if (!name || !species) return res.status(400).json({ error: 'Nombre y especie son requeridos' });

    let avatarData = null;
    let avatarMime = null;
    if (avatar_image) {
      const compressed = await compressAvatar(avatar_image, avatar_mime_type || 'image/jpeg');
      avatarData = compressed.data;
      avatarMime = compressed.mimeType;
    }

    const result = await pool.query(
      `INSERT INTO my_pets (user_id, name, species, breed, color, gender, birth_date, chip_id,
        bio, personality_tags, is_vaccinated, is_sterilized, is_dewormed, weight_kg,
        avatar_image, avatar_mime_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        req.user.id, name, species, breed || null, color || null, gender || 'unknown',
        birth_date || null, chip_id || null, bio || null,
        JSON.stringify(personality_tags || []),
        is_vaccinated || false, is_sterilized || false, is_dewormed || false,
        weight_kg || null, avatarData, avatarMime,
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
      weight_kg, avatar_image, avatar_mime_type,
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
      const compressed = await compressAvatar(avatar_image, avatar_mime_type || 'image/jpeg');
      addField('avatar_image', compressed.data);
      addField('avatar_mime_type', compressed.mimeType);
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

    const { image_data, mime_type, caption, taken_at } = req.body;
    if (!image_data) return res.status(400).json({ error: 'Imagen requerida' });

    const compressed = await compressPhoto(image_data, mime_type || 'image/jpeg');

    const result = await pool.query(
      `INSERT INTO my_pet_photos (my_pet_id, image_data, mime_type, caption, taken_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, caption, taken_at, created_at, mime_type`,
      [req.params.id, compressed.data, compressed.mimeType, caption || null, taken_at || null]
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
      vet_name, clinic_name, medication_name, dosage,
    } = req.body;

    if (!record_type || !title) return res.status(400).json({ error: 'Tipo y título son requeridos' });

    const result = await pool.query(
      `INSERT INTO pet_records (pet_id, my_pet_id, record_type, title, description, amount,
      record_date, next_date, vet_name, clinic_name, medication_name, dosage, created_by)
      VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        req.params.id, record_type, title, description || null, amount || null,
        record_date || null, next_date || null, vet_name || null, clinic_name || null,
        medication_name || null, dosage || null, req.user.id,
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
      'SELECT image_data, mime_type FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1',
      [pet.id]
    );

    let avatarData = null;
    let avatarMime = null;
    if (imagesResult.rows.length > 0) {
      const compressed = await compressAvatar(
        imagesResult.rows[0].image_data,
        imagesResult.rows[0].mime_type
      );
      avatarData = compressed.data;
      avatarMime = compressed.mimeType;
    }

    const finalBio = bio !== undefined ? bio : pet.description;
    const finalTags = personality_tags || null;
    const finalBirthDate = birth_date || null;
    const finalWeight = weight_kg || null;

    const myPetResult = await pool.query(
      `INSERT INTO my_pets (user_id, name, species, breed, color, gender,
        is_vaccinated, is_sterilized, is_dewormed, bio, avatar_image, avatar_mime_type,
        birth_date, weight_kg, personality_tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        req.user.id, pet.name || 'Mi mascota', pet.species, pet.breed, pet.color,
        pet.gender, pet.is_vaccinated, pet.is_sterilized, pet.is_dewormed,
        finalBio, avatarData, avatarMime, finalBirthDate, finalWeight, finalTags,
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

export default router;
