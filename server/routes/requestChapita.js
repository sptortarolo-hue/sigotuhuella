import { Router } from 'express';
import pool from '../db.js';
import { generateToken, hashPassword, verifyToken, sendVerificationEmail, generateVerificationToken, sendWelcomeEmail, sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from '../services/pushService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const router = Router();

router.post('/', async (req, res) => {
  const { pet, user: userData, share_token } = req.body;

  if (!pet || !pet.name || !pet.species) {
    return res.status(400).json({ error: 'Nombre y especie de la mascota son requeridos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validate share_token if provided
    if (share_token) {
      const qrCheck = await client.query(
        'SELECT id FROM qr_identifiers WHERE share_token = $1 AND my_pet_id IS NULL',
        [share_token]
      );
      if (qrCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Este código QR ya está asociado a otra mascota o no es válido.' });
      }
    }

    let userId;
    let needsVerification = false;
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

      await pool.query(
        'UPDATE users SET email_verification_token = $1, email_verification_expires = $2, email_verified = FALSE WHERE id = $3',
        [verificationToken, verificationExpires, userId]
      );

      sendVerificationEmail(newUser.email, newUser.display_name, verificationToken).catch(err => console.error('Verification email error:', err));
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
         <p><a href="https://sigotuhuella.online/admin" style="background:#5A5A40;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Ir al panel admin</a></p>`
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
         <p><a href="https://sigotuhuella.online/admin" style="background:#5A5A40;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Ir al panel admin</a></p>`
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
            from: `"Sigo Tu Huella" <${process.env.SMTP_USER}>`,
            to: userEmailToUse,
            subject: `Recibimos tu solicitud de chapita QR para ${myPet.name}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;">
              <div style="text-align:center;margin-bottom:24px;">
                <img src="https://sigotuhuella.online/favicon.svg" alt="Sigo Tu Huella" width="64" height="64" style="border-radius:16px;"/>
              </div>
              <h2 style="color:#5A5A40;text-align:center;">¡Solicitud recibida! 🐾</h2>
              <p style="font-size:16px;color:#334155;">Hola <strong>${userName}</strong>,</p>
              <p style="font-size:16px;color:#334155;">Recibimos tu solicitud de chapita QR para <strong>${myPet.name}</strong> (${myPet.species}${myPet.breed ? ' · ' + myPet.breed : ''}).</p>
              <p style="font-size:16px;color:#334155;">Te vamos a notificar cuando esté lista para que pases a retirarla.</p>
              <div style="text-align:center;margin:28px 0;">
                <a href="https://sigotuhuella.online/mascota/${myPet.id}" style="background:#5A5A40;color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:bold;display:inline-block;">Ver perfil de ${myPet.name}</a>
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
