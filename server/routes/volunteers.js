import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();

router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT vr.*, u.email, u.display_name FROM volunteer_requests vr LEFT JOIN users u ON u.id = vr.user_id ORDER BY vr.created_at DESC'
    );
    res.json({ requests: result.rows });
  } catch (err) {
    console.error('Get volunteer requests error:', err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { fullName, residenceZone, whatsapp } = req.body;
  if (!fullName || !residenceZone || !whatsapp) {
    return res.status(400).json({ error: 'Full name, residence zone, and WhatsApp are required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO volunteer_requests (full_name, residence_zone, whatsapp, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [fullName, residenceZone, whatsapp, req.user.id]
    );
    res.status(201).json({ request: result.rows[0] });
  } catch (err) {
    console.error('Create volunteer request error:', err);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

router.post('/force-reset', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE volunteer_requests SET status = 'pending' WHERE status = 'reviewed' RETURNING id"
    );
    res.json({ message: `Converted ${result.rowCount} records to pending` });
  } catch (err) {
    console.error('Force reset error:', err);
    res.status(500).json({ error: 'Failed to force reset status' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'reviewed', 'accepted', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const requestResult = await pool.query(
      'SELECT * FROM volunteer_requests WHERE id = $1',
      [req.params.id]
    );
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const volunteer = requestResult.rows[0];

    if (status === 'accepted') {
      if (volunteer.status === 'suspended') {
        await pool.query(
          "UPDATE users SET volunteer_status = 'active' WHERE id = $1",
          [volunteer.user_id]
        );
      } else {
        const counterResult = await pool.query(
          "SELECT COUNT(*) as count FROM users WHERE member_number IS NOT NULL"
        );
        const nextNum = parseInt(counterResult.rows[0].count) + 1;
        const memberNumber = 'STH-' + String(nextNum).padStart(5, '0');
        const volunteerBadge = JSON.stringify([{ code: 'volunteer', awarded_at: new Date().toISOString() }]);

        await pool.query(
          `UPDATE users SET
            member_number = COALESCE(member_number, $1),
            volunteer_status = 'active',
            badges = CASE
              WHEN badges IS NULL OR badges = '[]'::jsonb THEN $2::jsonb
              ELSE badges || $2::jsonb
            END
          WHERE id = $3`,
          [memberNumber, volunteerBadge, volunteer.user_id]
        );
      }

      const result = await pool.query(
        'UPDATE volunteer_requests SET status = $1 WHERE id = $2 RETURNING *',
        [status, req.params.id]
      );
      res.json({ request: result.rows[0] });
    } else if (status === 'suspended') {
      await pool.query(
        "UPDATE users SET volunteer_status = 'suspended' WHERE id = $1",
        [volunteer.user_id]
      );
      const result = await pool.query(
        'UPDATE volunteer_requests SET status = $1 WHERE id = $2 RETURNING *',
        [status, req.params.id]
      );
      res.json({ request: result.rows[0] });
    } else {
      const result = await pool.query(
        'UPDATE volunteer_requests SET status = $1 WHERE id = $2 RETURNING *',
        [status, req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }
      res.json({ request: result.rows[0] });
    }
  } catch (err) {
    console.error('Update volunteer request error:', err);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

export default router;
