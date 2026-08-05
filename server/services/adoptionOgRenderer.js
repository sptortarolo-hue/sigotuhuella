import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT = 'sans-serif';
const W = 1200;
const H = 630;

let _canvasModule = null;

async function getCanvas() {
  if (!_canvasModule) {
    _canvasModule = await import('canvas').catch(() => {
      throw new Error('canvas (node-canvas) no disponible en este servidor');
    });
  }
  return _canvasModule;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x + r, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCircularPhoto(ctx, x, y, size, img) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    const imgAspect = img.naturalWidth / img.naturalHeight;
    let sx, sy, sw, sh;
    if (imgAspect > 1) {
      sh = img.naturalHeight;
      sw = sh;
      sx = (img.naturalWidth - sw) / 2;
      sy = 0;
    } else {
      sw = img.naturalWidth;
      sh = sw;
      sx = 0;
      sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, size, size);
  } else {
    ctx.fillStyle = '#E6E6DF';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#999';
    ctx.font = `${size * 0.4}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐾', x + size / 2, y + size / 2);
  }
  ctx.restore();
  // Border
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.strokeStyle = '#D48C70';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

async function fetchAdoptionPets() {
  const result = await pool.query(`
    SELECT p.name, p.species, p.breed,
      (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id AND pi.image_data IS NOT NULL ORDER BY pi.created_at LIMIT 1) as image_data,
      (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id AND pi.image_data IS NOT NULL ORDER BY pi.created_at LIMIT 1) as mime_type
    FROM pets p
    WHERE p.status IN ('for_adoption', 'for_adoption_simple')
      AND (p.is_hidden = FALSE OR p.is_hidden IS NULL)
      AND p.group_id IS NULL
    ORDER BY RANDOM()
    LIMIT 4
  `);
  return result.rows;
}

function loadImageFromBase64(canvasModule, base64Data, mimeType) {
  const buf = Buffer.from(base64Data, 'base64');
  const prefix = mimeType === 'image/png' ? 'data:image/png;base64,' : 'data:image/jpeg;base64,';
  return canvasModule.loadImage(prefix + base64Data);
}

let cachedBuffer = null;
let cachedAt = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function renderAdoptionOg() {
  const now = Date.now();
  if (cachedBuffer && (now - cachedAt) < CACHE_TTL) {
    return cachedBuffer;
  }

  const { createCanvas, loadImage } = await getCanvas();
  const pets = await fetchAdoptionPets();

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#F5F5F0');
  bgGrad.addColorStop(1, '#E6E6DF');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Top brand bar
  ctx.fillStyle = '#5A5A40';
  ctx.fillRect(0, 0, W, 56);

  ctx.font = `bold 22px ${FONT}`;
  ctx.fillStyle = '#F5F5F0';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Sigo Tu Huella', 36, 28);

  ctx.textAlign = 'right';
  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = 'rgba(245,245,240,0.4)';
  ctx.fillText('sigotuhuella.com.ar', W - 36, 28);

  // Badge "MASCOTAS EN ADOPCIÓN"
  ctx.textAlign = 'center';
  ctx.font = `bold 13px ${FONT}`;
  const badgeText = 'MASCOTAS EN ADOPCIÓN';
  const badgeW = ctx.measureText(badgeText).width + 28;
  const badgeX = 36;
  const badgeY = 78;
  const badgeH = 26;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 13);
  ctx.fillStyle = 'rgba(212,140,112,0.15)';
  ctx.fill();
  ctx.fillStyle = '#D48C70';
  ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

  // Main title
  ctx.textAlign = 'left';
  ctx.font = `bold 52px ${FONT}`;
  ctx.fillStyle = '#5A5A40';
  ctx.fillText('Encontrá tu', 36, 160);
  ctx.fillText('nuevo compañero', 36, 220);

  // Accent underline
  const accentGrad = ctx.createLinearGradient(36, 0, 36 + 220, 0);
  accentGrad.addColorStop(0, '#D48C70');
  accentGrad.addColorStop(1, '#c47a5e');
  ctx.fillStyle = accentGrad;
  roundRect(ctx, 36, 240, 220, 6, 3);
  ctx.fill();

  // Subtitle
  ctx.font = `16px ${FONT}`;
  ctx.fillStyle = '#666';
  ctx.fillText('Conocé a las mascotas que buscan un hogar', 36, 278);

  // CTA
  const ctaText = 'Ver disponibles →';
  ctx.font = `bold 14px ${FONT}`;
  const ctaW = ctx.measureText(ctaText).width + 32;
  roundRect(ctx, 36, 302, ctaW, 36, 18);
  ctx.fillStyle = '#D48C70';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(ctaText, 36 + ctaW / 2, 320 + 1);

  // Pet photos section (right side)
  const petCount = Math.min(pets.length, 4);
  if (petCount > 0) {
    const photoSize = 110;
    const gap = 16;
    const startX = W - (petCount * photoSize + (petCount - 1) * gap) / 2 - 20;
    const startY = 80;

    // Decorative circles behind photos
    ctx.globalAlpha = 0.06;
    ctx.beginPath();
    ctx.arc(startX + 200, startY + 100, 130, 0, Math.PI * 2);
    ctx.fillStyle = '#D48C70';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(startX + 100, startY + 180, 80, 0, Math.PI * 2);
    ctx.fillStyle = '#5A5A40';
    ctx.fill();
    ctx.globalAlpha = 1;

    // Draw pet photos
    const promises = [];
    for (let i = 0; i < petCount; i++) {
      const pet = pets[i];
      const x = startX + i * (photoSize + gap);
      const y = startY;

      if (pet.image_data) {
        promises.push(
          loadImageFromBase64(_canvasModule, pet.image_data, pet.mime_type || 'image/jpeg')
            .then(img => ({ index: i, img, x, y, pet }))
            .catch(() => ({ index: i, img: null, x, y, pet }))
        );
      } else {
        promises.push(Promise.resolve({ index: i, img: null, x, y, pet }));
      }
    }

    const results = await Promise.all(promises);
    for (const r of results) {
      drawCircularPhoto(ctx, r.x, r.y, photoSize, r.img);

      // Pet name
      ctx.textAlign = 'center';
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillStyle = '#5A5A40';
      const name = truncateText(ctx, r.pet.name || 'Sin nombre', photoSize + 10);
      ctx.fillText(name, r.x + photoSize / 2, r.y + photoSize + 18);

      // Species
      ctx.font = `11px ${FONT}`;
      ctx.fillStyle = '#999';
      const speciesLabel = r.pet.species === 'dog' ? '🐕 Perro' : r.pet.species === 'cat' ? '🐈 Gato' : '🐾 Mascota';
      ctx.fillText(speciesLabel, r.x + photoSize / 2, r.y + photoSize + 34);
    }
  } else {
    // No pets placeholder
    ctx.textAlign = 'center';
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = '#999';
    ctx.fillText('🐾 Conocé a nuestras mascotas', W / 2, 220);
    ctx.fillText('disponibles para adopción', W / 2, 248);
  }

  // Bottom brand bar
  ctx.fillStyle = '#5A5A40';
  ctx.fillRect(0, H - 36, W, 36);
  ctx.textAlign = 'center';
  ctx.font = `12px ${FONT}`;
  ctx.fillStyle = 'rgba(245,245,240,0.7)';
  ctx.fillText('sigotuhuella.com.ar', W / 2, H - 14);

  const buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 });
  cachedBuffer = buffer;
  cachedAt = now;
  console.log(`[AdoptionOG] Generated ${buffer.length} bytes (${petCount} pets)`);
  return buffer;
}
