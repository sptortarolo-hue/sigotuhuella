import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, sendMemberApprovalEmail, sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins, sendPushToUser } from '../services/pushService.js';

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
        <a href="https://sigotuhuella.online/admin" 
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
      url: 'https://sigotuhuella.online/admin',
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
          url: 'https://sigotuhuella.online/sumate',
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

export default router;
