import { Router } from 'express';
import pool from '../db.js';

const router = Router();

router.get('/pet/:petId/:index', async (req, res) => {
  try {
    const full = req.query.full === '1';
    const sql = full
      ? 'SELECT COALESCE(original_image_data, image_data) AS image_data, mime_type FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1 OFFSET $2'
      : 'SELECT image_data, mime_type FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1 OFFSET $2';
    const result = await pool.query(sql, [req.params.petId, parseInt(req.params.index) || 0]);
    if (result.rows.length === 0 || !result.rows[0].image_data) return res.status(404).end();
    const img = result.rows[0];
    const buffer = Buffer.from(img.image_data, 'base64');
    res.set('Content-Type', img.mime_type || 'image/jpeg');
    res.set('Content-Length', buffer.length);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch (err) {
    console.error('Image serve error:', err);
    res.status(500).end();
  }
});

router.get('/pet-thumb/:petId/:index', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT image_data, mime_type FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1 OFFSET $2',
      [req.params.petId, parseInt(req.params.index) || 0]
    );
    if (result.rows.length === 0 || !result.rows[0].image_data) return res.status(404).end();
    const img = result.rows[0];
    const data = img.image_data.length > 50000
      ? img.image_data.slice(0, 50000)
      : img.image_data;
    const buffer = Buffer.from(data, 'base64');
    res.set('Content-Type', img.mime_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch (err) {
    console.error('Thumb serve error:', err);
    res.status(500).end();
  }
});

router.get('/my-pet-avatar/:petId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT avatar_image, avatar_mime_type FROM my_pets WHERE id = $1',
      [req.params.petId]
    );
    if (result.rows.length === 0 || !result.rows[0].avatar_image) return res.status(404).end();
    const img = result.rows[0];
    const buffer = Buffer.from(img.avatar_image, 'base64');
    res.set('Content-Type', img.avatar_mime_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch (err) {
    console.error('Avatar serve error:', err);
    res.status(500).end();
  }
});

export default router;
