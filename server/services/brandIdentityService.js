import sharp from 'sharp';
import pool from '../db.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

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

  const svgOverlay = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${brand.primaryColor}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${brand.secondaryColor}" stop-opacity="0.85"/>
      </linearGradient>
      <linearGradient id="footerGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${brand.primaryColor}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${brand.secondaryColor}" stop-opacity="0.85"/>
      </linearGradient>
    </defs>

    <!-- Header bar -->
    <rect x="0" y="0" width="${width}" height="80" fill="url(#headerGrad)"/>
    <!-- Footer bar -->
    <rect x="0" y="${height - 60}" width="${width}" height="60" fill="url(#footerGrad)"/>

    <!-- Brand name in header -->
    <text x="100" y="48" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="white">${escapeXml(brand.signature)}</text>

    <!-- Type badge -->
    <rect x="${width - 180}" y="18" width="160" height="44" rx="22" fill="${badge.bg}" opacity="0.9"/>
    <text x="${width - 100}" y="48" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">${badge.label}</text>

    <!-- Title -->
    <text x="60" y="${height / 2 - 20}" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="#1F2937">
      <tspan x="60" dy="0">${escapeXml(truncateText(news.title, 40))}</tspan>
    </text>

    <!-- Date -->
    <text x="60" y="${height / 2 + 30}" font-family="Arial, sans-serif" font-size="18" fill="#6B7280">
      ${new Date(news.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
    </text>

    <!-- Footer text -->
    <text x="${width / 2}" y="${height - 26}" font-family="Arial, sans-serif" font-size="16" fill="white" text-anchor="middle">
      ${escapeXml(brand.ctaText)} ${FRONTEND_URL}
    </text>
  </svg>`;

  let base;
  if (imageBuffer && imageBuffer.length > 0) {
    const resized = await sharp(imageBuffer)
      .resize(width, height - 140, { fit: 'cover', position: 'attention' })
      .toBuffer();
    const blank = await sharp({
      create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } }
    }).toBuffer();
    base = await sharp(blank)
      .composite([{ input: resized, top: 80, left: 0 }])
      .toBuffer();
  } else {
    const gradientSvg = `<svg width="${width}" height="${height - 140}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${brand.primaryColor}" stop-opacity="0.05"/>
          <stop offset="100%" stop-color="${brand.secondaryColor}" stop-opacity="0.1"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height - 140}" fill="url(#bg)"/>
    </svg>`;
    const svgBuf = Buffer.from(gradientSvg);
    const blank = await sharp({
      create: { width, height, channels: 3, background: { r: 248, g: 250, b: 252 } }
    }).toBuffer();
    base = await sharp(blank)
      .composite([{ input: svgBuf, top: 80, left: 0 }])
      .toBuffer();
  }

  const svgBuf = Buffer.from(svgOverlay);
  const result = await sharp(base)
    .composite([{ input: svgBuf, top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();

  return result;
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

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function truncateText(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '…';
}
