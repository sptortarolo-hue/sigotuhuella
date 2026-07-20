import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { sendPushToAll } from '../services/pushService.js';
import { publishNews } from '../services/newsPublisher.js';

const router = Router();

async function getPublications(newsId) {
  const r = await pool.query(
    'SELECT platform, status, platform_post_id, error_message, published_at, created_at FROM news_publications WHERE news_id = $1 ORDER BY platform',
    [newsId]
  );
  return r.rows;
}

router.get('/', async (req, res) => {
  try {
    const lite = req.query.lite !== '0';
    const baseColumns = lite
      ? `id, title, content, mime_type, video_url, source_url, type, related_pet_id, created_by, created_at, updated_at, (image_data IS NOT NULL) as has_image`
      : `*`;
    const result = await pool.query(
      `SELECT ${baseColumns}, u.display_name as author_name
       FROM news n
       LEFT JOIN users u ON u.id = n.created_by
       ORDER BY n.created_at DESC`
    );
    const news = result.rows;
    const publications = await Promise.all(news.map(n => getPublications(n.id)));
    for (let i = 0; i < news.length; i++) {
      news[i].publications = publications[i];
    }
    res.json({ news });
  } catch (err) {
    console.error('Get news error:', err);
    res.status(500).json({ error: 'Failed to fetch news' });
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
    const news = result.rows[0];
    news.publications = await getPublications(news.id);
    res.json({ news });
  } catch (err) {
    console.error('Get news error:', err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const { title, content, imageData, mimeType, videoUrl, sourceUrl, type, relatedPetId } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO news (title, content, image_data, mime_type, video_url, source_url, type, related_pet_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [title, content, imageData || null, mimeType || null, videoUrl || null,
       sourceUrl || null, type || 'manual', relatedPetId || null, req.user.id]
    );
    const newsItem = result.rows[0];

    const typeLabels = { reunited: 'Reencuentro', adopted: 'Adopción', manual: 'Novedad' };
    sendPushToAll({
      title: `📰 ${typeLabels[newsItem.type] || 'Novedad'}: ${newsItem.title}`,
      body: newsItem.content.substring(0, 100),
      url: `${process.env.FRONTEND_URL || 'https://sigotuhuella.online'}/novedad/${newsItem.id}`,
    }).catch(err => console.error('Push error:', err));

    if (newsItem.type === 'manual' && newsItem.image_data) {
      publishNews(newsItem.id).catch(err =>
        console.error('[NewsPublisher] Auto-publish error:', err.message)
      );
    }

    res.status(201).json({ news: newsItem });
  } catch (err) {
    console.error('Create news error:', err);
    res.status(500).json({ error: 'Failed to create news' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { title, content, imageData, mimeType, videoUrl, sourceUrl } = req.body;
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
    if (sourceUrl !== undefined) { updates.push(`source_url = $${idx++}`); values.push(sourceUrl); }
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

router.get('/:id/publications', async (req, res) => {
  try {
    const pubs = await getPublications(req.params.id);
    res.json({ publications: pubs });
  } catch (err) {
    console.error('Get publications error:', err);
    res.status(500).json({ error: 'Failed to fetch publications' });
  }
});

router.post('/:id/publish', requireAdmin, async (req, res) => {
  const { platforms } = req.body;
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({ error: 'Platforms array is required' });
  }
  try {
    const results = await publishNews(req.params.id, platforms);
    res.json({ results });
  } catch (err) {
    console.error('Publish news error:', err);
    res.status(500).json({ error: 'Failed to publish news' });
  }
});

export default router;
