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

export async function applyBrandOverlay(imageBuffer, news) {
  const brand = await getBrandSettings();
  const width = 720;
  const height = 1280;
  const badge = typeBadge[news.type] || typeBadge.manual;
  const { createCanvas, loadImage } = await getCanvas();

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Seccion imagen 70% (80→878, 798px)
  const imgTop = 80;
  const imgH = 798;
  // Seccion contenido 30% (878→1220, 342px)
  const contentTop = 878;

  if (imageBuffer && imageBuffer.length > 0) {
    const blurred = await sharp(imageBuffer)
      .resize(width, height, { fit: 'cover', position: 'attention' })
      .blur(50)
      .toBuffer();
    const bgImg = await loadImage(blurred);
    ctx.drawImage(bgImg, 0, 0, width, height);

    // Imagen escalada sin recortar (fit:inside)
    const mainResized = await sharp(imageBuffer)
      .resize({ width, height: imgH, fit: 'inside' })
      .toBuffer();
    const mainImg = await loadImage(mainResized);

    // Relleno blurreado en toda la seccion imagen
    ctx.drawImage(bgImg, 0, imgTop, width, imgH, 0, imgTop, width, imgH);

    // Imagen real centrada vertical y horizontalmente
    const imgOffX = (width - mainImg.width) / 2;
    const imgOffY = imgTop + (imgH - mainImg.height) / 2;
    ctx.drawImage(mainImg, imgOffX, imgOffY, mainImg.width, mainImg.height);

    // Gradiente de transicion en los ultimos 80px de la imagen
    const gradTop = contentTop - 80;
    const overlapGrad = ctx.createLinearGradient(0, gradTop, 0, contentTop);
    overlapGrad.addColorStop(0, 'rgba(0,0,0,0)');
    overlapGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = overlapGrad;
    ctx.fillRect(0, gradTop, width, 80);
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
  ctx.fillRect(0, 0, width, 80);

  // Footer bar
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, height - 60, width, 60);

  // Logo
  if (brand.logo) {
    try {
      const logoBuf = Buffer.from(brand.logo, 'base64');
      const logoImg = await loadImage(logoBuf);
      ctx.save();
      ctx.beginPath();
      ctx.arc(44, 40, 24, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logoImg, 20, 16, 48, 48);
      ctx.restore();
    } catch (e) {
      console.error('Brand logo draw error:', e.message);
    }
  }

  // Brand signature
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const sigX = brand.logo ? 85 : 40;
  ctx.fillText(brand.signature, sigX, 40);

  // ── Content section 30% (878→1220) ──

  ctx.textAlign = 'center';

  // Badge centrado
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hexToRgba(badge.bg, 0.9);
  const badgeW = 140;
  const badgeH = 32;
  const badgeX = (width - badgeW) / 2;
  const badgeY = contentTop + 30;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 16);
  ctx.fill();
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(badge.label, width / 2, badgeY + badgeH / 2);

  // Titulo auto-escalable (28px→16px segun ancho)
  const titleText = news.title || '';
  const maxTitleW = 620;
  let fontSize = 28;
  while (fontSize > 16) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    if (ctx.measureText(titleText).width <= maxTitleW) break;
    fontSize--;
  }
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  const titleY = contentTop + 130;
  if (ctx.measureText(titleText).width <= maxTitleW) {
    ctx.fillText(titleText, width / 2, titleY);
  } else {
    wrapText(ctx, titleText, width / 2, titleY - fontSize / 2, maxTitleW, fontSize + 6, 2);
  }

  // Fecha
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#D1D5DB';
  ctx.fillText(
    new Date(news.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }),
    width / 2, contentTop + 182
  );

  // CTA
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(brand.ctaText + ' ' + FRONTEND_URL, width / 2, contentTop + 212);

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
      return `${base.substring(0, 400)}\n\n🔗 ${link}\n\n${brand.defaultHashtags}`;
    }
    case 'facebook': {
      return `${base}\n\n🔗 ${link}\n\n${brand.defaultHashtags}`;
    }
    case 'whatsapp': {
      return `${base.substring(0, 200)}\n\n🔗 ${link}`;
    }
    case 'status': {
      return `📰 ${typeLabel}\n${news.title}\n🔗 ${link}`;
    }
    default:
      return base;
  }
}


