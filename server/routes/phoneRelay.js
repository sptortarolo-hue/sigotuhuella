import { Router } from 'express';
import { getPending, markSent, markFailed, enqueue, getStatus, setEnabled, getAllGroups } from '../services/phoneRelayService.js';
import { requireAdmin } from '../auth.js';

const router = Router();

function relayAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token && token === process.env.RELAY_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

router.get('/pending', relayAuth, async (req, res) => {
  try {
    const messages = await getPending(parseInt(req.query.limit) || 10);
    res.json({ messages });
  } catch (err) {
    console.error('[Relay] pending error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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

router.post('/send', requireAdmin, async (req, res) => {
  try {
    const { to, text, image_url } = req.body;
    if (!to) return res.status(400).json({ error: 'to required' });
    if (!text && !image_url) return res.status(400).json({ error: 'text or image_url required' });
    const id = await enqueue(to, text || '', image_url || null);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[Relay] send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin-status', requireAdmin, async (req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err) {
    console.error('[Relay] status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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

router.post('/groups-broadcast', requireAdmin, async (req, res) => {
  try {
    const { text, image_url } = req.body;
    if (!text && !image_url) return res.status(400).json({ error: 'text or image_url required' });

    const groups = await getAllGroups();
    if (groups.length === 0) return res.status(404).json({ error: 'No hay grupos activos' });

    const results = [];
    for (const group of groups) {
      try {
        const id = await enqueue(group.group_id, text || '', image_url || null);
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
