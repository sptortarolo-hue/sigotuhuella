// Job diario del ciclo de vida de casos:
// 1. Recordatorios al reportante antes/después del vencimiento (D-7, D-1, vencida+3d).
// 2. Auto-archive de casos vencidos hace más de ARCHIVE_AFTER_DAYS.
// Idempotente: cada milestone se envía una sola vez (dedupe por notifications).
import pool from '../db.js';
import { sendPushToUser } from './pushService.js';
import { createCaseEvent, computeExpiry, ARCHIVE_AFTER_DAYS } from './caseService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_TYPE = 'case_renewal_reminder';

const MILESTONES = [
  { key: 'd-7', min: 6, max: 8, title: 'Tu publicación vence en pocos días', body: (name) => `Si ${name} sigue sin aparecer, renová la publicación para mantenerla visible.` },
  { key: 'd-1', min: 0, max: 2, title: 'Tu publicación está por vencer', body: (name) => `${name} sigue en la búsqueda. Renová la publicación para no perder visibilidad.` },
  { key: 'expired', min: -Infinity, max: -3, title: 'Tu publicación venció', body: (name) => `La publicación de ${name} venció. Renovala para reactivar la difusión con voluntarios.` },
];

async function alreadySent(caseId, milestone) {
  const res = await pool.query(
    `SELECT 1 FROM notifications
     WHERE type = $1 AND data->>'case_id' = $2 AND data->>'milestone' = $3
     LIMIT 1`,
    [REMINDER_TYPE, String(caseId), milestone]
  );
  return res.rows.length > 0;
}

async function sendReminder(row, milestone) {
  if (await alreadySent(row.case_id, milestone.key)) return false;
  const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
  const petUrl = `${frontendUrl}/pet/${row.pet_id}`;
  const title = milestone.title;
  const body = milestone.body(row.name || 'tu mascota');

  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [row.notify_user_id, REMINDER_TYPE, title, body, JSON.stringify({
      case_id: row.case_id,
      pet_id: row.pet_id,
      milestone: milestone.key,
      url: petUrl,
    })]
  );
  await sendPushToUser(row.notify_user_id, { title, body, url: petUrl }).catch(err =>
    console.error('[LifecycleJob] push error:', err.message)
  );
  return true;
}

export async function runLifecycleCycle() {
  let remindersSent = 0;

  // 1) Recordatorios de renovación sobre casos activos
  try {
    const casesRes = await pool.query(
      `SELECT pc.id as case_id, pc.pet_id, pc.active_until,
              COALESCE(pc.reporter_id, p.created_by) as notify_user_id,
              p.name
       FROM pet_cases pc
       JOIN pets p ON p.id = pc.pet_id
       WHERE pc.status = 'active'
         AND pc.active_until IS NOT NULL`
    );
    for (const row of casesRes.rows) {
      if (!row.notify_user_id) continue;
      const { days_left } = computeExpiry('active', row.active_until);
      for (const milestone of MILESTONES) {
        if (days_left >= milestone.min && days_left <= milestone.max) {
          if (await sendReminder(row, milestone)) remindersSent++;
          break;
        }
      }
    }
  } catch (err) {
    console.error('[LifecycleJob] reminders error:', err.message);
  }

  // 2) Auto-archive de casos vencidos hace más de ARCHIVE_AFTER_DAYS días
  let archived = 0;
  try {
    const expiredRes = await pool.query(
      `UPDATE pet_cases SET status = 'archived', updated_at = NOW()
       WHERE status = 'active'
         AND active_until IS NOT NULL
         AND active_until < NOW() - ($1 || ' days')::interval
       RETURNING id`,
      [String(ARCHIVE_AFTER_DAYS)]
    );
    archived = expiredRes.rowCount;
    for (const row of expiredRes.rows) {
      await createCaseEvent(row.id, 'case_archived', {
        reason: 'auto_archive',
        archive_after_days: ARCHIVE_AFTER_DAYS,
      }).catch(err => console.error('[LifecycleJob] event error:', err.message));
    }
  } catch (err) {
    console.error('[LifecycleJob] auto-archive error:', err.message);
  }

  console.log(`[LifecycleJob] recordatorios enviados: ${remindersSent} | casos archivados: ${archived}`);
  return { remindersSent, archived };
}
