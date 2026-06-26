import { Router } from 'express';
import pool from '../db.js';
import { generateToken, hashPassword, comparePassword, requireAuth, sendPasswordResetEmail, generateResetToken, sendVerificationEmail, generateVerificationToken, sendWelcomeEmail, sendAdminNotificationEmail } from '../auth.js';
import crypto from 'crypto';
import { sendPushToAdmins } from '../services/pushService.js';
import { notifyUser } from '../services/notificationService.js';
import { OAuth2Client } from 'google-auth-library';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, displayName, phone } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Este email ya está registrado. Iniciá sesión o usá otro email.' });
    }
    const notificationPreference = ['both', 'whatsapp'].includes(req.body.notification_preference) ? req.body.notification_preference : 'email';
    const passwordHash = await hashPassword(password);
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);
    if (phone && !/^549\d{10}$/.test(phone.replace(/\D/g, ''))) {
      return res.status(400).json({ error: 'El teléfono debe tener formato 549XXXXXXXXXX (13 dígitos)' });
    }
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, phone, role, email_verified, email_verification_token, email_verification_expires, notification_preference)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7, $8)
       RETURNING id, email, display_name, phone, role, created_at,
                 avatar_data, avatar_mime_type, avatar_type,
                 member_number, volunteer_status, badges, notification_preference`,
      [email, passwordHash, displayName || email.split('@')[0], phone || null, 'user', verificationToken, verificationExpires, notificationPreference]
    );
    const user = result.rows[0];

    // Auto-accept any pending share invites for this email
    try {
      const pendingInvites = await pool.query(
        "SELECT id, pet_id, my_pet_id FROM share_invites WHERE invited_email = $1 AND status = 'pending'",
        [email]
      );
      for (const inv of pendingInvites.rows) {
        if (inv.pet_id) {
          await pool.query('INSERT INTO pet_shares (pet_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [inv.pet_id, user.id, 'editor']);
        } else if (inv.my_pet_id) {
          await pool.query('INSERT INTO my_pet_shares (pet_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [inv.my_pet_id, user.id, 'editor']);
        }
        await pool.query("UPDATE share_invites SET status = 'accepted', accepted_at = NOW() WHERE id = $1", [inv.id]);
      }
    } catch (e) { /* ignore invite errors on registration */ }

    sendVerificationEmail(user.email, user.display_name, verificationToken).catch(err => console.error('Failed to send verification email:', err));
    notifyUser(user, {
      subject: 'Confirmá tu email — Sigo Tu Huella',
      textMessage: `🐾 ¡Gracias por registrarte en Sigo Tu Huella, ${user.display_name}! Por favor verificá tu email para activar tu cuenta. Si no recibiste el email, revisá tu bandeja de spam.`,
      sendEmailFn: null,
    }).catch(err => console.error('WhatsApp verification notify error:', err));

    const adminSubject = `🔔 Nuevo Usuario Registrado: ${user.display_name}`;
    const adminHtml = `
      <p>Se ha registrado un nuevo usuario en la plataforma (email no verificado):</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; width: 120px; color: #475569;">Nombre:</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155;">${user.display_name}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #475569;">Email:</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155;">${user.email}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #475569;">Teléfono:</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155;">${user.phone || 'No especificado'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #475569;">Fecha:</td>
          <td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #334155;">${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</td>
        </tr>
      </table>
    `;
    sendAdminNotificationEmail(adminSubject, adminHtml).catch(err => console.error('Failed to send admin signup notification:', err));

    sendPushToAdmins({
      title: '🔔 Nuevo usuario registrado',
      body: `${user.display_name} se registró en la plataforma (pendiente verificación)`,
      url: `${process.env.FRONTEND_URL || 'https://sigotuhuella.online'}/admin`,
    }).catch(err => console.error('Push error:', err));

    res.status(201).json({ message: 'Registro exitoso. Revisá tu email para verificar tu cuenta.', requiresVerification: true, email: user.email });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Email no verificado. Revisá tu casilla (y la carpeta de correo no deseado). Si no encuentras el enlace, solicita uno nuevo.',
        requiresVerification: true,
        email: user.email,
      });
    }
    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id, email: user.email, display_name: user.display_name,
        phone: user.phone, role: user.role,
        avatar_data: user.avatar_data, avatar_mime_type: user.avatar_mime_type,
        avatar_type: user.avatar_type, member_number: user.member_number,
        volunteer_status: user.volunteer_status, badges: user.badges || [],
        notification_preference: user.notification_preference || 'email'
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, display_name, phone, role, created_at,
              avatar_data, avatar_mime_type, avatar_type,
              member_number, volunteer_status, badges
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    res.json({ user: { ...user, badges: user.badges || [] } });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  try {
    const result = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.json({ message: 'If the email exists, a reset link has been sent' });
    }

    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
      [resetToken, expiresAt, email]
    );

	try {
      await sendPasswordResetEmail(email, resetToken);
    } catch (emailErr) {
      console.error('Email send error:', emailErr.message);
    }

	res.json({ message: 'If the email exists, a reset link has been sent' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const result = await pool.query(
      'SELECT id, email, reset_token_expires FROM users WHERE reset_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    const user = result.rows[0];
    if (new Date(user.reset_token_expires) < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    const passwordHash = await hashPassword(newPassword);
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [passwordHash, user.id]
    );

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Check email status (exists, registration pending)
router.post('/check-email', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  try {
    const result = await pool.query(
      'SELECT id, email, registration_pending FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      return res.json({ exists: false });
    }
    res.json({
      exists: true,
      registrationPending: result.rows[0].registration_pending,
    });
  } catch (err) {
    console.error('Check email error:', err);
    res.status(500).json({ error: 'Failed to check email' });
  }
});

// Validate registration token
router.get('/validate-token/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, email, display_name FROM users WHERE registration_token = $1 AND registration_pending = TRUE',
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ valid: false, error: 'Invalid or expired token' });
    }
    res.json({ valid: true, email: result.rows[0].email, displayName: result.rows[0].display_name });
  } catch (err) {
    console.error('Validate token error:', err);
    res.status(500).json({ error: 'Failed to validate token' });
  }
});

// Complete registration (set password from token or email)
router.post('/complete-registration', async (req, res) => {
  const { email, token, password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  if (!email && !token) {
    return res.status(400).json({ error: 'Email or token is required' });
  }

  try {
    let user;

    if (token) {
      const result = await pool.query(
        'SELECT id, email, display_name, phone, notification_preference FROM users WHERE registration_token = $1 AND registration_pending = TRUE',
        [token]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired token' });
      }
      user = result.rows[0];
    } else {
      const result = await pool.query(
        'SELECT id, email, display_name, phone, notification_preference FROM users WHERE email = $1 AND registration_pending = TRUE',
        [email]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'User not found or already registered' });
      }
      user = result.rows[0];
    }

    const passwordHash = await hashPassword(password);
    await pool.query(
      'UPDATE users SET password_hash = $1, registration_pending = FALSE, registration_token = NULL, email_verified = TRUE WHERE id = $2',
      [passwordHash, user.id]
    );

    // Send welcome email
    sendWelcomeEmail(user.email, user.display_name).catch(err => console.error('Welcome email error:', err));
    notifyUser(user, {
      subject: '¡Te damos la bienvenida! 🐾',
      textMessage: `🐾 ¡Bienvenido a Sigo Tu Huella, ${user.display_name}! Ya podés reportar mascotas perdidas, avistajes y colaborar con la red de vecinos. Ingresá en sigotuhuella.online para empezar.`,
      sendEmailFn: null,
    }).catch(err => console.error('WhatsApp welcome notify error:', err));

    res.json({ message: 'Registration completed successfully', email: user.email });
  } catch (err) {
    console.error('Complete registration error:', err);
    res.status(500).json({ error: 'Failed to complete registration' });
  }
});

// Verify email
router.get('/verify-email/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, email, display_name, phone, role, notification_preference, email_verification_expires FROM users WHERE email_verification_token = $1 AND email_verified = FALSE',
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ valid: false, error: 'Token inválido o cuenta ya verificada' });
    }
    const user = result.rows[0];
    if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
      return res.status(400).json({ valid: false, error: 'El enlace de verificación expiró. Solicitá uno nuevo desde la pantalla de inicio de sesión.', expired: true });
    }
    await pool.query(
      'UPDATE users SET email_verified = TRUE, email_verification_token = NULL, email_verification_expires = NULL WHERE id = $1',
      [user.id]
    );
    const jwtToken = generateToken(user);
    sendWelcomeEmail(user.email, user.display_name).catch(err => console.error('Welcome email error:', err));
    notifyUser(user, {
      subject: '¡Email verificado! 🐾',
      textMessage: `✅ ¡Email verificado! Bienvenido a Sigo Tu Huella, ${user.display_name}. Ya podés acceder a tu cuenta y reportar mascotas.`,
      sendEmailFn: null,
    }).catch(err => console.error('WhatsApp welcome notify error:', err));
    res.json({ valid: true, token: jwtToken, user: { id: user.id, email: user.email, display_name: user.display_name, phone: user.phone, role: user.role, notification_preference: user.notification_preference } });
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'Error al verificar email' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  try {
    const result = await pool.query(
      'SELECT id, email, display_name, email_verification_token FROM users WHERE email = $1 AND email_verified = FALSE',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado o ya verificado' });
    }
    const user = result.rows[0];
    let token = user.email_verification_token;
    if (!token) {
      token = generateVerificationToken();
    }
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await pool.query(
      'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
      [token, expiresAt, user.id]
    );
    await sendVerificationEmail(user.email, user.display_name, token);
    res.json({ message: 'Email de verificación reenviado' });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Error al reenviar email de verificación' });
  }
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(credential) {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
}

// Google login
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Credential is required' });
  }
  try {
    const payload = await verifyGoogleToken(credential);
    const { email, name, sub: googleId } = payload;

    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      if (user.google_id) {
        const token = generateToken(user);
        return res.json({ token, user: { id: user.id, email: user.email, display_name: user.display_name, phone: user.phone, role: user.role, avatar_data: user.avatar_data, avatar_mime_type: user.avatar_mime_type, avatar_type: user.avatar_type, member_number: user.member_number, volunteer_status: user.volunteer_status, badges: user.badges || [] } });
      }
      return res.json({ needsPassword: true, email: user.email });
    }

    const result = await pool.query(
      `INSERT INTO users (email, display_name, role, email_verified, google_id)
       VALUES ($1, $2, 'user', TRUE, $3)
       RETURNING id, email, display_name, phone, role, created_at, avatar_data, avatar_mime_type, avatar_type, member_number, volunteer_status, badges`,
      [email, name || email.split('@')[0], googleId]
    );
    const user = result.rows[0];
    const token = generateToken(user);

    sendWelcomeEmail(user.email, user.display_name).catch(err => console.error('Welcome email error:', err));

    res.json({ token, user: { ...user, badges: user.badges || [] } });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ error: 'Error al iniciar sesión con Google' });
  }
});

// Link Google to existing account
router.post('/link-google', async (req, res) => {
  const { credential, password } = req.body;
  if (!credential || !password) {
    return res.status(400).json({ error: 'Credential and password are required' });
  }
  try {
    const payload = await verifyGoogleToken(credential);
    const { email, sub: googleId } = payload;

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const user = result.rows[0];

    if (!user.password_hash) {
      return res.status(400).json({ error: 'Esta cuenta no tiene contraseña. Usá Google para iniciar sesión.' });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);

    const token = generateToken(user);
    res.json({ token, user: { id: user.id, email: user.email, display_name: user.display_name, phone: user.phone, role: user.role, avatar_data: user.avatar_data, avatar_mime_type: user.avatar_mime_type, avatar_type: user.avatar_type, member_number: user.member_number, volunteer_status: user.volunteer_status, badges: user.badges || [] } });
  } catch (err) {
    console.error('Link google error:', err);
    res.status(500).json({ error: 'Error al vincular cuenta de Google' });
  }
});

export default router;
