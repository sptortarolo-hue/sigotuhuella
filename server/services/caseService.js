import pool from '../db.js';

// Mapeo pets.status -> (tipo de caso, estado de caso)
export function petCaseMapping(status) {
  if (['lost', 'transitada'].includes(status)) return { type: 'lost', caseStatus: 'active' };
  if (['found', 'retained', 'accidented', 'needs_attention'].includes(status)) return { type: 'found', caseStatus: 'active' };
  return null;
}

function isClosedStatus(status) {
  return status === 'reunited' || status === 'adopted';
}

function closeReason(status) {
  return status === 'adopted' ? 'adopted' : 'reunited';
}

// Crea un caso para un pet nuevo. Retorna null si el status no genera caso (sighted, adopcion simple, etc).
export async function createPetCase(pet, { source = 'app' } = {}) {
  try {
    const mapping = petCaseMapping(pet.status);
    if (!mapping) return null;

    const userId = pet.created_by || null;
    const reporterSource = userId && source === 'app_auth' ? 'app_auth' : source;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const caseResult = await client.query(
        `INSERT INTO pet_cases (pet_id, reporter_id, reporter_source, type, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [pet.id, userId, reporterSource, mapping.type, mapping.caseStatus]
      );
      const petCase = caseResult.rows[0];
      await client.query(
        `INSERT INTO case_events (case_id, user_id, event_type, payload)
         VALUES ($1, $2, 'case_created', $3)`,
        [petCase.id, userId, JSON.stringify({ type: petCase.type, source: reporterSource, pet_status: pet.status })]
      );
      await client.query('COMMIT');
      return petCase;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('createPetCase error:', err.message);
    return null;
  }
}

// Agrega un evento al timeline del caso
export async function createCaseEvent(caseId, eventType, payload = {}, userId = null) {
  try {
    const result = await pool.query(
      `INSERT INTO case_events (case_id, user_id, event_type, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [caseId, userId, eventType, JSON.stringify(payload)]
    );
    return result.rows[0];
  } catch (err) {
    console.error('createCaseEvent error:', err.message);
    return null;
  }
}

// Registra un evento de publicación (IG/FB/WA) en el caso del pet, si existe. No-op sin caso.
export async function recordPublicationEvent(petId, eventType, payload) {
  const result = await pool.query('SELECT id FROM pet_cases WHERE pet_id = $1 LIMIT 1', [petId]);
  if (result.rows.length === 0) return null;
  return createCaseEvent(result.rows[0].id, eventType, payload);
}

// Sincroniza el caso cuando cambia pets.status (cerrar en reunited/adopted, reactivar si vuelve a estar perdido)
export async function syncCaseStatus(petId, newStatus) {
  try {
    const caseRes = await pool.query('SELECT * FROM pet_cases WHERE pet_id = $1 LIMIT 1', [petId]);
    if (caseRes.rows.length === 0) return null;
    const petCase = caseRes.rows[0];

    if (isClosedStatus(newStatus) && petCase.status !== 'closed') {
      await pool.query(
        `UPDATE pet_cases SET status = 'closed', updated_at = NOW() WHERE id = $1`,
        [petCase.id]
      );
      await createCaseEvent(petCase.id, 'case_closed', { reason: closeReason(newStatus), pet_status: newStatus });
    } else if (!isClosedStatus(newStatus)) {
      const mapping = petCaseMapping(newStatus);
      if (mapping && petCase.status !== mapping.caseStatus) {
        await pool.query(
          `UPDATE pet_cases SET status = $1, updated_at = NOW() WHERE id = $2`,
          [mapping.caseStatus, petCase.id]
        );
      }
    }
    return petCase;
  } catch (err) {
    console.error('syncCaseStatus error:', err.message);
    return null;
  }
}

// Dashboard completo del caso: caso + mascota + timeline + reporter
export async function getCaseDashboard(caseId) {
  const caseRes = await pool.query(
    `SELECT pc.*,
            u.display_name AS reporter_name, u.email AS reporter_email, u.phone AS reporter_phone
     FROM pet_cases pc
     LEFT JOIN users u ON u.id = pc.reporter_id
     WHERE pc.id = $1`,
    [caseId]
  );
  if (caseRes.rows.length === 0) return null;
  const petCase = caseRes.rows[0];

  const petRes = await pool.query(
    `SELECT p.*,
       COALESCE(json_agg(
         json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type,
                           'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL)
         ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') AS images
     FROM pets p
     LEFT JOIN pet_images pi ON pi.pet_id = p.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [petCase.pet_id]
  );

  const eventsRes = await pool.query(
    `SELECT ce.*, u.display_name AS user_name
     FROM case_events ce
     LEFT JOIN users u ON u.id = ce.user_id
     WHERE ce.case_id = $1
     ORDER BY ce.created_at DESC`,
    [caseId]
  );

  const sightingsRes = await pool.query(
    `SELECT id, case_id, reporter_name, reporter_whatsapp, lat, lng, description, photo_data, photo_mime, hidden, created_at
     FROM case_sightings
     WHERE case_id = $1 AND hidden = FALSE
     ORDER BY created_at ASC`,
    [caseId]
  );

  const areasRes = await pool.query(
    `SELECT case_search_areas.*, u.display_name AS user_name
     FROM case_search_areas
     LEFT JOIN users u ON u.id = case_search_areas.user_id
     WHERE case_search_areas.case_id = $1
     ORDER BY case_search_areas.created_at ASC`,
    [caseId]
  );

  return {
    ...petCase,
    pet: petRes.rows[0] || null,
    events: eventsRes.rows,
    sightings: sightingsRes.rows,
    searchAreas: areasRes.rows,
  };
}

// Casos del usuario (como reporter o dueño de la mascota reportada)
export async function getCasesForUser(userId) {
  const result = await pool.query(
    `SELECT pc.*, p.name AS pet_name, p.species AS pet_species, p.status AS pet_status,
            (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) AS image_data,
            (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) AS image_mime,
            (SELECT COUNT(*) FROM case_events ce WHERE ce.case_id = pc.id) AS event_count
     FROM pet_cases pc
     JOIN pets p ON p.id = pc.pet_id
     WHERE pc.reporter_id = $1 OR p.created_by = $1
     ORDER BY pc.created_at DESC`,
    [userId]
  );
  return result.rows;
}

// Agrega un avistamiento al caso y registra el evento. Devuelve la fila creada.
export async function addSighting(caseId, { reporterName, reporterWhatsapp, lat, lng, description, photoData, photoMime }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `INSERT INTO case_sightings (case_id, reporter_name, reporter_whatsapp, lat, lng, description, photo_data, photo_mime)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [caseId, reporterName, reporterWhatsapp || null, lat, lng, description || null, photoData || null, photoMime || null]
    );
    const sighting = res.rows[0];
    await client.query(
      `INSERT INTO case_events (case_id, event_type, payload)
       VALUES ($1, 'sighting_reported', $2)`,
      [caseId, JSON.stringify({ sighting_id: sighting.id, lat, lng, description, reporter_name: reporterName })]
    );
    await client.query('COMMIT');
    return sighting;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('addSighting error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Lista avistamientos de un caso. Si includeHidden=false excluye los ocultos (vista pública).
export async function getSightings(caseId, includeHidden = false) {
  const res = await pool.query(
    `SELECT id, case_id, reporter_name, reporter_whatsapp, lat, lng, description, photo_data, photo_mime, hidden, created_at
     FROM case_sightings
     WHERE case_id = $1 ${includeHidden ? '' : 'AND hidden = FALSE'}
     ORDER BY created_at ASC`,
    [caseId]
  );
  return res.rows;
}

// Oculta (o desoculta) un avistamiento desde el panel admin.
export async function setSightingHidden(sightingId, hidden) {
  const res = await pool.query(
    `UPDATE case_sightings SET hidden = $1 WHERE id = $2 RETURNING *`,
    [hidden, sightingId]
  );
  return res.rows[0] || null;
}

// Registra un área cubierta de búsqueda (polygon geojson) y agrega evento.
export async function addSearchArea(caseId, userId, { geojson, notes }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `INSERT INTO case_search_areas (case_id, user_id, area_geojson, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [caseId, userId, JSON.stringify(geojson), notes || null]
    );
    const area = res.rows[0];
    await client.query(
      `INSERT INTO case_events (case_id, user_id, event_type, payload)
       VALUES ($1, $2, 'search_area_logged', $3)`,
      [caseId, userId, JSON.stringify({ area_id: area.id, notes })]
    );
    await client.query('COMMIT');
    return area;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('addSearchArea error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Lista áreas cubiertas de un caso.
export async function getSearchAreas(caseId) {
  const res = await pool.query(
    `SELECT case_search_areas.*, u.display_name AS user_name
     FROM case_search_areas
     LEFT JOIN users u ON u.id = case_search_areas.user_id
     WHERE case_search_areas.case_id = $1
     ORDER BY case_search_areas.created_at ASC`,
    [caseId]
  );
  return res.rows;
}

// Usuario es reporter del caso o dueno de la mascota, o admin
export async function canManageCase(userId, petCase) {
  if (!userId) return false;
  const roleRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
  const role = roleRes.rows[0]?.role;
  if (role === 'admin') return true;
  const ownerRes = await pool.query(
    'SELECT created_by FROM pets WHERE id = $1',
    [petCase.pet_id]
  );
  const ownerId = ownerRes.rows[0]?.created_by;
  return petCase.reporter_id === userId || ownerId === userId;
}

// Envía una alerta vecinal por push a usuarios con barrios coincidentes y registra el envío.
// Devuelve { alert, recipients, sent } o { error } si algo falla.
export async function sendNeighborhoodAlert(caseId, { neighborhoods, radiusKm = 5 } = {}) {
  try {
    const caseRes = await pool.query(
      `SELECT pc.*, p.name AS pet_name, p.species, p.location,
              p.neighborhoods AS pet_neighborhoods, p.latitude, p.longitude
       FROM pet_cases pc
       JOIN pets p ON p.id = pc.pet_id
       WHERE pc.id = $1`,
      [caseId]
    );
    if (caseRes.rows.length === 0) return { error: 'Caso no encontrado' };
    const petCase = caseRes.rows[0];

    let nbs = neighborhoods;
    if (!nbs || nbs.length === 0) {
      try {
        const parsed = typeof petCase.pet_neighborhoods === 'string'
          ? JSON.parse(petCase.pet_neighborhoods)
          : petCase.pet_neighborhoods;
        nbs = Array.isArray(parsed) ? parsed : [];
      } catch {
        nbs = [];
      }
    }
    nbs = (nbs || []).filter(Boolean);
    if (nbs.length === 0) return { error: 'La mascota no tiene barrios configurados' };

    const radius = parseInt(radiusKm, 10) || 5;

    const targets = await pool.query(
      `SELECT DISTINCT u.id
       FROM users u
       WHERE u.neighborhoods ?| $1::text[]
         AND EXISTS (
           SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id
           UNION ALL
           SELECT 1 FROM device_tokens dt WHERE dt.user_id = u.id
         )`,
      [nbs]
    );
    const userIds = targets.rows.map(r => r.id);
    const recipients = userIds.length;

    if (recipients === 0) {
      const alert = await pool.query(
        `INSERT INTO neighborhood_alerts (case_id, pet_id, neighborhoods, recipients, sent_count, radius_km, status)
         VALUES ($1, $2, $3, 0, 0, $4, 'no_recipients')
         RETURNING *`,
        [caseId, petCase.pet_id, nbs, radius]
      );
      return { alert: alert.rows[0], recipients: 0, sent: 0 };
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
    const caseUrl = `${frontendUrl}/caso/${caseId}`;
    const title = '🚨 Alerta vecinal';
    const body = `${petCase.pet_name || 'Una mascota'} ${petCase.species === 'dog' ? 'se perdió' : petCase.species === 'cat' ? 'se perdió' : 'fue reportada'} en ${petCase.location || petCase.pet_neighborhoods || 'tu zona'}. Mirá el caso.`;

    const { sendPushToUsers } = await import('./pushService.js');
    const sent = await sendPushToUsers(userIds, {
      title,
      body,
      data: { url: caseUrl, caseId, type: 'neighborhood_alert' },
    });

    const alert = await pool.query(
      `INSERT INTO neighborhood_alerts (case_id, pet_id, neighborhoods, recipients, sent_count, radius_km, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'sent')
       RETURNING *`,
      [caseId, petCase.pet_id, nbs, recipients, sent, radius]
    );

    await createCaseEvent(caseId, 'neighborhood_alert_sent', {
      recipients,
      radius_km: radius,
      neighborhoods: nbs,
      sent_count: sent,
    });

    return { alert: alert.rows[0], recipients, sent };
  } catch (err) {
    console.error('sendNeighborhoodAlert error:', err.message);
    return { error: 'Error al enviar la alerta: ' + err.message };
  }
}

// Devuelve todos los shares de un caso (IG/FB con links + WA informativo)
export async function getCaseShares(caseId) {
  const caseRes = await pool.query('SELECT pet_id FROM pet_cases WHERE id = $1', [caseId]);
  if (caseRes.rows.length === 0) return [];
  const petId = caseRes.rows[0].pet_id;
  const shares = [];

  const igRes = await pool.query(
    `SELECT ig_permalink, published_at FROM instagram_posts
     WHERE pet_id = $1 AND status = 'published' AND ig_permalink IS NOT NULL
     ORDER BY published_at DESC`,
    [petId]
  );
  igRes.rows.forEach(r => shares.push({
    platform: 'instagram',
    url: r.ig_permalink,
    date: r.published_at,
  }));

  const fbRes = await pool.query(
    `SELECT page_post_id, group_post_ids, published_at FROM facebook_page_posts
     WHERE pet_id = $1 AND status = 'published' AND page_post_id IS NOT NULL
     ORDER BY published_at DESC`,
    [petId]
  );
  fbRes.rows.forEach(r => shares.push({
    platform: 'facebook',
    url: `https://www.facebook.com/${r.page_post_id}`,
    group_count: Array.isArray(r.group_post_ids) ? r.group_post_ids.length : 0,
    date: r.published_at,
  }));

  const waRes = await pool.query(
    `SELECT payload, created_at FROM case_events
     WHERE case_id = $1 AND event_type = 'whatsapp_group_sent'
     ORDER BY created_at DESC`,
    [caseId]
  );
  waRes.rows.forEach(r => {
    const p = r.payload || {};
    shares.push({
      platform: 'whatsapp',
      group_name: p.group_name || 'Grupo de WhatsApp',
      date: r.created_at,
    });
  });

  return shares.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}