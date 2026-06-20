import { Router } from 'express';
import { getPending, markSent, markFailed, enqueue, getStatus, setEnabled, getAllGroups } from '../services/phoneRelayService.js';
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
    const id = await enqueue(to, text);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[Relay] send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/relay/admin-status (admin only) — relay status for panel
router.get('/admin-status', requireAdmin, async (req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err) {
    console.error('[Relay] status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/relay/admin-toggle (admin only) — toggle relay on/off
router.post('/admin-toggle', requireAdmin, async (req, res) => {
  try {
    const status = await getStatus();
    await setEnabled(!status.enabled);
    res.json({ enabled: !status.enabled });
  } catch (err) {
    console.error('[Relay] toggle error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/relay/groups-broadcast (admin only) — broadcast via relay to all active groups
router.post('/groups-broadcast', requireAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });

    const groups = await getAllGroups();
    if (groups.length === 0) return res.status(404).json({ error: 'No hay grupos activos' });

    const results = [];
    for (const group of groups) {
      try {
        const id = await enqueue(group.group_id, text.trim());
        results.push({ group: group.name, status: 'queued', id });
      } catch (err) {
        results.push({ group: group.name, status: 'error', error: err.message });
      }
    }
    res.json({ results });
  } catch (err) {
    console.error('[Relay] broadcast error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
