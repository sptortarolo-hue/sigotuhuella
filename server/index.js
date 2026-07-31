import './env-loader.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { dirname, join } from 'path';
import { readFileSync, mkdirSync } from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import pool, { initDb } from './db.js';
import { hashPassword, requireAdmin } from './auth.js';
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
import phoneRelayRoutes from './routes/phoneRelay.js';
import facebookRelayRoutes from './routes/facebookRelay.js';
import invitesRoutes from './routes/invites.js';
import adoptionAssignmentsRoutes from './routes/adoptionAssignments.js';
import adminDashboardRoutes from './routes/adminDashboard.js';
import rafflesRoutes from './routes/raffles.js';
// import { startSyncTimer } from './services/vpsSyncService.js';
import { startScreenshotScheduler } from './services/autoScreenshots.js';
import { autoQueueForAdoption, processQueue } from './services/instagramPublisher.js';
import { replicateLatestInstagramPosts, retryFailedFacebookPosts } from './services/facebookPublisher.js';
import { checkWhatsAppTimeouts } from './services/whatsappScheduler.js';
import { broadcastNextAdoptionPet, broadcastFbAdoptionPets, broadcastAdoptionPet } from './services/whatsappService.js';
import { processInviteReminders } from './services/reminderService.js';
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
      res.set('Cache-Control', 'no-cache');
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
    res.set('Cache-Control', 'no-cache');
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
    res.set('Cache-Control', 'no-cache');
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
    res.set('Cache-Control', 'no-cache');
    res.set('Access-Control-Allow-Origin', '*');
    res.end(buffer);
  } catch (err) {
    console.error('My-pet photo error:', err);
    res.status(500).end();
  }
});

app.use(express.static(join(__dirname, '..', 'dist')));
app.use('/generated', express.static(join(__dirname, '..', 'public', 'generated')));
app.use('/uploads', express.static(join(__dirname, '..', 'public', 'uploads')));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Demasiados intentos. Intentá de nuevo en 15 minutos.' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Demasiados intentos de login. Intentá de nuevo en 15 minutos.' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

const ogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests',
});

function logOgError(label, err) {
  if (err?.code === '22P02') return;
  console.error(label, err);
}

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
app.use('/api/invites', invitesRoutes);
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
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/adoption-assignments', adoptionAssignmentsRoutes);
app.use('/api/raffles', rafflesRoutes);
app.use('/api/relay', phoneRelayRoutes);
app.use('/api/relay', facebookRelayRoutes);

const APP_VERSION = process.env.APP_VERSION || '1.0.0';
app.get('/api/app/version', (_req, res) => {
  res.json({
    version: APP_VERSION,
    bundleUrl: `${process.env.APP_BASE_URL || 'https://sigotuhuella.com.ar'}/bundles/bundle-v${APP_VERSION}.zip`,
    changelog: '',
    mandatory: false,
  });
});

// Sync with VPS scraper every 5 minutes — removed (scraper deprecated)
// startSyncTimer(5);

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function stripOgTags(html) {
  return html.replace(/<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*\/?>/gi, '');
}

const indexHtml = readFileSync(join(__dirname, '..', 'dist', 'index.html'), 'utf-8');

app.get('/pet/:id', ogLimiter, async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(404).send(indexHtml);
  }
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
      const statusLabels = { lost: 'Perdido', retained: 'Retenido', sighted: 'Avistado', accidented: 'Accidentado', needs_attention: 'Necesita Atención', for_adoption: 'En Adopción', for_adoption_simple: 'Adopción (Difusión)', adopted: 'Adoptado', reunited: 'Reencuentro', transitada: 'En Tránsito' };
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
    logOgError('OG error:', err);
    res.send(indexHtml);
  }
});

 app.get('/novedad/:id', ogLimiter, async (req, res) => {
  if (!isValidUuid(req.params.id)) {
    return res.status(404).send(indexHtml);
  }
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
    logOgError('OG news error:', err);
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
    } else if (/^\d+$/.test(req.params.token)) {
      const oldResult = await pool.query(
        'SELECT qi.share_token, mp.name, mp.species, mp.breed, mp.bio, mp.avatar_image IS NOT NULL as has_avatar, qi.code FROM my_pets mp LEFT JOIN qr_identifiers qi ON qi.my_pet_id = mp.id WHERE mp.id = $1 AND qi.share_token IS NOT NULL',
        [req.params.token]
      );
      if (oldResult.rows.length > 0) {
        const correctUrl = `${baseUrl}/mascota/${oldResult.rows[0].share_token}`;
        return res.redirect(302, correctUrl);
      }
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

// Sponsor logo upload
const sponsorsUploadDir = join(__dirname, '..', 'public', 'uploads', 'sponsors');
mkdirSync(sponsorsUploadDir, { recursive: true });
const sponsorUpload = multer({
  storage: multer.diskStorage({
    destination: join(__dirname, '..', 'public', 'uploads', 'sponsors'),
    filename: (_req, file, cb) => {
      const ext = file.originalname.split('.').pop() || 'png';
      cb(null, `sponsor-${Date.now()}.${ext}`);
    },
  }),
  limits: { fileSize: 512 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'), false);
  },
});

app.post('/api/upload/sponsor-logo', requireAdmin, sponsorUpload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
  res.json({ url: `/uploads/sponsors/${req.file.filename}` });
});

// Video generator admin routes
 app.use('/api/admin/videos', videoGeneratorRoutes);

 // Multer / file upload error handler
 app.use((err, _req, res, next) => {
   if (err.code === 'LIMIT_FILE_SIZE') {
     return res.status(400).json({ error: 'El archivo excede el límite de 512KB' });
   }
   if (err.type === 'entity.too.large') {
     return res.status(413).json({ error: 'Solicitud demasiado grande' });
   }
   next(err);
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
        "UPDATE users SET role = 'admin' WHERE email = $1",
        [email]
      );
      console.log(`Admin role verified: ${email}`);
    }
  } catch (err) {
    console.error('Admin seed error:', err);
  }
}

async function seedTestUser() {
  const email = 'test@sigotuhuella.com.ar';
  const password = 'sihuella2024';
  try {
    const passwordHash = await hashPassword(password);
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length === 0) {
      const seededPwd = password;
      await pool.query(
        `INSERT INTO users (email, password_hash, display_name, role, email_verified)
         VALUES ($1, $2, $3, 'user', TRUE)`,
        [email, passwordHash, 'Usuario Prueba']
      );
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ('screenshot_test_password', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [seededPwd]
      );
      console.log(`Test user created: ${email} / ${seededPwd}`);
    } else {
      const stored = await pool.query("SELECT value FROM settings WHERE key = 'screenshot_test_password'");
      if (!stored.rows[0]?.value) {
        await pool.query(
          `INSERT INTO settings (key, value) VALUES ('screenshot_test_password', $1)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [password]
        );
      }
    }
  } catch (err) {
    console.error('Test user seed error:', err);
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
  await seedTestUser();
  console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✓ configurada' : '✗ NO configurada (fallback a keywords)'}`);
  console.log(`GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '✓ configurada' : '✗ NO configurada'}`);
  console.log(`WHATSAPP_AI_PRIMARY: ${process.env.WHATSAPP_AI_PRIMARY === 'true' ? '✓ AI first' : 'keywords first'}`);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  setInterval(checkReminders, 6 * 60 * 60 * 1000);
  checkReminders();

  // Invite reminders: every hour
  setInterval(processInviteReminders, 60 * 60 * 1000);
  processInviteReminders();

  // Instagram publisher: check every minute
  setInterval(async () => {
    try {
      await autoQueueForAdoption();
      await processQueue();
    } catch (err) {
      console.error('[Instagram Publisher] Error:', err.message);
    }
  }, 60 * 1000);

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

  // Auto screenshots: capture mobile screenshots of key pages periodically
  startScreenshotScheduler();

  // Facebook publisher: replicate new Instagram posts to Page + Groups every 2 minutes
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
  }, 2 * 60 * 1000);

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


  // WhatsApp timeout/reminder check every 10 minutes
  setInterval(async () => {
    try {
      await checkWhatsAppTimeouts();
    } catch (err) {
      console.error('[WhatsApp Scheduler] Error:', err.message);
    }
  }, 10 * 60 * 1000);

  checkWhatsAppTimeouts();

  // Adoption broadcast: every 60 min, publish only at configured hours
  async function checkAdoptionBroadcast() {
    try {
      const hour = parseInt(new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: 'numeric',
        hour12: false,
      }).format(new Date()));

      const waHours = (await pool.query("SELECT value FROM settings WHERE key = 'wa_adoption_broadcast_hours'")).rows[0]?.value || '8,12,16,20';
      const fbHours = (await pool.query("SELECT value FROM settings WHERE key = 'fb_adoption_broadcast_hours'")).rows[0]?.value || '8,12,16,20';
      const lastWaHour = parseInt((await pool.query("SELECT value FROM settings WHERE key = 'last_wa_adoption_broadcast_hour'")).rows[0]?.value || '-1');
      const lastFbHour = parseInt((await pool.query("SELECT value FROM settings WHERE key = 'last_fb_adoption_broadcast_hour'")).rows[0]?.value || '-1');

      if (hour !== lastWaHour && waHours.split(',').map(s => parseInt(s.trim())).includes(hour)) {
        await broadcastNextAdoptionPet();
        await pool.query("UPDATE settings SET value = $1 WHERE key = 'last_wa_adoption_broadcast_hour'", [String(hour)]);
      }
      if (hour !== lastFbHour && fbHours.split(',').map(s => parseInt(s.trim())).includes(hour)) {
        await broadcastFbAdoptionPets();
        await pool.query("UPDATE settings SET value = $1 WHERE key = 'last_fb_adoption_broadcast_hour'", [String(hour)]);
      }
    } catch (err) {
      console.error('[AdoptionBroadcast Scheduler] Error:', err.message);
    }
  }
  setTimeout(checkAdoptionBroadcast, 10_000);
  setInterval(checkAdoptionBroadcast, 60 * 60 * 1000);
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
