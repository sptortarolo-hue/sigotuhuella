import { Router } from 'express';
import pool from '../db.js';
import { generateToken, hashPassword, verifyToken, sendVerificationEmail, generateVerificationToken, sendWelcomeEmail, sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from '../services/pushService.js';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const router = Router();

router.post('/', async (req, res) => {
  const { pet, user: userData, share_token, for_adopter, adopter, my_pet_id } = req.body;

  if (!pet || !pet.name || !pet.species) {
    return res.status(400).json({ error: 'Nombre y especie de la mascota son requeridos' });
  }

  if (for_adopter) {
    if (!adopter || !adopter.name || !adopter.email || !adopter.phone) {
      return res.status(400).json({ error: 'Nombre, email y WhatsApp del adoptante son requeridos' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validate share_token if provided
    if (share_token) {
      const qrCheck = await client.query(
        'SELECT id FROM qr_identifiers WHERE share_token = $1 AND (my_pet_id IS NULL OR my_pet_id = $2)',
        [share_token, my_pet_id || null]
      );
      if (qrCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Este código QR ya está asociado a otra mascota o no es válido.' });
      }
    }

    let userId;
    let needsVerification = false;
    let userEmail;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = verifyToken(authHeader.slice(7));
        userId = decoded.id;
      } catch {
        return res.status(401).json({ error: 'Sesión inválida. Iniciá sesión nuevamente.' });
      }
    } else {
      if (!userData || !userData.email || !userData.password) {
        return res.status(400).json({ error: 'Email y contraseña son requeridos para registrarse' });
      }
      if (userData.password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }

      const existing = await client.query('SELECT id FROM users WHERE email = $1', [userData.email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Este email ya está registrado. Iniciá sesión o usá otro email.' });
      }

      const passwordHash = await hashPassword(userData.password);
      const displayName = userData.displayName || userData.email.split('@')[0];
      const verificationToken = generateVerificationToken();
      const verificationExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, display_name, phone, role, email_verified, email_verification_token, email_verification_expires)
         VALUES ($1, $2, $3, $4, 'user', FALSE, $5, $6)
         RETURNING id, email, display_name, phone, role, created_at`,
        [userData.email, passwordHash, displayName, userData.phone || null, verificationToken, verificationExpires]
      );
      needsVerification = true;
      const newUser = userResult.rows[0];
      userId = newUser.id;
      userEmail = newUser.email;

      await pool.query(
        'UPDATE users SET email_verification_token = $1, email_verification_expires = $2, email_verified = FALSE WHERE id = $3',
        [verificationToken, verificationExpires, userId]
      );

      sendVerificationEmail(newUser.email, newUser.display_name, verificationToken).catch(err => console.error('Verification email error:', err));
    }

    if (for_adopter) {
      // Buscar fila pública existente para esta my_pet (evitar duplicados)
      let newPet = null;
      if (my_pet_id) {
        const existingRes = await client.query(
          `SELECT p.*, aa.status as assignment_status
           FROM pets p
           LEFT JOIN adoption_assignments aa ON aa.pet_id = p.id AND aa.status = 'pending_adopter'
           WHERE p.my_pet_id = $1 AND p.created_by = $2
           LIMIT 1`,
          [my_pet_id, userId]
        );
        const existing = existingRes.rows[0];
        if (existing) {
          if (existing.assignment_status === 'pending_adopter') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Esta mascota ya tiene una adopción pendiente. Cancelala desde "Adopciones pendientes".' });
          }
          // Reutilizar la fila existente con datos actualizados
          const upd = await client.query(
            `UPDATE pets SET name=$1, species=$2, breed=$3, color=$4, gender=$5,
               status='for_adoption', description=$6, location=$7,
               is_vaccinated=$8, is_sterilized=$9, is_dewormed=$10,
               adoption_assignment_id=NULL, updated_at=NOW()
             WHERE id=$11 RETURNING *`,
            [pet.name, pet.species, pet.breed || null, pet.color || null, pet.gender || 'unknown',
             pet.bio || null, pet.location || '', pet.is_vaccinated || false, pet.is_sterilized || false,
             pet.is_dewormed || false, existing.id]
          );
          newPet = upd.rows[0];
        }
      }

      if (!newPet) {
        // Crear pet en estado for_adoption vinculado al dueño actual
        const petResult = await client.query(
          `INSERT INTO pets (name, species, breed, color, gender, status, description, location,
            is_vaccinated, is_sterilized, is_dewormed, created_by, my_pet_id)
           VALUES ($1,$2,$3,$4,$5,'for_adoption',$6,$7,$8,$9,$10,$11,$12)
           RETURNING *`,
          [
            pet.name, pet.species, pet.breed || null, pet.color || null,
            pet.gender || 'unknown', pet.bio || null, pet.location || '',
            pet.is_vaccinated || false, pet.is_sterilized || false, pet.is_dewormed || false,
            userId, my_pet_id || null,
          ]
        );
        newPet = petResult.rows[0];
      }

      // Crear adoption_assignment pendiente
      const token = uuidv4().replace(/-/g, '') + Date.now().toString(36);
      const assignmentResult = await client.query(
        `INSERT INTO adoption_assignments (pet_id, inviter_id, adopter_name, adopter_email, adopter_phone, token, qr_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [newPet.id, userId, adopter.name, adopter.email, adopter.phone, token, share_token ? (await client.query('SELECT id FROM qr_identifiers WHERE share_token = $1', [share_token])).rows[0]?.id : null]
      );
      const assignment = assignmentResult.rows[0];

      // Vincular el pet al assignment
      await client.query(
        'UPDATE pets SET adoption_assignment_id = $1 WHERE id = $2',
        [assignment.id, newPet.id]
      );

      // Si hay share_token (QR escaneado), asignarlo al assignment
      if (share_token) {
        const qrRow = await client.query('SELECT id FROM qr_identifiers WHERE share_token = $1', [share_token]);
        if (qrRow.rows.length > 0) {
          await client.query(
            'UPDATE qr_identifiers SET assigned_at = NOW() WHERE share_token = $1',
            [share_token]
          );
        }
      }

      await client.query('COMMIT');

      // Notificar al admin
      const userName = userData?.displayName || userData?.email?.split('@')[0] || 'Usuario';
      sendPushToAdmins({
        title: 'Nueva adopción pendiente',
        body: `${userName} cargó a ${pet.name} para adopción con datos del adoptante ${adopter.name}`,
        tag: `adoption-pending-${newPet.id}`,
      }).catch(() => {});

      res.status(201).json({
        for_adopter: true,
        assignment_token: token,
        pet_id: newPet.id,
        message: 'Adopción pendiente creada. El adoptante recibirá una invitación para registrarse y reclamar la mascota.',
      });

      // Enviar notificación al adoptante (sin bloquear la respuesta)
      const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
      const claimLink = `${FRONTEND_URL}/adopcion/reclamar/${token}`;
      const inviterName = userData?.displayName || userData?.email?.split('@')[0] || 'Un usuario';
      const speciesLabel = pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species;

      const waText = `🐾 Hola ${adopter.name}!

${inviterName} te eligió para darle un hogar a ${pet.name} a través de Sigo Tu Huella.

¿Qué significa?
✅ ${pet.name} va a ser oficialmente tuya
✅ Su chapita QR quedará asociada a tu nombre
✅ Vas a poder gestionar su perfil, fotos y salud
✅ El dueño anterior ya no podrá modificar sus datos

Para ver los detalles y confirmar, hacé clic acá:
${claimLink}`;

      import('../services/whatsappService.js').then(({ sendMessage }) => {
        const normalized = adopter.phone.replace(/\D/g, '');
        if (normalized) sendMessage(normalized, waText).catch(e => console.error('WA notify adopter error:', e));
      }).catch(() => {});

      import('nodemailer').then(({ default: nm }) => {
        const t = nm.createTransport({
          host: process.env.SMTP_HOST || 'l0061596.ferozo.com',
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: false,
          tls: { rejectUnauthorized: false },
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        t.sendMail({
          from: `"Sigo Tu Huella" <${process.env.SMTP_FROM}>`,
          to: adopter.email,
          subject: `${inviterName} te dio en adopción a ${pet.name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;">
              <div style="text-align:center;margin-bottom:20px;">
                <div style="background:#f43f5e;color:white;width:60px;height:60px;line-height:60px;font-size:30px;border-radius:20px;display:inline-block;">🐾</div>
              </div>
              <h2 style="color:#1e293b;text-align:center;font-size:20px;margin-bottom:8px;">${inviterName} te dio en adopción a ${pet.name}</h2>
              <p style="color:#475569;text-align:center;font-size:15px;margin-bottom:20px;">A través de Sigo Tu Huella, la red de vecinos que cuidamos las mascotas.</p>

              <table style="width:100%;background:white;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid #e2e8f0;">
                <tr><td style="padding:4px 0;color:#64748b;">Especie</td><td style="padding:4px 0;font-weight:bold;">${speciesLabel}</td></tr>
                ${pet.breed ? `<tr><td style="padding:4px 0;color:#64748b;">Raza</td><td style="padding:4px 0;font-weight:bold;">${pet.breed}</td></tr>` : ''}
                ${pet.color ? `<tr><td style="padding:4px 0;color:#64748b;">Color</td><td style="padding:4px 0;font-weight:bold;">${pet.color}</td></tr>` : ''}
              </table>

              <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:20px;">
                <h3 style="color:#92400e;font-size:14px;margin:0 0 8px;">¿Qué significa?</h3>
                <ul style="color:#92400e;font-size:13px;padding-left:20px;margin:0;">
                  <li style="margin-bottom:4px;">${pet.name} va a ser oficialmente tuya</li>
                  <li style="margin-bottom:4px;">Su chapita QR quedará asociada a tu nombre</li>
                  <li style="margin-bottom:4px;">Vas a poder gestionar su perfil, fotos y salud</li>
                  <li style="margin-bottom:4px;">El dueño anterior ya no podrá modificar sus datos</li>
                </ul>
              </div>

              <div style="text-align:center;margin:24px 0;">
                <a href="${claimLink}" style="background:#5A5A40;color:#fff;padding:14px 40px;border-radius:12px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block;">
                  Ver y confirmar adopción
                </a>
              </div>

              <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px;">
                Si tenés dudas, contactá a ${inviterName} directamente.
              </p>
            </div>
          `,
        }).catch(e => console.error('Email notify adopter error:', e));
      }).catch(() => {});

      return;
    }

    const petResult = await client.query(
      `INSERT INTO my_pets (user_id, name, species, breed, color, gender, birth_date, bio,
        personality_tags, is_vaccinated, is_sterilized, is_dewormed,
        behavior_notes, medical_notes, emergency_phone,
        avatar_image, avatar_mime_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        userId, pet.name, pet.species, pet.breed || null, pet.color || null,
        pet.gender || 'unknown', pet.birth_date || null, pet.bio || null,
        JSON.stringify(pet.personality_tags || []),
        pet.is_vaccinated || false, pet.is_sterilized || false, pet.is_dewormed || false,
        pet.behavior_notes || null, pet.medical_notes || null, pet.emergency_phone || null,
        pet.avatar_image || null, pet.avatar_mime_type || null,
      ]
    );
    const myPet = petResult.rows[0];

    if (share_token) {
      // Assign existing QR to this pet
      await client.query(
        'UPDATE qr_identifiers SET my_pet_id = $1, assigned_at = NOW() WHERE share_token = $2',
        [myPet.id, share_token]
      );
      await client.query(
        'UPDATE my_pets SET qr_id = (SELECT id FROM qr_identifiers WHERE share_token = $1) WHERE id = $2',
        [share_token, myPet.id]
      );
    } else {
      await client.query(
        'UPDATE my_pets SET qr_requested = true WHERE id = $1',
        [myPet.id]
      );
    }

    await client.query('COMMIT');

    const userName = userData?.displayName || userData?.email?.split('@')[0] || 'Usuario';

    if (share_token) {
      sendPushToAdmins({
        title: 'Nuevo registro via QR',
        body: `${userName} creó su perfil digital para ${myPet.name} escaneando un QR`,
        tag: `qr-signup-${myPet.id}`,
      }).catch(() => {});
      sendAdminNotificationEmail(
        'Nuevo perfil digital creado desde QR',
        `<p><strong>${userName}</strong> registró a <strong>${myPet.name}</strong> (${myPet.species}${myPet.breed ? ' · ' + myPet.breed : ''}) escaneando un código QR.</p>
         <p><a href="https://sigotuhuella.com.ar/admin" style="background:#5A5A40;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Ir al panel admin</a></p>`
      ).catch(() => {});
    } else {
      sendPushToAdmins({
        title: 'Solicitud de chappita QR',
        body: `${userName} solicita QR para ${myPet.name}`,
        tag: `qr-request-${myPet.id}`,
      }).catch(() => {});

      const userEmail = userData?.email;

      sendAdminNotificationEmail(
        'Nueva solicitud de chappita identificadora QR',
        `<p><strong>${userName}</strong> solicitó una chappita QR para <strong>${myPet.name}</strong> (${myPet.species}${myPet.breed ? ' · ' + myPet.breed : ''}).</p>
         <p><a href="https://sigotuhuella.com.ar/admin" style="background:#5A5A40;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Ir al panel admin</a></p>`
      ).catch(() => {});

      // Send confirmation email to the requester
      const userEmailToUse = userEmail || (await pool.query('SELECT email FROM users WHERE id = $1', [userId])).rows[0]?.email;
      if (userEmailToUse) {
        try {
          const { default: nm } = await import('nodemailer');
          const t = nm.createTransport({
            host: process.env.SMTP_HOST || 'l0061596.ferozo.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: false,
            tls: { rejectUnauthorized: false },
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          });
          await t.sendMail({
            from: `"Sigo Tu Huella" <${process.env.SMTP_FROM}>`,
            to: userEmailToUse,
            subject: `Recibimos tu solicitud de chapita QR para ${myPet.name}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;">
              <div style="text-align:center;margin-bottom:24px;">
                <img src="https://sigotuhuella.com.ar/favicon.svg" alt="Sigo Tu Huella" width="64" height="64" style="border-radius:16px;"/>
              </div>
              <h2 style="color:#5A5A40;text-align:center;">¡Solicitud recibida! 🐾</h2>
              <p style="font-size:16px;color:#334155;">Hola <strong>${userName}</strong>,</p>
              <p style="font-size:16px;color:#334155;">Recibimos tu solicitud de chapita QR para <strong>${myPet.name}</strong> (${myPet.species}${myPet.breed ? ' · ' + myPet.breed : ''}).</p>
              <p style="font-size:16px;color:#334155;">Te vamos a notificar cuando esté lista para que pases a retirarla.</p>
              <div style="text-align:center;margin:28px 0;">
                <a href="https://sigotuhuella.com.ar/mascota/${myPet.id}" style="background:#5A5A40;color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:bold;display:inline-block;">Ver perfil de ${myPet.name}</a>
              </div>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
              <p style="color:#94a3b8;font-size:12px;text-align:center;">Sigo Tu Huella — Identificación Digital para Mascotas</p>
            </div>`,
          });
        } catch (e) { console.error('Request confirmation email error:', e); }
      }
    }

    if (needsVerification) {
      res.status(201).json({
        requiresVerification: true,
        email: userData.email,
        myPet,
        share_token,
      });
    } else {
      res.status(201).json({
        myPet,
        share_token,
      });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('request-chapita error:', err);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  } finally {
    client.release();
  }
});

export default router;
