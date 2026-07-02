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
  const keys = ['brand_primary_color', 'brand_secondary_color', 'brand_logo',
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

  if (imageBuffer && imageBuffer.length > 0) {
    const blurred = await sharp(imageBuffer)
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .blur(50)
      .toBuffer();
    const bgImg = await loadImage(blurred);
    ctx.drawImage(bgImg, 0, 0, width, height);

    // Card background: blur fill
    ctx.drawImage(bgImg, cardX, cardY, cardW, cardH, cardX, cardY, cardW, cardH);

    // Image centered within card (fit:inside = sin recortar)
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

    // Gradiente transicion ultimos 60px del card + espacio
    const gradTop = cardY + cardH - 60;
    const gradBot = cardY + cardH + spaceH;
    const gradH = gradBot - gradTop;
    const overlapGrad = ctx.createLinearGradient(0, gradTop, 0, gradBot);
    overlapGrad.addColorStop(0, 'rgba(0,0,0,0)');
    overlapGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = overlapGrad;
    ctx.fillRect(0, gradTop, width, gradH);
  } else {
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, hexToRgba(brand.primaryColor, 0.08));
    bgGrad.addColorStop(1, hexToRgba(brand.secondaryColor, 0.12));
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
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
  // Degradado semi-transparente detrás del título y contacto
  const contentGrad = ctx.createLinearGradient(0, contentSectionTop - 20, 0, contentSectionTop + 160);
  contentGrad.addColorStop(0, 'rgba(0,0,0,0)');
  contentGrad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  contentGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = contentGrad;
  ctx.fillRect(0, contentSectionTop - 20, width, 180);

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

  // Contacto debajo del título (solo mascotas)
  if (content.contact_info) {
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const contactY = contentSectionTop + 120;
    ctx.strokeText('📞 ' + content.contact_info, width / 2, contactY);
    ctx.fillText('📞 ' + content.contact_info, width / 2, contactY);
    ctx.lineWidth = 1;
  }

  // CTA en footer
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 5;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ctaUrl = FRONTEND_URL.replace(/^https?:\/\//, '');
  ctx.strokeText('❤️ ' + brand.ctaText + ' ' + ctaUrl, width / 2, height - footerH / 2);
  ctx.fillText('❤️ ' + brand.ctaText + ' ' + ctaUrl, width / 2, height - footerH / 2);
  ctx.lineWidth = 1;

  // Fecha abajo a la derecha (encima del footer)
  ctx.font = '24px sans-serif';
  ctx.fillStyle = '#D1D5DB';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const dateStr = new Date(content.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.strokeText(dateStr, width - 20, height - footerH - 12);
  ctx.fillText(dateStr, width - 20, height - footerH - 12);
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
