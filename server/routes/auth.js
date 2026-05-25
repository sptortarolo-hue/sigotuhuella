import { Router } from 'express';
import pool from '../db.js';
import { generateToken, hashPassword, comparePassword, requireAuth, sendPasswordResetEmail, generateResetToken, sendWelcomeEmail, sendAdminNotificationEmail } from '../auth.js';
import crypto from 'crypto';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, displayName, phone } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, display_name, phone, role, created_at,
                 avatar_data, avatar_mime_type, avatar_type,
                 member_number, volunteer_status, badges`,
      [email, passwordHash, displayName || email.split('@')[0], phone || null, 'user']
    );
    const user = result.rows[0];
    const token = generateToken(user);
    sendWelcomeEmail(user.email, user.display_name).catch(err => console.error('Failed to send welcome email:', err));
    
    // Notify administrators of the new registration
    const adminSubject = `🔔 Nuevo Usuario Registrado: ${user.display_name}`;
    const adminHtml = `
      <p>Se ha registrado un nuevo usuario en la plataforma:</p>
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

    res.status(201).json({ token, user: { ...user, badges: user.badges || [] } });
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
    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id, email: user.email, display_name: user.display_name,
        phone: user.phone, role: user.role,
        avatar_data: user.avatar_data, avatar_mime_type: user.avatar_mime_type,
        avatar_type: user.avatar_type, member_number: user.member_number,
        volunteer_status: user.volunteer_status, badges: user.badges || []
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

    console.log(`PASSWORD RESET TOKEN for ${email}: ${resetToken}`);

    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
    console.log(`RESET LINK: ${resetUrl}`);

    try {
      const result = await sendPasswordResetEmail(email, resetToken);
      console.log('Resend response:', JSON.stringify(result));
      console.log(`Email sent successfully to ${email}`);
    } catch (emailErr) {
      console.error('Email send error:', emailErr.message);
    }

    res.json({ 
      message: 'If the email exists, a reset link has been sent',
      debugResetUrl: resetUrl
    });
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
        'SELECT id, email, display_name FROM users WHERE registration_token = $1 AND registration_pending = TRUE',
        [token]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired token' });
      }
      user = result.rows[0];
    } else {
      const result = await pool.query(
        'SELECT id, email, display_name FROM users WHERE email = $1 AND registration_pending = TRUE',
        [email]
      );
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'User not found or already registered' });
      }
      user = result.rows[0];
    }

    const passwordHash = await hashPassword(password);
    await pool.query(
      'UPDATE users SET password_hash = $1, registration_pending = FALSE, registration_token = NULL WHERE id = $2',
      [passwordHash, user.id]
    );

    // Send welcome email
    sendWelcomeEmail(user.email, user.display_name).catch(err => console.error('Welcome email error:', err));

    res.json({ message: 'Registration completed successfully', email: user.email });
  } catch (err) {
    console.error('Complete registration error:', err);
    res.status(500).json({ error: 'Failed to complete registration' });
  }
});

export default router;
