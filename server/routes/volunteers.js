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

router.put('/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'reviewed', 'accepted'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const result = await pool.query(
      'UPDATE volunteer_requests SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    res.json({ request: result.rows[0] });
  } catch (err) {
    console.error('Update volunteer request error:', err);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

export default router;
