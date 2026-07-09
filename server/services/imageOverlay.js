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
  for_adoption_simple: { label: 'EN ADOPCIÓN', color: '#F97316' },
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

  const bg = await sharp(buf)
    .resize(W, H, { fit: 'cover' })
    .blur(60)
    .png()
    .toBuffer();

  const fg = await sharp(buf)
    .resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const result = await sharp(bg)
    .composite([
      { input: fg },
      { input: Buffer.from(svgBar), top: H - BAR_H, left: 0 },
      { input: Buffer.from(svgLogo), top: LOGO_PAD, left: W - LOGO_SIZE - LOGO_PAD },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();

  return result;
}

const STORY_W = 1080, STORY_H = 1920, STORY_BAR_H = 200, STORY_LOCATION_H = 50, STORY_CONTACT_H = 150;

const WHATSAPP_SVG = `<svg viewBox="0 0 24 24" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
  <path fill="white" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
</svg>`;

export async function overlayStory(imageData, mimeType, status, contactInfo, location) {
  const style = STATUS_STYLES[status] || { label: status || 'MASCOTA', color: '#6B7280' };

  const labelChars = style.label;

  const svgBar = `<svg width="${STORY_W}" height="${STORY_BAR_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${STORY_W}" height="${STORY_BAR_H}" fill="${style.color}" fill-opacity="0.95"/>
    <text x="${STORY_W/2}" y="${STORY_BAR_H/2 + 24}" text-anchor="middle"
          font-family="Impact, 'Arial Black', sans-serif" font-size="72" font-weight="bold"
          letter-spacing="3" fill="white">${labelChars}</text>
  </svg>`;

  const logoB64 = await getLogo();
  const svgLogo = `<svg width="${LOGO_SIZE}" height="${LOGO_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs><clipPath id="c"><circle cx="${LOGO_SIZE/2}" cy="${LOGO_SIZE/2}" r="${LOGO_SIZE/2}"/></clipPath></defs>
    <image href="data:image/png;base64,${logoB64}" x="0" y="0" width="${LOGO_SIZE}" height="${LOGO_SIZE}" clip-path="url(#c)"/>
  </svg>`;

  let locationBar = null;
  if (location && location.trim()) {
    const escapedLoc = location.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    locationBar = Buffer.from(`<svg width="${STORY_W}" height="${STORY_LOCATION_H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${STORY_W}" height="${STORY_LOCATION_H}" fill="rgba(0,0,0,0.70)"/>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#EF4444" transform="translate(16,13)"/>
      <text x="52" y="33" font-family="Arial,sans-serif" font-size="28" font-weight="bold" fill="white">${escapedLoc}</text>
    </svg>`);
  }

  let contactBar = null;
  if (contactInfo && contactInfo.trim()) {
    const escapedPhone = contactInfo.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    contactBar = Buffer.from(`<svg width="${STORY_W}" height="${STORY_CONTACT_H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${STORY_W}" height="${STORY_CONTACT_H}" fill="#25D366"/>
      <g transform="translate(16, 51) scale(1.5)">
        <path fill="white" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </g>
      <text x="60" y="88" font-family="Arial,sans-serif" font-size="42" font-weight="bold" fill="white">${escapedPhone}</text>
    </svg>`);
  }

  const buf = Buffer.from(imageData, 'base64');

  const bg = await sharp(buf)
    .resize(STORY_W, STORY_H, { fit: 'cover' })
    .blur(60)
    .png()
    .toBuffer();

  const fg = await sharp(buf)
    .resize(STORY_W, STORY_H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const composites = [
    { input: fg },
    { input: Buffer.from(svgBar), top: 0, left: 0 },
    { input: Buffer.from(svgLogo), top: STORY_BAR_H + LOGO_PAD, left: STORY_W - LOGO_SIZE - LOGO_PAD },
  ];

  let bottomY = STORY_H;
  if (contactBar) {
    bottomY -= STORY_CONTACT_H;
    composites.push({ input: contactBar, top: bottomY, left: 0 });
  }
  if (locationBar) {
    bottomY -= STORY_LOCATION_H;
    composites.push({ input: locationBar, top: bottomY, left: 0 });
  }

  const result = await sharp(bg)
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();

  return result;
}
