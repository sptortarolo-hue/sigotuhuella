import pool from '../db.js';
import { sendMessage } from './whatsappService.js';
import { sendPushToUser } from './pushService.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

const REMINDER_INTERVALS = [
  { after: 24 * 60 * 60 * 1000, label: '1 día' },
  { after: 3 * 24 * 60 * 60 * 1000, label: '3 días' },
  { after: 7 * 24 * 60 * 60 * 1000, label: '7 días' },
];

const EXPIRE_AFTER = 14 * 24 * 60 * 60 * 1000; // 14 días

export async function processInviteReminders() {
  try {
    const pending = await pool.query(
      `SELECT si.*,
        COALESCE(p.name, mp.name) as pet_name,
        u.display_name as inviter_name,
        u.email as inviter_email
       FROM share_invites si
       LEFT JOIN pets p ON p.id = si.pet_id
       LEFT JOIN my_pets mp ON mp.id = si.my_pet_id
       JOIN users u ON u.id = si.created_by
       WHERE si.status = 'pending'
         AND (si.reminder_count < 3 OR si.reminder_count IS NULL)`
    );

    const now = Date.now();

    for (const invite of pending.rows) {
      const createdAt = new Date(invite.created_at).getTime();
      const age = now - createdAt;
      const shouldRemind = REMINDER_INTERVALS[invite.reminder_count || 0];
      const lastReminder = invite.last_reminder_at ? new Date(invite.last_reminder_at).getTime() : 0;

      // Expirar si pasó el límite
      if (age >= EXPIRE_AFTER) {
        await pool.query("UPDATE share_invites SET status = 'expired' WHERE id = $1", [invite.id]);
        continue;
      }

      // Enviar recordatorio si corresponde
      if (shouldRemind && age >= shouldRemind.after && (now - lastReminder) >= 60 * 60 * 1000) {
        const inviteLink = `${FRONTEND_URL}/login?invite=${invite.token}`;
        const textMsg = `📌 *${invite.inviter_name}* te compartió el perfil de *${invite.pet_name}* en Sigo Tu Huella. Registrate para acceder: ${inviteLink}`;

        if (invite.invited_email) {
          try {
            const { default: nodemailer } = await import('nodemailer');
            const t = nodemailer.createTransport({
              host: process.env.SMTP_HOST || 'l0061596.ferozo.com',
              port: parseInt(process.env.SMTP_PORT) || 587,
              secure: false,
              tls: { rejectUnauthorized: false },
              auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            });
            await t.sendMail({
              from: `"Sigo Tu Huella" <${process.env.SMTP_USER}>`,
              to: invite.invited_email,
              subject: `Recordatorio: ${invite.inviter_name} te compartió una mascota`,
              html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;">
                  <h2 style="color:#1e293b;text-align:center;font-size:18px;">📌 Tenés una invitación pendiente</h2>
                  <p style="color:#475569;text-align:center;font-size:15px;">
                    <strong>${invite.inviter_name}</strong> te compartió el perfil de <strong>${invite.pet_name}</strong> en Sigo Tu Huella.
                  </p>
                  <div style="text-align:center;margin:24px 0;">
                    <a href="${inviteLink}" style="background:#5A5A40;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block;">
                      Registrate para acceder
                    </a>
                  </div>
                </div>
              `,
            });
          } catch (e) { /* ignore email errors */ }
        }

        if (invite.invited_phone) {
          try {
            await sendMessage(invite.invited_phone.replace(/[^0-9]/g, ''), textMsg);
          } catch (e) { /* ignore whatsapp errors */ }
        }

        await pool.query(
          'UPDATE share_invites SET reminder_count = COALESCE(reminder_count, 0) + 1, last_reminder_at = NOW() WHERE id = $1',
          [invite.id]
        );
      }
    }
  } catch (err) {
    console.error('[Invite Reminder] Error:', err.message);
  }
}
