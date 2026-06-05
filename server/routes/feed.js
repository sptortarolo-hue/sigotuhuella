import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT fp.*, mp.name as pet_name, mp.species, mp.avatar_image IS NOT NULL as has_avatar,
              u.display_name as user_name, u.avatar as user_avatar,
              COALESCE(lc.like_count, 0) as like_count,
              fl.id IS NOT NULL as user_liked
       FROM feed_posts fp
       JOIN my_pets mp ON mp.id = fp.my_pet_id
       JOIN users u ON u.id = fp.user_id
       LEFT JOIN (SELECT post_id, COUNT(*)::int as like_count FROM feed_likes GROUP BY post_id) lc ON lc.post_id = fp.id
       LEFT JOIN feed_likes fl ON fl.post_id = fp.id AND fl.user_id = $3
       ORDER BY fp.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, req.user.id]
    );

    const total = await pool.query('SELECT COUNT(*)::int as count FROM feed_posts');
    const hasMore = offset + limit < total.rows[0].count;

    res.json({ posts: result.rows, hasMore });
  } catch (err) {
    console.error('feed list error:', err);
    res.status(500).json({ error: 'Error al obtener feed' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { my_pet_id, title, description, event_id, photo_ids } = req.body;
    if (!my_pet_id || !title) {
      return res.status(400).json({ error: 'my_pet_id y title son requeridos' });
    }
    const ownerCheck = await pool.query(
      'SELECT id FROM my_pets WHERE id = $1 AND user_id = $2',
      [my_pet_id, req.user.id]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'No te pertenece esta mascota' });
    }
    const result = await pool.query(
      `INSERT INTO feed_posts (my_pet_id, user_id, title, description, event_id, photo_ids)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [my_pet_id, req.user.id, title, description || null, event_id || null, photo_ids || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('feed create error:', err);
    res.status(500).json({ error: 'Error al publicar' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM feed_posts WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Post no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('feed delete error:', err);
    res.status(500).json({ error: 'Error al eliminar' });
  }
});

router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO feed_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.id, req.user.id]
    );
    const count = await pool.query(
      'SELECT COUNT(*)::int as count FROM feed_likes WHERE post_id = $1',
      [req.params.id]
    );
    res.json({ liked: true, count: count.rows[0].count });
  } catch (err) {
    console.error('feed like error:', err);
    res.status(500).json({ error: 'Error al dar like' });
  }
});

router.post('/:id/unlike', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM feed_likes WHERE post_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    const count = await pool.query(
      'SELECT COUNT(*)::int as count FROM feed_likes WHERE post_id = $1',
      [req.params.id]
    );
    res.json({ liked: false, count: count.rows[0].count });
  } catch (err) {
    console.error('feed unlike error:', err);
    res.status(500).json({ error: 'Error al quitar like' });
  }
});

export default router;
