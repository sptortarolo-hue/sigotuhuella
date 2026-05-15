import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin, requireAuth } from '../auth.js';

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
  const { title, content, imageData, mimeType, videoUrl, type, relatedPetId } = req.body;
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
    res.status(201).json({ news: result.rows[0] });
  } catch (err) {
    console.error('Create news error:', err);
    res.status(500).json({ error: 'Failed to create news' });
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

export default router;
