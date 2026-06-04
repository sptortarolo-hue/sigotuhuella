import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../auth.js';
import sharp from 'sharp';

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
    res.status(201).json({ record: result.rows[0] });
  } catch (err) {
    console.error('my-pet record create error:', err);
    res.status(500).json({ error: 'Error al crear registro médico' });
  }
});

router.get('/:id/records', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM pet_records WHERE my_pet_id = $1 ORDER BY COALESCE(record_date, created_at) DESC',
      [req.params.id]
    );
    res.json({ records: result.rows });
  } catch (err) {
    console.error('my-pet records list error:', err);
    res.status(500).json({ error: 'Error al obtener registros' });
  }
});

router.get('/:id/reminders', requireAuth, async (req, res) => {
  try {
    const petCheck = await pool.query(
      'SELECT id, name FROM my_pets WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (petCheck.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const eventsResult = await pool.query(
      `SELECT id, event_type, title, next_date as due_date, 'event' as source
       FROM my_pet_events WHERE my_pet_id = $1 AND next_date IS NOT NULL AND next_date >= CURRENT_DATE
       ORDER BY next_date ASC`,
      [req.params.id]
    );

    const recordsResult = await pool.query(
      `SELECT id, record_type as event_type, title, next_date as due_date, 'record' as source
       FROM pet_records WHERE my_pet_id = $1 AND next_date IS NOT NULL AND next_date >= CURRENT_DATE
       ORDER BY next_date ASC`,
      [req.params.id]
    );

    const reminders = [...eventsResult.rows, ...recordsResult.rows]
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    res.json({ reminders });
  } catch (err) {
    console.error('my-pet reminders error:', err);
    res.status(500).json({ error: 'Error al obtener recordatorios' });
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

    const myPetResult = await pool.query(
      `INSERT INTO my_pets (user_id, name, species, breed, color, gender, age,
        is_vaccinated, is_sterilized, is_dewormed, description, avatar_image, avatar_mime_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        req.user.id, pet.name || 'Mi mascota', pet.species, pet.breed, pet.color,
        pet.gender, pet.age, pet.is_vaccinated, pet.is_sterilized, pet.is_dewormed,
        pet.description, avatarData, avatarMime,
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

export default router;
