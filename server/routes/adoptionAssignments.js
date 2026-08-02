import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, verifyToken } from '../auth.js';
import { v4 as uuidv4 } from 'uuid';
import { notifyUser } from '../services/notificationService.js';
import { enqueue } from '../services/phoneRelayService.js';
import { normalizePhone } from '../services/phoneUtils.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';

const router = Router();

async function transferToAdopter(client, assignment, adopterUserId) {
  let inheritedQrRequested = false;
  if (assignment.my_pet_id) {
    const origRes = await client.query(
      'SELECT qr_requested FROM my_pets WHERE id = $1',
      [assignment.my_pet_id]
    );
    inheritedQrRequested = !!(origRes.rows[0]?.qr_requested);
  }
  const myPetResult = await client.query(
    `INSERT INTO my_pets (user_id, name, species, breed, color, gender, qr_requested)
     VALUES ($1, $2, $3, $4, $5, 'unknown', $6)
     RETURNING *`,
    [adopterUserId, assignment.pet_name, assignment.species, assignment.breed || null, assignment.color || null, inheritedQrRequested]
  );
  const myPet = myPetResult.rows[0];
  if (assignment.qr_id) {
    // Desvincular el QR de cualquier dueño anterior antes de transferirlo
    await client.query(
      'UPDATE my_pets SET qr_id = NULL WHERE qr_id = $1',
      [assignment.qr_id]
    );
    await client.query(
      'UPDATE qr_identifiers SET my_pet_id = $1, assigned_at = NOW() WHERE id = $2',
      [myPet.id, assignment.qr_id]
    );
    await client.query(
      'UPDATE my_pets SET qr_id = $1 WHERE id = $2',
      [assignment.qr_id, myPet.id]
    );
  }
  // La solicitud de chapita pendiente ahora pertenece a la mascota del adoptante
  if (assignment.my_pet_id) {
    await client.query(
      'UPDATE my_pets SET qr_requested = false, transferred_at = NOW() WHERE id = $1 AND transferred_at IS NULL',
      [assignment.my_pet_id]
    );
  }
  return myPet;
}

router.post('/return/:token', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const assignResult = await client.query(
      `SELECT aa.*, p.status as pet_status
       FROM adoption_assignments aa
       JOIN pets p ON p.id = aa.pet_id
       WHERE aa.token = $1 AND aa.inviter_id = $2 AND aa.status = 'pending_adopter'`,
      [req.params.token, req.user.id]
    );

    if (assignResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Asignación no encontrada o no se puede cancelar' });
    }

    const assignment = assignResult.rows[0];

    await client.query(
      `UPDATE adoption_assignments SET status = 'returned', returned_at = NOW(), return_reason = $1 WHERE id = $2`,
      [req.body.reason || null, assignment.id]
    );

    await client.query(
      `UPDATE pets SET status = 'for_adoption', adoption_assignment_id = NULL WHERE id = $1`,
      [assignment.pet_id]
    );

    await client.query(
      `INSERT INTO pet_history (pet_id, event_type, description, from_status, to_status, changed_by)
       VALUES ($1, 'status_change', 'Adopción cancelada, vuelve a adopción', $2, 'for_adoption', $3)`,
      [assignment.pet_id, assignment.pet_status, req.user.id]
    );

    if (assignment.qr_id) {
      await client.query(
        'UPDATE qr_identifiers SET my_pet_id = NULL, assigned_at = NULL WHERE id = $1',
        [assignment.qr_id]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });

    // Notificar al adoptante
    const textMsg = `ℹ️ Hola ${assignment.adopter_name}. ${assignment.pet_name} ya no está disponible para adopción. El dueño canceló la invitación.`;
    pool.query("SELECT id, email, display_name, phone, notification_preference FROM users WHERE email = $1", [assignment.adopter_email]).then(adopterRes => {
      if (adopterRes.rows[0]) {
        notifyUser(adopterRes.rows[0], {
          subject: 'Adopción cancelada — Sigo Tu Huella',
          textMessage: textMsg,
          sendEmailFn: null,
        }).catch(() => {});
      } else if (assignment.adopter_phone) {
        const normalized = normalizePhone(assignment.adopter_phone);
        if (normalized) enqueue(normalized, textMsg).catch(() => {});
      }
    }).catch(() => {});
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('adoption return error:', err);
    res.status(500).json({ error: 'Error al procesar devolución' });
  } finally {
    client.release();
  }
});

router.post('/claim/:token', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const assignResult = await client.query(
      `SELECT aa.*, p.species, p.breed, p.color, p.name as pet_name, p.status as pet_status,
              p.my_pet_id
       FROM adoption_assignments aa
       JOIN pets p ON p.id = aa.pet_id
       WHERE aa.token = $1 AND (aa.status = 'pending_adopter' OR (aa.status = 'completed' AND aa.adopter_id IS NULL))`,
      [req.params.token]
    );

    if (assignResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invitación de adopción no encontrada o ya fue procesada' });
    }

    const assignment = assignResult.rows[0];

    if (assignment.adopter_id && assignment.adopter_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Esta invitación fue creada para otra cuenta' });
    }

    const adopterUserRes = await client.query(
      'SELECT email, phone FROM users WHERE id = $1',
      [req.user.id]
    );
    const adopterUser = adopterUserRes.rows[0];
    const normalizedAdopterPhone = adopterUser?.phone ? normalizePhone(adopterUser.phone) : null;
    const assignmentPhone = assignment.adopter_phone ? normalizePhone(assignment.adopter_phone) : null;

    if (!assignment.adopter_id
        && assignment.adopter_email && assignment.adopter_email.toLowerCase() !== (adopterUser?.email || req.user.email).toLowerCase()
        && !(normalizedAdopterPhone && assignmentPhone && normalizedAdopterPhone === assignmentPhone)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Esta invitación fue creada para otra cuenta' });
    }

    const myPet = await transferToAdopter(client, assignment, req.user.id);

    await client.query(
      `UPDATE adoption_assignments SET status = 'completed', adopter_id = $1, completed_at = NOW() WHERE id = $2`,
      [req.user.id, assignment.id]
    );

    await client.query(
      `UPDATE pets SET status = 'adopted', adoption_assignment_id = NULL, my_pet_id = NULL WHERE id = $1`,
      [assignment.pet_id]
    );

    if (assignment.pet_status !== 'adopted') {
      await client.query(
        `INSERT INTO pet_history (pet_id, event_type, description, to_status, changed_by)
         VALUES ($1, 'status_change', 'Mascota adoptada', 'adopted', $2)`,
        [assignment.pet_id, req.user.id]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, myPet, share_token: assignment.qr_id ? (await pool.query('SELECT share_token FROM qr_identifiers WHERE id = $1', [assignment.qr_id])).rows[0]?.share_token : null });

    // Notificar al adoptante
    notifyUser(req.user, {
      subject: '🎉 Adopción confirmada — Sigo Tu Huella',
      textMessage: `🎉 Felicidades ${assignment.adopter_name}! Ya sos el dueño oficial de ${assignment.pet_name} en Sigo Tu Huella.\n\nPodés ver su perfil, gestionar fotos, salud y más desde "Mis mascotas" en la app.\n\n${FRONTEND_URL}/mi-mascota/${myPet.id}`,
      sendEmailFn: null,
    }).catch(() => {});

    // Notificar al dueño
    pool.query('SELECT id, email, display_name, phone, notification_preference FROM users WHERE id = $1', [assignment.inviter_id]).then(ownerRes => {
      if (ownerRes.rows[0]) {
        notifyUser(ownerRes.rows[0], {
          subject: '✅ Adopción confirmada — Sigo Tu Huella',
          textMessage: `✅ ${assignment.adopter_name} confirmó la adopción de ${assignment.pet_name}. Ya es oficial.\n\nLa mascota ya no aparece en tu lista de pendientes.`,
          sendEmailFn: null,
        }).catch(() => {});
      }
    }).catch(() => {});
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('adoption claim error:', err);
    res.status(500).json({ error: 'Error al reclamar adopción' });
  } finally {
    client.release();
  }
});

router.post('/confirm/:token', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const assignResult = await client.query(
      `SELECT aa.*, p.species, p.breed, p.color, p.name as pet_name, p.status as pet_status,
              p.my_pet_id
       FROM adoption_assignments aa
       JOIN pets p ON p.id = aa.pet_id
       WHERE aa.token = $1 AND aa.inviter_id = $2 AND aa.status = 'pending_adopter'`,
      [req.params.token, req.user.id]
    );

    if (assignResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Adopción pendiente no encontrada o ya fue procesada' });
    }

    const assignment = assignResult.rows[0];

    // Si el adoptante ya tiene cuenta, transferir mascota + QR automáticamente
    const normalizedAdopterPhone = normalizePhone(assignment.adopter_phone);
    const adopterRes = await client.query(
      `SELECT id, email, display_name, phone, notification_preference FROM users
       WHERE (LOWER(email) = LOWER($1) AND $1 IS NOT NULL AND $1 <> '')
          OR ($2 IS NOT NULL AND phone = $2)
       LIMIT 1`,
      [assignment.adopter_email, normalizedAdopterPhone]
    );
    const adopter = adopterRes.rows[0];

    let myPet = null;
    if (adopter) {
      myPet = await transferToAdopter(client, assignment, adopter.id);
    } else if (assignment.qr_id) {
      // Sin cuenta: desvincular el QR del dueño para que muestre al adoptante
      await client.query(
        'UPDATE qr_identifiers SET my_pet_id = NULL, assigned_at = NULL WHERE id = $1',
        [assignment.qr_id]
      );
    }

    // La mascota ya no es del dueño anterior: ocultarla de su portal
    if (assignment.my_pet_id) {
      await client.query(
        'UPDATE my_pets SET transferred_at = NOW() WHERE id = $1 AND transferred_at IS NULL',
        [assignment.my_pet_id]
      );
    }

    await client.query(
      `UPDATE adoption_assignments SET status = 'completed', adopter_id = $1, completed_at = NOW() WHERE id = $2`,
      [adopter ? adopter.id : null, assignment.id]
    );

    await client.query(
      `UPDATE pets SET status = 'adopted', adoption_assignment_id = NULL, my_pet_id = NULL WHERE id = $1`,
      [assignment.pet_id]
    );

    await client.query(
      `INSERT INTO pet_history (pet_id, event_type, description, from_status, to_status, changed_by)
       VALUES ($1, 'status_change', 'Adopción confirmada por el dueño', $2, 'adopted', $3)`,
      [assignment.pet_id, assignment.pet_status, req.user.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, myPet, share_token: assignment.qr_id ? (await pool.query('SELECT share_token FROM qr_identifiers WHERE id = $1', [assignment.qr_id])).rows[0]?.share_token : null });

    // Notificar al adoptante
    const textMsg = `✅ El dueño confirmó la adopción de ${assignment.pet_name}. Ya es oficial y quedó asociada a ${adopter ? 'tu cuenta' : 'los datos que dejaste'}.`;
    if (adopter) {
      notifyUser(adopter, {
        subject: '✅ Adopción confirmada — Sigo Tu Huella',
        textMessage: textMsg,
        sendEmailFn: null,
      }).catch(() => {});
    } else if (assignment.adopter_phone) {
      const normalized = normalizePhone(assignment.adopter_phone);
      if (normalized) enqueue(normalized, textMsg).catch(() => {});
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('adoption owner confirm error:', err);
    res.status(500).json({ error: 'Error al confirmar adopción' });
  } finally {
    client.release();
  }
});

router.get('/pending', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT aa.*, p.name as pet_name, p.species, p.breed, p.status as pet_status,
              qi.code as qr_code, qi.share_token
       FROM adoption_assignments aa
       JOIN pets p ON p.id = aa.pet_id
       LEFT JOIN qr_identifiers qi ON qi.id = aa.qr_id
       WHERE aa.inviter_id = $1 AND aa.status = 'pending_adopter'
       ORDER BY aa.created_at DESC`,
      [req.user.id]
    );
    res.json({ assignments: result.rows });
  } catch (err) {
    console.error('adoption pending error:', err);
    res.status(500).json({ error: 'Error al obtener adopciones pendientes' });
  }
});

router.get('/my-pending', requireAuth, async (req, res) => {
  try {
    const userRes = await pool.query(
      'SELECT email, phone FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userRes.rows[0];
    const normalizedPhone = user?.phone ? normalizePhone(user.phone) : null;

    const result = await pool.query(
      `SELECT aa.*, p.name as pet_name, p.species, p.breed, p.color, p.status as pet_status,
              u.display_name as inviter_name, qi.code as qr_code, qi.share_token
       FROM adoption_assignments aa
       JOIN pets p ON p.id = aa.pet_id
       JOIN users u ON u.id = aa.inviter_id
       LEFT JOIN qr_identifiers qi ON qi.id = aa.qr_id
       WHERE (aa.adopter_id = $1
          OR (LOWER(aa.adopter_email) = LOWER($2) AND $2 IS NOT NULL AND $2 <> '')
          OR ($3 IS NOT NULL AND regexp_replace(aa.adopter_phone, '[^0-9]', '', 'g') = $3))
         AND (aa.status = 'pending_adopter' OR (aa.status = 'completed' AND aa.adopter_id IS NULL))
       ORDER BY aa.created_at DESC`,
      [req.user.id, user?.email || null, normalizedPhone]
    );
    res.json({ assignments: result.rows });
  } catch (err) {
    console.error('adoption my-pending error:', err);
    res.status(500).json({ error: 'Error al obtener adopciones pendientes' });
  }
});

router.get('/check-token/:token', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT aa.*, p.name as pet_name, p.species, p.breed, p.color,
              p.description, p.location,
              u.display_name as inviter_name
       FROM adoption_assignments aa
       JOIN pets p ON p.id = aa.pet_id
       JOIN users u ON u.id = aa.inviter_id
       WHERE aa.token = $1 AND (aa.status = 'pending_adopter' OR (aa.status = 'completed' AND aa.adopter_id IS NULL))`,
      [req.params.token]
    );
    if (result.rows.length === 0) {
      return res.json({ found: false });
    }
    const assignment = result.rows[0];

    // Si hay sesión activa, vincular la invitación a la cuenta del adoptante
    let authedUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const payload = verifyToken(authHeader.slice(7));
        authedUserId = payload.id;
      } catch { /* token inválido: ignorar */ }
    }
    if (authedUserId && !assignment.adopter_id) {
      await pool.query(
        'UPDATE adoption_assignments SET adopter_id = $1 WHERE id = $2 AND adopter_id IS NULL',
        [authedUserId, assignment.id]
      );
      assignment.adopter_id = authedUserId;
    }

    res.json({
      found: true,
      owner_confirmed: assignment.status === 'completed' && !assignment.adopter_id,
      assignment: {
        id: assignment.id,
        pet_name: assignment.pet_name,
        species: assignment.species,
        breed: assignment.breed,
        color: assignment.color,
        description: assignment.description,
        location: assignment.location,
        adopter_name: assignment.adopter_name,
        adopter_email: assignment.adopter_email,
        adopter_phone: assignment.adopter_phone,
        inviter_name: assignment.inviter_name,
      },
    });
  } catch (err) {
    console.error('adoption check-token error:', err);
    res.status(500).json({ error: 'Error al verificar invitación' });
  }
});

export default router;