import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../auth.js';
import {
  processIncomingMessage,
  sendMessage,
  sendInteractiveButtons,
  isWhatsAppEnabled,
} from '../services/whatsappService.js';
import { processMessage, showMenu } from '../services/whatsappBot.js';

const router = Router();

// GET /api/whatsapp/diagnostic — check WhatsApp config (public)
router.get('/diagnostic', async (req, res) => {
  try {
    const keys = ['whatsapp_enabled', 'whatsapp_phone_number_id', 'whatsapp_access_token', 'whatsapp_verify_token', 'whatsapp_business_phone'];
    const rows = (await pool.query('SELECT key, value FROM settings WHERE key = ANY($1)', [keys])).rows;
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));

    const lastWebhook = (await pool.query(
      "SELECT created_at FROM whatsapp_messages ORDER BY created_at DESC LIMIT 1"
    )).rows[0];

    const activeConvs = (await pool.query(
      "SELECT COUNT(*) FROM whatsapp_conversations WHERE status = 'active'"
    )).rows[0].count;

    res.json({
      enabled: settings.whatsapp_enabled === 'true',
      has_phone_number_id: !!settings.whatsapp_phone_number_id,
      has_access_token: !!settings.whatsapp_access_token,
      has_verify_token: !!settings.whatsapp_verify_token,
      has_business_phone: !!settings.whatsapp_business_phone,
      phone_number_id: settings.whatsapp_phone_number_id || null,
      business_phone: settings.whatsapp_business_phone || null,
      access_token_preview: settings.whatsapp_access_token ? settings.whatsapp_access_token.substring(0, 10) + '...' : null,
      last_webhook_at: lastWebhook?.created_at || null,
      active_conversations: parseInt(activeConvs),
    });
  } catch (err) {
    console.error('Diagnostic error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/webhook — Meta webhook verification
router.get('/webhook', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

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
  res.status(200).send('OK');

  try {
    const enabled = await isWhatsAppEnabled();
    if (!enabled) return;

    const parsed = processIncomingMessage(req.body);
    if (!parsed) return;

    await processMessage(parsed);
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

// GET /api/whatsapp/conversations — admin list
router.get('/conversations', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT c.*,
       (SELECT COUNT(*) FROM whatsapp_messages m WHERE m.conversation_id = c.id) as message_count,
       (SELECT text_body FROM whatsapp_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
       (SELECT message_type FROM whatsapp_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_type,
       (SELECT created_at FROM whatsapp_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
     FROM whatsapp_conversations c`;
    const params = [];
    if (status) {
      sql += ' WHERE c.status = $1';
      params.push(status);
    }
    sql += ' ORDER BY c.last_message_at DESC';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing conversations:', err);
    res.status(500).json({ error: 'Error al listar conversaciones' });
  }
});

// GET /api/whatsapp/conversations/:id — messages in conversation
router.get('/conversations/:id', requireAdmin, async (req, res) => {
  try {
    const conv = await pool.query('SELECT * FROM whatsapp_conversations WHERE id = $1', [req.params.id]);
    if (conv.rows.length === 0) return res.status(404).json({ error: 'Conversación no encontrada' });

    const messages = await pool.query(
      `SELECT wm.*, u.display_name as user_name
       FROM whatsapp_messages wm
       LEFT JOIN users u ON wm.user_id = u.id
       WHERE wm.conversation_id = $1
       ORDER BY wm.created_at ASC`,
      [req.params.id]
    );
    res.json({ conversation: conv.rows[0], messages: messages.rows });
  } catch (err) {
    console.error('Error fetching conversation:', err);
    res.status(500).json({ error: 'Error al obtener conversación' });
  }
});

// POST /api/whatsapp/conversations/:id/reply — admin sends message
router.post('/conversations/:id/reply', requireAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'El mensaje no puede estar vacío' });

    const conv = (await pool.query('SELECT * FROM whatsapp_conversations WHERE id = $1', [req.params.id])).rows[0];
    if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });

    await sendMessage(conv.wa_from, `✏️ *${req.user?.display_name || 'Admin'} (Sigo Tu Huella):*\n\n${text.trim()}`);

    await pool.query(
      `INSERT INTO whatsapp_messages (wa_from, conversation_id, message_type, text_body, status, direction)
       VALUES ($1, $2, 'text', $3, 'processed', 'outbound')`,
      [conv.wa_from, conv.id, text.trim()]
    );

    if (conv.flow === 'pending_human') {
      await pool.query(
        `UPDATE whatsapp_conversations SET flow = 'menu', last_message_at = NOW() WHERE id = $1`,
        [conv.id]
      );
    } else {
      await pool.query(`UPDATE whatsapp_conversations SET last_message_at = NOW() WHERE id = $1`, [conv.id]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error sending reply:', err);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
});

// POST /api/whatsapp/conversations/:id/assign-bot — reassign bot name
router.post('/conversations/:id/assign-bot', requireAdmin, async (req, res) => {
  try {
    const { bot_name } = req.body;
    if (!['Tute', 'Lilo', 'Toto'].includes(bot_name)) return res.status(400).json({ error: 'Nombre inválido. Usá Tute, Lilo o Toto' });
    await pool.query(`UPDATE whatsapp_conversations SET bot_name = $1 WHERE id = $2`, [bot_name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error assigning bot:', err);
    res.status(500).json({ error: 'Error al asignar bot' });
  }
});

// POST /api/whatsapp/conversations/:id/close — close conversation
router.post('/conversations/:id/close', requireAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE whatsapp_conversations SET status = 'closed' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error closing conversation:', err);
    res.status(500).json({ error: 'Error al cerrar conversación' });
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

// GET /api/whatsapp/stats — admin stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM whatsapp_messages");
    const today = await pool.query("SELECT COUNT(*) FROM whatsapp_messages WHERE created_at::date = CURRENT_DATE");
    const byType = await pool.query("SELECT message_type, COUNT(*) as count FROM whatsapp_messages GROUP BY message_type");
    const activeConvs = await pool.query("SELECT COUNT(*) FROM whatsapp_conversations WHERE status = 'active'");
    const byFlow = await pool.query("SELECT COALESCE(flow, 'menu') as flow, COUNT(*) as count FROM whatsapp_conversations GROUP BY flow ORDER BY count DESC");

    res.json({
      total: parseInt(total.rows[0].count),
      today: parseInt(today.rows[0].count),
      byType: byType.rows,
      activeConversations: parseInt(activeConvs.rows[0].count),
      byFlow: byFlow.rows,
    });
  } catch (err) {
    console.error('Error fetching WhatsApp stats:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

export default router;
