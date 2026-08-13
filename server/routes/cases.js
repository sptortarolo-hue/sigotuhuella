import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { getCaseDashboard, getCasesForUser, canManageCase, createCaseEvent, addSighting, getSightings, setSightingHidden, addSearchArea, getSearchAreas, getCaseShares, sendNeighborhoodAlert, proposeMeeting, confirmReunion, closeCase, followCase, unfollowCase, getFollowedCases, isFollowing, countFollowers, renewCase } from '../services/caseService.js';
import { sendPushToUser } from '../services/pushService.js';
import { normalizePhone } from '../services/phoneUtils.js';
import { enqueue } from '../services/phoneRelayService.js';
import { isPhoneBlacklisted } from '../services/blacklistService.js';

const router = Router();

// Notifica al dueño/reporter de un caso lost cuando entra un nuevo avistamiento
async function notifySighting(caseId, sighting) {
  try {
    const caseRes = await pool.query(
      `SELECT pc.*, p.name AS pet_name, p.contact_info AS pet_contact
       FROM pet_cases pc JOIN pets p ON p.id = pc.pet_id WHERE pc.id = $1`,
      [caseId]
    );
    if (caseRes.rows.length === 0) return;
    const petCase = caseRes.rows[0];
    if (petCase.type !== 'lost') return;

    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
    const caseUrl = `${frontendUrl}/caso/${caseId}`;
    const title = `👁 Nuevo avistamiento`;
    const body = `Avistaron a ${petCase.pet_name || 'tu mascota'} en ${sighting.description ? `${sighting.description}. ` : ''}Mirá los detalles.`;

    if (petCase.reporter_id) {
      sendPushToUser(petCase.reporter_id, { title, body, data: { url: caseUrl, caseId } }).catch(e => console.error('Sighting push error:', e));
    }

    if (petCase.reporter_source === 'whatsapp_bot' && petCase.pet_contact) {
      const phone = normalizePhone(petCase.pet_contact);
      if (phone && phone.length >= 12) {
        const text = `👁 *Nuevo avistamiento de ${petCase.pet_name || 'tu mascota'}*\n\n${sighting.description ? `📝 ${sighting.description}\n\n` : ''}📲 Seguí el caso: ${caseUrl}`;
        enqueue(phone, text).catch(async e => {
          console.warn('Sighting WhatsApp relay error:', e.message);
          try {
            const { sendMessage } = await import('./whatsappService.js');
            await sendMessage(phone, text);
          } catch (metaErr) {
            console.error('Sighting WhatsApp Meta fallback error:', metaErr.message);
          }
        });
      }
    }
  } catch (err) {
    console.error('notifySighting error:', err.message);
  }
}

// GET /api/cases/mine — casos del usuario logueado
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const cases = await getCasesForUser(req.user.id);
    res.json({ cases });
  } catch (err) {
    console.error('get my cases error:', err);
    res.status(500).json({ error: 'Error al obtener mis casos' });
  }
});

// GET /api/cases/followed — casos que el usuario sigue (auth)
router.get('/followed', requireAuth, async (req, res) => {
  try {
    const cases = await getFollowedCases(req.user.id);
    res.json({ cases });
  } catch (err) {
    console.error('get followed cases error:', err);
    res.status(500).json({ error: 'Error al obtener casos seguidos' });
  }
});

// GET /api/cases/:id/shares — shares del caso (IG/FB con links + WA informativo)
router.get('/:id/shares', async (req, res) => {
  try {
    const shares = await getCaseShares(req.params.id);
    res.json({ shares });
  } catch (err) {
    console.error('get case shares error:', err);
    res.status(500).json({ error: 'Error al obtener los shares' });
  }
});

// POST /api/cases/:id/comments/:commentId/reply — respuesta pública del owner/admin a un comentario IG o FB.
router.post('/:id/comments/:commentId/reply', requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'El texto de la respuesta es obligatorio' });

    const can = await canManageCase(req.params.id, req.user.id);
    if (!can) return res.status(403).json({ error: 'No tenés permisos para responder este caso' });

    const commentId = req.params.commentId;
    const ig = await pool.query(
      'SELECT id, ig_comment_id FROM instagram_comments WHERE id = $1',
      [commentId]
    );
    if (ig.rows.length > 0) {
      const { replyToComment } = await import('../services/instagramService.js');
      await replyToComment(ig.rows[0].ig_comment_id, text.trim());
      await pool.query('UPDATE instagram_comments SET replied = TRUE WHERE id = $1', [ig.rows[0].id]);
      return res.json({ success: true, platform: 'instagram' });
    }

    const fb = await pool.query(
      'SELECT id, fb_comment_id FROM facebook_page_comments WHERE id = $1',
      [commentId]
    );
    if (fb.rows.length > 0) {
      const { getStoredToken } = await import('../services/instagramService.js');
      const { default: axios } = await import('axios');
      const token = await getStoredToken();
      if (!token) return res.status(400).json({ error: 'Meta no conectado' });
      const { data } = await axios.post(
        `https://graph.facebook.com/v22.0/${fb.rows[0].fb_comment_id}/comments`,
        { message: text.trim(), access_token: token }
      );
      return res.json({ success: true, platform: 'facebook', replyId: data.id });
    }

    res.status(404).json({ error: 'Comentario no encontrado' });
  } catch (err) {
    console.error('reply comment error:', err);
    res.status(500).json({ error: err.response?.data?.error?.message || 'Error al responder el comentario' });
  }
});

// GET /api/cases/:id — dashboard público del caso (timeline completo visible).
// Acepta UUID o número de caso invocable (STH#####).
router.get('/:id', async (req, res) => {
  try {
    let caseId = req.params.id;
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(caseId)) {
      const petRes = await pool.query('SELECT id FROM pets WHERE case_number = $1 LIMIT 1', [caseId]);
      if (petRes.rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
      const caseRes = await pool.query('SELECT id FROM pet_cases WHERE pet_id = $1 LIMIT 1', [petRes.rows[0].id]);
      if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
      caseId = caseRes.rows[0].id;
    }
    // userId opcional para is_following (solo si hay token válido)
    let viewerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const { verifyToken } = await import('../auth.js');
        viewerId = verifyToken(authHeader.slice(7))?.id || null;
      } catch {}
    }
    const data = await getCaseDashboard(caseId, viewerId);
    if (!data) return res.status(404).json({ error: 'Caso no encontrado' });
    res.json({ case: data });
  } catch (err) {
    console.error('get case error:', err);
    res.status(500).json({ error: 'Error al obtener el caso' });
  }
});

// GET /api/cases — listado admin
router.get('/', requireAdmin, async (req, res) => {
  try {
    const status = req.query.status;
    const result = await pool.query(
      `SELECT pc.*, p.name AS pet_name, p.species AS pet_species, p.status AS pet_status,
              u.display_name AS reporter_name,
              (SELECT COUNT(*) FROM case_events ce WHERE ce.case_id = pc.id) AS event_count,
              (SELECT COUNT(*) FROM case_sightings cs WHERE cs.case_id = pc.id) AS sighting_count
       FROM pet_cases pc
       JOIN pets p ON p.id = pc.pet_id
       LEFT JOIN users u ON u.id = pc.reporter_id
       ${status ? 'WHERE pc.status = $1' : ''}
       ORDER BY pc.created_at DESC`,
      status ? [status] : []
    );
    res.json({ cases: result.rows });
  } catch (err) {
    console.error('list cases error:', err);
    res.status(500).json({ error: 'Error al listar casos' });
  }
});

// POST /api/cases/sightings/:id/hide — admin oculta/desoculta avistamiento
router.post('/sightings/:id/hide', requireAdmin, async (req, res) => {
  const { hidden } = req.body;
  try {
    const sighting = await setSightingHidden(req.params.id, hidden !== false);
    if (!sighting) return res.status(404).json({ error: 'Avistamiento no encontrado' });
    res.json({ sighting });
  } catch (err) {
    console.error('hide sighting error:', err);
    res.status(500).json({ error: 'Error al ocultar avistamiento' });
  }
});

// GET /api/cases/:id/sightings — lista de avistamientos del caso (ocultos excluidos salvo admin)
router.get('/:id/sightings', async (req, res) => {
  let isAdmin = false;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const { verifyToken } = await import('../auth.js');
      const user = verifyToken(token);
      const roleRes = await pool.query('SELECT role FROM users WHERE id = $1', [user.id]);
      isAdmin = roleRes.rows[0]?.role === 'admin';
    } catch {}
  }
  try {
    const sightings = await getSightings(req.params.id, isAdmin);
    res.json({ sightings });
  } catch (err) {
    console.error('get sightings error:', err);
    res.status(500).json({ error: 'Error al obtener avistamientos' });
  }
});

// GET /api/cases/:id/search-areas — lista de áreas cubiertas
router.get('/:id/search-areas', async (req, res) => {
  try {
    const areas = await getSearchAreas(req.params.id);
    res.json({ areas });
  } catch (err) {
    console.error('get search areas error:', err);
    res.status(500).json({ error: 'Error al obtener áreas de búsqueda' });
  }
});

// POST /api/cases/:id/sightings — reportar avistamiento (sin login, nombre obligatorio)
router.post('/:id/sightings', async (req, res) => {
  const { reporter_name, reporter_whatsapp, lat, lng, description, photo_data, photo_mime } = req.body;
  if (!reporter_name || !reporter_name.trim()) {
    return res.status(400).json({ error: 'Tu nombre es obligatorio' });
  }
  if (lat == null || lng == null || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
    return res.status(400).json({ error: 'Se requiere ubicación GPS' });
  }
  try {
    const caseRes = await pool.query('SELECT * FROM pet_cases WHERE id = $1', [req.params.id]);
    if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
    if (caseRes.rows[0].status === 'closed') {
      return res.status(400).json({ error: 'El caso ya está cerrado' });
    }
    const blacklisted = reporter_whatsapp ? await isPhoneBlacklisted(reporter_whatsapp) : false;
    const sighting = await addSighting(req.params.id, {
      reporterName: reporter_name.trim(),
      reporterWhatsapp: reporter_whatsapp || null,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      description: description || null,
      photoData: photo_data || null,
      photoMime: photo_mime || null,
      hidden: blacklisted,
    });
    if (!blacklisted) notifySighting(req.params.id, sighting);
    res.status(201).json({ sighting });
  } catch (err) {
    console.error('create sighting error:', err);
    res.status(500).json({ error: 'Error al reportar avistamiento' });
  }
});

// POST /api/cases/:id/search-areas — registrar área cubierta (logueado)
router.post('/:id/search-areas', requireAuth, async (req, res) => {
  const { area_geojson, notes } = req.body;
  if (!area_geojson || !area_geojson.type || !Array.isArray(area_geojson.coordinates)) {
    return res.status(400).json({ error: 'Se requiere un polígono GeoJSON válido' });
  }
  try {
    const caseRes = await pool.query('SELECT * FROM pet_cases WHERE id = $1', [req.params.id]);
    if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
    const area = await addSearchArea(req.params.id, req.user.id, { geojson: area_geojson, notes });
    res.status(201).json({ area });
  } catch (err) {
    console.error('create search area error:', err);
    res.status(500).json({ error: 'Error al registrar el área' });
  }
});

// PATCH /api/cases/:id/status — cambiar estado (reporter, dueño o admin)
router.patch('/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  if (!status || !['active', 'closed', 'pause'].includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    const caseRes = await pool.query('SELECT * FROM pet_cases WHERE id = $1', [req.params.id]);
    if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
    const petCase = caseRes.rows[0];
    if (!(await canManageCase(req.user.id, petCase))) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const updated = await pool.query(
      `UPDATE pet_cases SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    await createCaseEvent(req.params.id, 'status_changed', { from: petCase.status, to: status, changed_by: req.user.id });
    res.json({ case: updated.rows[0] });
  } catch (err) {
    console.error('update case status error:', err);
    res.status(500).json({ error: 'Error al actualizar el estado' });
  }
});

// POST /api/cases/:id/neighborhood-alert — enviar alerta vecinal a usuarios del barrio (reporter, dueño o admin)
router.post('/:id/neighborhood-alert', requireAuth, async (req, res) => {
  const { neighborhoods, radius_km } = req.body;
  try {
    const caseRes = await pool.query('SELECT * FROM pet_cases WHERE id = $1', [req.params.id]);
    if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
    const petCase = caseRes.rows[0];
    if (!(await canManageCase(req.user.id, petCase))) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const result = await sendNeighborhoodAlert(req.params.id, { neighborhoods, radiusKm: radius_km });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('send neighborhood alert error:', err);
    res.status(500).json({ error: 'Error al enviar la alerta' });
  }
});

// POST /api/cases/:id/meeting — proponer punto de encuentro (reporter, dueño o admin)
router.post('/:id/meeting', requireAuth, async (req, res) => {
  const { lat, lng, time, location } = req.body;
  if (!time) return res.status(400).json({ error: 'Se requiere fecha y hora del encuentro' });
  try {
    const caseRes = await pool.query('SELECT * FROM pet_cases WHERE id = $1', [req.params.id]);
    if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
    const petCase = caseRes.rows[0];
    if (!(await canManageCase(req.user.id, petCase))) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const result = await proposeMeeting(req.params.id, req.user.id, { lat, lng, time, location });
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) {
    console.error('propose meeting error:', err);
    res.status(500).json({ error: 'Error al proponer el encuentro' });
  }
});

// POST /api/cases/:id/reunite — confirmar reunión + foto opcional (reporter, dueño o admin)
router.post('/:id/reunite', requireAuth, async (req, res) => {
  const { photo_data, photo_mime, owner_name, owner_phone, owner_email, owner_address } = req.body;
  try {
    const caseRes = await pool.query('SELECT * FROM pet_cases WHERE id = $1', [req.params.id]);
    if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
    const petCase = caseRes.rows[0];
    if (!(await canManageCase(req.user.id, petCase))) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (petCase.status === 'closed') return res.status(400).json({ error: 'El caso ya está cerrado' });
    const result = await confirmReunion(req.params.id, req.user.id, {
      photoData: photo_data,
      photoMime: photo_mime,
      ownerName: owner_name,
      ownerPhone: owner_phone,
      ownerEmail: owner_email,
      ownerAddress: owner_address,
    });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('confirm reunion error:', err);
    res.status(500).json({ error: 'Error al confirmar la reunión' });
  }
});

// POST /api/cases/:id/close — cerrar caso con motivo (reporter, dueño o admin)
router.post('/:id/close', requireAuth, async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Se requiere un motivo de cierre' });
  try {
    const caseRes = await pool.query('SELECT * FROM pet_cases WHERE id = $1', [req.params.id]);
    if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
    const petCase = caseRes.rows[0];
    if (!(await canManageCase(req.user.id, petCase))) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    if (petCase.status === 'closed') return res.status(400).json({ error: 'El caso ya está cerrado' });
    const result = await closeCase(req.params.id, req.user.id, reason);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('close case error:', err);
    res.status(500).json({ error: 'Error al cerrar el caso' });
  }
});

// POST /api/cases/:id/renew — renovar la publicación 45 días más (reporter, dueño o admin)
router.post('/:id/renew', requireAuth, async (req, res) => {
  try {
    const caseRes = await pool.query('SELECT * FROM pet_cases WHERE id = $1', [req.params.id]);
    if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
    const petCase = caseRes.rows[0];
    if (!(await canManageCase(req.user.id, petCase))) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const result = await renewCase(req.params.id, req.user.id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('renew case error:', err);
    res.status(500).json({ error: 'Error al renovar el caso' });
  }
});

// POST /api/cases/:id/follow — seguir un caso (auth). No permite seguirse en casos propios.
router.post('/:id/follow', requireAuth, async (req, res) => {
  try {
    const caseRes = await pool.query('SELECT * FROM pet_cases WHERE id = $1', [req.params.id]);
    if (caseRes.rows.length === 0) return res.status(404).json({ error: 'Caso no encontrado' });
    const petCase = caseRes.rows[0];
    if (await canManageCase(req.user.id, petCase)) {
      return res.status(400).json({ error: 'Este es tu caso. No es necesario que lo sigas.' });
    }
    const result = await followCase(req.params.id, req.user.id);
    if (result.error) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (err) {
    console.error('follow case error:', err);
    res.status(500).json({ error: 'Error al seguir el caso' });
  }
});

// DELETE /api/cases/:id/follow — dejar de seguir un caso (auth)
router.delete('/:id/follow', requireAuth, async (req, res) => {
  try {
    const result = await unfollowCase(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    console.error('unfollow case error:', err);
    res.status(500).json({ error: 'Error al dejar de seguir el caso' });
  }
});

export default router;