import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, hashPassword, comparePassword } from '../auth.js';
import sharp from 'sharp';

const router = Router();

router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, display_name, phone, role, created_at,
              avatar_type, member_number, volunteer_status, badges
       FROM users ORDER BY created_at DESC`
    );
    res.json({ users: result.rows.map(u => ({ ...u, badges: u.badges || [] })) });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const { displayName, phone, role, badges } = req.body;
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
    if (badges !== undefined && isAdmin) {
      fields.push(`badges = $${idx++}::jsonb`);
      values.push(typeof badges === 'string' ? badges : JSON.stringify(badges));
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, display_name, phone, role, created_at, avatar_data, avatar_mime_type, avatar_type, member_number, volunteer_status, badges`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: { ...result.rows[0], badges: result.rows[0].badges || [] } });
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

router.put('/:id/avatar', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }
  const { imageData, mimeType } = req.body;
  if (!imageData || !mimeType) {
    return res.status(400).json({ error: 'Image data and mime type are required' });
  }
  let avatarData = imageData;
  let avatarMime = mimeType;
  try {
    const buffer = Buffer.from(imageData, 'base64');
    const resized = await sharp(buffer)
      .resize(200, 200, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 85 })
      .toBuffer();
    avatarData = resized.toString('base64');
    avatarMime = 'image/jpeg';
  } catch (sharpErr) {
    console.warn('Sharp resizing failed, using raw base64:', sharpErr.message);
  }

  try {
    const result = await pool.query(
      `UPDATE users SET avatar_data = $1, avatar_mime_type = $2, avatar_type = 'photo' WHERE id = $3
       RETURNING id, avatar_data, avatar_mime_type, avatar_type`,
      [avatarData, avatarMime, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ avatar: result.rows[0] });
  } catch (err) {
    console.error('Avatar upload database error:', err);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// ── User Stats & Gamification Level ─────────────────────────────────────────
router.get('/:id/stats', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }
  try {
    const statsRes = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE TRUE)                          AS total_reports,
        COUNT(*) FILTER (WHERE status = 'reunited')           AS reunited_count,
        COUNT(*) FILTER (WHERE status = 'sighted')            AS sighted_count,
        COUNT(*) FILTER (WHERE status = 'adopted')            AS adopted_count,
        COUNT(*) FILTER (WHERE status = 'for_adoption')       AS for_adoption_count
       FROM pets WHERE created_by = $1`,
      [req.params.id]
    );
    const s = statsRes.rows[0];
    const total = parseInt(s.total_reports) || 0;
    const reunited = parseInt(s.reunited_count) || 0;

    // Determine level
    let level = 'Voluntario';
    let levelCode = 'volunteer';
    let levelOrder = 1;
    if (total >= 5 || reunited >= 1) { level = 'Proteccionista'; levelCode = 'protector'; levelOrder = 2; }
    if (total >= 15 || reunited >= 3) { level = 'Héroe Local'; levelCode = 'hero'; levelOrder = 3; }
    if (total >= 30 || reunited >= 10) { level = 'Leyenda'; levelCode = 'legend'; levelOrder = 4; }

    // Next level thresholds
    const nextThresholds = [
      { order: 1, name: 'Proteccionista', reports: 5, reunited: 1 },
      { order: 2, name: 'Héroe Local', reports: 15, reunited: 3 },
      { order: 3, name: 'Leyenda', reports: 30, reunited: 10 },
    ];
    const next = nextThresholds.find(t => t.order > levelOrder) || null;

    res.json({
      stats: {
        total_reports: total,
        reunited_count: reunited,
        sighted_count: parseInt(s.sighted_count) || 0,
        adopted_count: parseInt(s.adopted_count) || 0,
        for_adoption_count: parseInt(s.for_adoption_count) || 0,
      },
      level: { name: level, code: levelCode, order: levelOrder },
      nextLevel: next,
    });
  } catch (err) {
    console.error('Get user stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;