import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.get('/verify/:memberNumber', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT display_name, avatar_data, avatar_mime_type, avatar_type,
              member_number, volunteer_status, badges
       FROM users WHERE member_number = $1`,
      [req.params.memberNumber]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const member = result.rows[0];
    res.json({ member: { ...member, badges: member.badges || [] } });
  } catch (err) {
    console.error('Verify member error:', err);
    res.status(500).json({ error: 'Failed to verify member' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, display_name, phone, role, created_at,
              avatar_data, avatar_mime_type, avatar_type,
              member_number, volunteer_status, badges
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    res.json({ user: { ...user, badges: user.badges || [] } });
  } catch (err) {
    console.error('Get my member data error:', err);
    res.status(500).json({ error: 'Failed to get member data' });
  }
});

export default router;
