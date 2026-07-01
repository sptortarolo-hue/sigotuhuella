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
  const width = 1200;
  const height = 630;
  const badge = typeBadge[news.type] || typeBadge.manual;
  const { createCanvas, loadImage } = await getCanvas();

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  if (imageBuffer && imageBuffer.length > 0) {
    const contentH = height - 140;
    const resized = await sharp(imageBuffer)
      .resize(width, contentH, { fit: 'cover', position: 'attention' })
      .toBuffer();
    const img = await loadImage(resized);
    ctx.drawImage(img, 0, 80, width, contentH);
  } else {
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 80, width, height - 140);
  }

  // Header bar
  const headerGrad = ctx.createLinearGradient(0, 0, width, 0);
  headerGrad.addColorStop(0, hexToRgba(brand.primaryColor, 0.95));
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
      ctx.arc(48, 40, 28, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(logoImg, 20, 12, 56, 56);
      ctx.restore();
    } catch (e) {
      console.error('Brand logo draw error:', e.message);
    }
  }

  // Brand signature
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  const sigX = brand.logo ? 100 : 60;
  ctx.fillText(brand.signature, sigX, 40);

  // Badge
  ctx.fillStyle = hexToRgba(badge.bg, 0.9);
  roundRect(ctx, width - 180, 18, 160, 44, 22);
  ctx.fill();
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(badge.label, width - 100, 40);

  // Title
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = '#1F2937';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const titleText = truncateText(news.title, 40);
  ctx.fillText(titleText, 60, height / 2 - 5);

  // Date
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#6B7280';
  ctx.fillText(
    new Date(news.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }),
    60, height / 2 + 40
  );

  // Footer text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(brand.ctaText + ' ' + FRONTEND_URL, width / 2, height - 30);

  return canvas.toBuffer('image/jpeg', { quality: 85 });
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

function truncateText(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '…';
}
