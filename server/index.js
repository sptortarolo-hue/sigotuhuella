import 'dotenv/config';
import express from 'express';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import pool, { initDb } from './db.js';
import { hashPassword } from './auth.js';
import authRoutes from './routes/auth.js';
import petRoutes from './routes/pets.js';
import collaborationRoutes from './routes/collaboration.js';
import volunteerRoutes from './routes/volunteers.js';
import userRoutes from './routes/users.js';
import newsRoutes from './routes/news.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: '50mb' }));

// Serve pet images for OG preview (before static middleware to avoid conflicts)
app.get('/og-image/:petId/:index', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT image_data, mime_type FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1 OFFSET $2',
      [req.params.petId, parseInt(req.params.index) || 0]
    );
    if (result.rows.length === 0) return res.status(404).end();
    const img = result.rows[0];
    const buffer = Buffer.from(img.image_data, 'base64');
    res.set('Content-Type', img.mime_type);
    res.set('Content-Length', buffer.length);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch (err) {
    console.error('OG image error:', err);
    res.status(500).end();
  }
});

app.use(express.static(join(__dirname, '..', 'dist')));

app.use('/api/auth', authRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/volunteers', volunteerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/news', newsRoutes);

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const indexHtml = readFileSync(join(__dirname, '..', 'dist', 'index.html'), 'utf-8');

app.get('/pet/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.name, p.description, p.location, p.status, p.species,
        (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as image_data,
        (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as mime_type
      FROM pets p WHERE p.id = $1`,
      [req.params.id]
    );
    const pet = result.rows[0];
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'https';
    const baseUrl = `${protocol}://${req.get('host')}`;
    let title = 'Mascota - Sigo Tu Huella';
    let description = 'Publicación en Sigo Tu Huella - Red Vecinal';
    let image = `${baseUrl}/sigotuhuella.jpg`;
    if (pet) {
      const statusLabels = { lost: 'Perdido', retained: 'Retenido', sighted: 'Avistado', accidented: 'Accidentado', needs_attention: 'Necesita Atención', for_adoption: 'En Adopción', adopted: 'Adoptado', reunited: 'Reencuentro' };
      title = `${pet.name || 'Mascota sin identificar'} - ${statusLabels[pet.status] || 'Reporte'} | Sigo Tu Huella`;
      description = `${pet.location} | ${pet.description ? pet.description.substring(0, 160) : 'Ver más información en Sigo Tu Huella'}`;
      if (pet.image_data && pet.mime_type) {
        image = `${baseUrl}/og-image/${req.params.id}/0`;
      }
    }
    const ogTags = `<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${baseUrl}/pet/${req.params.id}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="es_AR" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:secure_url" content="${escapeHtml(image)}" />
${pet && pet.mime_type ? `<meta property="og:image:type" content="${escapeHtml(pet.mime_type)}" />` : ''}
<meta property="og:image:width" content="800" />
<meta property="og:image:height" content="600" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
</head>`;
    res.send(indexHtml.replace('</head>', ogTags));
  } catch (err) {
    console.error('OG error:', err);
    res.send(indexHtml);
  }
});

app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});

async function seedAdmin() {
  const email = 'sptortarolo@gmail.com';
  try {
    const passwordHash = await hashPassword('123456');
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, $4)',
        [email, passwordHash, 'sptortarolo', 'admin']
      );
      console.log(`Admin user created: ${email}`);
    } else {
      await pool.query(
        'UPDATE users SET password_hash = $1, display_name = $2, role = $3 WHERE email = $4',
        [passwordHash, 'sptortarolo', 'admin', email]
      );
      console.log(`Admin user updated: ${email}`);
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
