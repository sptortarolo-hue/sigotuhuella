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

const W = 1200;
const H = 630;
const PHOTO_SIZE = 150;
const PHOTO_GAP = 20;
const PHOTO_Y = 340;
const PHOTO_MARGIN_X = 80;
const BRAND_BAR_H = 56;
const BOTTOM_BAR_H = 32;

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
    .replace(/&/g, '&amp;')
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
    LIMIT 4
  `);
  return result.rows;
}

async function processPhoto(base64Data, mimeType, size) {
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

  // Photo positions — distributed across full width
  const petCount = Math.min(pets.length, 4);
  const usableW = W - PHOTO_MARGIN_X * 2;
  const spacing = petCount > 1 ? usableW / (petCount - 1) : 0;
  const photosStartX = petCount === 1 ? W / 2 : PHOTO_MARGIN_X;

  let photoElements = '';

  for (let i = 0; i < petCount; i++) {
    const pet = pets[i];
    const photoData = photoDataList[i];
    const cx = photosStartX + i * spacing + (petCount === 1 ? 0 : 0);
    const cy = PHOTO_Y + PHOTO_SIZE / 2;
    const clipId = `clip-${i}`;

    // Clip path for circular photo
    photoElements += `
    <clipPath id="${clipId}">
      <circle cx="${cx}" cy="${cy}" r="${PHOTO_SIZE / 2}" />
    </clipPath>`;

    // Shadow circle (behind photo)
    photoElements += `
    <circle cx="${cx}" cy="${cy + 4}" r="${PHOTO_SIZE / 2}"
      fill="black" opacity="0.12" />`;

    // Photo (clipped circle)
    if (photoData) {
      photoElements += `
    <image href="data:image/jpeg;base64,${photoData}"
      x="${cx - PHOTO_SIZE / 2}" y="${cy - PHOTO_SIZE / 2}"
      width="${PHOTO_SIZE}" height="${PHOTO_SIZE}"
      clip-path="url(#${clipId})" />`;
    } else {
      photoElements += `
    <circle cx="${cx}" cy="${cy}" r="${PHOTO_SIZE / 2}"
      fill="${COLORS.brandAccent}" />
    <text x="${cx}" y="${cy + 6}" text-anchor="middle"
      font-size="48" fill="${COLORS.textLight}">🐾</text>`;
    }

    // Border ring
    photoElements += `
    <circle cx="${cx}" cy="${cy}" r="${PHOTO_SIZE / 2}"
      fill="none" stroke="${COLORS.brandSecondary}" stroke-width="3" />`;

    // Pet name
    const name = esc(pet.name || 'Sin nombre');
    photoElements += `
    <text x="${cx}" y="${cy + PHOTO_SIZE / 2 + 22}" text-anchor="middle"
      font-size="14" font-weight="bold" fill="${COLORS.textDark}"
      class="title">${name}</text>`;

    // Species emoji
    const emoji = pet.species === 'dog' ? '🐕' : pet.species === 'cat' ? '🐈' : '🐾';
    photoElements += `
    <text x="${cx}" y="${cy + PHOTO_SIZE / 2 + 40}" text-anchor="middle"
      font-size="12" fill="${COLORS.textLight}">${emoji}</text>`;
  }

  // No pets fallback
  if (petCount === 0) {
    photoElements = `
    <text x="${W / 2}" y="${PHOTO_Y + 60}" text-anchor="middle"
      font-size="20" fill="${COLORS.textLight}" class="title">
      Conocé a nuestras mascotas disponibles
    </text>`;
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
  </defs>
  ${fontFace}

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bgGrad)" />

  <!-- Decorative circles -->
  <circle cx="${W - 150}" cy="180" r="120" fill="${COLORS.brandSecondary}" opacity="0.05" />
  <circle cx="${W - 80}" cy="400" r="70" fill="${COLORS.brandPrimary}" opacity="0.04" />
  <circle cx="100" cy="${H - 40}" r="50" fill="${COLORS.brandSecondary}" opacity="0.04" />

  <!-- Top brand bar -->
  <rect width="${W}" height="${BRAND_BAR_H}" fill="${COLORS.brandPrimary}" />
  <text x="36" y="${BRAND_BAR_H / 2 + 1}" font-size="20" font-weight="bold"
    fill="${COLORS.white}" class="title" dominant-baseline="middle">Sigo Tu Huella</text>
  <text x="${W - 36}" y="${BRAND_BAR_H / 2 + 1}" font-size="13"
    fill="${COLORS.white}" opacity="0.4" class="title" text-anchor="end"
    dominant-baseline="middle">sigotuhuella.com.ar</text>

  <!-- Badge -->
  <rect x="36" y="74" width="210" height="28" rx="14"
    fill="${COLORS.brandSecondary}" opacity="0.15" />
  <text x="141" y="89" text-anchor="middle" font-size="12" font-weight="bold"
    fill="${COLORS.brandSecondary}" class="title" dominant-baseline="middle"
    letter-spacing="2">MASCOTAS EN ADOPCIÓN</text>

  <!-- Main title -->
  <text x="36" y="165" font-size="62" font-weight="bold"
    fill="${COLORS.textDark}" class="title">Mascotas en</text>
  <text x="36" y="235" font-size="62" font-weight="bold"
    fill="${COLORS.textDark}" class="title">Adopción</text>

  <!-- Accent bar -->
  <rect x="36" y="254" width="200" height="5" rx="2.5" fill="url(#accentGrad)" />

  <!-- Subtitle -->
  <text x="36" y="290" font-size="16" fill="${COLORS.textMid}" class="title">
    Conocé a las mascotas que buscan un hogar
  </text>

  <!-- Pet photos -->
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

  const pets = await fetchAdoptionPets();
  const petCount = Math.min(pets.length, 4);

  // Pre-process pet photos
  const photoDataList = [];
  for (let i = 0; i < petCount; i++) {
    const pet = pets[i];
    if (pet.image_data) {
      try {
        const buf = await processPhoto(pet.image_data, pet.mime_type || 'image/jpeg', PHOTO_SIZE);
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
