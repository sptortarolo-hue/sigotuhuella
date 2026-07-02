import sharp from 'sharp';
import pool from '../db.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

let _canvasModule = null;
async function getCanvas() {
  if (!_canvasModule) {
    try {
      _canvasModule = await import('canvas');
    } catch (e) {
      throw new Error('canvas (node-canvas) no disponible: ' + e.message);
    }
  }
  return _canvasModule;
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export async function getBrandSettings() {
  const keys = ['brand_primary_color', 'brand_secondary_color', 'brand_background_color', 'brand_logo',
    'brand_default_hashtags', 'brand_signature', 'brand_cta_text'];
  const { rows } = await pool.query(
    `SELECT key, value FROM settings WHERE key = ANY($1::text[])`,
    [keys]
  );
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const logoSetting = map.brand_logo || '';
  let logo = null;
  if (logoSetting) {
    logo = logoSetting;
  }
  return {
    primaryColor: map.brand_primary_color || '#5A5A40',
    secondaryColor: map.brand_secondary_color || '#D48C70',
    backgroundColor: map.brand_background_color || '#5A5A40',
    logo,
    defaultHashtags: map.brand_default_hashtags || '#AdoptaNoCompres #SigoTuHuella #MascotasPerdidas',
    signature: map.brand_signature || 'Sigo tu Huella',
    ctaText: map.brand_cta_text || 'Conocé más en',
  };
}

export async function getAutoPublishSettings() {
  const keys = ['news_auto_publish_enabled', 'news_auto_publish_platforms'];
  const { rows } = await pool.query(
    `SELECT key, value FROM settings WHERE key = ANY($1::text[])`,
    [keys]
  );
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  let platforms = ['instagram', 'facebook_page', 'whatsapp', 'status'];
  try { platforms = JSON.parse(map.news_auto_publish_platforms || '[]'); } catch {}
  return {
    enabled: map.news_auto_publish_enabled !== 'false',
    platforms,
  };
}

export async function saveAutoPublishSettings(settings) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('news_auto_publish_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
    [settings.enabled ? 'true' : 'false']
  );
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('news_auto_publish_platforms', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
    [JSON.stringify(settings.platforms || [])]
  );
}

export async function saveBrandSettings(settings) {
  const map = {
    brand_primary_color: settings.primaryColor,
    brand_secondary_color: settings.secondaryColor,
    brand_background_color: settings.backgroundColor,
    brand_logo: settings.logo,
    brand_default_hashtags: settings.defaultHashtags,
    brand_signature: settings.signature,
    brand_cta_text: settings.ctaText,
  };
  for (const [key, value] of Object.entries(map)) {
    if (value !== undefined) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
        [key, value]
      );
    }
  }
}

const typeBadge = {
  reunited: { label: 'Reencuentro', bg: '#10B981' },
  adopted: { label: 'Adopción', bg: '#3B82F6' },
  manual: { label: 'Novedad', bg: '#5A5A40' },
};

export const petBadges = {
  lost: { label: 'PERDIDO', bg: '#EF4444' },
  retained: { label: 'RETENIDO', bg: '#2563EB' },
  sighted: { label: 'AVISTADO', bg: '#2563EB' },
  accidented: { label: 'ACCIDENTADO', bg: '#EA580C' },
  needs_attention: { label: 'NECESITA ATENCIÓN', bg: '#D97706' },
  for_adoption: { label: 'EN ADOPCIÓN', bg: '#8B5CF6' },
  for_adoption_simple: { label: 'EN ADOPCIÓN', bg: '#F97316' },
  adopted: { label: 'ADOPTADO', bg: '#10B981' },
  reunited: { label: 'REENCUENTRO', bg: '#10B981' },
};

const ICON_SIZE = 38;
const ICON_GAP = 10;

function drawPhoneIcon(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  const w = Math.round(ICON_SIZE * 0.28);
  const h = Math.round(ICON_SIZE * 0.6);
  roundRect(ctx, -w / 2, -h / 2, w, h, w / 2);
  const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, '#64B5F6');
  grad.addColorStop(1, '#1565C0');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  ctx.fill();
  ctx.beginPath();
  roundRect(ctx, -w * 0.2, -h * 0.35, w * 0.3, h * 0.2, w * 0.1);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fill();
  ctx.restore();
}

function drawPinIcon(ctx, cx, cy) {
  const s = Math.round(ICON_SIZE * 0.45);
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.15, s * 0.35, Math.PI, 0);
  ctx.lineTo(cx, cy + s * 0.5);
  ctx.closePath();
  const grad = ctx.createRadialGradient(cx - s * 0.2, cy - s * 0.25, 0, cx, cy - s * 0.15, s * 0.55);
  grad.addColorStop(0, '#EF5350');
  grad.addColorStop(1, '#B71C1C');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - s * 0.08, cy - s * 0.28, s * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fill();
  ctx.restore();
}

function drawHeartIcon(ctx, cx, cy) {
  const s = Math.round(ICON_SIZE * 0.48);
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.bezierCurveTo(cx - s * 0.5, cy - s * 0.05, cx - s * 0.25, cy - s * 0.55, cx, cy - s * 0.15);
  ctx.bezierCurveTo(cx + s * 0.25, cy - s * 0.55, cx + s * 0.5, cy - s * 0.05, cx, cy + s * 0.35);
  ctx.closePath();
  const grad = ctx.createRadialGradient(cx - s * 0.15, cy - s * 0.2, 0, cx, cy - s * 0.1, s * 0.55);
  grad.addColorStop(0, '#F06292');
  grad.addColorStop(1, '#AD1457');
  ctx.save();
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - s * 0.1, cy - s * 0.25, s * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fill();
  ctx.restore();
}

function iconTextWidth(ctx, text) {
  return ICON_SIZE + ICON_GAP + ctx.measureText(text).width;
}

function drawIconAndText(ctx, iconFn, text, cx, y) {
  const totalW = iconTextWidth(ctx, text);
  const startX = cx - totalW / 2;
  ctx.textAlign = 'left';
  const iconCenterX = startX + ICON_SIZE / 2;
  iconFn(ctx, iconCenterX, y);
  ctx.strokeText(text, startX + ICON_SIZE + ICON_GAP, y);
  ctx.fillText(text, startX + ICON_SIZE + ICON_GAP, y);
}

export async function applyBrandOverlay(imageBuffer, content) {
  const brand = await getBrandSettings();
  const width = 720;
  const height = 1280;
  const badge = (content.type === 'pet' ? petBadges[content.pet_status] : null) || typeBadge[content.type] || typeBadge.manual;
  const { createCanvas, loadImage } = await getCanvas();

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Layout: header 10%, card 59% (9:16), title 15%, footer 10%
  const headerH = Math.round(height * 0.10); // 128
  const spaceH = Math.round(height * 0.03); // 38
  const cardH = Math.round(height * 0.59); // 755
  const cardW = Math.round(width * 0.95); // 684 (95% del ancho)
  const cardX = Math.round((width - cardW) / 2); // centered
  const cardY = headerH + spaceH; // 166
  const footerH = Math.round(height * 0.10); // 128
  const titleTop = height - footerH - Math.round(height * 0.15); // ~959
  const contentSectionTop = titleTop; // 959

  // Fondo sólido del color primario (entre header y footer)
  ctx.fillStyle = hexToRgba(brand.backgroundColor, 1);
  ctx.fillRect(0, 0, width, height);

  if (imageBuffer && imageBuffer.length > 0) {
    // Card con imagen centrada (fit:inside = sin recortar)
    const mainResized = await sharp(imageBuffer)
      .resize({ width: cardW, height: cardH, fit: 'inside' })
      .toBuffer();
    const mainImg = await loadImage(mainResized);
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, cardH, 20);
    ctx.clip();
    const imgOffX = cardX + (cardW - mainImg.width) / 2;
    const imgOffY = cardY + (cardH - mainImg.height) / 2;
    ctx.drawImage(mainImg, imgOffX, imgOffY, mainImg.width, mainImg.height);
    ctx.restore();
  }

  // Header bar
  const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
  headerGrad.addColorStop(0, hexToRgba(brand.primaryColor, 0.92));
  headerGrad.addColorStop(1, hexToRgba(brand.secondaryColor, 0.85));
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, headerH);

  // Footer bar
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, height - footerH, width, footerH);

  // Logo
  if (brand.logo) {
    try {
      const logoBuf = Buffer.from(brand.logo, 'base64');
      const logoImg = await loadImage(logoBuf);
      ctx.save();
      ctx.beginPath();
      ctx.arc(44, headerH / 2, 24, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logoImg, 20, headerH / 2 - 24, 48, 48);
      ctx.restore();
    } catch (e) {
      console.error('Brand logo draw error:', e.message);
    }
  }

  // Brand signature
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 5;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const sigX = brand.logo ? 110 : 40;
  ctx.strokeText(brand.signature, sigX, headerH / 2);
  ctx.fillText(brand.signature, sigX, headerH / 2);
  ctx.lineWidth = 1;

  // Badge en header (derecha)
  ctx.textBaseline = 'middle';
  const badgeW = 260;
  const badgeH = 64;
  const badgeX = width - badgeW - 20;
  const badgeY = (headerH - badgeH) / 2;
  ctx.fillStyle = hexToRgba(badge.bg, 0.9);
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 32);
  ctx.fill();
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 4;
  ctx.textAlign = 'center';
  ctx.strokeText(badge.label, badgeX + badgeW / 2, badgeY + badgeH / 2);
  ctx.fillText(badge.label, badgeX + badgeW / 2, badgeY + badgeH / 2);
  ctx.lineWidth = 1;

  // ── Content section (titleTop → height - footerH) ──

  ctx.textAlign = 'center';

  // Titulo auto-escalable (64px→32px segun ancho)
  const titleText = content.title || '';
  let fontSize = 64;
  const maxTitleW = 640;
  while (fontSize > 32) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    if (ctx.measureText(titleText).width <= maxTitleW) break;
    fontSize--;
  }
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 5;
  const titleCenterY = contentSectionTop + 50;
  if (ctx.measureText(titleText).width <= maxTitleW) {
    ctx.strokeText(titleText, width / 2, titleCenterY);
    ctx.fillText(titleText, width / 2, titleCenterY);
  } else {
    wrapText(ctx, titleText, width / 2, titleCenterY - fontSize / 2, maxTitleW, fontSize + 6, 2);
  }
  ctx.lineWidth = 1;

  // Contacto debajo del título
  let infoY = titleCenterY + (fontSize > 40 ? fontSize + 10 : 90);
  if (content.contact_info) {
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    ctx.textBaseline = 'middle';
    drawIconAndText(ctx, drawPhoneIcon, content.contact_info, width / 2, infoY);
    ctx.lineWidth = 1;
    infoY += 46;
  }
  // Ubicación debajo del contacto
  if (content.location) {
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    ctx.textBaseline = 'middle';
    drawIconAndText(ctx, drawPinIcon, content.location, width / 2, infoY);
    ctx.lineWidth = 1;
  }

  // CTA en footer
  const ctaUrl = FRONTEND_URL.replace(/^https?:\/\//, '');
  const ctaText = brand.ctaText + ' ' + ctaUrl;
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 5;
  ctx.textBaseline = 'middle';
  drawIconAndText(ctx, drawHeartIcon, ctaText, width / 2, height - footerH / 2);
  ctx.lineWidth = 1;

  return canvas.toBuffer('image/jpeg', { quality: 85 });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(' ');
  let line = '';
  let lineCount = 0;
  let curY = y;
  for (const word of words) {
    const testLine = line ? line + ' ' + word : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.strokeText(line, x, curY);
      ctx.fillText(line, x, curY);
      lineCount++;
      if (lineCount >= maxLines) break;
      curY += lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line && lineCount < maxLines) {
    ctx.strokeText(line, x, curY);
    ctx.fillText(line, x, curY);
  }
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
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function generatePlatformContent(news, platform) {
  const brand = { defaultHashtags: '#SigoTuHuella', signature: 'Sigo tu Huella' };
  const frontendUrl = FRONTEND_URL;
  const link = `${frontendUrl}/novedad/${news.id}`;
  const typeLabels = { reunited: 'Reencuentro', adopted: 'Adopción', manual: 'Novedad' };
  const typeLabel = typeLabels[news.type] || 'Novedad';

  const base = `📰 ${typeLabel}: ${news.title}\n\n${news.content}`;

  switch (platform) {
    case 'instagram': {
      const body = news.content.substring(0, 400);
      return `${base.substring(0, 400)}\n\n🔗 Encontrá más info en nuestro perfil\n\n${brand.defaultHashtags}`;
    }
    case 'facebook': {
      return `${base}\n\n🔗 ${link}\n\n${brand.defaultHashtags}`;
    }
    case 'whatsapp': {
      return `${base.substring(0, 200)}\n\n🔗 ${link}`;
    }
    case 'status': {
      return `${typeLabel}\n${news.title}\n🔗 ${link}`;
    }
    default:
      return base;
  }
}

export function generatePetCaption(pet, platform, petId) {
  const frontendUrl = FRONTEND_URL;
  const link = `${frontendUrl}/mascota/${petId}`;
  const speciesLabel = pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Mascota';
  const genderLabel = pet.gender === 'female' ? 'la' : 'el';
  const locationText = pet.location ? ` en ${pet.location}` : '';
  const base = `${speciesLabel} ${genderLabel} descripción: ${pet.description || 'Sin descripción'}${locationText}`;

  switch (platform) {
    case 'instagram': {
      return `${pet.status_label || pet.status}\n\n${base}\n\n🔗 Encontrá más info en nuestro perfil`;
    }
    case 'facebook': {
      return `${pet.status_label || pet.status}\n\n${base}\n\n🔗 ${link}`;
    }
    case 'whatsapp': {
      return `${pet.status_label || pet.status}: ${pet.description || 'Sin descripción'}${locationText}\n🔗 ${link}`;
    }
    default:
      return base;
  }
}

function truncateText(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '…';
}
