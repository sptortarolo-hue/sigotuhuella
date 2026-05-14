import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const status = req.query.status;
    let query = `
      SELECT p.*, 
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
    `;
    const params = [];
    if (status) {
      params.push(status);
      query += ` WHERE p.status = $1`;
    }
    query += ` GROUP BY p.id ORDER BY p.created_at DESC`;
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
  const { name, species, breed, color, status, gender, description, location, latitude, longitude, contactInfo, images } = req.body;
  if (!species || !status || !location) {
    return res.status(400).json({ error: 'Species, status, and location are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const petResult = await client.query(
      `INSERT INTO pets (name, species, breed, color, status, gender, description, location, latitude, longitude, contact_info, created_by, is_admin_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [name || null, species, breed || null, color || null, status, gender || 'unknown',
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
    const fields = ['name', 'species', 'breed', 'color', 'status', 'gender', 'description', 'location', 'contact_info'];
    const updates = [];
    const values = [];
    let idx = 1;
    for (const field of fields) {
      const key = field === 'contact_info' ? 'contactInfo' : field;
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
    if (updates.length === 0 && !req.body.images) {
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
    // Handle images: replace all if provided
    if (req.body.images && req.body.images.length > 0) {
      await pool.query('DELETE FROM pet_images WHERE pet_id = $1', [petId]);
      for (const img of req.body.images) {
        await pool.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type) VALUES ($1, $2, $3)',
          [petId, img.data, img.mimeType || 'image/jpeg']
        );
      }
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

export default router;
