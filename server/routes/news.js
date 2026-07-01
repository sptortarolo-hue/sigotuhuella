import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { sendPushToAll } from '../services/pushService.js';
import { publishNewsToAll, getNewsPublications } from '../services/newsPublisherService.js';
import { getBrandSettings, saveBrandSettings, getAutoPublishSettings, saveAutoPublishSettings } from '../services/brandIdentityService.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*, u.display_name as author_name
       FROM news n
       LEFT JOIN users u ON u.id = n.created_by
       ORDER BY n.created_at DESC`
    );
    res.json({ news: result.rows });
  } catch (err) {
    console.error('Get news error:', err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

router.get('/brand-settings', requireAdmin, async (req, res) => {
  try {
    const [brand, auto] = await Promise.all([
      getBrandSettings(),
      getAutoPublishSettings(),
    ]);
    res.json({ settings: { ...brand, ...auto } });
  } catch (err) {
    console.error('Get brand settings error:', err);
    res.status(500).json({ error: 'Failed to fetch brand settings' });
  }
});

router.put('/brand-settings', requireAdmin, async (req, res) => {
  try {
    await saveBrandSettings(req.body);
    await saveAutoPublishSettings(req.body);
    res.json({ message: 'Brand settings updated' });
  } catch (err) {
    console.error('Save brand settings error:', err);
    res.status(500).json({ error: 'Failed to save brand settings' });
  }
});

router.get('/brand-preview', async (req, res) => {
  try {
    const dummyNews = {
      id: 'preview',
      title: 'Vista previa del overlay',
      content: 'Contenido de ejemplo para visualizar el diseño del overlay con la identidad de marca configurada.',
      type: 'manual',
      created_at: new Date().toISOString(),
      image_data: null,
    };
    const { applyBrandOverlay } = await import('../services/brandIdentityService.js');
    const branded = await applyBrandOverlay(null, dummyNews);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(branded);
  } catch (err) {
    console.error('Brand preview error:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*, u.display_name as author_name
       FROM news n
       LEFT JOIN users u ON u.id = n.created_by
       WHERE n.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'News not found' });
    }
    res.json({ news: result.rows[0] });
  } catch (err) {
    console.error('Get news error:', err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { title, content, imageData, mimeType, videoUrl, type, relatedPetId, platforms } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO news (title, content, image_data, mime_type, video_url, type, related_pet_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, content, imageData || null, mimeType || null, videoUrl || null,
       type || 'manual', relatedPetId || null, req.user.id]
    );
    const newsItem = result.rows[0];

    const typeLabels = { reunited: 'Reencuentro', adopted: 'Adopción', manual: 'Novedad' };
    sendPushToAll({
      title: `📰 ${typeLabels[newsItem.type] || 'Novedad'}: ${newsItem.title}`,
      body: newsItem.content.substring(0, 100),
      url: `${process.env.FRONTEND_URL || 'https://sigotuhuella.online'}/novedad/${newsItem.id}`,
    }).catch(err => console.error('Push error:', err));

    publishNewsToAll(newsItem.id, platforms).catch(err =>
      console.error('Auto-publish news error:', err)
    );

    res.status(201).json({ news: newsItem });
  } catch (err) {
    console.error('Create news error:', err);
    res.status(500).json({ error: 'Failed to create news' });
  }
});

router.post('/:id/publish', requireAdmin, async (req, res) => {
  try {
    const existing = await pool.query('SELECT id FROM news WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'News not found' });
    }
    const results = await publishNewsToAll(req.params.id, req.body.platforms);
    res.json({ results });
  } catch (err) {
    console.error('Publish news error:', err);
    res.status(500).json({ error: 'Failed to publish news' });
  }
});

router.get('/:id/publications', async (req, res) => {
  try {
    const publications = await getNewsPublications(req.params.id);
    res.json({ publications });
  } catch (err) {
    console.error('Get publications error:', err);
    res.status(500).json({ error: 'Failed to fetch publications' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { title, content, imageData, mimeType, videoUrl } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM news WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'News not found' });
    }
    const updates = [];
    const values = [];
    let idx = 1;
    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
    if (content !== undefined) { updates.push(`content = $${idx++}`); values.push(content); }
    if (imageData !== undefined) { updates.push(`image_data = $${idx++}`); values.push(imageData); }
    if (mimeType !== undefined) { updates.push(`mime_type = $${idx++}`); values.push(mimeType); }
    if (videoUrl !== undefined) { updates.push(`video_url = $${idx++}`); values.push(videoUrl); }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);
    await pool.query(`UPDATE news SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    const updated = await pool.query('SELECT * FROM news WHERE id = $1', [req.params.id]);
    res.json({ news: updated.rows[0] });
  } catch (err) {
    console.error('Update news error:', err);
    res.status(500).json({ error: 'Failed to update news' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM news WHERE id = $1', [req.params.id]);
    res.json({ message: 'News deleted' });
  } catch (err) {
    console.error('Delete news error:', err);
    res.status(500).json({ error: 'Failed to delete news' });
  }
});

router.get('/:id/publish-image', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM news WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'News not found' });
    const news = rows[0];
    const { applyBrandOverlay } = await import('../services/brandIdentityService.js');
    const imageBuffer = news.image_data ? Buffer.from(news.image_data, 'base64') : null;
    const branded = await applyBrandOverlay(imageBuffer, news);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(branded);
  } catch (err) {
    console.error('Get publish image error:', err);
    res.status(500).end();
  }
});

export default router;
