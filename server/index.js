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
import qrRoutes from './routes/qr.js';
import pushRoutes from './routes/push.js';
import feedRoutes from './routes/feed.js';
import contestRoutes from './routes/contests.js';
import gamificationRoutes from './routes/gamification.js';
import requestChapitaRoutes from './routes/requestChapita.js';
import facebookRoutes from './routes/facebook.js';
import instagramRoutes from './routes/instagram.js';
import imageRoutes from './routes/images.js';
import { startSyncTimer } from './services/vpsSyncService.js';
import { autoQueueForAdoption, processQueue } from './services/instagramPublisher.js';
import { replicateLatestInstagramPosts, retryFailedFacebookPosts } from './services/facebookPublisher.js';
import { publishStory, isConnected } from './services/instagramService.js';
import { checkWhatsAppTimeouts } from './services/whatsappScheduler.js';
import { verifyToken } from './auth.js';
import { sendPushToUser } from './services/pushService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const app = express();

app.disable('x-powered-by');

app.set('trust proxy', 1);
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
    const full = req.query.full === '1';
    const sql = full
      ? 'SELECT COALESCE(original_image_data, image_data) AS image_data, mime_type, external_url FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1 OFFSET $2'
      : 'SELECT image_data, mime_type, external_url FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1 OFFSET $2';
    const result = await pool.query(sql,
      [req.params.petId, parseInt(req.params.index) || 0]
    );
    if (result.rows.length === 0) return res.status(404).end();
    const img = result.rows[0];
    if (img.image_data) {
      const buffer = Buffer.from(img.image_data, 'base64');
      res.set('Content-Type', img.mime_type);
      res.set('Content-Length', buffer.length);
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.set('Access-Control-Allow-Origin', '*');
      res.end(buffer);
    } else if (img.external_url) {
      res.redirect(302, img.external_url);
    } else {
      res.status(404).end();
    }
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
    if (result.rows.length === 0 || !result.rows[0].image_data) return res.status(404).end();
    const img = result.rows[0];
    const buffer = Buffer.from(img.image_data, 'base64');
    res.set('Content-Type', img.mime_type || 'image/jpeg');
    res.set('Content-Length', buffer.length);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Access-Control-Allow-Origin', '*');
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
app.use('/api/qr', qrRoutes);

app.use('/api/push', (req, res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try { req.user = verifyToken(header.slice(7)); } catch {}
  }
  next();
}, pushRoutes);

app.use('/api/request-chapita', requestChapitaRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/facebook', facebookRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/images', imageRoutes);

// Sync with VPS scraper every 5 minutes
startSyncTimer(5);

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function stripOgTags(html) {
  return html.replace(/<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*\/?>/gi, '');
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
    res.send(stripOgTags(indexHtml).replace('</head>', ogTags));
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
    res.send(stripOgTags(indexHtml).replace('</head>', ogTags));
  } catch (err) {
    console.error('OG news error:', err);
    res.send(indexHtml);
  }
});

app.get('/mascota/:token', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mp.name, mp.species, mp.breed, mp.bio, mp.avatar_image IS NOT NULL as has_avatar, qi.code
       FROM qr_identifiers qi JOIN my_pets mp ON mp.id = qi.my_pet_id
       WHERE qi.share_token = $1`,
      [req.params.token]
    );
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'https';
    const baseUrl = `${protocol}://${req.get('host')}`;
    let title = 'Mascota - Sigo Tu Huella';
    let description = 'Identificación digital de mascotas - Sigo Tu Huella';
    const image = `${baseUrl}/sigotuhuella.jpg`;
    if (result.rows.length > 0) {
      const pet = result.rows[0];
      const speciesLabels = { dog: 'Perro', cat: 'Gato', other: 'Otro' };
      title = `${pet.name} - ${speciesLabels[pet.species] || 'Mascota'} | Sigo Tu Huella`;
      description = pet.bio ? pet.bio.substring(0, 160) : `${pet.name} — Identificado con QR ${pet.code}`;
    }
    const ogTags = `<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${baseUrl}/mascota/${req.params.token}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="es_AR" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta name="twitter:card" content="summary" />
</head>`;
    res.send(stripOgTags(indexHtml).replace('</head>', ogTags));
  } catch (err) {
    console.error('OG mascota error:', err);
    res.send(indexHtml);
  }
});

app.get('/vet/:token', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mp.id as pet_id, mp.name, mp.species, mp.avatar_image IS NOT NULL as has_avatar
       FROM my_pets mp WHERE mp.vet_share_token = $1 AND mp.vet_share_enabled = true`,
      [req.params.token]
    );
    const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'https';
    const baseUrl = `${protocol}://${req.get('host')}`;
    let title = 'Perfil Veterinario - Sigo Tu Huella';
    let description = 'Historia clínica compartida - Sigo Tu Huella';
    let image = `${baseUrl}/sigotuhuella.jpg`;
    if (result.rows.length > 0) {
      const pet = result.rows[0];
      title = `${pet.name} - Ficha Veterinaria | Sigo Tu Huella`;
      description = `Historia clínica de ${pet.name}`;
      if (pet.has_avatar) {
        image = `${baseUrl}/my-pet-avatar/${pet.pet_id}`;
      }
    }
    const ogTags = `<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${baseUrl}/vet/${req.params.token}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="es_AR" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:width" content="400" />
<meta property="og:image:height" content="400" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
</head>`;
    res.send(stripOgTags(indexHtml).replace('</head>', ogTags));
  } catch (err) {
    console.error('OG vet error:', err);
    res.send(indexHtml);
  }
});

app.get('/api/vet/:token', async (req, res) => {
  try {
    const petResult = await pool.query(
      `SELECT mp.*, u.display_name as owner_name, u.phone as owner_phone, u.email as owner_email
       FROM my_pets mp JOIN users u ON u.id = mp.user_id
       WHERE mp.vet_share_token = $1 AND mp.vet_share_enabled = true`,
      [req.params.token]
    );
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Token inválido o deshabilitado' });

    const pet = petResult.rows[0];
    const recordsResult = await pool.query(
      'SELECT * FROM pet_records WHERE my_pet_id = $1 ORDER BY COALESCE(record_date, created_at) DESC',
      [pet.id]
    );
    const eventsResult = await pool.query(
      'SELECT * FROM my_pet_events WHERE my_pet_id = $1 ORDER BY event_date DESC',
      [pet.id]
    );

    res.json({
      pet: {
        id: pet.id, name: pet.name, species: pet.species, breed: pet.breed,
        color: pet.color, gender: pet.gender, birth_date: pet.birth_date,
        weight_kg: pet.weight_kg, chip_id: pet.chip_id,
        is_vaccinated: pet.is_vaccinated, is_sterilized: pet.is_sterilized,
        is_dewormed: pet.is_dewormed, bio: pet.bio,
        owner_name: pet.owner_name, owner_phone: pet.owner_phone,
        owner_email: pet.owner_email,
        records: recordsResult.rows, events: eventsResult.rows,
      },
    });
  } catch (err) {
    console.error('vet API error:', err);
    res.status(500).json({ error: 'Error al obtener perfil veterinario' });
  }
});

// Solicitar chapita OG tags
app.get('/solicitar-chapita', (_req, res) => {
  const protocol = _req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'https';
  const baseUrl = `${protocol}://${_req.get('host')}`;
  const ogTags = `<meta property="og:title" content="Chappita identificadora - Sigo Tu Huella" />
<meta property="og:description" content="Protegé a tu mascota con una chappita QR. Identificación digital gratuita para tu perro o gato." />
<meta property="og:url" content="${baseUrl}/solicitar-chapita" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="es_AR" />
<meta property="og:image" content="${baseUrl}/chapita.png" />
<meta property="og:image:width" content="512" />
<meta property="og:image:height" content="512" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${baseUrl}/chapita.png" />
</head>`;
  res.send(stripOgTags(indexHtml).replace('</head>', ogTags));
});

app.get('/buscar-facebook', (_req, res) => {
  const protocol = _req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'https';
  const baseUrl = `${protocol}://${_req.get('host')}`;
  const ogTags = `<meta property="og:title" content="Buscar mascotas en Facebook - Sigo Tu Huella" />
<meta property="og:description" content="Encontrá publicaciones de mascotas perdidas y encontradas en grupos de Facebook de Zona Sur." />
<meta property="og:url" content="${baseUrl}/buscar-facebook" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="es_AR" />
<meta property="og:image" content="${baseUrl}/sigotuhuella.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${baseUrl}/sigotuhuella.jpg" />
</head>`;
  res.send(stripOgTags(indexHtml).replace('</head>', ogTags));
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
  console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✓ configurada' : '✗ NO configurada (fallback a keywords)'}`);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  setInterval(checkReminders, 6 * 60 * 60 * 1000);
  checkReminders();

  // Instagram publisher: check every 5 minutes
  setInterval(async () => {
    try {
      await autoQueueForAdoption();
      await processQueue();
    } catch (err) {
      console.error('[Instagram Publisher] Error:', err.message);
    }
  }, 5 * 60 * 1000);

  // Run Instagram publisher once immediately on startup (with a small 5s delay to let server start up fully)
  setTimeout(async () => {
    try {
      console.log('[Instagram Publisher] Running initial queue check...');
      await autoQueueForAdoption();
      await processQueue();
    } catch (err) {
      console.error('[Instagram Publisher Startup] Error:', err.message);
    }
  }, 5000);

  // Facebook publisher: replicate new Instagram posts to Page + Groups every 10 minutes
  setInterval(async () => {
    try {
      const enabled = await pool.query("SELECT value FROM settings WHERE key = 'facebook_page_publisher_enabled'");
      if (enabled.rows[0]?.value !== 'true') return;
      const results = await replicateLatestInstagramPosts(3);
      const ok = results.filter(r => r.result?.page?.success).length;
      if (results.length > 0) console.log(`[Facebook Publisher] Replicated ${ok}/${results.length} posts`);
      const retried = await retryFailedFacebookPosts(5);
      if (retried.length > 0) console.log(`[Facebook Publisher] Retried ${retried.length} failed posts`);
    } catch (err) {
      console.error('[Facebook Publisher] Error:', err.message);
    }
  }, 10 * 60 * 1000);

  setTimeout(async () => {
    try {
      const enabled = await pool.query("SELECT value FROM settings WHERE key = 'facebook_page_publisher_enabled'");
      if (enabled.rows[0]?.value === 'true') {
        console.log('[Facebook Publisher] Running initial replication...');
        await replicateLatestInstagramPosts(3);
        await retryFailedFacebookPosts(5);
      }
    } catch (err) {
      console.error('[Facebook Publisher Startup] Error:', err.message);
    }
  }, 15000);

  // Auto-story: rotate through videos with configured intervals
  async function publishNextStory() {
    try {
      const connected = await isConnected();
      if (!connected) return;
      const result = await pool.query(`
        SELECT id, title, video_data, story_interval_minutes, last_story_posted_at
        FROM promotional_videos
        WHERE status = 'ready'
          AND video_data != ''
          AND story_interval_minutes IS NOT NULL
          AND (last_story_posted_at IS NULL
               OR last_story_posted_at < NOW() - (story_interval_minutes || ' minutes')::INTERVAL)
        ORDER BY last_story_posted_at ASC NULLS FIRST
        LIMIT 1
      `);
      if (result.rows.length === 0) return;
      const video = result.rows[0];
      const FRONTEND = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
      const publicUrl = `${FRONTEND}/generated/videos/${video.video_data}`;
      await publishStory(publicUrl);
      await pool.query('UPDATE promotional_videos SET last_story_posted_at = NOW() WHERE id = $1', [video.id]);
      console.log(`[Auto-Story] Published "${video.title}" (${video.id})`);
    } catch (err) {
      console.error('[Auto-Story] Error:', err.message);
    }
  }

  setInterval(publishNextStory, 5 * 60 * 1000);
  setTimeout(publishNextStory, 20_000);

  // WhatsApp timeout/reminder check every 10 minutes
  setInterval(async () => {
    try {
      await checkWhatsAppTimeouts();
    } catch (err) {
      console.error('[WhatsApp Scheduler] Error:', err.message);
    }
  }, 10 * 60 * 1000);

  checkWhatsAppTimeouts();
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
