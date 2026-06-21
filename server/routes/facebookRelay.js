import { Router } from 'express';
import multer from 'multer';
import pool from '../db.js';
import {
  getPendingTasks, markCompleted, markFailed, isEnabled, setEnabled,
  getStats, getFailedTasks, saveSessionFile, getSessionFile, clearSessionFile,
} from '../services/facebookRelayService.js';
import { requireAdmin } from '../auth.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

function relayAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token && token === process.env.RELAY_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

router.get('/fb/pending', relayAuth, async (req, res) => {
  try {
    const tasks = await getPendingTasks(parseInt(req.query.limit) || 5);
    res.json({ tasks });
  } catch (err) {
    console.error('[FB Relay] pending error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fb/completed', relayAuth, async (req, res) => {
  try {
    const { task_ids } = req.body;
    await markCompleted(task_ids || []);
    res.json({ success: true });
  } catch (err) {
    console.error('[FB Relay] markCompleted error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fb/failed', relayAuth, async (req, res) => {
  try {
    const { task_id, error } = req.body;
    await markFailed(task_id, error || 'Unknown error');
    res.json({ success: true });
  } catch (err) {
    console.error('[FB Relay] markFailed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/fb/session-file', relayAuth, async (req, res) => {
  try {
    const data = await getSessionFile();
    if (!data) return res.status(404).json({ error: 'No session file' });
    res.json({ data });
  } catch (err) {
    console.error('[FB Relay] session-file error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/fb/status', requireAdmin, async (req, res) => {
  try {
    const enabled = await isEnabled();
    const stats = await getStats();
    const hasSession = !!(await getSessionFile());
    res.json({ enabled, hasSession, stats });
  } catch (err) {
    console.error('[FB Relay] status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fb/toggle', requireAdmin, async (req, res) => {
  try {
    const enabled = await isEnabled();
    await setEnabled(!enabled);
    res.json({ enabled: !enabled });
  } catch (err) {
    console.error('[FB Relay] toggle error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fb/upload-session', requireAdmin, upload.single('session'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No session file provided' });
    }
    const base64 = req.file.buffer.toString('base64');
    await saveSessionFile(base64);
    res.json({ success: true });
  } catch (err) {
    console.error('[FB Relay] upload-session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fb/clear-session', requireAdmin, async (req, res) => {
  try {
    await clearSessionFile();
    res.json({ success: true });
  } catch (err) {
    console.error('[FB Relay] clear-session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/fb/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    console.error('[FB Relay] stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/fb/failed-tasks', requireAdmin, async (req, res) => {
  try {
    const tasks = await getFailedTasks(parseInt(req.query.limit) || 20);
    res.json({ tasks });
  } catch (err) {
    console.error('[FB Relay] failed-tasks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
