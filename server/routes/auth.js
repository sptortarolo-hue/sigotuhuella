import { Router } from 'express';
import pool from '../db.js';
import { generateToken, hashPassword, comparePassword, requireAuth } from '../auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, displayName } = req.body;
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
      'INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, display_name, role, created_at',
      [email, passwordHash, displayName || email.split('@')[0], 'user']
    );
    const user = result.rows[0];
    const token = generateToken(user);
    res.status(201).json({ token, user });
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
      user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, display_name, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
