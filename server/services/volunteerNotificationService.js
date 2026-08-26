import pool from '../db.js';
import { sendPushToUser } from './pushService.js';
import { enqueue } from './phoneRelayService.js';
import { sendAdminNotificationEmail } from '../auth.js';
import { nbNormSql, normalizeNb } from './neighborhoodUtils.js';
import { pointInPolygon } from './coordinatorScope.js';

const STATUS_LABELS = {
  lost: 'perdido/a',
  found: 'rescatado/a',
  sighted: 'avistado/a',
  accidented: 'accidentado/a',
  retained: 'retenido/a',
  transitada: 'en tránsito',
  needs_attention: 'que necesita ayuda',
  for_adoption: 'en adopción',
  for_adoption_simple: 'en adopción',
  reunited: 'reunificado/a',
};

export async function notifyVolunteersOfNewPet(pet) {
  if (!pet?.id) return;
  const neighborhoods = pet.neighborhoods || [];
  const hasCoords = pet.latitude != null && pet.longitude != null;
  if (neighborhoods.length === 0 && !hasCoords) {
    console.info(`[volunteer-notify] pet ${pet.id} sin barrios ni coordenadas: no se notifica`);
    return;
  }
  if (['reunited', 'adopted'].includes(pet.status)) return;

  try {
    const allAgrupaciones = await pool.query(
      `SELECT id, name, neighborhoods, zone_polygon FROM agrupaciones WHERE is_active = TRUE`
    );

    const matchingAgrupaciones = allAgrupaciones.rows.filter(a => {
      const agNb = Array.isArray(a.neighborhoods) ? a.neighborhoods : [];
      const petNbNorm = new Set(neighborhoods.map(normalizeNb));
      const nbMatch = neighborhoods.length > 0 && agNb.length > 0 &&
        agNb.some(ag => petNbNorm.has(normalizeNb(ag)));
      if (nbMatch) return true;
      if (hasCoords && a.zone_polygon) {
        let ring = a.zone_polygon;
        if (typeof ring === 'string') {
          try { ring = JSON.parse(ring); } catch { return false; }
        }
        if (Array.isArray(ring) && ring.length >= 3) {
          return pointInPolygon(pet.latitude, pet.longitude, ring);
        }
      }
      return false;
    });

    if (matchingAgrupaciones.length === 0) {
      console.info(`[volunteer-notify] pet ${pet.id}: ninguna agrupación cubre sus barrios/coordenadas`);
      return;
    }

    const agrupacionIds = matchingAgrupaciones.map(a => a.id);

    const volunteers = await pool.query(
      `SELECT DISTINCT vs.user_id, vs.category, u.notification_channels, u.display_name
       FROM volunteer_subscriptions vs
       JOIN users u ON u.id = vs.user_id
       WHERE vs.agrupacion_id = ANY($1::uuid[])
         AND vs.status = 'active'`,
      [agrupacionIds]
    );
    if (volunteers.rows.length === 0) {
      console.info(`[volunteer-notify] pet ${pet.id}: no hay voluntarios activos en ${matchingAgrupaciones.length} agrupaciones`);
      return;
    }

    const statusLabel = STATUS_LABELS[pet.status] || pet.status.toLowerCase();
    const petUrl = `https://sigotuhuella.com.ar/pet/${pet.id}`;
    const locationShort = pet.location?.length > 60 ? pet.location.substring(0, 60) + '...' : pet.location;

    const notified = new Set();

    for (const vol of volunteers.rows) {
      if (notified.has(`${vol.user_id}-${vol.category}`)) continue;
      notified.add(`${vol.user_id}-${vol.category}`);

      const channels = vol.notification_channels || { push: true, whatsapp: true, in_app: true };

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
            url: petUrl,
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
