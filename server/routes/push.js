import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

router.get('/vapid-key', (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

router.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Missing subscription data' });
  }

  try {
    const userId = req.user?.id || null;

    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth_key = $4`,
      [userId, endpoint, keys.p256dh, keys.auth]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

router.post('/register-device', async (req, res) => {
  const { fcm_token, platform } = req.body;
  if (!fcm_token) {
    return res.status(400).json({ error: 'Missing fcm_token' });
  }

  try {
    const userId = req.user?.id || null;

    await pool.query(
      `INSERT INTO device_tokens (user_id, fcm_token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (fcm_token) DO UPDATE SET user_id = $1, platform = $3`,
      [userId, fcm_token, platform || 'android']
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Device register error:', err);
    res.status(500).json({ error: 'Failed to save device token' });
  }
});

router.post('/unregister-device', async (req, res) => {
  const { fcm_token } = req.body;
  if (!fcm_token) {
    return res.status(400).json({ error: 'Missing fcm_token' });
  }

  try {
    await pool.query('DELETE FROM device_tokens WHERE fcm_token = $1', [fcm_token]);
    res.json({ success: true });
  } catch (err) {
    console.error('Device unregister error:', err);
    res.status(500).json({ error: 'Failed to remove device token' });
  }
});

router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint' });
  }

  try {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    res.json({ success: true });
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    res.status(500).json({ error: 'Failed to remove subscription' });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT endpoint FROM push_subscriptions WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    res.json({ subscribed: result.rows.length > 0 });
  } catch (err) {
    console.error('Push status error:', err);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

export default router;
