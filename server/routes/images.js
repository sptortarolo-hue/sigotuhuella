import { Router } from 'express';
import sharp from 'sharp';
import pool from '../db.js';
import { renderFlyer } from '../services/flyerRenderer.js';
import { overlayStatus, overlayStory } from '../services/imageOverlay.js';
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

router.get('/pet/:petId/story', async (req, res) => {
  try {
    const petResult = await pool.query(`
      SELECT p.status, p.contact_info, p.location,
        (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as image_data,
        (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as mime_type
      FROM pets p WHERE p.id = $1
    `, [req.params.petId]);
    if (petResult.rows.length === 0) { return res.status(404).end(); }
    const pet = petResult.rows[0];
    if (!pet.image_data) { return res.status(404).end(); }
    const jpgBuffer = await overlayStory(pet.image_data, pet.mime_type || 'image/jpeg', pet.status, pet.contact_info, pet.location);
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Length', jpgBuffer.length);
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(jpgBuffer);
  } catch (err) {
    console.error('[Story] RENDER ERROR:', err.message);
    res.redirect(302, `/api/images/pet/${req.params.petId}/cover`);
  }
});

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
    res.set('Cache-Control', 'no-store');
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
      ? 'SELECT COALESCE(original_image_data, image_data) AS image_data, mime_type, external_url FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1 OFFSET $2'
      : 'SELECT image_data, mime_type, external_url FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1 OFFSET $2';
    const result = await pool.query(sql, [req.params.petId, parseInt(req.params.index) || 0]);
    if (result.rows.length === 0) return res.status(404).end();
    const img = result.rows[0];
    if (img.image_data) {
      const buffer = Buffer.from(img.image_data, 'base64');
      res.set('Content-Type', img.mime_type || 'image/jpeg');
      res.set('Content-Length', buffer.length);
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.set('Access-Control-Allow-Origin', '*');
      res.end(buffer);
    } else if (img.external_url) {
      res.redirect(302, img.external_url);
    } else {
      res.status(404).end();
    }
  } catch (err) {
    console.error('Image serve error:', err);
    res.status(500).end();
  }
});

function isInstaSafeExternalUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https:\/\//i.test(url)) return false;
  if (/scontent[^.]*\.fbcdn\.net/i.test(url) || /fbcdn\.net/i.test(url)) return false;
  if (/[?&](oe|oh|ohkey|__tn__)=/i.test(url)) return false;
  return /\.(jpe?g|png)$/i.test(url);
}

function hasValidImageMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return false;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
  return false;
}

function sendInstaError(res, status, message, ctx) {
  console.error(`[Insta image] ${status} ${message}`, ctx || '');
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Access-Control-Allow-Origin', '*');
  res.status(status).end(message);
}

// Instagram-safe version: resizes to 1080×1350 (4:5) with white padding, no status overlay
router.get('/pet/:petId/:index/insta', async (req, res) => {
  const ctx = { petId: req.params.petId, index: req.params.index };
  try {
    const result = await pool.query(
      'SELECT image_data, mime_type, external_url FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1 OFFSET $2',
      [req.params.petId, parseInt(req.params.index) || 0]
    );
    if (result.rows.length === 0) {
      return sendInstaError(res, 404, 'Not Found', { ...ctx, reason: 'no row' });
    }
    const img = result.rows[0];

    if (img.image_data) {
      const buffer = Buffer.from(img.image_data, 'base64');
      if (!hasValidImageMagicBytes(buffer)) {
        return sendInstaError(res, 415, 'Unsupported Media Type', {
          ...ctx, reason: 'bad magic bytes', mime: img.mime_type, bytes: buffer.length
        });
      }
      try {
        const bg = await sharp(buffer)
          .resize(1080, 1350, { fit: 'cover' })
          .blur(60)
          .png()
          .toBuffer();
        const fg = await sharp(buffer)
          .resize(1080, 1350, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        const resized = await sharp(bg)
          .composite([{ input: fg }])
          .jpeg({ quality: 85 })
          .toBuffer();
        res.set('Content-Type', 'image/jpeg');
        res.set('Content-Length', resized.length);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('Access-Control-Allow-Origin', '*');
        res.set('X-Content-Type-Options', 'nosniff');
        res.end(resized);
      } catch (sharpErr) {
        return sendInstaError(res, 500, 'Image processing failed', {
          ...ctx, reason: 'sharp error', mime: img.mime_type, bytes: buffer.length, err: sharpErr.message
        });
      }
    } else if (isInstaSafeExternalUrl(img.external_url)) {
      res.set('X-Content-Type-Options', 'nosniff');
      res.redirect(302, img.external_url);
    } else {
      return sendInstaError(res, 404, 'Not Found', {
        ...ctx, reason: 'no image_data and unsafe external_url',
        external: img.external_url ? String(img.external_url).slice(0, 120) : null
      });
    }
  } catch (err) {
    return sendInstaError(res, 500, 'Internal Server Error', { ...ctx, err: err.message });
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

// ── News images ──

async function serveNewsImage(newsId, width, height, req, res) {
  const result = await pool.query('SELECT image_data, mime_type, title FROM news WHERE id = $1', [newsId]);
  if (result.rows.length === 0 || !result.rows[0].image_data) return res.status(404).end();
  const news = result.rows[0];
  const buf = Buffer.from(news.image_data, 'base64');

  const bg = await sharp(buf)
    .resize(width, height, { fit: 'cover' })
    .blur(60)
    .png()
    .toBuffer();
  const fg = await sharp(buf)
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const out = await sharp(bg)
    .composite([{ input: fg }])
    .jpeg({ quality: 85 })
    .toBuffer();

  res.set('Content-Type', 'image/jpeg');
  res.set('Content-Length', out.length);
  res.set('Cache-Control', 'public, max-age=3600');
  res.set('Access-Control-Allow-Origin', '*');
  res.end(out);
}

router.get('/news/:newsId/feed', async (req, res) => {
  try { await serveNewsImage(req.params.newsId, 1080, 1350, req, res); }
  catch (err) { console.error('[News image] feed error:', err.message); res.status(500).end(); }
});

router.get('/news/:newsId/story', async (req, res) => {
  try { await serveNewsImage(req.params.newsId, 1080, 1920, req, res); }
  catch (err) { console.error('[News image] story error:', err.message); res.status(500).end(); }
});

router.get('/news/:newsId/square', async (req, res) => {
  try { await serveNewsImage(req.params.newsId, 1080, 1080, req, res); }
  catch (err) { console.error('[News image] square error:', err.message); res.status(500).end(); }
});

router.get('/news/:newsId/fb', async (req, res) => {
  try { await serveNewsImage(req.params.newsId, 1200, 630, req, res); }
  catch (err) { console.error('[News image] fb error:', err.message); res.status(500).end(); }
});

// Raw news image
router.get('/news/:newsId', async (req, res) => {
  try {
    const result = await pool.query('SELECT image_data, mime_type FROM news WHERE id = $1', [req.params.newsId]);
    if (result.rows.length === 0 || !result.rows[0].image_data) return res.status(404).end();
    const news = result.rows[0];
    const buffer = Buffer.from(news.image_data, 'base64');
    res.set('Content-Type', news.mime_type || 'image/jpeg');
    res.set('Content-Length', buffer.length);
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch (err) {
    console.error('[News image] raw error:', err.message);
    res.status(500).end();
  }
});

export default router;
