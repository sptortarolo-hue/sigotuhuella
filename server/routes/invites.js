import { Router } from 'express';
import crypto from 'crypto';
import pool from '../db.js';
import { requireAuth } from '../auth.js';
import { sendPushToUser } from '../services/pushService.js';
import { notifyUser } from '../services/notificationService.js';
import { sendMessage } from '../services/whatsappService.js';
import { sendAdminNotificationEmail } from '../auth.js';

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function getPetInfo(petId, myPetId) {
  if (petId) {
    const r = await pool.query('SELECT id, name, species FROM pets WHERE id = $1', [petId]);
    return r.rows[0] || null;
  }
  if (myPetId) {
    const r = await pool.query('SELECT id, name, species FROM my_pets WHERE id = $1', [myPetId]);
    return r.rows[0] || null;
  }
  return null;
}

async function getInviterName(userId) {
  const r = await pool.query('SELECT display_name FROM users WHERE id = $1', [userId]);
  return r.rows[0]?.display_name || 'Alguien';
}

// POST /api/invites — crear invitación por email o teléfono
router.post('/', requireAuth, async (req, res) => {
  const { petId, myPetId, email, phone, message } = req.body;
  if (!petId && !myPetId) return res.status(400).json({ error: 'Se requiere petId o myPetId' });
  if (!email && !phone) return res.status(400).json({ error: 'Se requiere email o teléfono' });

  try {
    const pet = await getPetInfo(petId, myPetId);
    if (!pet) return res.status(404).json({ error: 'Mascota no encontrada' });

    const inviterName = await getInviterName(req.user.id);
    const token = generateToken();
    const inviteLink = `${FRONTEND_URL}/login?invite=${token}`;
    const petName = pet.name || `${pet.species === 'dog' ? 'perro' : pet.species === 'cat' ? 'gato' : 'mascota'}`;

    // Si el usuario ya existe por email, compartir directo
    if (email) {
      const existing = await pool.query('SELECT id, notification_preference FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        const targetUser = existing.rows[0];
        if (petId) {
          await pool.query(
            'INSERT INTO pet_shares (pet_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [petId, targetUser.id, 'editor']
          );
        } else {
          await pool.query(
            'INSERT INTO my_pet_shares (pet_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [myPetId, targetUser.id, 'editor']
          );
        }
        sendPushToUser(targetUser.id, {
          title: '🐾 Nuevo acceso compartido',
          body: `${inviterName} te compartió el perfil de ${petName} en Sigo Tu Huella. Ya tenés acceso para ver y editar su ficha.`,
          url: petId ? `/pet/${petId}` : `/mi-mascota/${myPetId}`,
        }).catch(() => {});
        return res.json({ shared: true, userExists: true });
      }
    }

    // Si el usuario ya existe por teléfono
    if (phone) {
      const normalized = phone.replace(/[^0-9]/g, '');
      if (normalized.startsWith('54')) {
        const existing = await pool.query(
          "SELECT id, notification_preference FROM users WHERE phone = $1 OR phone = $2",
          [normalized, normalized.replace(/^54/, '')]
        );
        if (existing.rows.length > 0) {
          const targetUser = existing.rows[0];
          if (petId) {
            await pool.query(
              'INSERT INTO pet_shares (pet_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
              [petId, targetUser.id, 'editor']
            );
          } else {
            await pool.query(
              'INSERT INTO my_pet_shares (pet_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
              [myPetId, targetUser.id, 'editor']
            );
          }
          sendPushToUser(targetUser.id, {
            title: '🐾 Nuevo acceso compartido',
            body: `${inviterName} te compartió el perfil de ${petName} en Sigo Tu Huella. Ya tenés acceso para ver y editar su ficha.`,
            url: petId ? `/pet/${petId}` : `/mi-mascota/${myPetId}`,
          }).catch(() => {});
          try {
            await sendMessage(normalized,
              `🐾 *${inviterName}* te compartió el perfil de *${petName}* en Sigo Tu Huella. Ya tenés acceso para ver y editar su ficha.`
            );
          } catch (e) { /* ignore */ }
          return res.json({ shared: true, userExists: true });
        }
      }
    }

    // Crear invitación para futuro usuario
    const result = await pool.query(
      `INSERT INTO share_invites (pet_id, my_pet_id, invited_email, invited_phone, token, message, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [petId || null, myPetId || null, email || null, phone || null, token, message || null, req.user.id]
    );

    const textMsg = `🐾 *${inviterName}* te compartió el perfil de *${petName}* en Sigo Tu Huella, una red de vecinos que cuidamos las mascotas de la comunidad.\n\nRegistrate gratis para sumarte: ${inviteLink}`;

    // Enviar por email
    if (email) {
      const { default: nodemailer } = await import('nodemailer');
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'l0061596.ferozo.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        tls: { rejectUnauthorized: false },
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      t.sendMail({
        from: `"Sigo Tu Huella" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `${inviterName} te compartió una mascota en Sigo Tu Huella`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;">
            <div style="text-align:center;margin-bottom:20px;">
              <div style="background:#3b82f6;color:white;width:60px;height:60px;line-height:60px;font-size:30px;border-radius:20px;display:inline-block;">🐾</div>
            </div>
            <h2 style="color:#1e293b;text-align:center;font-size:20px;margin-bottom:16px;">${inviterName} te compartió el perfil de ${petName}</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6;text-align:center;">
              En Sigo Tu Huella, una red de vecinos que cuidamos las mascotas de la comunidad.
            </p>
            ${message ? `<p style="color:#64748b;font-size:14px;text-align:center;font-style:italic;">"${message}"</p>` : ''}
            <div style="text-align:center;margin:24px 0;">
              <a href="${inviteLink}" style="background:#5A5A40;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block;">
                Registrate gratis
              </a>
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center;">
              Ya tenés acceso para ver y editar su ficha al registrarte.
            </p>
          </div>
        `,
      }).catch(e => console.error('Failed to send invite email:', e));
    }

    // Enviar por WhatsApp
    if (phone) {
      const normalized = phone.replace(/[^0-9]/g, '');
      try {
        await sendMessage(normalized, textMsg);
      } catch (e) {
        console.error('Failed to send invite WhatsApp:', e);
      }
    }

    res.status(201).json({ invite: result.rows[0], inviteLink });
  } catch (err) {
    console.error('Create invite error:', err);
    res.status(500).json({ error: 'Error al crear invitación' });
  }
});

// GET /api/invites/pending — invites pendientes del usuario logueado
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT si.*,
        COALESCE(p.name, mp.name) as pet_name,
        COALESCE(p.species, mp.species) as pet_species,
        u.display_name as inviter_name
       FROM share_invites si
       LEFT JOIN pets p ON p.id = si.pet_id
       LEFT JOIN my_pets mp ON mp.id = si.my_pet_id
       JOIN users u ON u.id = si.created_by
       WHERE (si.invited_email = $1 OR si.invited_phone = $2)
         AND si.status = 'pending'
       ORDER BY si.created_at DESC`,
      [req.user.email, req.user.phone || '']
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get pending invites error:', err);
    res.status(500).json({ error: 'Error al obtener invitaciones' });
  }
});

// POST /api/invites/:token/accept — aceptar invitación
router.post('/:token/accept', requireAuth, async (req, res) => {
  try {
    const invite = await pool.query(
      'SELECT * FROM share_invites WHERE token = $1 AND status = $2',
      [req.params.token, 'pending']
    );
    if (invite.rows.length === 0) return res.status(404).json({ error: 'Invitación no encontrada o ya procesada' });
    const inv = invite.rows[0];

    if (inv.pet_id) {
      await pool.query(
        'INSERT INTO pet_shares (pet_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [inv.pet_id, req.user.id, 'editor']
      );
    } else if (inv.my_pet_id) {
      await pool.query(
        'INSERT INTO my_pet_shares (pet_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [inv.my_pet_id, req.user.id, 'editor']
      );
    }

    await pool.query(
      "UPDATE share_invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1",
      [inv.id]
    );

    // Notificar al creador
    sendPushToUser(inv.created_by, {
      title: '✅ Invitación aceptada',
      body: `${req.user.display_name || 'Alguien'} aceptó tu invitación`,
    }).catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('Accept invite error:', err);
    res.status(500).json({ error: 'Error al aceptar invitación' });
  }
});

// POST /api/invites/:token/reject — rechazar invitación
router.post('/:token/reject', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE share_invites SET status = 'rejected' WHERE token = $1 AND status = 'pending' RETURNING *",
      [req.params.token]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invitación no encontrada' });
    res.json({ success: true });
  } catch (err) {
    console.error('Reject invite error:', err);
    res.status(500).json({ error: 'Error al rechazar invitación' });
  }
});

// POST /api/invites/:token/cancel — cancelar invitación (solo creador)
router.post('/:token/cancel', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE share_invites SET status = 'cancelled' WHERE token = $1 AND created_by = $2 AND status = 'pending' RETURNING *",
      [req.params.token, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Invitación no encontrada' });
    res.json({ success: true });
  } catch (err) {
    console.error('Cancel invite error:', err);
    res.status(500).json({ error: 'Error al cancelar invitación' });
  }
});

export default router;
