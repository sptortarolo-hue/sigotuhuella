import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, sendMemberApprovalEmail, sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins, sendPushToUser } from '../services/pushService.js';
import { buildPetMessage } from '../services/facebookPublisher.js';
import { buildPetCaption } from '../services/instagramPublisher.js';
import { buildPetBroadcastCaption } from '../services/whatsappService.js';

const router = Router();

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

router.get('/agrupaciones/all', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*,
        au.email as admin_email, au.display_name as admin_name,
        cu.email as coordinator_email, cu.display_name as coordinator_name
       FROM agrupaciones a
       LEFT JOIN users au ON au.id = a.admin_user_id
       LEFT JOIN users cu ON cu.id = a.coordinator_user_id
       ORDER BY a.name`
    );
    res.json({ agrupaciones: result.rows });
  } catch (err) {
    console.error('Get all agrupaciones error:', err);
    res.status(500).json({ error: 'Failed to fetch agrupaciones' });
  }
});

router.post('/agrupaciones', requireAdmin, async (req, res) => {
  const { name, description, neighborhoods, contact_whatsapp, contact_email, logo_url, admin_user_id, coordinator_user_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO agrupaciones (name, description, neighborhoods, contact_whatsapp, contact_email, logo_url, admin_user_id, coordinator_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, description || null, JSON.stringify(neighborhoods || []), contact_whatsapp || null, contact_email || null, logo_url || null, admin_user_id || null, coordinator_user_id || null]
    );
    res.status(201).json({ agrupacion: result.rows[0] });
  } catch (err) {
    console.error('Create agrupacion error:', err);
    res.status(500).json({ error: 'Failed to create agrupacion' });
  }
});

router.put('/agrupaciones/:id', requireAdmin, async (req, res) => {
  const { name, description, neighborhoods, contact_whatsapp, contact_email, logo_url, is_active, admin_user_id, coordinator_user_id } = req.body;
  try {
    const result = await pool.query(
      `UPDATE agrupaciones SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        neighborhoods = COALESCE($3, neighborhoods),
        contact_whatsapp = COALESCE($4, contact_whatsapp),
        contact_email = COALESCE($5, contact_email),
        logo_url = COALESCE($6, logo_url),
        is_active = COALESCE($7, is_active),
        admin_user_id = $8,
        coordinator_user_id = $9
       WHERE id = $10 RETURNING *`,
      [name, description, neighborhoods ? JSON.stringify(neighborhoods) : null, contact_whatsapp, contact_email, logo_url, is_active, admin_user_id || null, coordinator_user_id || null, req.params.id]
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
  try {
    const result = await pool.query(
      'INSERT INTO share_logs (pet_id, user_id, platform, share_type) VALUES ($1, $2, $3, $4) RETURNING *',
      [pet_id, req.user.id, platform, share_type || 'link']
    );

    // Si el voluntario seleccionó grupos, registrar cada uno en el timeline del caso
    const caseEvents = [];
    if (Array.isArray(groups) && groups.length > 0) {
      const { recordSocialShare } = await import('../services/caseService.js');
      for (const group of groups) {
        const evt = await recordSocialShare(pet_id, req.user.id, {
          platform: platform || 'facebook',
          group_name: group.name || null,
          group_url: group.url || null,
          share_log_id: result.rows[0].id,
        });
        if (evt) caseEvents.push(evt);
      }
    }

    res.status(201).json({ log: result.rows[0], case_events: caseEvents });
  } catch (err) {
    console.error('Share log error:', err);
    res.status(500).json({ error: 'Failed to log share' });
  }
});

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
//  SHARE PREVIEW — captions por plataforma (mismos que auto-publishers)
// ══════════════════════════════════════════════════════════════════════

router.get('/share-preview/:petId', requireAuth, async (req, res) => {
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

router.get('/fb-search-groups/pending', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT fsg.*, a.name as agrupacion_name, u.display_name as requested_by_name
       FROM fb_search_groups fsg
       LEFT JOIN agrupaciones a ON a.id = fsg.agrupacion_id
       LEFT JOIN users u ON u.id = fsg.requested_by
       WHERE fsg.approved = FALSE
       ORDER BY fsg.created_at DESC`
    );
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

router.put('/fb-search-groups/:id/approve', requireAdmin, async (req, res) => {
  try {
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
      petsInZone = await pool.query(
        `SELECT id, name, species, status, location, neighborhoods, created_at
         FROM pets
         WHERE neighborhoods IS NOT NULL
           AND neighborhoods != '[]'
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(neighborhoods::jsonb) elem
             WHERE elem = ANY($1::text[])
           )
            AND status IN ('lost', 'sighted', 'accidented')
           AND is_hidden = FALSE
         ORDER BY created_at DESC
         LIMIT 20`,
        [allNeighborhoods]
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

router.post('/findings', requireAuth, async (req, res) => {
  const { pet_id, fb_url, description, group_name } = req.body;
  if (!pet_id || !fb_url) {
    return res.status(400).json({ error: 'pet_id and fb_url are required' });
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

      // Notificación in-app
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'volunteer_finding', $2, $3, $4)`,
        [pet.created_by, title, body, JSON.stringify({ pet_id, finding_id: result.rows[0].id, fb_url })]
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

router.get('/findings/:petId', requireAuth, async (req, res) => {
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
      [finding.user_id, title, body, JSON.stringify({ pet_id: finding.pet_id, finding_id: finding.id })]
    );

    res.json({ confirmed: true, case_event: caseEvent });
  } catch (err) {
    console.error('Confirm finding error:', err);
    res.status(500).json({ error: 'Failed to confirm finding' });
  }
});

// Reunión desde hallazgo — el reportante cierra el caso
router.put('/findings/:id/reunite', requireAuth, async (req, res) => {
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
      [finding.user_id, title, body, JSON.stringify({ pet_id: finding.pet_id, finding_id: finding.id })]
    );

    res.json({ reunited: true });
  } catch (err) {
    console.error('Reunite from finding error:', err);
    res.status(500).json({ error: 'Failed to reunite' });
  }
});

export default router;
