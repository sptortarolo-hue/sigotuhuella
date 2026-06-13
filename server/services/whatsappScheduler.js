import pool from '../db.js';
import { sendMessage } from './whatsappService.js';
import { isWhatsAppEnabled } from './whatsappService.js';

const THIRTY_MIN = 30 * 60 * 1000;
const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;
const FORTY_EIGHT_H = 48 * 60 * 60 * 1000;

export async function checkWhatsAppTimeouts() {
  try {
    const enabled = await isWhatsAppEnabled();
    if (!enabled) return;

    // Conversations inactive for 30+ min mid-flow → reminder
    const midFlow = await pool.query(
      `SELECT * FROM whatsapp_conversations
       WHERE status = 'active'
         AND flow NOT IN ('menu', 'pending_human')
         AND flow IS NOT NULL
         AND last_message_at < NOW() - INTERVAL '30 minutes'
         AND last_message_at > NOW() - INTERVAL '24 hours'`
    );

    for (const conv of midFlow.rows) {
      try {
        await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Seguís ahí? 😊 Recordá que podés continuar donde lo dejaste o escribir "menu" para volver al inicio.`);
        await pool.query(`UPDATE whatsapp_conversations SET last_message_at = NOW() WHERE id = $1`, [conv.id]);
      } catch (e) {
        console.error(`Reminder error for ${conv.wa_from}:`, e.message);
      }
    }

    // Conversations inactive for 24+ hours → notify about closing
    const nearClose = await pool.query(
      `SELECT * FROM whatsapp_conversations
       WHERE status = 'active'
         AND last_message_at < NOW() - INTERVAL '24 hours'
         AND last_message_at > NOW() - INTERVAL '48 hours'`
    );

    for (const conv of nearClose.rows) {
      try {
        await sendMessage(conv.wa_from, `⏰ ${conv.bot_name}: Pasaron más de 24 horas desde tu último mensaje. Si necesitás ayuda, escribinos de nuevo. Este chat se cerrará automáticamente.`);
        await pool.query(`UPDATE whatsapp_conversations SET last_message_at = NOW() WHERE id = $1`, [conv.id]);
      } catch (e) {
        console.error(`Close warning error for ${conv.wa_from}:`, e.message);
      }
    }

    // Close conversations inactive for 48+ hours
    const expired = await pool.query(
      `UPDATE whatsapp_conversations
       SET status = 'closed'
       WHERE status = 'active'
         AND last_message_at < NOW() - INTERVAL '48 hours'
       RETURNING id`
    );

    if (expired.rows.length > 0) {
      console.log(`[WhatsApp Scheduler] Closed ${expired.rows.length} expired conversations`);
    }
  } catch (err) {
    console.error('[WhatsApp Scheduler] Error:', err);
  }
}
