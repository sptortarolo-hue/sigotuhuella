import { Router } from 'express';
import pool from '../db.js';
import { generateToken, hashPassword, verifyToken, sendWelcomeEmail, sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from '../services/pushService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const router = Router();

router.post('/', async (req, res) => {
  const { pet, user: userData } = req.body;

  if (!pet || !pet.name || !pet.species) {
    return res.status(400).json({ error: 'Nombre y especie de la mascota son requeridos' });
  }

  let authToken = null;
  let newUser = null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let userId;
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
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, display_name, phone, role)
         VALUES ($1, $2, $3, $4, 'user')
         RETURNING id, email, display_name, phone, role, created_at`,
        [userData.email, passwordHash, displayName, userData.phone || null]
      );
      newUser = userResult.rows[0];
      userId = newUser.id;
      authToken = generateToken(newUser);
    }

    const petResult = await client.query(
      `INSERT INTO my_pets (user_id, name, species, breed, color, gender, birth_date, bio,
        personality_tags, is_vaccinated, is_sterilized, is_dewormed, avatar_image, avatar_mime_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        userId, pet.name, pet.species, pet.breed || null, pet.color || null,
        pet.gender || 'unknown', pet.birth_date || null, pet.bio || null,
        JSON.stringify(pet.personality_tags || []),
        pet.is_vaccinated || false, pet.is_sterilized || false, pet.is_dewormed || false,
        pet.avatar_image || null, pet.avatar_mime_type || null,
      ]
    );
    const myPet = petResult.rows[0];

    await client.query(
      'UPDATE my_pets SET qr_requested = true WHERE id = $1',
      [myPet.id]
    );

    await client.query('COMMIT');

    const userName = newUser?.display_name || 'Usuario';
    sendPushToAdmins({
      title: 'Solicitud de chappita QR',
      body: `${userName} solicita QR para ${myPet.name}`,
      tag: `qr-request-${myPet.id}`,
    }).catch(() => {});

    sendAdminNotificationEmail(
      'Nueva solicitud de chappita identificadora QR',
      `<p><strong>${userName}</strong> solicitó una chappita QR para <strong>${myPet.name}</strong> (${myPet.species}${myPet.breed ? ' · ' + myPet.breed : ''}).</p>
       <p><a href="https://sigotuhuella.online/admin" style="background:#5A5A40;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Ir al panel admin</a></p>`
    ).catch(() => {});

    if (newUser) {
      sendWelcomeEmail(newUser.email, newUser.display_name).catch(err => console.error('Welcome email error:', err));
    }

    res.status(201).json({
      token: authToken,
      user: newUser ? { id: newUser.id, email: newUser.email, display_name: newUser.display_name, phone: newUser.phone, role: newUser.role } : null,
      myPet,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('request-chapita error:', err);
    res.status(500).json({ error: 'Error al procesar la solicitud' });
  } finally {
    client.release();
  }
});

export default router;
