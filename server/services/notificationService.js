import pool from '../db.js';

function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.startsWith('549') && cleaned.length > 12) return cleaned;
  if (cleaned.startsWith('54') && cleaned.length > 11) return cleaned;
  if (cleaned.startsWith('9') && cleaned.length > 10) cleaned = '54' + cleaned;
  else if (cleaned.length === 10) cleaned = '549' + cleaned;
  else if (cleaned.length === 11) cleaned = '54' + cleaned;
  return cleaned;
}

async function sendViaWhatsApp(user, textMessage) {
  const phone = normalizePhone(user.phone);
  if (!phone) {
    console.log(`[notification] No phone for user ${user.email}, skipping WhatsApp`);
    return;
  }
  try {
    const { sendMessage } = await import('./whatsappService.js');
    await sendMessage(phone, textMessage);
    console.log(`[notification] WhatsApp sent via Cloud API to ${user.email} (${phone})`);
  } catch (err) {
    console.error(`[notification] WhatsApp error for ${user.email}:`, err.message);
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
