import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../auth.js';
import {
  verifyWebhook,
  processIncomingMessage,
  sendMessage,
  sendInteractiveButtons,
  downloadMedia,
  isWhatsAppEnabled,
} from '../services/whatsappService.js';

const router = Router();

// GET /api/whatsapp/webhook — Meta webhook verification
router.get('/webhook', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check verify token from settings
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_verify_token'");
    const expectedToken = result.rows[0]?.value || '';
    if (mode === 'subscribe' && token === expectedToken) {
      return res.status(200).send(challenge);
    }
  } catch (err) {
    console.error('Webhook verify error:', err);
  }
  res.status(403).send('Verification failed');
});

// POST /api/whatsapp/webhook — Receive incoming messages
router.post('/webhook', async (req, res) => {
  // Always respond 200 quickly to prevent Meta from retrying
  res.status(200).send('OK');

  try {
    const enabled = await isWhatsAppEnabled();
    if (!enabled) return;

    const parsed = processIncomingMessage(req.body);
    if (!parsed) return;

    // Save message to DB
    const msgResult = await pool.query(
      `INSERT INTO whatsapp_messages (wa_message_id, wa_from, sender_name, message_type, text_body, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (wa_message_id) DO NOTHING
       RETURNING id`,
      [parsed.waMessageId, parsed.from, parsed.profileName, parsed.messageType, parsed.textBody]
    );

    if (msgResult.rows.length === 0) return; // duplicate message

    const savedId = msgResult.rows[0].id;

    // Download image if present
    let imageData = null;
    let imageMime = null;
    if (parsed.mediaId) {
      try {
        const media = await downloadMedia(parsed.mediaId);
        imageData = media.buffer.toString('base64');
        imageMime = media.mimeType;
      } catch (e) {
        console.error('Media download error:', e);
      }
    }

    // Update message with image and location data
    await pool.query(
      `UPDATE whatsapp_messages SET image_data = $1, image_mime = $2, location_lat = $3, location_lng = $4 WHERE id = $5`,
      [imageData, imageMime, parsed.locationLat, parsed.locationLng, savedId]
    );

    // Check if sender has a user account
    const userResult = await pool.query(
      "SELECT id, display_name, email FROM users WHERE phone LIKE $1 OR phone LIKE $2 LIMIT 1",
      [`%${parsed.from.slice(-8)}`, `%${parsed.from.slice(-10)}`]
    );
    const user = userResult.rows[0] || null;

    if (user) {
      await pool.query('UPDATE whatsapp_messages SET user_id = $1 WHERE id = $2', [user.id, savedId]);
    }

    // Determine the report type from the message
    const text = (parsed.textBody || '').toLowerCase();
    let reportType = 'sighted';
    if (text.includes('atención') || text.includes('herid')) reportType = 'needs_attention';
    else if (text.includes('accident') || text.includes('atropell')) reportType = 'accidented';

    // Send greeting
    const greetingResult = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_greeting'");
    const greeting = greetingResult.rows[0]?.value || '';

    const replyText = user
      ? `🐾 ¡Gracias ${user.display_name || 'por tu reporte'}! Estamos procesando tu información.\n\nTu reporte fue vinculado a tu perfil. Te notificaremos si hay novedades.`
      : `${greeting}\n\n📝 ¿Ya tenés cuenta en Sigo Tu Huella? Registrate gratis para vincular tus reportes: https://sigotuhuella.online/registro`;

    try {
      await sendMessage(parsed.from, replyText);
    } catch (e) {
      console.error('Error sending WhatsApp reply:', e);
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

// GET /api/whatsapp/messages — admin list
router.get('/messages', requireAdmin, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let sql = `SELECT wm.*, p.name as pet_name, u.display_name as user_name
               FROM whatsapp_messages wm
               LEFT JOIN pets p ON wm.pet_id = p.id
               LEFT JOIN users u ON wm.user_id = u.id`;
    const params = [];
    if (status) {
      sql += ' WHERE wm.status = $1';
      params.push(status);
    }
    sql += ' ORDER BY wm.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing WhatsApp messages:', err);
    res.status(500).json({ error: 'Error al listar mensajes' });
  }
});

// GET /api/whatsapp/messages/:id — admin detail
router.get('/messages/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT wm.*, p.name as pet_name, p.status as pet_status,
              u.display_name as user_name, u.email as user_email
       FROM whatsapp_messages wm
       LEFT JOIN pets p ON wm.pet_id = p.id
       LEFT JOIN users u ON wm.user_id = u.id
       WHERE wm.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching message:', err);
    res.status(500).json({ error: 'Error al obtener mensaje' });
  }
});

export default router;
