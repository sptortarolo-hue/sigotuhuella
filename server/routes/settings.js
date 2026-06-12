import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../auth.js';

const router = Router();

// GET /api/settings — list all settings (admin only)
router.get('/', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query('SELECT key, value, updated_at FROM settings ORDER BY key');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// GET /api/settings/public — public settings (WhatsApp number, enabled status)
router.get('/public', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT key, value FROM settings WHERE key IN ('whatsapp_enabled', 'whatsapp_business_phone', 'banner_chapita_visible', 'banner_chapita_price', 'banner_chapita_is_free')`
    );
    const data = {};
    result.rows.forEach(r => { data[r.key] = r.value; });
    res.json(data);
  } catch (err) {
    console.error('Error fetching public settings:', err);
    res.status(500).json({ error: 'Error al obtener configuración pública' });
  }
});

// POST /api/settings — update single setting
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: '{key, value} are required' });
    }
    await pool.query(
      'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
      [key, String(value)]
    );
    res.json({ key, value });
  } catch (err) {
    console.error('Error processing settings:', err);
    res.status(500).json({ error: 'Error al procesar configuración' });
  }
});

// POST /api/settings/batch — batch fetch settings
router.post('/batch', requireAdmin, async (req, res) => {
  try {
    const { keys } = req.body;
    if (!keys || !Array.isArray(keys)) {
      return res.status(400).json({ error: 'keys array is required' });
    }
    const placeholders = keys.map((_, i) => '$' + (i + 1)).join(',');
    const result = await pool.query(
      `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
      keys
    );
    const data = {};
    result.rows.forEach(r => { data[r.key] = r.value; });
    res.json(data);
  } catch (err) {
    console.error('Error batch fetching settings:', err);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// PUT /api/settings/:key — update setting (admin only)
router.put('/:key', requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'Value is required' });
    }
    await pool.query(
      'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
      [key, String(value)]
    );
    res.json({ key, value });
  } catch (err) {
    console.error('Error updating setting:', err);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

export default router;
