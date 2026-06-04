import './env-loader.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
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
import memberRoutes from './routes/members.js';
import settingsRoutes from './routes/settings.js';
import whatsappRoutes from './routes/whatsapp.js';
import aiRoutes from './routes/ai.js';
import videoGeneratorRoutes from './routes/videoGenerator.js';
import myPetsRoutes from './routes/myPets.js';
import pushRoutes from './routes/push.js';
import { verifyToken } from './auth.js';
import { sendPushToUser } from './services/pushService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();

app.disable('x-powered-by');

app.use(express.json({ limit: '200mb' }));

app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  next();
});

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

app.get('/og-news-image/:newsId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT image_data, mime_type FROM news WHERE id = $1',
      [req.params.newsId]
    );
    if (result.rows.length === 0 || !result.rows[0].image_data) return res.status(404).end();
    const img = result.rows[0];
    const buffer = Buffer.from(img.image_data, 'base64');
    res.set('Content-Type', img.mime_type);
    res.set('Content-Length', buffer.length);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch (err) {
    console.error('OG news image error:', err);
    res.status(500).end();
  }
});

app.get('/my-pet-avatar/:petId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT avatar_image, avatar_mime_type FROM my_pets WHERE id = $1',
      [req.params.petId]
    );
    if (result.rows.length === 0 || !result.rows[0].avatar_image) return res.status(404).end();
    const img = result.rows[0];
    const buffer = Buffer.from(img.avatar_image, 'base64');
    res.set('Content-Type', img.avatar_mime_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch (err) {
    console.error('My-pet avatar error:', err);
    res.status(500).end();
  }
});

app.get('/my-pet-photo/:photoId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT image_data, mime_type FROM my_pet_photos WHERE id = $1',
      [req.params.photoId]
    );
    if (result.rows.length === 0) return res.status(404).end();
    const img = result.rows[0];
    const buffer = Buffer.from(img.image_data, 'base64');
    res.set('Content-Type', img.mime_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(buffer);
  } catch (err) {
    console.error('My-pet photo error:', err);
    res.status(500).end();
  }
});

app.use(express.static(join(__dirname, '..', 'dist')));
app.use('/generated', express.static(join(__dirname, '..', 'public', 'generated')));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Demasiados intentos de login. Intentá de nuevo en 15 minutos.' } });

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/pets', petRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/volunteers', volunteerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/my-pets', myPetsRoutes);

app.use('/api/push', (req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try { req.user = verifyToken(header.slice(7)); } catch {}
  }
  next();
}, pushRoutes);

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

 app.get('/novedad/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT title, content, image_data, mime_type, type FROM news WHERE id = $1',
      [req.params.id]
    );
    const news = result.rows[0];
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'https';
    const baseUrl = `${protocol}://${req.get('host')}`;
    let title = 'Novedad - Sigo Tu Huella';
    let description = 'Novedad de la comunidad de Sigo Tu Huella - Barrios Villa Garibaldi';
    let image = `${baseUrl}/sigotuhuella.jpg`;
    let imageType = '';
    if (news) {
      const typeLabels = { reunited: 'Reencuentro', adopted: 'Adopción', manual: 'Novedad' };
      title = `${news.title} - ${typeLabels[news.type] || 'Novedad'} | Sigo Tu Huella`;
      description = news.content ? news.content.substring(0, 160) : 'Ver más información en Sigo Tu Huella';
      if (news.image_data && news.mime_type) {
        image = `${baseUrl}/og-news-image/${req.params.id}`;
        imageType = news.mime_type;
      }
    }
    const ogTags = `<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${baseUrl}/novedad/${req.params.id}" />
<meta property="og:type" content="article" />
<meta property="og:locale" content="es_AR" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:secure_url" content="${escapeHtml(image)}" />
${imageType ? `<meta property="og:image:type" content="${escapeHtml(imageType)}" />` : ''}
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
</head>`;
    res.send(indexHtml.replace('</head>', ogTags));
  } catch (err) {
    console.error('OG news error:', err);
    res.send(indexHtml);
  }
});

// Video generator admin routes
 app.use('/api/admin/videos', videoGeneratorRoutes);

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
        "UPDATE users SET role = 'admin' WHERE email = $1",
        [email]
      );
      console.log(`Admin role verified: ${email}`);
    }
  } catch (err) {
    console.error('Admin seed error:', err);
  }
}

async function checkReminders() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await pool.query(`
      SELECT DISTINCT mp.user_id, mp.name AS pet_name,
             e.title AS event_title, e.next_date,
             r.title AS record_title
      FROM my_pets mp
      LEFT JOIN my_pet_events e ON e.my_pet_id = mp.id
        AND e.next_date <= $1 AND e.next_date >= $1::date - interval '3 days'
      LEFT JOIN pet_records r ON r.my_pet_id = mp.id
        AND r.next_date <= $1 AND r.next_date >= $1::date - interval '3 days'
      WHERE e.id IS NOT NULL OR r.id IS NOT NULL
    `, [today]);
    for (const row of result.rows) {
      const title = row.event_title || row.record_title;
      await sendPushToUser(row.user_id, {
        title: `Recordatorio para ${row.pet_name}`,
        body: `${title} — ${row.next_date?.toLocaleDateString?.('es-AR') || today}`,
        tag: `reminder-${row.pet_name}`,
      });
    }
    if (result.rows.length > 0) {
      console.log(`[reminders] Sent ${result.rows.length} reminder notifications`);
    }
  } catch (err) {
    console.error('[reminders] Error:', err);
  }
}

async function start() {
  await initDb();
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  setInterval(checkReminders, 6 * 60 * 60 * 1000);
  checkReminders();
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
