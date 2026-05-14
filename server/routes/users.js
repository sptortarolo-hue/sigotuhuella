import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, hashPassword, comparePassword } from '../auth.js';

const router = Router();

router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const { displayName, phone, role } = req.body;
  const isSelf = req.user.id === req.params.id;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (displayName !== undefined) {
      fields.push(`display_name = $${idx++}`);
      values.push(displayName);
    }
    if (phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(phone);
    }
    if (role !== undefined && isAdmin) {
      fields.push(`role = $${idx++}`);
      values.push(role);
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, display_name, phone, role, created_at`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.put('/:id/password', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'You can only change your own password' });
  }
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Current password and new password (min 6 chars) are required' });
  }
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const valid = await comparePassword(currentPassword, result.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const passwordHash = await hashPassword(newPassword);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.params.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.get('/:id/pets', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }
  try {
    const result = await pool.query(
      `SELECT p.*,
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.created_by = $1
      GROUP BY p.id
      ORDER BY p.created_at DESC`,
      [req.params.id]
    );
    res.json({ pets: result.rows });
  } catch (err) {
    console.error('Get user pets error:', err);
    res.status(500).json({ error: 'Failed to fetch pets' });
  }
});

export default router;