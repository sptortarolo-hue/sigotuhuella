import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, requireCoordinator, sendMemberApprovalEmail, sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins, sendPushToUser } from '../services/pushService.js';
import { buildPetMessage } from '../services/facebookPublisher.js';
import { buildPetCaption } from '../services/instagramPublisher.js';
import { buildPetBroadcastCaption } from '../services/whatsappService.js';
import { getCaseShares, computeExpiry } from '../services/caseService.js';
import { nbOverlapSql } from '../services/neighborhoodUtils.js';
import { getCoordinatorZones, zonesAreEmpty, petInZones, coarseZoneSql } from '../services/coordinatorScope.js';

const router = Router();

// ─── Helpers de autorización y validación ──────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// Exige que el usuario tenga al menos una suscripción de voluntario activa
const requireActiveVolunteer = async (req, res, next) => {
  try {
    const r = await pool.query(
      "SELECT 1 FROM volunteer_subscriptions WHERE user_id = $1 AND status = 'active' LIMIT 1",
      [req.user.id]
    );
    if (r.rows.length === 0) {
      return res.status(403).json({ error: 'Se requiere ser voluntario activo' });
    }
    next();
  } catch (err) {
    console.error('Active volunteer check error:', err);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT vr.*, u.email, u.display_name FROM volunteer_requests vr LEFT JOIN users u ON u.id = vr.user_id ORDER BY vr.created_at DESC'
    );
    res.json({ requests: result.rows });
  } catch (err) {
    console.error('Get volunteer requests error:', err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { fullName, residenceZone, whatsapp, contributionAreas } = req.body;
  if (!fullName || !residenceZone || !whatsapp) {
    return res.status(400).json({ error: 'Full name, residence zone, and WhatsApp are required' });
  }
  // Validate max 3 contribution areas
  if (contributionAreas.length > 3) {
    return res.status(400).json({ error: 'Máximo 3 áreas de contribución permitidas.' });
  }
  try {
    const existing = await pool.query(
      "SELECT id FROM volunteer_requests WHERE user_id = $1 AND status IN ('pending', 'reviewed')",
      [req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Ya tenés una solicitud en proceso.' });
    }

    const userCheck = await pool.query(
      "SELECT volunteer_status FROM users WHERE id = $1",
      [req.user.id]
    );
    if (userCheck.rows[0]?.volunteer_status === 'active') {
      return res.status(400).json({ error: 'Ya sos socio activo.' });
    }
    const areas = JSON.stringify(contributionAreas || []);
    const result = await pool.query(
      'INSERT INTO volunteer_requests (full_name, residence_zone, whatsapp, user_id, contribution_areas) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [fullName, residenceZone, whatsapp, req.user.id, areas]
    );
    await pool.query(
      "UPDATE users SET volunteer_status = 'pending' WHERE id = $1",
      [req.user.id]
    );

    // Notify administrators of the new volunteer request
    const adminSubject = `📢 Nueva Solicitud de Socio: ${fullName}`;
    const areasList = (contributionAreas || []).length > 0
      ? `<tr>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #475569;">Áreas:</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155;">${(contributionAreas || []).join(', ')}</td>
        </tr>`
      : '';
    const adminHtml = `
      <p>Se ha recibido una nueva solicitud para convertirse en Socio / Voluntario:</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; width: 120px; color: #475569;">Nombre:</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155;">${fullName}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #475569;">Zona:</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155;">${residenceZone}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #475569;">WhatsApp:</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155;">${whatsapp}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #475569;">Usuario:</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155;">${req.user.email}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #475569;">Fecha:</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155;">${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</td>
        </tr>
        ${areasList}
      </table>
      <div style="text-align: center; margin-top: 25px;">
        <a href="https://sigotuhuella.com.ar/admin" 
           style="background-color: #3b82f6; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 10px; font-weight: bold; 
                  display: inline-block;">
          Ver Solicitudes en el Panel
        </a>
      </div>
    `;
    sendAdminNotificationEmail(adminSubject, adminHtml).catch(err => console.error('Failed to send admin volunteer notification:', err));

    sendPushToAdmins({
      title: '📢 Nueva solicitud de socio',
      body: `Solicitud de ${req.body.fullName || 'un vecino'}`,
      url: 'https://sigotuhuella.com.ar/admin',
    }).catch(err => console.error('Push error:', err));

    res.status(201).json({ request: result.rows[0] });
  } catch (err) {
    console.error('Create volunteer request error:', err);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

router.post('/force-reset', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE volunteer_requests SET status = 'pending' WHERE status = 'reviewed' RETURNING id"
    );
    res.json({ message: `Converted ${result.rowCount} records to pending` });
  } catch (err) {
    console.error('Force reset error:', err);
    res.status(500).json({ error: 'Failed to force reset status' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'reviewed', 'accepted', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const requestResult = await pool.query(
      'SELECT * FROM volunteer_requests WHERE id = $1',
      [req.params.id]
    );
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const volunteer = requestResult.rows[0];

    if (status === 'accepted') {
      let finalMemberNumber = '';
      if (volunteer.status === 'suspended') {
        await pool.query(
          "UPDATE users SET volunteer_status = 'active' WHERE id = $1",
          [volunteer.user_id]
        );
        const userRes = await pool.query('SELECT member_number FROM users WHERE id = $1', [volunteer.user_id]);
        finalMemberNumber = userRes.rows[0]?.member_number || '';
      } else {
        const counterResult = await pool.query(
          "SELECT MAX(CAST(SUBSTRING(member_number FROM 5) AS INTEGER)) as max_num FROM users WHERE member_number LIKE 'STH-%'"
        );
        const nextNum = (parseInt(counterResult.rows[0].max_num) || 0) + 1;
        const memberNumber = 'STH-' + String(nextNum).padStart(5, '0');
        finalMemberNumber = memberNumber;
        const volunteerBadge = JSON.stringify([{ code: 'volunteer', awarded_at: new Date().toISOString() }]);

        await pool.query(
          `UPDATE users SET
            member_number = COALESCE(member_number, $1),
            volunteer_status = 'active',
            badges = CASE
              WHEN badges IS NULL OR badges = '[]'::jsonb THEN $2::jsonb
              WHEN badges @> '[{"code": "volunteer"}]'::jsonb THEN badges
              ELSE badges || $2::jsonb
            END,
            contribution_areas = COALESCE(contribution_areas, '[]'::jsonb) || $4::jsonb
          WHERE id = $3`,
          [memberNumber, volunteerBadge, volunteer.user_id, JSON.stringify(volunteer.contribution_areas || [])]
        );

        // Award badges for each contribution area
        const areas = volunteer.contribution_areas || [];
        for (const area of areas) {
          const areaBadge = JSON.stringify([{ code: area, awarded_at: new Date().toISOString() }]);
          await pool.query(
            `UPDATE users SET
              badges = CASE
                WHEN badges IS NULL OR badges = '[]'::jsonb THEN $1::jsonb
                WHEN badges @> $2::jsonb THEN badges
                ELSE badges || $1::jsonb
              END
            WHERE id = $3`,
            [areaBadge, JSON.stringify([{ code: area }]), volunteer.user_id]
          );
        }
      }

      // Fetch user email and display name to send approval email
      const userRes = await pool.query('SELECT email, display_name, member_number FROM users WHERE id = $1', [volunteer.user_id]);
      if (userRes.rows.length > 0) {
        const dbUser = userRes.rows[0];
        sendMemberApprovalEmail(dbUser.email, dbUser.display_name, dbUser.member_number || finalMemberNumber)
          .catch(err => console.error('Failed to send member approval email:', err));

        sendPushToUser(volunteer.user_id, {
          title: '🎉 ¡Tu solicitud de socio fue aprobada!',
          body: `Tu número de socio: ${dbUser.member_number || finalMemberNumber}`,
          url: 'https://sigotuhuella.com.ar/sumate',
        }).catch(err => console.error('Push error:', err));
      }

      const result = await pool.query(
        'UPDATE volunteer_requests SET status = $1 WHERE id = $2 RETURNING *',
        [status, req.params.id]
      );
      res.json({ request: result.rows[0] });
    } else if (status === 'suspended') {
      await pool.query(
        "UPDATE users SET volunteer_status = 'suspended' WHERE id = $1",
        [volunteer.user_id]
      );
      const result = await pool.query(
        'UPDATE volunteer_requests SET status = $1 WHERE id = $2 RETURNING *',
        [status, req.params.id]
      );
      res.json({ request: result.rows[0] });
    } else {
      const result = await pool.query(
        'UPDATE volunteer_requests SET status = $1 WHERE id = $2 RETURNING *',
        [status, req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Request not found' });
      }
      res.json({ request: result.rows[0] });
    }
  } catch (err) {
    console.error('Update volunteer request error:', err);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const requestResult = await pool.query(
      'SELECT * FROM volunteer_requests WHERE id = $1',
      [req.params.id]
    );
    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const volunteer = requestResult.rows[0];
    if (volunteer.user_id) {
      await pool.query(
        "UPDATE users SET volunteer_status = 'none' WHERE id = $1",
        [volunteer.user_id]
      );
    }
    await pool.query('DELETE FROM volunteer_requests WHERE id = $1', [req.params.id]);
    res.json({ message: 'Request deleted' });
  } catch (err) {
    console.error('Delete volunteer request error:', err);
    res.status(500).json({ error: 'Failed to delete request' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  AGRUPACIONES
// ══════════════════════════════════════════════════════════════════════

router.get('/agrupaciones', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM agrupaciones WHERE is_active = TRUE ORDER BY name'
    );
    res.json({ agrupaciones: result.rows });
  } catch (err) {
    console.error('Get agrupaciones error:', err);
    res.status(500).json({ error: 'Failed to fetch agrupaciones' });
  }
});

router.get('/agrupaciones/all', requireCoordinator, async (req, res) => {
  try {
    let query = `SELECT a.*,
        cu.email as coordinator_email, cu.display_name as coordinator_name
       FROM agrupaciones a
       LEFT JOIN users cu ON cu.id = a.coordinator_user_id`;
    const params = [];

    if (req.user.role !== 'admin') {
      params.push(req.user.id);
      query += ` WHERE a.coordinator_user_id = $${params.length} AND a.is_active = TRUE`;
    }
    query += ` ORDER BY a.name`;

    const result = await pool.query(query, params);
    res.json({ agrupaciones: result.rows });
  } catch (err) {
    console.error('Get all agrupaciones error:', err);
    res.status(500).json({ error: 'Failed to fetch agrupaciones' });
  }
});

function validateZonePolygon(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > 300) return { ok: false };
  const ring = raw.map(p => Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p?.lat), Number(p?.lng)]);
  if (ring.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return { ok: false };
  return { ok: true, value: ring };
}

// GET /api/volunteers/my-zone-feed — Tablero del coordinador: último post FB/IG
// e historial de publicaciones de mascotas dentro de su zona (barrios o polígono)
router.get('/my-zone-feed', requireCoordinator, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(400).json({ error: 'Endpoint solo para coordinadores' });
    }
    const zones = await getCoordinatorZones(pool, req.user.id);
    if (zonesAreEmpty(zones)) return res.json({ instagram: null, facebook: null, history: [] });

    const params = [JSON.stringify(zones.neighborhoodIds)];
    const zoneCond = coarseZoneSql(params.length, zones.polygons.length > 0);

    const igRes = await pool.query(
      `SELECT ip.id, ip.pet_id, ip.ig_permalink, ip.caption, ip.published_at,
              p.name AS pet_name, p.neighborhoods AS pet_neighborhoods,
              p.latitude AS pet_latitude, p.longitude AS pet_longitude
       FROM instagram_posts ip
       JOIN pets p ON p.id = ip.pet_id
       WHERE ip.status = 'published' AND ip.ig_permalink IS NOT NULL AND ${zoneCond}
       ORDER BY ip.published_at DESC NULLS LAST LIMIT 50`,
      params
    );
    const fbRes = await pool.query(
      `SELECT fpp.id, fpp.pet_id, fpp.page_post_id, fpp.message, fpp.published_at,
              p.name AS pet_name, p.neighborhoods AS pet_neighborhoods,
              p.latitude AS pet_latitude, p.longitude AS pet_longitude
       FROM facebook_page_posts fpp
       JOIN pets p ON p.id = fpp.pet_id
       WHERE fpp.status = 'published' AND fpp.page_post_id IS NOT NULL AND ${zoneCond}
       ORDER BY fpp.published_at DESC NULLS LAST LIMIT 50`,
      params
    );

    const inZone = r => petInZones(
      { neighborhoods: r.pet_neighborhoods, latitude: r.pet_latitude, longitude: r.pet_longitude },
      zones
    );

    const igMatches = igRes.rows.filter(inZone);
    const fbMatches = fbRes.rows.filter(inZone);

    const shape = (r, platform) => ({
      pet_id: r.pet_id,
      pet_name: r.pet_name,
      image_url: `/api/images/pet/${r.pet_id}/cover`,
      permalink: platform === 'instagram' ? r.ig_permalink : `https://www.facebook.com/${r.page_post_id}`,
      caption: r.caption || r.message || '',
      published_at: r.published_at,
      platform,
    });

    const history = [
      ...igMatches.map(r => shape(r, 'instagram')),
      ...fbMatches.map(r => shape(r, 'facebook')),
    ]
      .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
      .slice(0, 30);

    res.json({
      instagram: igMatches.length > 0 ? shape(igMatches[0], 'instagram') : null,
      facebook: fbMatches.length > 0 ? shape(fbMatches[0], 'facebook') : null,
      history,
    });
  } catch (err) {
    console.error('my-zone-feed error:', err);
    res.status(500).json({ error: 'Error al obtener el feed de la zona' });
  }
});

router.post('/agrupaciones', requireAdmin, async (req, res) => {
  const { name, description, neighborhoods, zone_polygon, contact_whatsapp, contact_email, logo_url, admin_user_id, coordinator_user_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  let polyValue = null;
  if (zone_polygon !== undefined && zone_polygon !== null && (!Array.isArray(zone_polygon) || zone_polygon.length > 0)) {
    const poly = validateZonePolygon(zone_polygon);
    if (!poly.ok) return res.status(400).json({ error: 'Polígono de zona inválido (mínimo 3 puntos)' });
    polyValue = JSON.stringify(poly.value);
  }
  try {
    const result = await pool.query(
      `INSERT INTO agrupaciones (name, description, neighborhoods, zone_polygon, contact_whatsapp, contact_email, logo_url, admin_user_id, coordinator_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, description || null, JSON.stringify(neighborhoods || []), polyValue, contact_whatsapp || null, contact_email || null, logo_url || null, admin_user_id || null, coordinator_user_id || null]
    );
    res.status(201).json({ agrupacion: result.rows[0] });
  } catch (err) {
    console.error('Create agrupacion error:', err);
    res.status(500).json({ error: 'Failed to create agrupacion' });
  }
});

router.put('/agrupaciones/:id', requireCoordinator, async (req, res) => {
  const { name, description, neighborhoods, zone_polygon, contact_whatsapp, contact_email, logo_url, is_active, coordinator_user_id } = req.body;
  const polyProvided = zone_polygon !== undefined;
  const poly = validateZonePolygon(zone_polygon);
  // undefined = no tocar; [] = limpiar; array válido = reemplazar
  if (!poly.ok && !(polyProvided && zone_polygon !== null && (zone_polygon.length === 0))) {
    return res.status(400).json({ error: 'Polígono de zona inválido (mínimo 3 puntos)' });
  }
  const polyValue = !polyProvided ? null
    : (Array.isArray(poly.value) ? JSON.stringify(poly.value) : null);
  try {
    if (req.user.role !== 'admin') {
      const ownership = await pool.query(
        'SELECT 1 FROM agrupaciones WHERE id = $1 AND coordinator_user_id = $2',
        [req.params.id, req.user.id]
      );
      if (ownership.rows.length === 0) {
        return res.status(403).json({ error: 'No tenés acceso a esta agrupación' });
      }
    }
    const result = await pool.query(
      `UPDATE agrupaciones SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        neighborhoods = COALESCE($3, neighborhoods),
        zone_polygon = CASE WHEN $11 THEN COALESCE($4, zone_polygon) ELSE $4 END,
        contact_whatsapp = COALESCE($5, contact_whatsapp),
        contact_email = COALESCE($6, contact_email),
        logo_url = COALESCE($7, logo_url),
        is_active = COALESCE($8, is_active),
        coordinator_user_id = $9
       WHERE id = $10 RETURNING *`,
      [name, description, neighborhoods ? JSON.stringify(neighborhoods) : null, polyValue, contact_whatsapp, contact_email, logo_url, is_active, coordinator_user_id || null, req.params.id, !polyProvided]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agrupacion not found' });
    res.json({ agrupacion: result.rows[0] });
  } catch (err) {
    console.error('Update agrupacion error:', err);
    res.status(500).json({ error: 'Failed to update agrupacion' });
  }
});

router.delete('/agrupaciones/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE agrupaciones SET is_active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ message: 'Agrupacion deactivated' });
  } catch (err) {
    console.error('Delete agrupacion error:', err);
    res.status(500).json({ error: 'Failed to delete agrupacion' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  SUSCRIPCIONES DE VOLUNTARIOS
// ══════════════════════════════════════════════════════════════════════

router.get('/categories', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM volunteer_categories WHERE is_active = TRUE ORDER BY id'
    );
    res.json({ categories: result.rows });
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.get('/my-subscriptions', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT vs.*, a.name as agrupacion_name, a.neighborhoods as agrupacion_neighborhoods,
              vc.name as category_name, vc.description as category_description, vc.icon as category_icon
       FROM volunteer_subscriptions vs
       JOIN agrupaciones a ON a.id = vs.agrupacion_id AND a.is_active = TRUE
       JOIN volunteer_categories vc ON vc.id = vs.category AND vc.is_active = TRUE
       WHERE vs.user_id = $1 AND vs.status = 'active'
       ORDER BY a.name, vs.category`,
      [req.user.id]
    );
    res.json({ subscriptions: result.rows });
  } catch (err) {
    console.error('Get my subscriptions error:', err);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

router.post('/subscribe', requireAuth, async (req, res) => {
  const { agrupacion_id, category } = req.body;
  if (!agrupacion_id || !category) {
    return res.status(400).json({ error: 'agrupacion_id and category are required' });
  }
  try {
    const agrupacion = await pool.query('SELECT id FROM agrupaciones WHERE id = $1 AND is_active = TRUE', [agrupacion_id]);
    if (agrupacion.rows.length === 0) return res.status(404).json({ error: 'Agrupacion not found' });

    const catCheck = await pool.query('SELECT id FROM volunteer_categories WHERE id = $1 AND is_active = TRUE', [category]);
    if (catCheck.rows.length === 0) return res.status(400).json({ error: 'Invalid or inactive category' });

    const result = await pool.query(
      `INSERT INTO volunteer_subscriptions (user_id, agrupacion_id, category, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (user_id, agrupacion_id, category)
       DO UPDATE SET status = 'active'
       RETURNING *`,
      [req.user.id, agrupacion_id, category]
    );
    res.status(201).json({ subscription: result.rows[0] });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

router.post('/unsubscribe', requireAuth, async (req, res) => {
  const { agrupacion_id, category } = req.body;
  try {
    await pool.query(
      "UPDATE volunteer_subscriptions SET status = 'inactive' WHERE user_id = $1 AND agrupacion_id = $2 AND category = $3",
      [req.user.id, agrupacion_id, category]
    );
    res.json({ message: 'Unsubscribed' });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  SHARE LOGS
// ══════════════════════════════════════════════════════════════════════

router.post('/share-log', requireAuth, async (req, res) => {
  const { pet_id, platform, share_type, groups } = req.body;
  if (!pet_id || !platform) {
    return res.status(400).json({ error: 'pet_id and platform are required' });
  }
  if (!validUuid(pet_id)) {
    return res.status(400).json({ error: 'Invalid pet id' });
  }
  if (groups !== undefined && !Array.isArray(groups)) {
    return res.status(400).json({ error: 'groups must be an array' });
  }
  try {
    const petCheck = await pool.query('SELECT id FROM pets WHERE id = $1', [pet_id]);
    if (petCheck.rows.length === 0) return res.status(404).json({ error: 'Pet not found' });

    // Resolver agrupacion_id del voluntario (primera suscripción activa)
    let agrupacionId = null;
    const subRes = await pool.query(
      'SELECT agrupacion_id FROM volunteer_subscriptions WHERE user_id = $1 AND status = \'active\' LIMIT 1',
      [req.user.id]
    );
    if (subRes.rows.length > 0) agrupacionId = subRes.rows[0].agrupacion_id;

    const result = await pool.query(
      'INSERT INTO share_logs (pet_id, user_id, platform, share_type, agrupacion_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [pet_id, req.user.id, String(platform).slice(0, 50), typeof share_type === 'string' ? share_type.slice(0, 20) : 'link', agrupacionId]
    );

    // Si el voluntario seleccionó grupos, registrar cada uno en el timeline del caso
    const caseEvents = [];
    if (Array.isArray(groups) && groups.length > 0) {
      const { recordSocialShare } = await import('../services/caseService.js');
      for (const group of groups.slice(0, 20)) {
        if (!group || typeof group.name !== 'string') continue;
        const evt = await recordSocialShare(pet_id, req.user.id, {
          platform: platform || 'facebook',
          group_name: group.name.slice(0, 255),
          group_url: typeof group.url === 'string' ? group.url : null,
          post_url: typeof group.post_url === 'string' && group.post_url.trim() ? group.post_url.trim() : null,
          share_log_id: result.rows[0].id,
        });
        if (evt) caseEvents.push(evt);
      }
      // Auto-proponer al catálogo los grupos que aún no existen (pendientes de aprobación admin)
      try {
        const norm = (s) => String(s).toLowerCase().trim().replace(/\s+/g, ' ');
        const existRes = await pool.query('SELECT group_name FROM fb_search_groups');
        const known = new Set(existRes.rows.map(r => norm(r.group_name)));
        for (const group of groups.slice(0, 20)) {
          if (!group || typeof group.name !== 'string') continue;
          const name = norm(group.name);
          if (!name || known.has(name)) continue;
          await pool.query(
            `INSERT INTO fb_search_groups (group_name, group_url, requested_by, approved)
             VALUES ($1, $2, $3, FALSE)`,
            [group.name.trim().slice(0, 255), typeof group.url === 'string' && group.url.trim() ? group.url.trim() : null, req.user.id]
          );
          known.add(name);
        }
      } catch (proposeErr) {
        console.error('Auto-propose fb groups error:', proposeErr);
      }
    }

    res.status(201).json({ log: result.rows[0], case_events: caseEvents });
  } catch (err) {
    console.error('Share log error:', err);
    res.status(500).json({ error: 'Failed to log share' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  SHARE STATS
// ══════════════════════════════════════════════════════════════════════

router.get('/share-stats', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT platform, COUNT(*) as count FROM share_logs WHERE user_id = $1 GROUP BY platform`,
      [req.user.id]
    );
    const total = await pool.query(
      'SELECT COUNT(*) as total FROM share_logs WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ stats: result.rows, total: parseInt(total.rows[0].total) });
  } catch (err) {
    console.error('Share stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Actualiza la URL de un share_log y su case_event asociado (futuro: scraper detecta el post)
router.put('/share-log/:id/url', requireAdmin, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });
  if (!validUuid(req.params.id)) return res.status(404).json({ error: 'Share log not found' });
  try {
    const logRes = await pool.query('UPDATE share_logs SET url = $1 WHERE id = $2 RETURNING *', [url, req.params.id]);
    if (logRes.rows.length === 0) return res.status(404).json({ error: 'Share log not found' });
    const log = logRes.rows[0];
    // Actualizar el case_event asociado si tiene share_log_id en el payload
    await pool.query(
      `UPDATE case_events SET payload = payload || $1::jsonb
       WHERE event_type = 'social_shared' AND (payload->>'share_log_id')::uuid = $2`,
      [JSON.stringify({ url, status: 'url_captured' }), log.id]
    );
    res.json({ log });
  } catch (err) {
    console.error('Update share URL error:', err);
    res.status(500).json({ error: 'Failed to update URL' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  MEMBRESÍA DE GRUPOS — el voluntario dice en cuáles es miembro
// ══════════════════════════════════════════════════════════════════════

router.get('/volunteer-group-memberships', requireAuth, requireActiveVolunteer, async (req, res) => {
  try {
    const subsRes = await pool.query(
      'SELECT agrupacion_id FROM volunteer_subscriptions WHERE user_id = $1 AND status = \'active\'',
      [req.user.id]
    );
    const agrupacionIds = subsRes.rows.map(r => r.agrupacion_id);
    if (agrupacionIds.length === 0) return res.json({ memberships: [] });

    const placeholders = agrupacionIds.map((_, i) => '$' + (i + 1)).join(',');
    const groupsRes = await pool.query(
      `SELECT fsg.id, fsg.group_name, fsg.group_url, fsg.agrupacion_id, a.name AS agrupacion_name
       FROM fb_search_groups fsg
       LEFT JOIN agrupaciones a ON a.id = fsg.agrupacion_id
       WHERE fsg.approved = TRUE AND fsg.agrupacion_id IN (${placeholders})
       ORDER BY fsg.group_name`,
      agrupacionIds
    );

    const membershipRes = await pool.query(
      `SELECT group_id, is_member FROM volunteer_group_memberships WHERE user_id = $1`,
      [req.user.id]
    );
    const membershipMap = new Map(membershipRes.rows.map(r => [String(r.group_id), r.is_member]));

    const memberships = groupsRes.rows.map(g => ({
      group_id: g.id,
      group_name: g.group_name,
      group_url: g.group_url,
      agrupacion_id: g.agrupacion_id,
      agrupacion_name: g.agrupacion_name || null,
      is_member: membershipMap.get(String(g.id)) ?? false,
    }));

    res.json({ memberships });
  } catch (err) {
    console.error('Get memberships error:', err);
    res.status(500).json({ error: 'Failed to fetch memberships' });
  }
});

router.put('/volunteer-group-memberships/:groupId', requireAuth, requireActiveVolunteer, async (req, res) => {
  const { is_member } = req.body;
  if (typeof is_member !== 'boolean') return res.status(400).json({ error: 'is_member must be boolean' });
  if (!validUuid(req.params.groupId)) return res.status(400).json({ error: 'Invalid group id' });
  try {
    await pool.query(
      `INSERT INTO volunteer_group_memberships (user_id, group_id, is_member, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, group_id) DO UPDATE SET is_member = $3, updated_at = NOW()`,
      [req.user.id, req.params.groupId, is_member]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Update membership error:', err);
    res.status(500).json({ error: 'Failed to update membership' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  ADMIN: STATS DE DIFUSIÓN POR AGRUPACIÓN Y VOLUNTARIO
// ══════════════════════════════════════════════════════════════════════

router.get('/admin/diffusion-stats', requireCoordinator, async (req, res) => {
  try {
    const { agrupacion_id } = req.query;
    let query = `
      SELECT
        a.id AS agrupacion_id, a.name AS agrupacion_name,
        u.id AS user_id, u.display_name,
        COUNT(sl.id) AS total_shares,
        MAX(sl.created_at) AS last_share_at
      FROM agrupaciones a
      JOIN volunteer_subscriptions vs ON vs.agrupacion_id = a.id AND vs.status = 'active'
      JOIN users u ON u.id = vs.user_id
      LEFT JOIN share_logs sl ON sl.user_id = u.id AND sl.agrupacion_id = a.id
        AND sl.created_at > NOW() - INTERVAL '30 days'
      WHERE a.is_active = TRUE
    `;
    const params = [];
    if (agrupacion_id && validUuid(agrupacion_id)) {
      params.push(agrupacion_id);
      query += ` AND a.id = $${params.length}`;
    }
    if (req.user.role !== 'admin') {
      params.push(req.user.id);
      query += ` AND a.coordinator_user_id = $${params.length}`;
    }
    query += ` GROUP BY a.id, a.name, u.id, u.display_name ORDER BY a.name, total_shares DESC`;

    const result = await pool.query(query, params);
    res.json({ stats: result.rows });
  } catch (err) {
    console.error('Diffusion stats error:', err);
    res.status(500).json({ error: 'Failed to fetch diffusion stats' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  ADMIN: GESTIÓN DE MEMBRESÍA DE GRUPOS
// ══════════════════════════════════════════════════════════════════════

router.get('/admin/group-memberships', requireCoordinator, async (req, res) => {
  try {
    const { user_id, agrupacion_id } = req.query;

    let query = `
      SELECT
        fg.id AS group_id, fg.group_name, fg.group_url, fg.agrupacion_id,
        COALESCE(vgm.user_id, NULL) AS user_id,
        COALESCE(vgm.is_member, FALSE) AS is_member
      FROM fb_search_groups fg
      LEFT JOIN volunteer_group_memberships vgm ON vgm.group_id = fg.id
    `;
    const params = [];
    const conditions = [];

    if (req.user.role !== 'admin') {
      params.push(req.user.id);
      conditions.push(`fg.agrupacion_id IN (SELECT id FROM agrupaciones WHERE coordinator_user_id = $${params.length})`);
    }

    if (user_id && validUuid(user_id)) {
      params.push(user_id);
      conditions.push(`(vgm.user_id = $${params.length} OR vgm.user_id IS NULL)`);
    }
    if (agrupacion_id && validUuid(agrupacion_id)) {
      params.push(agrupacion_id);
      conditions.push(`fg.agrupacion_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ` ORDER BY fg.group_name, fg.agrupacion_id`;

    const result = await pool.query(query, params);

    // Group by group_id, each with array of user memberships
    const groupsMap = new Map();
    for (const row of result.rows) {
      if (!groupsMap.has(row.group_id)) {
        groupsMap.set(row.group_id, {
          group_id: row.group_id,
          group_name: row.group_name,
          group_url: row.group_url,
          agrupacion_id: row.agrupacion_id,
          memberships: [],
        });
      }
      if (row.user_id) {
        groupsMap.get(row.group_id).memberships.push({
          user_id: row.user_id,
          is_member: row.is_member,
        });
      }
    }

    res.json({ groups: Array.from(groupsMap.values()) });
  } catch (err) {
    console.error('Admin group memberships error:', err);
    res.status(500).json({ error: 'Failed to fetch group memberships' });
  }
});

router.put('/admin/group-memberships/:groupId', requireAdmin, async (req, res) => {
  if (!validUuid(req.params.groupId)) return res.status(400).json({ error: 'Invalid group id' });
  const { user_id, is_member } = req.body;
  if (!user_id || !validUuid(user_id)) return res.status(400).json({ error: 'Invalid user_id' });

  try {
    if (is_member) {
      await pool.query(
        `INSERT INTO volunteer_group_memberships (user_id, group_id, is_member, updated_at)
         VALUES ($1, $2, TRUE, NOW())
         ON CONFLICT (user_id, group_id)
         DO UPDATE SET is_member = TRUE, updated_at = NOW()`,
        [user_id, req.params.groupId]
      );
    } else {
      await pool.query(
        `DELETE FROM volunteer_group_memberships
         WHERE user_id = $1 AND group_id = $2`,
        [user_id, req.params.groupId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Admin group membership toggle error:', err);
    res.status(500).json({ error: 'Failed to toggle membership' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  SHARE PREVIEW — captions por plataforma (mismos que auto-publishers)
// ══════════════════════════════════════════════════════════════════════

router.get('/share-preview/:petId', requireAuth, requireActiveVolunteer, async (req, res) => {
  if (!validUuid(req.params.petId)) return res.status(400).json({ error: 'Invalid pet id' });
  try {
    const petRes = await pool.query(
      `SELECT p.*, u.display_name as author_name
       FROM pets p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.id = $1`,
      [req.params.petId]
    );
    if (petRes.rows.length === 0) return res.status(404).json({ error: 'Pet not found' });
    const pet = petRes.rows[0];

    const hashtagsRes = await pool.query("SELECT value FROM settings WHERE key = 'instagram_default_hashtags'");
    const hashtags = hashtagsRes.rows[0]?.value || '#SigoTuHuella #MascotasPerdidas #AdoptaNoCompres';

    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
    const originalUrl = null;

    const facebook = buildPetMessage(pet, hashtags, originalUrl, pet.author_name || null);
    const instagram = buildPetCaption(pet, hashtags);
    const whatsapp = await buildPetBroadcastCaption(pet);

    res.json({ facebook, instagram, whatsapp });
  } catch (err) {
    console.error('Share preview error:', err);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  PET ACTION CENTER — datos completos para que el voluntario actúe
//  (publicaciones FB/IG + captions + grupos + categorías del voluntario)
// ══════════════════════════════════════════════════════════════════════

router.get('/pet-action-center/:petId', requireAuth, requireActiveVolunteer, async (req, res) => {
  const petId = req.params.petId;
  if (!validUuid(petId)) return res.status(400).json({ error: 'Invalid pet id' });
  try {
    // Mascota + contacto del reportante (solo visibles para voluntarios activos)
    const petRes = await pool.query(
      `SELECT p.id, p.name, p.species, p.breed, p.color, p.gender, p.age, p.status,
              p.location, p.neighborhoods, p.description, p.created_at, p.is_hidden,
              u.display_name as reporter_name, u.phone as reporter_phone
       FROM pets p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.id = $1`,
      [petId]
    );
    if (petRes.rows.length === 0) return res.status(404).json({ error: 'Pet not found' });
    const pet = petRes.rows[0];

    // Caso más reciente de la mascota (para publicaciones, timeline y vigencia)
    const caseRes = await pool.query(
      'SELECT id, status as case_status, active_until FROM pet_cases WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 1',
      [petId]
    );
    const petCase = caseRes.rows[0] || null;
    const caseId = petCase?.id || null;
    const expiry = computeExpiry(petCase?.case_status, petCase?.active_until);

    // Publicaciones reales: IG permalinks + posts de página/grupos FB (getCaseShares)
    let publications = { facebook: null, instagram: null };
    if (caseId) {
      try {
        const shares = await getCaseShares(caseId);
        const fbPost = shares.find(s => s.platform === 'facebook' && s.url);
        const igPost = shares.find(s => s.platform === 'instagram' && s.url);
        if (fbPost) {
          publications.facebook = { url: fbPost.url, group_count: fbPost.group_count || 0, date: fbPost.date };
        }
        if (igPost) {
          publications.instagram = { permalink: igPost.url, date: igPost.date };
        }
      } catch (sharesErr) {
        console.error('Action center shares error:', sharesErr);
        // Degradar sin publicaciones en vez de fallar todo el endpoint
      }
    }

    // Captions por plataforma (mismos builders que los auto-publishers)
    let sharePreview = { facebook: '', instagram: '', whatsapp: '' };
    try {
      const fullPetRes = await pool.query(
        `SELECT p.*, u.display_name as author_name FROM pets p
         LEFT JOIN users u ON u.id = p.created_by WHERE p.id = $1`,
        [petId]
      );
      const hashtagsRes = await pool.query("SELECT value FROM settings WHERE key = 'instagram_default_hashtags'");
      const hashtags = hashtagsRes.rows[0]?.value || '#SigoTuHuella #MascotasPerdidas #AdoptaNoCompres';
      const fp = fullPetRes.rows[0];
      sharePreview = {
        facebook: buildPetMessage(fp, hashtags, null, fp.author_name || null),
        instagram: buildPetCaption(fp, hashtags),
        whatsapp: await buildPetBroadcastCaption(fp),
      };
    } catch (capErr) {
      console.error('Action center captions error:', capErr);
    }

    // Categorías activas de ESTE voluntario (definen las tabs)
    const catsRes = await pool.query(
      `SELECT DISTINCT vc.name
       FROM volunteer_subscriptions vs
       JOIN volunteer_categories vc ON vc.id = vs.category
       WHERE vs.user_id = $1 AND vs.status = 'active'`,
      [req.user.id]
    );
    const volunteerCategories = catsRes.rows.map(r => r.name);

    // Agrupaciones activas del voluntario
    const subsRes = await pool.query(
      `SELECT agrupacion_id FROM volunteer_subscriptions WHERE user_id = $1 AND status = 'active'`,
      [req.user.id]
    );
    const agrupacionIds = subsRes.rows.map(r => r.agrupacion_id);

    // Grupos FB aprobados: filtrados por agrupaciones del voluntario + globales (sin agrupacion)
    let groupsRes;
    if (agrupacionIds.length > 0) {
      const placeholders = agrupacionIds.map((_, i) => '$' + (i + 1)).join(',');
      groupsRes = await pool.query(
        `SELECT group_name, group_url, zone, agrupacion_id FROM fb_search_groups
         WHERE approved = TRUE AND (agrupacion_id IS NULL OR agrupacion_id IN (${placeholders}))
         ORDER BY group_name`,
        agrupacionIds
      );
    } else {
      groupsRes = await pool.query(
        'SELECT group_name, group_url, zone, agrupacion_id FROM fb_search_groups WHERE approved = TRUE AND agrupacion_id IS NULL ORDER BY group_name'
      );
    }

    // Hallazgos previos de esta mascota (para no duplicar avistamientos)
    const findingsRes = await pool.query(
      `SELECT vf.id, vf.fb_url, vf.description, vf.group_name, vf.confirmed_by_owner, vf.created_at,
              u.display_name as volunteer_name
       FROM volunteer_findings vf LEFT JOIN users u ON u.id = vf.user_id
       WHERE vf.pet_id = $1 ORDER BY vf.created_at DESC LIMIT 10`,
      [petId]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
    res.json({
      pet,
      case_id: caseId,
      case_status: petCase?.case_status || null,
      active_until: petCase?.active_until || null,
      expired: expiry.expired,
      days_left: expiry.days_left,
      timeline_url: caseId ? `${frontendUrl}/case/${caseId}` : null,
      publications,
      sharePreview,
      volunteerCategories,
      agrupacionIds,
      fbSearchGroups: groupsRes.rows,
      recentFindings: findingsRes.rows,
    });
  } catch (err) {
    console.error('Action center error:', err);
    res.status(500).json({ error: 'Failed to fetch action center data' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  COLA DE DIFUSIÓN
// ══════════════════════════════════════════════════════════════════════

const REPOST_WINDOW_DAYS = 5;

router.get('/diffusion-queue', requireAuth, requireActiveVolunteer, async (req, res) => {
  try {
    const subsRes = await pool.query(
      `SELECT DISTINCT a.neighborhoods
       FROM volunteer_subscriptions vs
       JOIN agrupaciones a ON a.id = vs.agrupacion_id
       WHERE vs.user_id = $1 AND vs.status = 'active'`,
      [req.user.id]
    );
    const allNeighborhoods = [...new Set(subsRes.rows.flatMap(r => r.neighborhoods || []))];

    const emptyBuckets = { nuevos: [], repostear: [], al_dia: [], pausados: [] };
    if (allNeighborhoods.length === 0) {
      return res.json({
        buckets: emptyBuckets,
        counts: { nuevos: 0, repostear: 0, al_dia: 0, pausados: 0 },
        window_days: REPOST_WINDOW_DAYS,
      });
    }

    const petsRes = await pool.query(
      `SELECT p.id, p.name, p.species, p.status, p.location, p.neighborhoods, p.created_at,
              pc.id as case_id, pc.status as case_status, pc.active_until,
              sl.last_share_at,
              (SELECT COUNT(*) FROM share_logs s2 WHERE s2.pet_id = p.id AND s2.user_id = $2) as my_share_count
       FROM pets p
       JOIN pet_cases pc ON pc.id = (
         SELECT id FROM pet_cases WHERE pet_id = p.id ORDER BY created_at DESC LIMIT 1
       )
       LEFT JOIN LATERAL (
         SELECT MAX(created_at) as last_share_at
         FROM share_logs WHERE pet_id = p.id AND user_id = $2
       ) sl ON TRUE
       WHERE p.status IN ('lost', 'transitada', 'found', 'retained', 'accidented', 'needs_attention')
         AND ${nbOverlapSql('$1', "(NULLIF(p.neighborhoods, '')::jsonb)")}
         AND p.is_hidden = FALSE
       ORDER BY CASE WHEN p.status IN ('accidented', 'needs_attention') THEN 0 ELSE 1 END,
                p.created_at DESC
       LIMIT 200`,
      [JSON.stringify(allNeighborhoods), req.user.id]
    );

    const now = Date.now();
    const cutoffMs = REPOST_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    // Calcular cobertura: cuántos grupos de las agrupaciones del voluntario están cubiertos por caso
    const petIds = petsRes.rows.map(r => r.id);
    let coverageMap = new Map(); // pet_id -> Set<group_name>
    let totalGroups = 0;

    if (petIds.length > 0 && agrupacionIds.length > 0) {
      // Total de grupos de las agrupaciones del voluntario
      const grpPlaceholders = agrupacionIds.map((_, i) => '$' + (i + 1)).join(',');
      const totalGrpRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM fb_search_groups
         WHERE approved = TRUE AND agrupacion_id IN (${grpPlaceholders})`,
        agrupacionIds
      );
      totalGroups = parseInt(totalGrpRes.rows[0].cnt, 10) || 0;

      // Grupos cubiertos por caso (social_shared + facebook_replica en ventana)
      if (totalGroups > 0) {
        const petPlaceholders = petIds.map((_, i) => '$' + (i + 2)).join(',');
        const covRes = await pool.query(
          `SELECT pc.pet_id, ce.payload->>'group_name' AS group_name
           FROM case_events ce
           JOIN pet_cases pc ON pc.id = ce.case_id
           WHERE pc.pet_id IN (${petPlaceholders})
             AND ce.event_type IN ('social_shared', 'facebook_replica')
             AND ce.payload->>'group_name' IS NOT NULL
             AND ce.created_at > NOW() - make_interval(days => $1)`,
          [REPOST_WINDOW_DAYS, ...petIds]
        );
        for (const row of covRes.rows) {
          if (!coverageMap.has(row.pet_id)) coverageMap.set(row.pet_id, new Set());
          coverageMap.get(row.pet_id).add(row.group_name.toLowerCase().trim());
        }
      }
    }

    const buckets = { nuevos: [], repostear: [], al_dia: [], pausados: [] };

    for (const row of petsRes.rows) {
      const expiry = computeExpiry(row.case_status, row.active_until);
      if (row.case_status === 'archived') continue;

      const covered = coverageMap.get(row.id)?.size || 0;
      // Si todos los grupos están cubiertos, excluir de la cola
      if (totalGroups > 0 && covered >= totalGroups) continue;

      const item = {
        id: row.id,
        name: row.name,
        species: row.species,
        status: row.status,
        location: row.location,
        neighborhoods: row.neighborhoods,
        created_at: row.created_at,
        case_id: row.case_id,
        days_left: expiry.days_left,
        my_last_share_at: row.last_share_at || null,
        my_share_count: parseInt(row.my_share_count, 10) || 0,
        groups_covered: covered,
        groups_total: totalGroups,
      };
      if (expiry.expired) {
        buckets.pausados.push(item);
      } else if (!row.last_share_at) {
        buckets.nuevos.push(item);
      } else if (now - new Date(row.last_share_at).getTime() > cutoffMs) {
        buckets.repostear.push(item);
      } else {
        buckets.al_dia.push(item);
      }
    }

    res.json({
      buckets,
      counts: {
        nuevos: buckets.nuevos.length,
        repostear: buckets.repostear.length,
        al_dia: buckets.al_dia.length,
        pausados: buckets.pausados.length,
      },
      window_days: REPOST_WINDOW_DAYS,
    });
  } catch (err) {
    console.error('Diffusion queue error:', err);
    res.status(500).json({ error: 'Failed to fetch diffusion queue' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  NOTIFICACIONES IN-APP
// ══════════════════════════════════════════════════════════════════════

router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    const unread = await pool.query(
      "SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
      [req.user.id]
    );
    res.json({ notifications: result.rows, unread: parseInt(unread.rows[0].count) });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.put('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL",
      [req.user.id]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Read notifications error:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

router.put('/notifications/:id/read', requireAuth, async (req, res) => {
  if (!validUuid(req.params.id)) return res.status(404).json({ error: 'Notification not found' });
  try {
    await pool.query(
      "UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Read notification error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  PREFERENCIAS DE NOTIFICACIÓN
// ══════════════════════════════════════════════════════════════════════

router.get('/notification-channels', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT notification_channels FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ channels: result.rows[0]?.notification_channels || { push: true, email: true, whatsapp: true, in_app: true } });
  } catch (err) {
    console.error('Get notification channels error:', err);
    res.status(500).json({ error: 'Failed to fetch notification channels' });
  }
});

router.put('/notification-channels', requireAuth, async (req, res) => {
  const { channels } = req.body;
  if (!channels || typeof channels !== 'object') {
    return res.status(400).json({ error: 'channels object is required' });
  }
  try {
    await pool.query(
      'UPDATE users SET notification_channels = $1 WHERE id = $2',
      [JSON.stringify(channels), req.user.id]
    );
    res.json({ message: 'Notification channels updated' });
  } catch (err) {
    console.error('Update notification channels error:', err);
    res.status(500).json({ error: 'Failed to update notification channels' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  COBERTURA DE GRUPOS (anti-duplicados entre voluntarios)
// ══════════════════════════════════════════════════════════════════════

const COVERAGE_WINDOW_DAYS = 5; // mismo ciclo que REPOST_WINDOW_DAYS

router.get('/pet-coverage/:petId', requireAuth, async (req, res) => {
  try {
    const { petId } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(petId)) {
      return res.status(400).json({ error: 'petId inválido' });
    }
    const result = await pool.query(
      `SELECT DISTINCT ON (lower(group_name))
             group_name, group_url, volunteer, date
       FROM (
         SELECT ce.payload->>'group_name' AS group_name,
                ce.payload->>'group_url' AS group_url,
                u.display_name AS volunteer,
                ce.created_at AS date
         FROM case_events ce
         JOIN pet_cases pc ON pc.id = ce.case_id
         LEFT JOIN users u ON u.id = ce.user_id
         WHERE pc.pet_id = $1
           AND ce.event_type = 'social_shared'
           AND ce.payload->>'group_name' IS NOT NULL
           AND ce.created_at > NOW() - make_interval(days => $2)
         UNION ALL
         SELECT ce.payload->>'group_name' AS group_name,
                ce.payload->>'fb_post_url' AS group_url,
                NULL AS volunteer,
                ce.created_at AS date
         FROM case_events ce
         JOIN pet_cases pc ON pc.id = ce.case_id
         WHERE pc.pet_id = $1
           AND ce.event_type = 'facebook_replica'
           AND ce.payload->>'group_name' IS NOT NULL
           AND ce.created_at > NOW() - make_interval(days => $2)
       ) t
       ORDER BY lower(group_name), date DESC`,
      [petId, COVERAGE_WINDOW_DAYS]
    );
    res.json({ coverage: result.rows, window_days: COVERAGE_WINDOW_DAYS });
  } catch (err) {
    console.error('Get pet coverage error:', err);
    res.status(500).json({ error: 'Failed to fetch coverage' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  GRUPOS DE FB PARA BÚSQUEDA
// ══════════════════════════════════════════════════════════════════════

router.get('/fb-search-groups', requireAuth, async (req, res) => {
  const { agrupacion_id, zone } = req.query;
  try {
    let query = 'SELECT * FROM fb_search_groups WHERE approved = TRUE';
    const params = [];
    if (agrupacion_id) {
      params.push(agrupacion_id);
      query += ` AND agrupacion_id = $${params.length}`;
    }
    if (zone) {
      params.push(zone);
      query += ` AND zone = $${params.length}`;
    }
    query += ' ORDER BY group_name';
    const result = await pool.query(query, params);
    res.json({ groups: result.rows });
  } catch (err) {
    console.error('Get fb search groups error:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

router.get('/fb-search-groups/pending', requireCoordinator, async (req, res) => {
  try {
    let query = `SELECT fsg.*, a.name as agrupacion_name, u.display_name as requested_by_name
       FROM fb_search_groups fsg
       LEFT JOIN agrupaciones a ON a.id = fsg.agrupacion_id
       LEFT JOIN users u ON u.id = fsg.requested_by
       WHERE fsg.approved = FALSE`;
    const params = [];
    if (req.user.role !== 'admin') {
      params.push(req.user.id);
      query += ` AND fsg.agrupacion_id IN (SELECT id FROM agrupaciones WHERE coordinator_user_id = $${params.length})`;
    }
    query += ` ORDER BY fsg.created_at DESC`;
    const result = await pool.query(query, params);
    res.json({ groups: result.rows });
  } catch (err) {
    console.error('Get pending fb groups error:', err);
    res.status(500).json({ error: 'Failed to fetch pending groups' });
  }
});

router.post('/fb-search-groups', requireAuth, async (req, res) => {
  const { agrupacion_id, group_name, group_url, zone } = req.body;
  if (!group_name || !group_url) {
    return res.status(400).json({ error: 'group_name and group_url are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO fb_search_groups (agrupacion_id, group_name, group_url, zone, requested_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [agrupacion_id || null, group_name, group_url, zone || null, req.user.id]
    );
    res.status(201).json({ group: result.rows[0] });
  } catch (err) {
    console.error('Create fb search group error:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

router.put('/fb-search-groups/:id/approve', requireCoordinator, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      const ownership = await pool.query(
        `SELECT 1 FROM fb_search_groups WHERE id = $1
         AND agrupacion_id IN (SELECT id FROM agrupaciones WHERE coordinator_user_id = $2)`,
        [req.params.id, req.user.id]
      );
      if (ownership.rows.length === 0) {
        return res.status(403).json({ error: 'No tenés acceso a este grupo' });
      }
    }
    const result = await pool.query(
      "UPDATE fb_search_groups SET approved = TRUE, approved_by = $1, approved_at = NOW() WHERE id = $2 RETURNING *",
      [req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Group not found' });
    res.json({ group: result.rows[0] });
  } catch (err) {
    console.error('Approve fb group error:', err);
    res.status(500).json({ error: 'Failed to approve group' });
  }
});

router.delete('/fb-search-groups/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM fb_search_groups WHERE id = $1', [req.params.id]);
    res.json({ message: 'Group deleted' });
  } catch (err) {
    console.error('Delete fb group error:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  DASHBOARD DEL VOLUNTARIO
// ══════════════════════════════════════════════════════════════════════

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const subs = await pool.query(
      `SELECT vs.*, a.name as agrupacion_name, a.neighborhoods as agrupacion_neighborhoods,
              vc.name as category_name, vc.icon as category_icon
       FROM volunteer_subscriptions vs
       JOIN agrupaciones a ON a.id = vs.agrupacion_id
       JOIN volunteer_categories vc ON vc.id = vs.category
       WHERE vs.user_id = $1 AND vs.status = 'active'`,
      [req.user.id]
    );

    const agrupacionIds = subs.rows.map(s => s.agrupacion_id);
    const categories = [...new Set(subs.rows.map(s => s.category))];
    const allNeighborhoods = [...new Set(subs.rows.flatMap(s => s.agrupacion_neighborhoods || []))];

    let petsInZone = { rows: [] };
    if (allNeighborhoods.length > 0) {
      const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
      petsInZone = await pool.query(
        `SELECT id, name, species, status, location, neighborhoods, created_at
         FROM pets
         WHERE neighborhoods IS NOT NULL
           AND neighborhoods != '[]'
           AND ${nbOverlapSql('$1')}
           AND status NOT IN ('adopted', 'reunited')
           AND (status <> 'sighted' OR created_at > NOW() - INTERVAL '14 days')
           AND is_hidden = FALSE
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [JSON.stringify(allNeighborhoods), limit, offset]
      );
    }

    const shareStats = await pool.query(
      `SELECT platform, COUNT(*) as count FROM share_logs WHERE user_id = $1 GROUP BY platform`,
      [req.user.id]
    );
    const totalShares = await pool.query(
      'SELECT COUNT(*) as total FROM share_logs WHERE user_id = $1',
      [req.user.id]
    );

    const unreadNotifs = await pool.query(
      "SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
      [req.user.id]
    );

    res.json({
      subscriptions: subs.rows,
      pets_in_zone: petsInZone.rows,
      share_stats: shareStats.rows,
      total_shares: parseInt(totalShares.rows[0].total),
      unread_notifications: parseInt(unreadNotifs.rows[0].count),
      neighborhoods_count: allNeighborhoods.length,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// ══════════════════════════════════════════════════════════════════════
//  HALLAZGOS DEL BUSCADOR (van directo al timeline)
// ══════════════════════════════════════════════════════════════════════

router.post('/findings', requireAuth, requireActiveVolunteer, async (req, res) => {
  const { pet_id, fb_url, description, group_name } = req.body;
  if (!pet_id || !fb_url) {
    return res.status(400).json({ error: 'pet_id and fb_url are required' });
  }
  if (!validUuid(pet_id)) {
    return res.status(400).json({ error: 'Invalid pet id' });
  }
  if (typeof fb_url !== 'string' || fb_url.length > 2000 || !/^https?:\/\//i.test(fb_url)) {
    return res.status(400).json({ error: 'fb_url debe ser una URL válida' });
  }
  try {
    // Buscar el caso del pet y el dueño
    const petRes = await pool.query('SELECT id, name, created_by FROM pets WHERE id = $1', [pet_id]);
    if (petRes.rows.length === 0) return res.status(404).json({ error: 'Pet not found' });
    const pet = petRes.rows[0];
    const caseRes = await pool.query('SELECT id FROM pet_cases WHERE pet_id = $1 LIMIT 1', [pet_id]);
    const caseId = caseRes.rows.length > 0 ? caseRes.rows[0].id : null;

    // Guardar en la tabla de hallazgos primero
    const result = await pool.query(
      `INSERT INTO volunteer_findings (pet_id, user_id, fb_url, description, group_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [pet_id, req.user.id, fb_url, description || null, group_name || null]
    );
    const finding = result.rows[0];

    // Crear el case_event con finding_id en el payload
    let caseEvent = null;
    if (caseId) {
      const { createCaseEvent } = await import('../services/caseService.js');
      caseEvent = await createCaseEvent(caseId, 'volunteer_finding', {
        finding_id: finding.id,
        fb_url,
        description: description || null,
        group_name: group_name || null,
        volunteer: req.user.display_name || req.user.email,
        confirmed_by_owner: false,
      }, req.user.id);

      // Actualizar el finding con el case_event_id
      if (caseEvent) {
        await pool.query('UPDATE volunteer_findings SET case_event_id = $1 WHERE id = $2', [caseEvent.id, finding.id]);
      }
    }

    // Notificar al dueño del reporte
    if (pet.created_by && pet.created_by !== req.user.id) {
      const petUrl = `https://sigotuhuella.com.ar/pet/${pet_id}`;
      const volunteerName = req.user.display_name || 'Un voluntario';
      const title = `🔍 Hallazgo en "${pet.name || 'tu mascota'}"`;
      const body = group_name
        ? `${volunteerName} encontró un post en "${group_name}": ${description || fb_url}`
        : `${volunteerName} encontró un post en Facebook: ${description || fb_url}`;

      // Notificación in-app (con url para que la campanita navegue al hacer click)
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'volunteer_finding', $2, $3, $4)`,
        [pet.created_by, title, body, JSON.stringify({ pet_id, finding_id: result.rows[0].id, fb_url, url: petUrl })]
      );

      // Push notification
      const { sendPushToUser } = await import('../services/pushService.js');
      sendPushToUser(pet.created_by, { title, body, url: petUrl }).catch(e => console.error('Finding push error:', e));

      // WhatsApp relay si el dueño tiene teléfono
      const ownerPhone = await pool.query(
        "SELECT phone FROM users WHERE id = $1 AND phone IS NOT NULL AND phone != ''",
        [pet.created_by]
      );
      if (ownerPhone.rows.length > 0) {
        const { enqueue } = await import('../services/phoneRelayService.js');
        const waText = `${title}\n\n${body}\n\n👉 ${petUrl}`;
        enqueue(ownerPhone.rows[0].phone, waText).catch(e => console.error('Finding WA relay error:', e));
      }
    }

    res.status(201).json({ finding: result.rows[0], case_event: caseEvent });
  } catch (err) {
    console.error('Create finding error:', err);
    res.status(500).json({ error: 'Failed to create finding' });
  }
});

router.get('/findings/:petId', requireAuth, requireActiveVolunteer, async (req, res) => {
  if (!validUuid(req.params.petId)) return res.status(400).json({ error: 'Invalid pet id' });
  try {
    const result = await pool.query(
      `SELECT vf.*, u.display_name as volunteer_name
       FROM volunteer_findings vf
       LEFT JOIN users u ON u.id = vf.user_id
       WHERE vf.pet_id = $1
       ORDER BY vf.created_at DESC`,
      [req.params.petId]
    );
    res.json({ findings: result.rows });
  } catch (err) {
    console.error('Get findings error:', err);
    res.status(500).json({ error: 'Failed to fetch findings' });
  }
});

// Confirmar hallazgo — el reportante (created_by) verifica que es la mascota
router.put('/findings/:id/confirm', requireAuth, async (req, res) => {
  if (!validUuid(req.params.id)) return res.status(404).json({ error: 'Hallazgo no encontrado' });
  try {
    const findingRes = await pool.query(
      'SELECT vf.*, p.created_by, p.name as pet_name FROM volunteer_findings vf JOIN pets p ON p.id = vf.pet_id WHERE vf.id = $1',
      [req.params.id]
    );
    if (findingRes.rows.length === 0) return res.status(404).json({ error: 'Hallazgo no encontrado' });
    const finding = findingRes.rows[0];
    if (finding.created_by !== req.user.id) return res.status(403).json({ error: 'Solo el reportante puede confirmar' });
    if (finding.confirmed_by_owner) return res.status(400).json({ error: 'Ya está confirmado' });

    await pool.query(
      'UPDATE volunteer_findings SET confirmed_by_owner = TRUE, confirmed_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    // Actualizar el payload del event original para que el frontend sepa que está confirmado
    if (finding.case_event_id) {
      await pool.query(
        `UPDATE case_events SET payload = payload || '{"confirmed_by_owner": true}'::jsonb WHERE id = $1`,
        [finding.case_event_id]
      );
    }

    // Crear case_event si tiene caso
    let caseEvent = null;
    if (finding.case_event_id) {
      const caseRes = await pool.query('SELECT id FROM pet_cases WHERE pet_id = $1 LIMIT 1', [finding.pet_id]);
      if (caseRes.rows.length > 0) {
        const { createCaseEvent } = await import('../services/caseService.js');
        caseEvent = await createCaseEvent(caseRes.rows[0].id, 'finding_confirmed', {
          finding_id: finding.id,
          fb_url: finding.fb_url,
          group_name: finding.group_name,
          confirmed_by: req.user.display_name || req.user.email,
        }, req.user.id);
      }
    }

    // Notificar al buscador que su hallazgo fue confirmado
    const { sendPushToUser } = await import('../services/pushService.js');
    const petUrl = `https://sigotuhuella.com.ar/pet/${finding.pet_id}`;
    const title = `✅ Hallazgo confirmado`;
    const body = `El reportante confirmó que "${finding.pet_name || 'la mascota'}" es la que encontraste`;
    sendPushToUser(finding.user_id, { title, body, url: petUrl }).catch(() => {});

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'finding_confirmed', $2, $3, $4)`,
      [finding.user_id, title, body, JSON.stringify({ pet_id: finding.pet_id, finding_id: finding.id, url: petUrl })]
    );

    res.json({ confirmed: true, case_event: caseEvent });
  } catch (err) {
    console.error('Confirm finding error:', err);
    res.status(500).json({ error: 'Failed to confirm finding' });
  }
});

// Reunión desde hallazgo — el reportante cierra el caso
router.put('/findings/:id/reunite', requireAuth, async (req, res) => {
  if (!validUuid(req.params.id)) return res.status(404).json({ error: 'Hallazgo no encontrado' });
  try {
    const findingRes = await pool.query(
      'SELECT vf.*, p.created_by, p.name as pet_name FROM volunteer_findings vf JOIN pets p ON p.id = vf.pet_id WHERE vf.id = $1',
      [req.params.id]
    );
    if (findingRes.rows.length === 0) return res.status(404).json({ error: 'Hallazgo no encontrado' });
    const finding = findingRes.rows[0];
    if (finding.created_by !== req.user.id) return res.status(403).json({ error: 'Solo el reportante puede confirmar la reunión' });

    const caseRes = await pool.query('SELECT * FROM pet_cases WHERE pet_id = $1 LIMIT 1', [finding.pet_id]);
    if (caseRes.rows.length === 0) return res.status(400).json({ error: 'No hay caso abierto para esta mascota' });
    const petCase = caseRes.rows[0];
    if (petCase.status === 'closed') return res.status(400).json({ error: 'El caso ya está cerrado' });

    const { confirmReunion } = await import('../services/caseService.js');
    const result = await confirmReunion(petCase.id, req.user.id, {});
    if (result.error) return res.status(400).json({ error: result.error });

    // Marcar finding como confirmado
    await pool.query(
      'UPDATE volunteer_findings SET confirmed_by_owner = TRUE, confirmed_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    // Notificar al buscador
    const { sendPushToUser } = await import('../services/pushService.js');
    const petUrl = `https://sigotuhuella.com.ar/pet/${finding.pet_id}`;
    const title = `🎉 ¡Reencontrada!`;
    const body = `"${finding.pet_name || 'La mascota'}" volvió a casa gracias a tu hallazgo`;
    sendPushToUser(finding.user_id, { title, body, url: petUrl }).catch(() => {});

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, 'reunion_from_finding', $2, $3, $4)`,
      [finding.user_id, title, body, JSON.stringify({ pet_id: finding.pet_id, finding_id: finding.id, url: petUrl })]
    );

    res.json({ reunited: true });
  } catch (err) {
    console.error('Reunite from finding error:', err);
    res.status(500).json({ error: 'Failed to reunite' });
  }
});

export default router;
