import { Router } from 'express';
import multer from 'multer';
import pool from '../db.js';
import {
  getPendingTasks, markCompleted, markFailed, isEnabled, setEnabled,
  getStats, getFailedTasks, saveSessionFile, getSessionFile, clearSessionFile,
  saveProfile, getProfile, clearProfile, saveSessionData, getSessionData,
} from '../services/facebookRelayService.js';
import { requireAdmin } from '../auth.js';
import { searchPets } from '../services/phoneRelayService.js';
import { broadcastAdoptionPet } from '../services/whatsappService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

function relayAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token && token === process.env.RELAY_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

router.get('/fb/pending', relayAuth, async (req, res) => {
  try {
    if (!(await isEnabled())) return res.json({ tasks: [], disabled: true });
    const limit = parseInt(req.query.limit) || 5;
    const action = req.query.action ? String(req.query.action).split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const excludeAction = req.query.exclude_action ? String(req.query.exclude_action).split(',').map(s => s.trim()).filter(Boolean) : undefined;
    const tasks = await getPendingTasks(limit, { action, excludeAction });
    res.json({ tasks });
  } catch (err) {
    console.error('[FB Relay] pending error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fb/completed', relayAuth, async (req, res) => {
  try {
    const { task_updates } = req.body;
    await markCompleted(task_updates || []);
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
    const hasProfile = !!(await getProfile());
    const hasSessionData = !!(await getSessionData());
    const adoptionSetting = await pool.query("SELECT value FROM settings WHERE key = 'fb_adoption_broadcast_enabled'");
    const adoptionBroadcastEnabled = adoptionSetting.rows[0]?.value === 'true';
    let lastHeartbeat = null;
    try {
      const hbRow = await pool.query("SELECT value FROM settings WHERE key = 'fb_relay_last_heartbeat'");
      if (hbRow.rows[0]?.value) lastHeartbeat = JSON.parse(hbRow.rows[0].value);
    } catch (e) {}
    res.json({ enabled, hasSession, hasProfile, hasSessionData, stats, adoptionBroadcastEnabled, lastHeartbeat });
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
    const raw = req.file.buffer.toString('utf-8');
    const parsed = JSON.parse(raw);
    const cookies = parsed.cookies || parsed;
    const count = Array.isArray(cookies) ? cookies.length : 0;
    const base64 = Buffer.from(raw).toString('base64');
    await saveSessionFile(base64);
    res.json({ success: true, cookieCount: count });
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

router.post('/fb/upload-profile', upload.single('profile'), async (req, res) => {
  try {
    const authHeader = req.headers['authorization']?.replace('Bearer ', '');
    const isRelay = authHeader === process.env.RELAY_TOKEN;
    const isAdmin = req.user?.role === 'admin';
    if (!isRelay && !isAdmin) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let base64;
    let size;
    if (req.file) {
      base64 = req.file.buffer.toString('base64');
      size = req.file.size;
    } else if (req.body?.data) {
      base64 = req.body.data;
      size = Math.round(Buffer.from(base64, 'base64').length);
    } else {
      return res.status(400).json({ error: 'No profile data provided' });
    }
    await saveProfile(base64);
    console.log(`[FB Relay] Profile uploaded: ${size} bytes`);
    res.json({ success: true, size });
  } catch (err) {
    console.error('[FB Relay] upload-profile error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/fb/download-profile', relayAuth, async (req, res) => {
  try {
    const data = await getProfile();
    if (!data) return res.status(404).json({ error: 'No profile backup' });
    res.json({ data });
  } catch (err) {
    console.error('[FB Relay] download-profile error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fb/session-data', relayAuth, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No session data provided' });
    await saveSessionData(JSON.stringify(data));
    res.json({ success: true });
  } catch (err) {
    console.error('[FB Relay] session-data error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/fb/session-data', relayAuth, async (req, res) => {
  try {
    const data = await getSessionData();
    if (!data) return res.status(404).json({ error: 'No session data' });
    res.json({ data: JSON.parse(data) });
  } catch (err) {
    console.error('[FB Relay] session-data error:', err.message);
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

// Descarga del script nativo (AutoJs6). GitHub limita el raw (429) y el repo
// es privado, así que el celular baja la última versión desde el propio VPS.
// Acepta Authorization: Bearer <RELAY_TOKEN> o ?token=<RELAY_TOKEN> (más fácil
// de pegar en el navegador del celular).
router.get('/fb/script', (req, res) => {
  try {
    const hdr = req.headers['authorization']?.replace('Bearer ', '');
    const q = req.query.token;
    if (hdr !== process.env.RELAY_TOKEN && q !== process.env.RELAY_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const scriptPath = path.join(__dirname, '..', '..', 'fb-native-relay.js');
    if (!existsSync(scriptPath)) {
      return res.status(404).json({ error: 'Script not found on server' });
    }
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'no-cache');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(readFileSync(scriptPath, 'utf-8'));
  } catch (err) {
    console.error('[FB Relay] script error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/fb/groups', relayAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, url, fb_group_id FROM facebook_groups WHERE is_active = true ORDER BY name ASC"
    );
    res.json({ groups: result.rows });
  } catch (err) {
    console.error('[FB Relay] groups error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fb/add-test-task', requireAdmin, async (req, res) => {
  try {
    const { fb_group_id, message, target_url } = req.body;
    if (!fb_group_id || !message) {
      return res.status(400).json({ error: 'fb_group_id and message are required' });
    }
    if (target_url) {
      const result = await pool.query(
        `INSERT INTO fb_relay_tasks (fb_group_id, message, action, target_url, status) VALUES ($1, $2, 'share', $3, 'pending') RETURNING id`,
        [fb_group_id, message, target_url]
      );
      return res.json({ success: true, task_id: result.rows[0].id, action: 'share' });
    }
    const result = await pool.query(
      `INSERT INTO fb_relay_tasks (fb_group_id, message, status) VALUES ($1, $2, 'pending') RETURNING id`,
      [fb_group_id, message]
    );
    res.json({ success: true, task_id: result.rows[0].id });
  } catch (err) {
    console.error('[FB Relay] add-test-task error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/fb/pets', requireAdmin, async (req, res) => {
  try {
    const { category, search } = req.query;
    const pets = await searchPets(category || 'reportados', search || '');
    res.json({ pets });
  } catch (err) {
    console.error('[FB Relay] pets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/fb/groups-ui', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, fb_group_id FROM facebook_groups WHERE is_active = true ORDER BY name ASC"
    );
    res.json({ groups: result.rows });
  } catch (err) {
    console.error('[FB Relay] groups-ui error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fb/broadcast-adoptions', requireAdmin, async (req, res) => {
  try {
    await broadcastAdoptionPet();
    res.json({ success: true, message: 'Broadcast de adopciones ejecutado (FB + WA)' });
  } catch (err) {
    console.error('[FB Relay] broadcast-adoptions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fb/clear-queue', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM fb_relay_tasks WHERE status = 'pending'");
    res.json({ deleted: result.rowCount });
  } catch (err) {
    console.error('[FB Relay] clear-queue error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Debug dump storage
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEBUG_DIR = path.join(__dirname, '..', '.fb_debug');

function saveDebug(key, data) {
  if (!existsSync(DEBUG_DIR)) mkdirSync(DEBUG_DIR, { recursive: true });
  writeFileSync(path.join(DEBUG_DIR, `${key}.json`), JSON.stringify(data, null, 2));
}

router.post('/fb-debug', relayAuth, async (req, res) => {
  try {
    const { screenshot, ariaLabels, lexicalInfo, url, html, label, totalDialogs, dialogTag, dialogRole, items, uiNodes } = req.body;
    // Heartbeat del relay nativo: no pisar el dump de debug, solo guardar el
    // timestamp del último heartbeat + estado para mostrarlo en el panel.
    if (label === 'heartbeat') {
      const hb = req.body.heartbeat || {};
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ('fb_relay_last_heartbeat', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [JSON.stringify({ timestamp: new Date().toISOString(), ...hb })]
      );
      return res.json({ success: true });
    }
    saveDebug('last', {
      ariaLabels, lexicalInfo, url, html, label,
      diag4: { totalDialogs, dialogTag, dialogRole, items },
      uiNodes,
      timestamp: new Date().toISOString(),
    });
    if (screenshot) {
      const buf = Buffer.from(screenshot, 'base64');
      writeFileSync(path.join(DEBUG_DIR, 'last_screenshot.png'), buf);
    }
    console.log('[FB Relay] Debug dump saved from relay');
    res.json({ success: true });
  } catch (err) {
    console.error('[FB Relay] fb-debug error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/fb-debug-view', requireAdmin, async (req, res) => {
  try {
    const debugPath = path.join(DEBUG_DIR, 'last.json');
    if (!existsSync(debugPath)) return res.status(404).json({ error: 'No debug dump available' });
    const data = JSON.parse(readFileSync(debugPath, 'utf-8'));
    const screenshotPath = path.join(DEBUG_DIR, 'last_screenshot.png');
    if (existsSync(screenshotPath)) {
      data.screenshot = readFileSync(screenshotPath).toString('base64');
    }
    res.json(data);
  } catch (err) {
    console.error('[FB Relay] fb-debug-view error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
