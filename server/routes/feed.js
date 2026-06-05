import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../auth.js';
import { sendPushToUser } from '../services/pushService.js';
import { awardPoints, checkChallenge } from './gamification.js';

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
      [my_pet_id, req.user.id, title || null, description || null, event_id || null, photo_ids || null]
    );

    awardPoints(req.user.id, 5, 'Nueva publicación en comunidad');
    checkChallenge(req.user.id, 'first_post');
    checkChallenge(req.user.id, 'five_posts');

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

    const post = await pool.query(
      'SELECT user_id, title FROM feed_posts WHERE id = $1',
      [req.params.id]
    );
    if (post.rows.length > 0 && post.rows[0].user_id !== req.user.id) {
      sendPushToUser(post.rows[0].user_id, {
        title: '❤️ Nuevo like',
        body: `A alguien le gustó tu publicación "${post.rows[0].title}"`,
        tag: `feed-like-${req.params.id}`,
      });
      awardPoints(post.rows[0].user_id, 1, 'Recibió un like');
      checkChallenge(post.rows[0].user_id, 'first_like_received');
      checkChallenge(post.rows[0].user_id, 'ten_likes_received');
    }

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

router.get('/:id/comments', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT fc.*, u.display_name as user_name, u.avatar_data IS NOT NULL as has_avatar, u.avatar_type
       FROM feed_comments fc
       JOIN users u ON u.id = fc.user_id
       WHERE fc.post_id = $1
       ORDER BY fc.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('comments list error:', err);
    res.status(500).json({ error: 'Error al obtener comentarios' });
  }
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'El comentario no puede estar vacío' });
    }
    const result = await pool.query(
      `INSERT INTO feed_comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, req.user.id, content.trim()]
    );
    const comment = result.rows[0];

    const post = await pool.query('SELECT user_id, title FROM feed_posts WHERE id = $1', [req.params.id]);
    if (post.rows.length > 0 && post.rows[0].user_id !== req.user.id) {
      sendPushToUser(post.rows[0].user_id, {
        title: '💬 Nuevo comentario',
        body: `${req.user.display_name || 'Alguien'} comentó en "${post.rows[0].title}"`,
        tag: `feed-comment-${req.params.id}`,
      });
    }

    awardPoints(req.user.id, 2, 'Comentó en una publicación');

    const enriched = await pool.query(
      `SELECT fc.*, u.display_name as user_name, u.avatar_data IS NOT NULL as has_avatar, u.avatar_type
       FROM feed_comments fc JOIN users u ON u.id = fc.user_id WHERE fc.id = $1`,
      [comment.id]
    );

    res.status(201).json(enriched.rows[0]);
  } catch (err) {
    console.error('comment create error:', err);
    res.status(500).json({ error: 'Error al comentar' });
  }
});

router.delete('/:postId/comments/:commentId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM feed_comments WHERE id = $1 AND user_id = $2',
      [req.params.commentId, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('comment delete error:', err);
    res.status(500).json({ error: 'Error al eliminar comentario' });
  }
});

export default router;
