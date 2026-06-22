import pool from '../db.js';
import { enqueue } from './phoneRelayService.js';
import { normalizePhone } from './phoneUtils.js';

async function sendViaWhatsApp(user, textMessage) {
  const phone = normalizePhone(user.phone);
  if (!phone) {
    console.log(`[notification] No phone for user ${user.email}, skipping WhatsApp`);
    return;
  }
  try {
    await enqueue(phone, textMessage);
    console.log(`[notification] Queued via relay for ${user.email} (${phone})`);
  } catch (relayErr) {
    console.warn(`[notification] Relay error for ${user.email}, fallback to Meta:`, relayErr.message);
    try {
      const { sendMessage } = await import('./whatsappService.js');
      await sendMessage(phone, textMessage);
      console.log(`[notification] Sent via Meta fallback for ${user.email} (${phone})`);
    } catch (metaErr) {
      console.error(`[notification] Meta fallback error for ${user.email}:`, metaErr.message);
    }
  }
}

export async function notifyUser(user, { subject, textMessage, sendEmailFn }) {
  const pref = user.notification_preference || 'email';
  const sendWA = (pref === 'whatsapp' || pref === 'both');
  const sendML = (pref === 'email' || pref === 'both');

  if (sendWA && textMessage) {
    await sendViaWhatsApp(user, textMessage);
  }
  if (sendML && sendEmailFn) {
    try {
      await sendEmailFn();
    } catch (err) {
      console.error(`[notification] Email error for ${user.email}:`, err.message);
    }
  }
}

export async function notifyAdmins({ subject, htmlContent, textMessage }) {
  const adminsRes = await pool.query("SELECT * FROM users WHERE role = 'admin'");
  const admins = adminsRes.rows;

  for (const admin of admins) {
    await notifyUser(admin, { subject, textMessage, sendEmailFn: null });
  }

  const { sendAdminNotificationEmail } = await import('../auth.js');
  if (htmlContent) {
    await sendAdminNotificationEmail(subject, htmlContent).catch(err => {
      console.error('[notification] Admin email error:', err.message);
    });
  }
}
