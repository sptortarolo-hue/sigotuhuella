import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../auth.js';
import { getBaileysStatus, getBaileysQR, reconnectBaileys, sendBaileysMessage, requestPairingBaileys } from '../services/whatsappBaileysClient.js';

const router = Router();

router.get('/whatsapp-web/status', requireAdmin, async (req, res) => {
  try {
    const baileysStatus = getBaileysStatus();
    const settings = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('whatsapp_web_enabled', 'whatsapp_web_phone', 'whatsapp_web_session_path')"
    );
    const config = Object.fromEntries(settings.rows.map(r => [r.key, r.value]));

    res.json({ ...baileysStatus, ...config });
  } catch (err) {
    console.error('[WhatsAppWeb] Status error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/whatsapp-web/qr', requireAdmin, async (req, res) => {
  try {
    const qr = getBaileysQR();
    if (qr) {
      res.json({ qr });
    } else {
      const { status } = getBaileysStatus();
      res.json({ qr: null, status });
    }
  } catch (err) {
    console.error('[WhatsAppWeb] QR error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/whatsapp-web/reconnect', requireAdmin, async (req, res) => {
  try {
    await reconnectBaileys();
    res.json({ success: true, status: getBaileysStatus() });
  } catch (err) {
    console.error('[WhatsAppWeb] Reconnect error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/whatsapp-web/request-pairing', requireAdmin, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    const pairingCode = await requestPairingBaileys(phone);
    const formatted = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;
    res.json({ pairingCode: formatted });
  } catch (err) {
    console.error('[WhatsAppWeb] Pairing error:', err);
    res.status(502).json({ error: err.message });
  }
});

router.post('/whatsapp-web/send-test', requireAdmin, async (req, res) => {
  try {
    const { phone, text } = req.body;
    if (!phone || !text) return res.status(400).json({ error: 'Phone and text are required' });

    const sent = await sendBaileysMessage(phone, text);
    if (sent) {
      res.json({ success: true });
    } else {
      res.status(502).json({ error: 'Baileys client not ready', status: getBaileysStatus().status });
    }
  } catch (err) {
    console.error('[WhatsAppWeb] Send test error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
