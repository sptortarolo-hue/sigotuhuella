import 'dotenv/config';
import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pool, { initDb } from './db.js';
import { hashPassword } from './auth.js';
import authRoutes from './routes/auth.js';
import petRoutes from './routes/pets.js';
import collaborationRoutes from './routes/collaboration.js';
import volunteerRoutes from './routes/volunteers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.static(join(__dirname, '..', 'dist')));

app.use('/api/auth', authRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/volunteers', volunteerRoutes);

app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});

async function seedAdmin() {
  const email = 'sptortarolo@gmail.com';
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length === 0) {
      const passwordHash = await hashPassword('123456');
      await pool.query(
        'INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4)',
        [email, passwordHash, 'sptortarolo', 'admin']
      );
      console.log(`Admin user created: ${email}`);
    }
  } catch (err) {
    console.error('Admin seed error:', err);
  }
}

async function start() {
  await initDb();
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
