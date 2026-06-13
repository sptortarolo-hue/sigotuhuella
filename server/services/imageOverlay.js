import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const W = 1080, H = 1350, BAR_H = 90;
const LOGO_SIZE = 80, LOGO_PAD = 16;

const STATUS_STYLES = {
  lost: { label: 'SE PERDIÓ', color: '#EF4444' },
  retained: { label: 'RETENIDO', color: '#2563EB' },
  sighted: { label: 'AVISTADO', color: '#2563EB' },
  accidented: { label: 'ACCIDENTADO', color: '#EA580C' },
  needs_attention: { label: 'NECESITA ATENCIÓN', color: '#D97706' },
  for_adoption: { label: 'EN ADOPCIÓN', color: '#8B5CF6' },
  adopted: { label: 'ADOPTADO', color: '#10B981' },
  reunited: { label: 'REENCUENTRO', color: '#10B981' },
};

let _logoBase64 = null;

async function getLogo() {
  if (_logoBase64) return _logoBase64;
  const logoPath = join(__dirname, '..', '..', 'public', 'sigotuhuella.jpg');
  const buf = readFileSync(logoPath);
  const logoPng = await sharp(buf).resize(LOGO_SIZE, LOGO_SIZE, { fit: 'cover' }).png().toBuffer();
  _logoBase64 = logoPng.toString('base64');
  return _logoBase64;
}

export async function overlayStatus(imageData, mimeType, status) {
  const style = STATUS_STYLES[status] || { label: status || 'MASCOTA', color: '#6B7280' };

  const svgBar = `<svg width="${W}" height="${BAR_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${BAR_H}" fill="${style.color}" fill-opacity="0.88"/>
    <text x="${W/2}" y="${BAR_H/2 + 14}" text-anchor="middle"
          font-family="Arial,sans-serif" font-size="36" font-weight="bold" fill="white">${style.label}</text>
  </svg>`;

  const logoB64 = await getLogo();
  const svgLogo = `<svg width="${LOGO_SIZE}" height="${LOGO_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="c"><circle cx="${LOGO_SIZE/2}" cy="${LOGO_SIZE/2}" r="${LOGO_SIZE/2}"/></clipPath></defs>
    <image href="data:image/png;base64,${logoB64}" x="0" y="0" width="${LOGO_SIZE}" height="${LOGO_SIZE}" clip-path="url(#c)"/>
  </svg>`;

  const buf = Buffer.from(imageData, 'base64');

  const result = await sharp(buf)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .composite([
      { input: Buffer.from(svgBar), top: H - BAR_H, left: 0 },
      { input: Buffer.from(svgLogo), top: LOGO_PAD, left: W - LOGO_SIZE - LOGO_PAD },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();

  return result;
}
