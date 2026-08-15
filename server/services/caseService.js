import pool from '../db.js';
import { addPetHistory, celebrateStatusChange } from './reunionCelebration.js';

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

// Genera el próximo número de caso secuencial STH##### (usa pets.case_number, histórico).
export async function generateCaseNumber(client = pool) {
  const counterResult = await client.query(
    "SELECT MAX(CAST(SUBSTRING(case_number FROM 4) AS INTEGER)) as max_num FROM pets WHERE case_number LIKE 'STH%'"
  );
  const nextNum = (parseInt(counterResult.rows[0]?.max_num, 10) || 0) + 1;
  return 'STH' + String(nextNum).padStart(5, '0');
}

// Asigna case_number a la mascota si aún no tiene (mismo client, dentro de transacción).
// Retorna el case_number asignado o el existente.
export async function assignCaseNumberIfMissing(petId, client = pool) {
  const cur = await client.query('SELECT case_number FROM pets WHERE id = $1', [petId]);
  if (cur.rows.length === 0) return null;
  if (cur.rows[0].case_number) return cur.rows[0].case_number;
  const caseNumber = await generateCaseNumber(client);
  await client.query('UPDATE pets SET case_number = $1 WHERE id = $2', [caseNumber, petId]);
  return caseNumber;
}

// Crea un caso para un pet nuevo. Retorna null si el status no genera caso (sighted, adopcion simple, etc).
// createdAt (opcional): respeta la fecha original del reporte (p.ej. backfills), default NOW.
export async function createPetCase(pet, { source = 'app', createdAt = null } = {}) {
  try {
    const mapping = petCaseMapping(pet.status);
    if (!mapping) return null;

    const userId = pet.created_by || null;
    const reporterSource = userId && source === 'app_auth' ? 'app_auth' : source;
    const created = createdAt ? new Date(createdAt) : new Date();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Garantiza número invocable para todos los orígenes (app_auth, app_anon, whatsapp_bot)
      const caseNumber = await assignCaseNumberIfMissing(pet.id, client);
      const caseResult = await client.query(
        `INSERT INTO pet_cases (pet_id, reporter_id, reporter_source, type, status, active_until, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [pet.id, userId, reporterSource, mapping.type, mapping.caseStatus, new Date(created.getTime() + 45 * 24 * 60 * 60 * 1000), created]
      );
      const petCase = caseResult.rows[0];
      await client.query(
        `INSERT INTO case_events (case_id, user_id, event_type, payload, created_at)
         VALUES ($1, $2, 'case_created', $3, $4)`,
        [petCase.id, userId, JSON.stringify({ type: petCase.type, source: reporterSource, pet_status: pet.status }), created]
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
export async function getCaseDashboard(caseId, viewerUserId = null, _visited = new Set()) {
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

  // Si el caso está cerrado por "grouped", redirige al caso principal (con protección anti-recursión).
  if (petCase.status === 'closed' && !_visited.has(caseId)) {
    const closeEvt = await pool.query(
      `SELECT payload FROM case_events
       WHERE case_id = $1 AND event_type = 'case_closed' AND payload->>'reason' = 'grouped'
       ORDER BY created_at DESC LIMIT 1`,
      [caseId]
    );
    const mergedInto = closeEvt.rows[0]?.payload?.merged_into;
    if (mergedInto && mergedInto !== caseId && !_visited.has(mergedInto) && _visited.size < 3) {
      const main = await getCaseDashboard(mergedInto, viewerUserId, new Set([..._visited, caseId]));
      if (main) return { ...main, redirected_from: { case_id: caseId, case_number: petCase.case_number } };
    }
  }

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
    `SELECT ce.*, u.display_name AS user_name, u.role AS user_role
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

  // Casos que fueron mergeados EN este caso (para mostrar en el dashboard principal).
  const mergedRes = await pool.query(
    `SELECT ce.payload->>'merged_pet_id' AS merged_pet_id,
            ce.payload->>'merged_case_number' AS merged_case_number,
            ce.created_at AS merged_at
     FROM case_events ce
     WHERE ce.case_id = $1 AND ce.event_type = 'case_merged'
     ORDER BY ce.created_at DESC`,
    [caseId]
  );

  return {
    ...withExpiry(petCase),
    pet: petRes.rows[0] || null,
    events: eventsRes.rows,
    sightings: sightingsRes.rows,
    searchAreas: areasRes.rows,
    followerCount: await countFollowers(caseId),
    is_following: await isFollowing(caseId, viewerUserId),
    impact: await getCaseImpact(caseId, petCase.pet_id),
    merged_cases: mergedRes.rows,
  };
}

// Métricas de engagement + comentarios de las publicaciones IG/FB vinculadas al pet del caso.
export async function getCaseImpact(caseId, petId) {
  const [igRes, fbRes] = await Promise.all([
    pool.query(
      `SELECT ip.ig_permalink, ip.embed_html, ip.like_count, ip.comment_count, ip.share_count,
              ip.reach, ip.metrics_updated_at, ip.caption, ip.ig_media_id
       FROM instagram_posts ip
       WHERE ip.pet_id = $1 AND ip.status = 'published' AND ip.is_celebration = FALSE
       ORDER BY ip.published_at DESC NULLS LAST
       LIMIT 1`,
      [petId]
    ),
    pool.query(
      `SELECT fp.page_post_id, fp.like_count, fp.comment_count, fp.share_count, fp.reach,
              fp.metrics_updated_at, fp.message
       FROM facebook_page_posts fp
       WHERE fp.pet_id = $1 AND fp.status = 'published' AND fp.is_celebration = FALSE
       ORDER BY fp.published_at DESC NULLS LAST
       LIMIT 1`,
      [petId]
    ),
  ]);

  const ig = igRes.rows[0] || null;
  const fb = fbRes.rows[0] || null;

  let igComments = [];
  if (ig?.ig_media_id) {
    const cmts = await pool.query(
      `SELECT ic.id, ic.ig_comment_id, ic.username, ic.text, ic.replied, ic.created_at
       FROM instagram_comments ic
       WHERE ic.ig_post_id = $1
       ORDER BY ic.created_at DESC
       LIMIT 50`,
      [igRes.rows[0].id]
    );
    igComments = cmts.rows;
  }

  let fbComments = [];
  if (fb?.page_post_id) {
    const cmts = await pool.query(
      `SELECT fc.id, fc.fb_comment_id, fc.author_name, fc.text, fc.like_count, fc.posted_at
       FROM facebook_page_comments fc
       WHERE fc.page_post_id = $1
       ORDER BY fc.posted_at DESC
       LIMIT 50`,
      [fbRes.rows[0].id]
    );
    fbComments = cmts.rows;
  }

  // Réplicas del flyer detectadas por el scraper en grupos de Facebook
  const replicaRows = (await pool.query(
    `SELECT fr.id, fr.group_id, fr.group_name, fr.fb_post_url, fr.method, fr.detected_at,
            fp.fb_post_id AS fb_post_external_id, fp.posted_at
     FROM facebook_replicas fr
     LEFT JOIN facebook_posts fp ON fp.id = fr.fb_post_id
     WHERE fr.case_id = $1
     ORDER BY fr.detected_at DESC
     LIMIT 50`,
    [caseId]
  )).rows;

  const replicaGroups = new Map();
  for (const r of replicaRows) {
    const key = r.group_id || '__unknown__';
    const cur = replicaGroups.get(key) || { group_id: r.group_id, group_name: r.group_name || 'Grupo desconocido', count: 0, fb_post_url: r.fb_post_url || null };
    cur.count++;
    if (!cur.fb_post_url && r.fb_post_url) cur.fb_post_url = r.fb_post_url;
    replicaGroups.set(key, cur);
  }

  const replicas = {
    count: replicaRows.length,
    groups: [...replicaGroups.values()].sort((a, b) => b.count - a.count),
    items: replicaRows.map(r => ({
      id: r.id,
      fb_post_url: r.fb_post_url,
      method: r.method,
      group_name: r.group_name || null,
      detected_at: r.detected_at,
    })),
  };

  return {
    instagram: ig
      ? {
          permalink: ig.ig_permalink,
          embed_html: ig.embed_html,
          like_count: ig.like_count,
          comment_count: ig.comment_count,
          share_count: ig.share_count,
          reach: ig.reach,
          metrics_updated_at: ig.metrics_updated_at,
          caption: ig.caption,
        }
      : null,
    facebook: fb
      ? {
          page_post_id: fb.page_post_id,
          like_count: fb.like_count,
          comment_count: fb.comment_count,
          share_count: fb.share_count,
          reach: fb.reach,
          metrics_updated_at: fb.metrics_updated_at,
          message: fb.message,
        }
      : null,
    replicas,
    comments: {
      instagram: igComments,
      facebook: fbComments,
    },
  };
}

// Casos del usuario (como reporter o dueño de la mascota reportada)
export async function getCasesForUser(userId) {
  const result = await pool.query(
    `SELECT pc.*, p.name AS pet_name, p.case_number, p.species AS pet_species, p.status AS pet_status,
            (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) AS image_data,
            (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) AS image_mime,
            (SELECT COUNT(*) FROM case_events ce WHERE ce.case_id = pc.id) AS event_count
     FROM pet_cases pc
     JOIN pets p ON p.id = pc.pet_id
     WHERE pc.reporter_id = $1 OR p.created_by = $1
     ORDER BY pc.created_at DESC`,
    [userId]
  );
  return result.rows.map(withExpiry);
}

const MAX_FOLLOWS = 30;

// Sigue un caso. Retorna { error } si ya lo seguía o supera el límite.
export async function followCase(caseId, userId) {
  const countRes = await pool.query('SELECT COUNT(*)::int AS cnt FROM case_followers WHERE user_id = $1', [userId]);
  if (countRes.rows[0].cnt >= MAX_FOLLOWS) {
    return { error: `Alcanzaste el límite de ${MAX_FOLLOWS} casos en seguimiento` };
  }
  const res = await pool.query(
    `INSERT INTO case_followers (case_id, user_id) VALUES ($1, $2)
     ON CONFLICT (case_id, user_id) DO NOTHING RETURNING *`,
    [caseId, userId]
  );
  if (res.rows.length === 0) return { error: 'Ya seguís este caso' };
  return { followed: true, followerCount: await countFollowers(caseId) };
}

// Deja de seguir un caso.
export async function unfollowCase(caseId, userId) {
  await pool.query('DELETE FROM case_followers WHERE case_id = $1 AND user_id = $2', [caseId, userId]);
  return { followed: false, followerCount: await countFollowers(caseId) };
}

export async function countFollowers(caseId) {
  const res = await pool.query('SELECT COUNT(*)::int AS cnt FROM case_followers WHERE case_id = $1', [caseId]);
  return res.rows[0].cnt;
}

export async function isFollowing(caseId, userId) {
  if (!userId) return false;
  const res = await pool.query('SELECT 1 FROM case_followers WHERE case_id = $1 AND user_id = $2', [caseId, userId]);
  return res.rows.length > 0;
}

// IDs de seguidores de un caso.
export async function getFollowerIds(caseId) {
  const res = await pool.query('SELECT user_id FROM case_followers WHERE case_id = $1', [caseId]);
  return res.rows.map(r => r.user_id);
}

// Casos que el usuario sigue (mismo shape que getCasesForUser).
export async function getFollowedCases(userId) {
  const result = await pool.query(
    `SELECT pc.*, p.name AS pet_name, p.case_number, p.species AS pet_species, p.status AS pet_status,
            (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) AS image_data,
            (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) AS image_mime,
            (SELECT COUNT(*) FROM case_events ce WHERE ce.case_id = pc.id) AS event_count
     FROM case_followers cf
     JOIN pet_cases pc ON pc.id = cf.case_id
     JOIN pets p ON p.id = pc.pet_id
     WHERE cf.user_id = $1
     ORDER BY cf.created_at DESC`,
    [userId]
  );
  return result.rows.map(withExpiry);
}

// Agrega un avistamiento al caso y registra el evento. Devuelve la fila creada.
// Si hidden=true (por lista negra), se registra evento sighting_suspicious.
export async function addSighting(caseId, { reporterName, reporterWhatsapp, lat, lng, description, photoData, photoMime, hidden = false }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `INSERT INTO case_sightings (case_id, reporter_name, reporter_whatsapp, lat, lng, description, photo_data, photo_mime, hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [caseId, reporterName, reporterWhatsapp || null, lat, lng, description || null, photoData || null, photoMime || null, hidden]
    );
    const sighting = res.rows[0];
    await client.query(
      `INSERT INTO case_events (case_id, event_type, payload)
       VALUES ($1, 'sighting_reported', $2)`,
      [caseId, JSON.stringify({ sighting_id: sighting.id, lat, lng, description, reporter_name: reporterName, hidden })]
    );
    await client.query('COMMIT');

    // Aviso a followers del nuevo avistamiento (no bloquea al reporter)
    try {
      const followerIds = await getFollowerIds(caseId);
      if (followerIds.length > 0) {
        const caseRes = await pool.query('SELECT p.name AS pet_name FROM pet_cases pc JOIN pets p ON p.id = pc.pet_id WHERE pc.id = $1', [caseId]);
        const petName = caseRes.rows[0]?.pet_name || 'La mascota';
        const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
        const { sendPushToUsers } = await import('./pushService.js');
        sendPushToUsers(followerIds, {
          title: '👁 Nuevo avistamiento',
          body: `Avistaron a ${petName}. Mirá los detalles del caso.`,
          data: { url: `${frontendUrl}/caso/${caseId}`, caseId, type: 'case_followed' },
        }).catch(e => console.error('Sighting followers push error:', e.message));
      }
    } catch (err) {
      console.error('addSighting notify followers error:', err.message);
    }

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

// Sprint 4 — Propone un punto de encuentro y registra el evento en el timeline
export async function proposeMeeting(caseId, userId, { lat, lng, time, location } = {}) {
  if (!time) return { error: 'Se requiere fecha y hora del encuentro' };
  const event = await createCaseEvent(caseId, 'meeting_arranged', {
    lat,
    lng,
    time,
    location: location || null,
    proposed_by: userId,
  }, userId);

  // Aviso a followers del encuentro coordinado
  try {
    const followerIds = (await getFollowerIds(caseId)).filter(id => id !== userId);
    if (followerIds.length > 0) {
      const caseRes = await pool.query('SELECT p.name AS pet_name FROM pet_cases pc JOIN pets p ON p.id = pc.pet_id WHERE pc.id = $1', [caseId]);
      const petName = caseRes.rows[0]?.pet_name || 'La mascota';
      const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
      const { sendPushToUsers } = await import('./pushService.js');
      sendPushToUsers(followerIds, {
        title: '📍 Encuentro coordinado',
        body: `Se coordinó un encuentro para ${petName}. Mirá los detalles del caso.`,
        data: { url: `${frontendUrl}/caso/${caseId}`, caseId, type: 'case_followed' },
      }).catch(e => console.error('Meeting followers push error:', e.message));
    }
  } catch (err) {
    console.error('proposeMeeting notify followers error:', err.message);
  }

  return { event };
}

// Confirma la reunión, cierra el caso, avisa a colaboradores y dispara la celebración completa
export async function confirmReunion(caseId, userId, { photoData, photoMime, ownerName, ownerPhone, ownerEmail, ownerAddress } = {}) {
  const caseRes = await pool.query(
    `SELECT pc.*, p.name AS pet_name FROM pet_cases pc JOIN pets p ON p.id = pc.pet_id WHERE pc.id = $1`,
    [caseId]
  );
  if (caseRes.rows.length === 0) return { error: 'Caso no encontrado' };
  const petCase = caseRes.rows[0];

  // Pet status before transaction (for celebrateStatusChange fromStatus)
  const petRes = await pool.query('SELECT status FROM pets WHERE id = $1', [petCase.pet_id]);
  const previousStatus = petRes.rows[0]?.status || 'lost';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE pet_cases SET status = 'closed', updated_at = NOW() WHERE id = $1`,
      [caseId]
    );
    await client.query(
      `UPDATE pets SET status = 'reunited', reunited_at = COALESCE(reunited_at, NOW()) WHERE id = $1`,
      [petCase.pet_id]
    );
    await client.query(
      `INSERT INTO case_events (case_id, user_id, event_type, payload)
       VALUES ($1, $2, 'reunited', $3)`,
      [caseId, userId, JSON.stringify({ confirmed_by: userId, photo_data: photoData || null, photo_mime: photoMime || null })]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Avisar a colaboradores + followers
  try {
    const collabRes = await pool.query(
      `SELECT DISTINCT user_id FROM case_search_areas WHERE case_id = $1 AND user_id IS NOT NULL`,
      [caseId]
    );
    const collaboratorIds = collabRes.rows.map(r => r.user_id);
    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
    await notifyCollaborators(caseId, petCase, collaboratorIds, userId, petCase.pet_name, frontendUrl);
  } catch (err) {
    console.error('confirmReunion notify collaborators error:', err.message);
  }

  // Celebración completa (news, IG/FB, broadcast, badges, etc.)
  try {
    await celebrateStatusChange({
      petId: petCase.pet_id,
      userId,
      fromStatus: previousStatus,
      toStatus: 'reunited',
      ownerFields: { owner_name: ownerName, owner_phone: ownerPhone, owner_email: ownerEmail, owner_address: ownerAddress },
    });
  } catch (err) {
    console.error('confirmReunion celebrateStatusChange error:', err.message);
  }

  return { success: true };
}

export async function closeCase(caseId, userId, reason) {
  const validReasons = ['reunited', 'deceased', 'transferred', 'adopted'];
  if (!validReasons.includes(reason)) return { error: 'Motivo de cierre inválido' };
  const caseRes = await pool.query('SELECT * FROM pet_cases WHERE id = $1', [caseId]);
  if (caseRes.rows.length === 0) return { error: 'Caso no encontrado' };
  const petCase = caseRes.rows[0];

  // Pet status before transaction
  const petRes = await pool.query('SELECT status FROM pets WHERE id = $1', [petCase.pet_id]);
  const previousStatus = petRes.rows[0]?.status || 'lost';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE pet_cases SET status = 'closed', updated_at = NOW() WHERE id = $1`,
      [caseId]
    );
    if (reason === 'reunited' || reason === 'adopted') {
      await client.query(
        `UPDATE pets SET status = $1, reunited_at = COALESCE(reunited_at, NOW()) WHERE id = $2`,
        [reason, petCase.pet_id]
      );
    }
    await client.query(
      `INSERT INTO case_events (case_id, user_id, event_type, payload)
       VALUES ($1, $2, 'case_closed', $3)`,
      [caseId, userId, JSON.stringify({ reason, closed_by: userId })]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Celebración completa + push para reunited/adopted
  if (reason === 'reunited' || reason === 'adopted') {
    try {
      const collabRes = await pool.query(
        `SELECT DISTINCT user_id FROM case_search_areas WHERE case_id = $1 AND user_id IS NOT NULL`,
        [caseId]
      );
      const collaboratorIds = collabRes.rows.map(r => r.user_id);
      const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
      await notifyCollaborators(caseId, petCase, collaboratorIds, userId, petCase.pet_name || null, frontendUrl);
    } catch (err) {
      console.error('closeCase notify collaborators error:', err.message);
    }

    try {
      await celebrateStatusChange({
        petId: petCase.pet_id,
        userId,
        fromStatus: previousStatus,
        toStatus: reason,
      });
    } catch (err) {
      console.error('closeCase celebrateStatusChange error:', err.message);
    }
  }

  return { success: true };
}

// Renueva la publicación del caso por 45 días (reporter, dueño o admin).
export async function renewCase(caseId, userId) {
  const caseRes = await pool.query('SELECT * FROM pet_cases WHERE id = $1', [caseId]);
  if (caseRes.rows.length === 0) return { error: 'Caso no encontrado' };
  const petCase = caseRes.rows[0];
  if (petCase.status === 'closed') return { error: 'El caso está cerrado. No se puede renovar.' };
  const newUntil = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
  await pool.query(
    `UPDATE pet_cases SET active_until = $1, updated_at = NOW() WHERE id = $2`,
    [newUntil, caseId]
  );
  await createCaseEvent(caseId, 'case_renewed', {
    renewed_by: userId,
    active_until: newUntil.toISOString(),
  }, userId);
  return { success: true, active_until: newUntil };
}

// Calcula expired/days_left para un caso (no muta la DB).
export function computeExpiry(caseStatus, activeUntil) {
  if (caseStatus !== 'active' || !activeUntil) return { expired: false, days_left: null };
  const ms = new Date(activeUntil).getTime() - Date.now();
  const daysLeft = Math.floor(ms / (24 * 60 * 60 * 1000));
  return { expired: daysLeft < 0, days_left: daysLeft };
}

// Ordena payload hacia getFollowedCases/getCasesForUser: agrega expired/days_left
function withExpiry(row) {
  return {
    ...row,
    ...computeExpiry(row.status, row.active_until),
  };
}

// Envía push "¡Volvió a casa!" a los colaboradores del caso y registra el evento
async function notifyCollaborators(caseId, petCase, collaboratorIds, userId, petName, frontendUrl) {
  const followerIds = await getFollowerIds(caseId);
  const filtered = [...new Set([...collaboratorIds, ...followerIds])].filter(id => id && id !== userId);
  const caseUrl = `${frontendUrl}/caso/${caseId}`;
  const title = '🎉 ¡Volvió a casa!';
  const body = `${petName || 'La mascota'} se reencontró con su familia. ¡Gracias por ayudar!`;

  let sent = 0;
  if (filtered.length > 0) {
    const { sendPushToUsers } = await import('./pushService.js');
    sent = await sendPushToUsers(filtered, {
      title,
      body,
      data: { url: caseUrl, caseId, type: 'reunion_announced' },
    });
  }

  await createCaseEvent(caseId, 'reunion_announced', {
    collaborators_count: filtered.length,
    channels_reached: sent,
  }, userId);
}