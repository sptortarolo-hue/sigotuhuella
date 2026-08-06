import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pool from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load Montserrat Bold font for embedding in SVG
let FONT_BASE64 = '';
try {
  const fontPath = join(__dirname, '..', '..', 'public', 'fonts', 'Montserrat-Bold.ttf');
  FONT_BASE64 = readFileSync(fontPath).toString('base64');
} catch {
  console.warn('[AdoptionOG] Montserrat-Bold.ttf not found, using system fallback');
}

// Load logo
let LOGO_BASE64 = '';
let logoReady = false;
async function ensureLogo() {
  if (logoReady) return;
  try {
    const logoPath = join(__dirname, '..', '..', 'public', 'sigotuhuella.jpg');
    const buf = await sharp(readFileSync(logoPath))
      .resize(240, 240, { fit: 'cover' })
      .png()
      .toBuffer();
    LOGO_BASE64 = buf.toString('base64');
    logoReady = true;
  } catch {
    console.warn('[AdoptionOG] sigotuhuella.jpg not found');
  }
}

const W = 1080;
const H = 1080;
const BRAND_BAR_H = 56;
const BOTTOM_BAR_H = 32;

// Circle definitions — 30% bigger, shifted bottom-right
const CIRCLES = [
  { size: 230, x: 140, y: 650 },   // foto 1 — largest, back left
  { size: 180, x: 380, y: 530 },   // foto 5 — mid, top center
  { size: 210, x: 600, y: 680 },   // foto 3 — large, right
  { size: 170, x: 500, y: 870 },   // foto 4 — mid, bottom center
  { size: 155, x: 260, y: 830 },   // foto 2 — small, left
  { size: 130, x: 780, y: 850 },   // foto 6 — smallest, far right
];

const COLORS = {
  brandPrimary: '#5A5A40',
  brandSecondary: '#D48C70',
  brandBg: '#F5F5F0',
  brandAccent: '#E6E6DF',
  textDark: '#5A5A40',
  textMid: '#666666',
  textLight: '#999999',
  white: '#F5F5F0',
};

function esc(str) {
  return String(str)
    .replace(/&&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchAdoptionPets() {
  const result = await pool.query(`
    SELECT p.id, p.name, p.species, p.breed,
      (SELECT pi.image_data FROM pet_images pi
       WHERE pi.pet_id = p.id AND pi.image_data IS NOT NULL
       ORDER BY pi.created_at LIMIT 1) as image_data,
      (SELECT pi.mime_type FROM pet_images pi
       WHERE pi.pet_id = p.id AND pi.image_data IS NOT NULL
       ORDER BY pi.created_at LIMIT 1) as mime_type
    FROM pets p
    WHERE p.status IN ('for_adoption', 'for_adoption_simple')
      AND (p.is_hidden = FALSE OR p.is_hidden IS NULL)
      AND p.group_id IS NULL
    ORDER BY RANDOM()
    LIMIT 6
  `);
  return result.rows;
}

async function processPhoto(base64Data, size) {
  const inputBuf = Buffer.from(base64Data, 'base64');
  return sharp(inputBuf)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 90 })
    .toBuffer();
}

function buildSvg(pets, photoDataList) {
  const fontFace = FONT_BASE64
    ? `<style>
    @font-face {
      font-family: 'Montserrat';
      src: url(data:font/truetype;base64,${FONT_BASE64}) format('truetype');
      font-weight: bold;
      font-style: normal;
    }
    .title { font-family: 'Montserrat', Arial, sans-serif; }
  </style>`
    : `<style>
    .title { font-family: 'Montserrat Bold', 'Arial Black', Arial, sans-serif; }
  </style>`;

  const petCount = Math.min(pets.length, CIRCLES.length);

  // Build clip paths for all circles
  let clipDefs = '';
  for (let i = 0; i < CIRCLES.length; i++) {
    const c = CIRCLES[i];
    clipDefs += `
    <clipPath id="clip-${i}">
      <circle cx="${c.x}" cy="${c.y}" r="${c.size / 2}" />
    </clipPath>`;
  }

  // Logo clip
  const logoX = W - logoSize - 36;
  const logoY = 150;
  const logoSize = 240;
  clipDefs += `
    <clipPath id="logoClip">
      <circle cx="${logoX + logoSize / 2}" cy="${logoY + logoSize / 2}" r="${logoSize / 2}" />
    </clipPath>`;

  // Build photo elements (drawn back to front for overlap)
  let photoElements = '';
  for (let i = 0; i < CIRCLES.length; i++) {
    const c = CIRCLES[i];
    const cx = c.x;
    const cy = c.y;
    const r = c.size / 2;

    if (i < petCount && photoDataList[i]) {
      // Shadow
      photoElements += `
    <circle cx="${cx}" cy="${cy + 5}" r="${r}" fill="black" opacity="0.1" />`;
      // Photo
      photoElements += `
    <image href="data:image/jpeg;base64,${photoDataList[i]}"
      x="${cx - r}" y="${cy - r}" width="${c.size}" height="${c.size}"
      clip-path="url(#clip-${i})" />`;
    } else if (i < petCount) {
      // Pet without photo — placeholder
      photoElements += `
    <circle cx="${cx}" cy="${cy + 5}" r="${r}" fill="black" opacity="0.08" />
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORS.brandAccent}" />
    <text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="${c.size * 0.35}"
      fill="${COLORS.textLight}">🐾</text>`;
    } else {
      // Decorative circle (no pet)
      photoElements += `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORS.brandSecondary}" opacity="0.08" />`;
    }

    // Border ring
    photoElements += `
    <circle cx="${cx}" cy="${cy}" r="${r}"
      fill="none" stroke="${COLORS.brandSecondary}" stroke-width="3" opacity="0.6" />`;

    // Pet name label (only for real pets)
    if (i < petCount && pets[i]) {
      const pet = pets[i];
      const name = esc(pet.name || '');
      const emoji = pet.species === 'dog' ? '🐕' : pet.species === 'cat' ? '🐈' : '🐾';
      // Position label below circle
      const labelY = cy + r + 20;
      photoElements += `
    <text x="${cx}" y="${labelY}" text-anchor="middle" font-size="13" font-weight="bold"
      fill="${COLORS.textDark}" class="title">${name}</text>
    <text x="${cx}" y="${labelY + 16}" text-anchor="middle" font-size="11"
      fill="${COLORS.textLight}">${emoji}</text>`;
    }
  }

  // Logo element
  let logoElement = '';
  if (LOGO_BASE64) {
    logoElement = `
    <!-- Logo -->
    <circle cx="${logoX + logoSize / 2}" cy="${logoY + logoSize / 2 + 5}" r="${logoSize / 2}"
      fill="black" opacity="0.08" />
    <image href="data:image/png;base64,${LOGO_BASE64}"
      x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}"
      clip-path="url(#logoClip)" />
    <circle cx="${logoX + logoSize / 2}" cy="${logoY + logoSize / 2}" r="${logoSize / 2}"
      fill="none" stroke="${COLORS.brandSecondary}" stroke-width="3" opacity="0.4" />`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${COLORS.brandBg}" />
      <stop offset="100%" stop-color="${COLORS.brandAccent}" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${COLORS.brandSecondary}" />
      <stop offset="100%" stop-color="#c47a5e" />
    </linearGradient>
    ${clipDefs}
  </defs>
  ${fontFace}

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bgGrad)" />

  <!-- Decorative background circles -->
  <circle cx="${W - 100}" cy="200" r="160" fill="${COLORS.brandSecondary}" opacity="0.04" />
  <circle cx="60" cy="${H - 100}" r="80" fill="${COLORS.brandPrimary}" opacity="0.03" />

  <!-- Top brand bar -->
  <rect width="${W}" height="${BRAND_BAR_H}" fill="${COLORS.brandPrimary}" />
  <text x="36" y="${BRAND_BAR_H / 2 + 1}" font-size="20" font-weight="bold"
    fill="${COLORS.white}" class="title" dominant-baseline="middle">Sigo Tu Huella</text>
  <text x="${W - 36}" y="${BRAND_BAR_H / 2 + 1}" font-size="13"
    fill="${COLORS.white}" opacity="0.4" class="title" text-anchor="end"
    dominant-baseline="middle">sigotuhuella.com.ar</text>

  <!-- Badge -->
  <rect x="36" y="80" width="220" height="30" rx="15"
    fill="${COLORS.brandSecondary}" opacity="0.15" />
  <text x="146" y="96" text-anchor="middle" font-size="12" font-weight="bold"
    fill="${COLORS.brandSecondary}" class="title" dominant-baseline="middle"
    letter-spacing="2">MASCOTAS EN ADOPCIÓN</text>

  <!-- Main title — LARGE -->
  <text x="36" y="200" font-size="110" font-weight="bold"
    fill="${COLORS.textDark}" class="title">Mascotas en</text>
  <text x="36" y="330" font-size="110" font-weight="bold"
    fill="${COLORS.textDark}" class="title">Adopción</text>

  <!-- Accent bar -->
  <rect x="36" y="355" width="220" height="6" rx="3" fill="url(#accentGrad)" />

  <!-- Subtitle — 80% bigger -->
  <text x="36" y="400" font-size="30" fill="${COLORS.textMid}" class="title">
    Conocé a las mascotas que buscan un hogar
  </text>

  <!-- Logo (right of title) -->
  ${logoElement}

  <!-- Pet photos (overlapping circles) -->
  ${photoElements}

  <!-- Bottom brand bar -->
  <rect y="${H - BOTTOM_BAR_H}" width="${W}" height="${BOTTOM_BAR_H}" fill="${COLORS.brandPrimary}" />
  <text x="${W / 2}" y="${H - BOTTOM_BAR_H / 2 + 1}" text-anchor="middle"
    font-size="12" fill="${COLORS.white}" opacity="0.7" class="title"
    dominant-baseline="middle">sigotuhuella.com.ar</text>
</svg>`;
}

let cachedBuffer = null;
let cachedAt = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function renderAdoptionOg() {
  const now = Date.now();
  if (cachedBuffer && (now - cachedAt) < CACHE_TTL) {
    return cachedBuffer;
  }

  await ensureLogo();
  const pets = await fetchAdoptionPets();
  const petCount = Math.min(pets.length, CIRCLES.length);

  // Pre-process pet photos at their circle sizes
  const photoDataList = [];
  for (let i = 0; i < petCount; i++) {
    const pet = pets[i];
    if (pet.image_data) {
      try {
        const buf = await processPhoto(pet.image_data, CIRCLES[i].size);
        photoDataList.push(buf.toString('base64'));
      } catch {
        photoDataList.push(null);
      }
    } else {
      photoDataList.push(null);
    }
  }

  const svg = buildSvg(pets, photoDataList);

  const buffer = await sharp(Buffer.from(svg))
    .jpeg({ quality: 85 })
    .toBuffer();

  cachedBuffer = buffer;
  cachedAt = now;
  console.log(`[AdoptionOG] Generated ${buffer.length} bytes (${petCount} pets)`);
  return buffer;
}
