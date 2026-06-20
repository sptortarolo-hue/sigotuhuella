import { Router } from 'express';
import { getPending, markSent, markFailed } from '../services/phoneRelayService.js';
import { requireAdmin } from '../auth.js';

const router = Router();

function relayAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token && token === process.env.RELAY_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// GET /api/relay/pending — phone polls this
router.get('/pending', relayAuth, async (req, res) => {
  try {
    const messages = await getPending(parseInt(req.query.limit) || 10);
    res.json({ messages });
  } catch (err) {
    console.error('[Relay] pending error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/relay/sent — phone marks messages as sent
router.post('/sent', relayAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    await markSent(ids);
    res.json({ success: true });
  } catch (err) {
    console.error('[Relay] markSent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/relay/failed — phone marks messages as failed
router.post('/failed', relayAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    await markFailed(ids);
    res.json({ success: true });
  } catch (err) {
    console.error('[Relay] markFailed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/relay/send (admin only) — enqueue a message
router.post('/send', requireAdmin, async (req, res) => {
  try {
    const { to, text } = req.body;
    if (!to || !text) return res.status(400).json({ error: 'to and text required' });
    const { enqueue } = await import('../services/phoneRelayService.js');
    const id = await enqueue(to, text);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[Relay] send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
