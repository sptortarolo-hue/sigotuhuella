import { Router } from 'express';
import pool from '../db.js';
import { renderFlyer } from '../services/flyerRenderer.js';
import { overlayStatus } from '../services/imageOverlay.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

let _canvasLoadImage = null;
async function getLoadImage() {
  if (!_canvasLoadImage) {
    try {
      const mod = await import('canvas');
      _canvasLoadImage = mod.loadImage;
    } catch {
      _canvasLoadImage = async () => { throw new Error('canvas no disponible'); };
    }
  }
  return _canvasLoadImage;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
let _logoImage = null;

async function getLogoImage() {
  if (_logoImage) return _logoImage;
  try {
    const logoPath = join(__dirname, '..', '..', 'public', 'sigotuhuella.jpg');
    const buf = readFileSync(logoPath);
    const loadImage = await getLoadImage();
    _logoImage = await loadImage(buf);
  } catch { _logoImage = null; }
  return _logoImage;
}

const router = Router();

router.get('/pet/:petId/cover', async (req, res) => {
  try {
    const petResult = await pool.query(`
      SELECT p.status,
        (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as image_data,
        (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as mime_type
      FROM pets p WHERE p.id = $1
    `, [req.params.petId]);
    if (petResult.rows.length === 0) { console.log('[Cover] pet not found'); return res.status(404).end(); }
    const pet = petResult.rows[0];
    if (!pet.image_data) { console.log('[Cover] no image data'); return res.status(404).end(); }
    console.log(`[Cover] rendering for pet ${req.params.petId}, status=${pet.status}, image_data.length=${pet.image_data.length}`);
    const jpgBuffer = await overlayStatus(pet.image_data, pet.mime_type || 'image/jpeg', pet.status);
    console.log(`[Cover] success, size=${jpgBuffer.length}`);
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Length', jpgBuffer.length);
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(jpgBuffer);
  } catch (err) {
    console.error('[Cover] RENDER ERROR:', err.message, err.stack?.split('\n')[1] || '');
    res.redirect(302, `/api/images/pet/${req.params.petId}/0`);
  }
});

router.get('/pet/:petId/flyer4x5', async (req, res) => {
  try {
    const petResult = await pool.query(`
      SELECT p.*,
        (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as image_data,
        (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as mime_type
      FROM pets p WHERE p.id = $1
    `, [req.params.petId]);
    if (petResult.rows.length === 0) return res.status(404).end();
    const pet = petResult.rows[0];
    let petImage = null;
    if (pet.image_data) {
      const buf = Buffer.from(pet.image_data, 'base64');
      const loadImage = await getLoadImage();
      petImage = await loadImage(buf);
    }
    const logoImage = await getLogoImage();
    const pngBuffer = await renderFlyer({
      status: pet.status,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      gender: pet.gender,
      age: pet.age,
      location: pet.location,
      contact_info: pet.contact_info,
      description: pet.description,
      case_number: pet.case_number,
      petImage,
      logoImage,
    });
    res.set('Content-Type', 'image/png');
    res.set('Content-Length', pngBuffer.length);
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(pngBuffer);
  } catch (err) {
    console.error('Flyer render error, falling back to first image:', err.message);
    res.redirect(302, `/api/images/pet/${req.params.petId}/0`);
  }
});

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
