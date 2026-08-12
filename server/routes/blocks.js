import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// GET /api/blocks  -> users blocked by the current user
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ub.blocked_id, u.display_name, u.avatar_data, u.avatar_mime_type, u.avatar_type, ub.created_at
       FROM user_blocks ub
       JOIN users u ON u.id = ub.blocked_id
       WHERE ub.blocker_id = $1
       ORDER BY ub.created_at DESC`,
      [req.user.id]
    );
    res.json({ blocked: result.rows });
  } catch (err) {
    console.error('blocks list error:', err);
    res.status(500).json({ error: 'Error al obtener usuarios bloqueados' });
  }
});

// POST /api/blocks/:userId  -> block a user
router.post('/:userId', requireAuth, async (req, res) => {
  try {
    const blockedId = req.params.userId;
    if (blockedId === req.user.id) {
      return res.status(400).json({ error: 'No podés bloquearte a vos mismo' });
    }
    const target = await pool.query('SELECT id FROM users WHERE id = $1', [blockedId]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    await pool.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.user.id, blockedId]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('block error:', err);
    res.status(500).json({ error: 'Error al bloquear usuario' });
  }
});

// DELETE /api/blocks/:userId  -> unblock a user
router.delete('/:userId', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
      [req.user.id, req.params.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('unblock error:', err);
    res.status(500).json({ error: 'Error al desbloquear usuario' });
  }
});

export default router;
