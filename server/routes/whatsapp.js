import { Router } from 'express';
import pool from '../db.js';
import { requireAdmin } from '../auth.js';
import {
  processIncomingMessage,
  sendMessage,
  sendInteractiveButtons,
  isWhatsAppEnabled,
  getBusinessProfile,
  updateBusinessProfile,
  sendGroupMessage,
  sendGroupImage,
  broadcastPetToGroups,
} from '../services/whatsappService.js';
import { processMessage, showMenu } from '../services/whatsappBot.js';
import { handleFlowComplete, handleDataExchange, getFlowStatus, registerFlow, publishFlow } from '../services/whatsappFlows.js';

const router = Router();

// GET /api/whatsapp/diagnostic — check WhatsApp config (public)
router.get('/diagnostic', async (req, res) => {
  try {
    const keys = ['whatsapp_enabled', 'whatsapp_phone_number_id', 'whatsapp_access_token', 'whatsapp_verify_token', 'whatsapp_business_phone', 'whatsapp_waba_id', 'whatsapp_main_flow_id'];
    const rows = (await pool.query('SELECT key, value FROM settings WHERE key = ANY($1)', [keys])).rows;
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));

    // If a test message was requested, process it
    let testResult = null;
    if (req.query.test === '1') {
      const testPhone = req.query.phone || '5491111111111';
      const testText = req.query.text || 'Hola';
      const fakePayload = {
        entry: [{
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '5492212025190', phone_number_id: settings.whatsapp_phone_number_id },
              contacts: [{ profile: { name: 'Test User' }, wa_id: testPhone }],
              messages: [{
                id: `test_${Date.now()}`,
                from: testPhone,
                type: 'text',
                text: { body: testText },
                timestamp: Math.floor(Date.now() / 1000),
              }],
            },
          }],
        }],
      };
      try {
        const parsed = processIncomingMessage(fakePayload);
        if (parsed) {
          await processMessage(parsed);
          testResult = 'ok';
        } else {
          testResult = 'parse_failed: payload format not recognized';
        }
      } catch (e) {
        testResult = `error: ${e.message}`;
        console.error('Test message error:', e);
      }
    }

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
      has_waba_id: !!settings.whatsapp_waba_id,
      has_main_flow_id: !!settings.whatsapp_main_flow_id,
      phone_number_id: settings.whatsapp_phone_number_id || null,
      business_phone: settings.whatsapp_business_phone || null,
      waba_id: settings.whatsapp_waba_id || null,
      main_flow_id: settings.whatsapp_main_flow_id || null,
      access_token_preview: settings.whatsapp_access_token ? settings.whatsapp_access_token.substring(0, 10) + '...' : null,
      last_webhook_at: lastWebhook?.created_at || null,
      active_conversations: parseInt(activeConvs),
      test_sent: req.query.test === '1',
      test_result: testResult,
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

// GET /api/whatsapp/profile — obtener perfil de WhatsApp Business
router.get('/profile', requireAdmin, async (req, res) => {
  try {
    const profile = await getBusinessProfile();
    res.json(profile || {});
  } catch (err) {
    console.error('Error fetching WhatsApp profile:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/whatsapp/profile — actualizar perfil de WhatsApp Business
router.put('/profile', requireAdmin, async (req, res) => {
  try {
    const { about, description, email, websites } = req.body;
    const fields = {};
    if (about !== undefined && about) fields.about = about;
    if (description !== undefined) fields.description = description;
    if (email !== undefined && email) fields.email = email;
    if (websites !== undefined) {
      const valid = websites.filter(w => w && w.startsWith('http'));
      if (valid.length > 0) fields.websites = valid;
    }
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No hay campos válidos para actualizar' });
    }
    const result = await updateBusinessProfile(fields);
    res.json({ success: true, result });
  } catch (err) {
    const full = err?.response?.data;
    console.error('Error updating WhatsApp profile:', JSON.stringify(full, null, 2));
    const msg = full?.error?.message || full?.error || err.message;
    res.status(500).json({ error: msg, fbtrace_id: full?.error?.fbtrace_id });
  }
});

// GET /api/whatsapp/conversations — admin list
router.get('/conversations', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `SELECT c.*,
       c.context->>'motive' as motive,
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
    const conv = await pool.query(`SELECT *, context->>'motive' as motive FROM whatsapp_conversations WHERE id = $1`, [req.params.id]);
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

// ─── Chapita Requests (admin) ───

router.get('/chapita-requests', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM whatsapp_chapita_requests';
    const params = [];
    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing chapita requests:', err);
    res.status(500).json({ error: 'Error al listar solicitudes' });
  }
});

router.put('/chapita-requests/:id', requireAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const result = await pool.query(
      `UPDATE whatsapp_chapita_requests SET status = COALESCE($1, status), notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status || null, notes || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating chapita request:', err);
    res.status(500).json({ error: 'Error al actualizar solicitud' });
  }
});

// ─── Adoption Interests (admin) ───

router.get('/adoption-interests', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM whatsapp_adoption_interests';
    const params = [];
    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing adoption interests:', err);
    res.status(500).json({ error: 'Error al listar intereses' });
  }
});

router.put('/adoption-interests/:id', requireAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const result = await pool.query(
      `UPDATE whatsapp_adoption_interests SET status = COALESCE($1, status), notes = COALESCE($2, notes), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status || null, notes || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Interés no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating adoption interest:', err);
    res.status(500).json({ error: 'Error al actualizar interés' });
  }
});

// ─── WhatsApp Flows ───

// POST /api/whatsapp/flow-endpoint — Meta sends flow submissions here
router.post('/flow-endpoint', async (req, res) => {
  try {
    const body = req.body;
    const action = body.action || 'navigate';
    const payload = {
      flow_token: body.flow_token || '',
      user_id: body.user_id || '',
      screen: body.screen || 'MAIN_MENU',
      data: body.data || {},
      version: body.version || '3.0',
    };

    let result;
    if (action === 'complete') {
      result = await handleFlowComplete(payload);
    } else {
      result = await handleDataExchange(payload);
    }

    res.json(result);
  } catch (err) {
    console.error('Flow endpoint error:', err);
    res.status(500).json({
      version: '3.0',
      screen: 'MAIN_MENU',
      data: { error_message: 'Error interno. Intenta de nuevo.' },
    });
  }
});

// GET /api/whatsapp/flow-status — health check for the flow
router.get('/flow-status', async (req, res) => {
  try {
    const status = await getFlowStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/flows/register — register or update the flow with Meta
router.post('/flows/register', requireAdmin, async (req, res) => {
  try {
    const flowId = await registerFlow();
    res.json({ success: true, flowId });
  } catch (err) {
    console.error('Flow register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/flows/publish — publish the flow
router.post('/flows/publish', requireAdmin, async (req, res) => {
  try {
    const result = await publishFlow();
    res.json({ success: true, result });
  } catch (err) {
    console.error('Flow publish error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── WhatsApp Groups ───

router.get('/groups', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM whatsapp_groups ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing groups:', err);
    res.status(500).json({ error: 'Error al listar grupos' });
  }
});

router.post('/groups', requireAdmin, async (req, res) => {
  try {
    const { name, group_id } = req.body;
    if (!name || !group_id) return res.status(400).json({ error: 'Nombre y Group ID son requeridos' });
    const result = await pool.query(
      'INSERT INTO whatsapp_groups (name, group_id) VALUES ($1, $2) RETURNING *',
      [name.trim(), group_id.trim()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El Group ID ya existe' });
    console.error('Error adding group:', err);
    res.status(500).json({ error: 'Error al agregar grupo' });
  }
});

router.put('/groups/:id', requireAdmin, async (req, res) => {
  try {
    const { name, group_id, is_active } = req.body;
    const result = await pool.query(
      'UPDATE whatsapp_groups SET name = COALESCE($1, name), group_id = COALESCE($2, group_id), is_active = COALESCE($3, is_active) WHERE id = $4 RETURNING *',
      [name || null, group_id || null, is_active !== undefined ? is_active : null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating group:', err);
    res.status(500).json({ error: 'Error al actualizar grupo' });
  }
});

router.delete('/groups/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM whatsapp_groups WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Grupo no encontrado' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting group:', err);
    res.status(500).json({ error: 'Error al eliminar grupo' });
  }
});

router.post('/groups/broadcast', requireAdmin, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'El mensaje no puede estar vacío' });

    const groups = (await pool.query("SELECT * FROM whatsapp_groups WHERE is_active = TRUE")).rows;
    if (groups.length === 0) return res.status(404).json({ error: 'No hay grupos activos' });

    const results = [];
    for (const group of groups) {
      try {
        await sendGroupMessage(group.group_id, text.trim());
        results.push({ group: group.name, status: 'ok' });
      } catch (err) {
        results.push({ group: group.name, status: 'error', error: err.message });
      }
    }
    res.json({ results });
  } catch (err) {
    console.error('Error broadcasting:', err);
    res.status(500).json({ error: 'Error al enviar broadcast' });
  }
});

router.post('/groups/broadcast-pet/:petId', requireAdmin, async (req, res) => {
  try {
    await broadcastPetToGroups(req.params.petId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error broadcasting pet:', err);
    res.status(500).json({ error: 'Error al publicar mascota en grupos' });
  }
});

export default router;
