import { Router } from 'express';
import multer from 'multer';
import pool from '../db.js';
import {
  getPendingTasks, markCompleted, markFailed, isEnabled, setEnabled,
  getStats, getFailedTasks, saveSessionFile, getSessionFile, clearSessionFile,
} from '../services/facebookRelayService.js';
import { requireAdmin } from '../auth.js';
import { searchPets } from '../services/phoneRelayService.js';
import { enqueuePublishTask } from '../services/facebookRelayService.js';
import { broadcastFbAdoptionPets } from '../services/whatsappService.js';

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
    const adoptionSetting = await pool.query("SELECT value FROM settings WHERE key = 'fb_adoption_broadcast_enabled'");
    const adoptionBroadcastEnabled = adoptionSetting.rows[0]?.value === 'true';
    res.json({ enabled, hasSession, stats, adoptionBroadcastEnabled });
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
    const { fb_group_id, message } = req.body;
    if (!fb_group_id || !message) {
      return res.status(400).json({ error: 'fb_group_id and message are required' });
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

const fbStatusLabels = {
  lost: '🐾 SE PERDIÓ', retained: '🔄 RETENIDO', sighted: '👀 AVISTADO',
  for_adoption: '❤️ EN ADOPCIÓN', adopted: '✅ ADOPTADO',
  reunited: '🎉 REENCUENTRO', accidented: '🚑 ACCIDENTADO',
  needs_attention: '⚠️ NECESITA ATENCIÓN',
};
const fbSpeciesLabel = { dog: 'Perro', cat: 'Gato' };
const fbGenderLabel = { male: 'Macho', female: 'Hembra' };

router.post('/fb/broadcast-pet', requireAdmin, async (req, res) => {
  try {
    const { petId, groups } = req.body;
    if (!petId) return res.status(400).json({ error: 'petId required' });
    if (!groups || !Array.isArray(groups) || groups.length === 0)
      return res.status(400).json({ error: 'groups array required' });

    const pet = (await pool.query('SELECT * FROM pets WHERE id = $1', [petId])).rows[0];
    if (!pet) return res.status(404).json({ error: 'Mascota no encontrada' });

    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
    const tag = fbStatusLabels[pet.status] || '🐾 MASCOTA';
    const species = fbSpeciesLabel[pet.species] || pet.species || 'Mascota';
    const gender = fbGenderLabel[pet.gender] || '';
    const ageGender = [gender, pet.age].filter(Boolean).join(' · ');
    const hashtags = '#SigoTuHuella #MascotasPerdidas #AdoptaNoCompres';

    const caption = [
      tag,
      pet.name ? `Nombre: ${pet.name}` : '',
      `${species}${pet.breed ? ' · ' + pet.breed : ''}`,
      ageGender || '',
      pet.color ? `🎨 ${pet.color}` : '',
      pet.location ? `📍 ${pet.location}` : '',
      pet.contact_info ? `📞 ${pet.contact_info}` : '',
      '',
      pet.description ? pet.description.substring(0, 500) : '',
      '',
      `🔗 ${frontendUrl}/pet/${pet.id}`,
      '',
      hashtags,
    ].filter(Boolean).join('\n');

    const imagesResult = await pool.query(
      'SELECT image_data FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 5',
      [petId]
    );
    const imageUrls = imagesResult.rows.length > 0
      ? [`${frontendUrl}/api/images/pet/${pet.id}/cover`, ...imagesResult.rows.slice(1).map((_, i) => `${frontendUrl}/api/images/pet/${pet.id}/${i + 1}`)]
      : [`${frontendUrl}/api/images/pet/${pet.id}/cover`];

    const results = [];
    for (const group of groups) {
      try {
        const { taskId } = await enqueuePublishTask(petId, group.id, group.fb_group_id, caption, imageUrls);
        results.push({ groupId: group.fb_group_id, groupName: group.name || group.id, status: 'queued', taskId });
      } catch (err) {
        results.push({ groupId: group.fb_group_id, groupName: group.name || group.id, status: 'error', error: err.message });
      }
    }

    res.json({ results, caption });
  } catch (err) {
    console.error('[FB Relay] broadcast-pet error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/fb/broadcast-adoptions', requireAdmin, async (req, res) => {
  try {
    await broadcastFbAdoptionPets();
    res.json({ success: true, message: 'Broadcast Facebook de adopciones ejecutado' });
  } catch (err) {
    console.error('[FB Relay] broadcast-adoptions error:', err.message);
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
    const { screenshot, ariaLabels, lexicalInfo, url, html } = req.body;
    saveDebug('last', { ariaLabels, lexicalInfo, url, html, timestamp: new Date().toISOString() });
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
