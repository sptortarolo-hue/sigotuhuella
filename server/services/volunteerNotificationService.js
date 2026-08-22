import pool from '../db.js';
import { sendPushToUser } from './pushService.js';
import { enqueue } from './phoneRelayService.js';
import { sendAdminNotificationEmail } from '../auth.js';

const STATUS_LABELS = {
  LOST: 'perdido/a',
  SIGHTED: 'avistado/a',
  ACCIDENTED: 'accidentado/a',
  RETAINED: 'retenido/a',
  FOR_ADOPTION: 'en adopción',
  REUNITED: 'reunificado/a',
};

export async function notifyVolunteersOfNewPet(pet) {
  if (!pet.neighborhoods || pet.neighborhoods.length === 0) return;
  if (['REUNITED', 'ADOPTED'].includes(pet.status)) return;

  try {
    const agrupaciones = await pool.query(
      `SELECT id, name FROM agrupaciones WHERE is_active = TRUE AND neighborhoods && $1::jsonb`,
      [JSON.stringify(pet.neighborhoods)]
    );
    if (agrupaciones.rows.length === 0) return;

    const agrupacionIds = agrupaciones.rows.map(a => a.id);

    const volunteers = await pool.query(
      `SELECT DISTINCT vs.user_id, vs.category, u.notification_channels, u.display_name
       FROM volunteer_subscriptions vs
       JOIN users u ON u.id = vs.user_id
       WHERE vs.agrupacion_id = ANY($1::uuid[])
         AND vs.status = 'active'`,
      [agrupacionIds]
    );
    if (volunteers.rows.length === 0) return;

    const statusLabel = STATUS_LABELS[pet.status] || pet.status.toLowerCase();
    const petUrl = `https://sigotuhuella.com.ar/pet/${pet.id}`;
    const locationShort = pet.location?.length > 60 ? pet.location.substring(0, 60) + '...' : pet.location;

    const notified = new Set();

    for (const vol of volunteers.rows) {
      if (notified.has(`${vol.user_id}-${vol.category}`)) continue;
      notified.add(`${vol.user_id}-${vol.category}`);

      const channels = vol.notification_channels || { push: true, email: true, whatsapp: true, in_app: true };

      let title, body;
      if (vol.category === 'difusion') {
        title = `📢 ${pet.name || 'Mascota'} ${statusLabel} en tu zona`;
        body = `Ayudá a difundir: ${locationShort}`;
      } else {
        title = `🔍 ${pet.name || 'Mascota'} ${statusLabel} en tu zona`;
        body = `Investigá en redes sociales: ${locationShort}`;
      }

      if (channels.in_app) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1, 'new_pet_in_zone', $2, $3, $4)`,
          [vol.user_id, title, body, JSON.stringify({
            pet_id: pet.id,
            category: vol.category,
            agrupacion_ids: agrupacionIds,
            neighborhoods: pet.neighborhoods,
          })]
        );
      }

      if (channels.push) {
        sendPushToUser(vol.user_id, {
          title,
          body,
          url: petUrl,
        }).catch(e => console.error('Volunteer push error:', e));
      }

      if (channels.whatsapp) {
        const userPhone = await pool.query(
          "SELECT phone FROM users WHERE id = $1 AND phone IS NOT NULL AND phone != ''",
          [vol.user_id]
        );
        if (userPhone.rows.length > 0) {
          const waText = `${title}\n\n${body}\n\n👉 ${petUrl}`;
          enqueue(userPhone.rows[0].phone, waText).catch(e => console.error('Volunteer WA relay error:', e));
        }
      }
    }

    console.log(`Notified ${notified.size} volunteer slots for pet ${pet.id}`);
  } catch (err) {
    console.error('notifyVolunteersOfNewPet error:', err);
  }
}
