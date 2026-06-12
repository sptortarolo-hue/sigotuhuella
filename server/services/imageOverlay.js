import sharp from 'sharp';

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

export async function overlayStatus(imageData, mimeType, status) {
  const style = STATUS_STYLES[status] || { label: status, color: '#6B7280' };
  const overlaySvg = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${style.color}" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="${style.color}" stop-opacity="0.7"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="1080" height="90" fill="url(#bar)" rx="0"/>
    <text x="540" y="56" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="38" fill="white" letter-spacing="4">
      ${style.label}
    </text>
  </svg>`;

  const buf = Buffer.from(imageData, 'base64');
  const img = sharp(buf);
  const meta = await img.metadata();

  const w = meta.width || 1080;
  const h = meta.height || 1350;

  const barHeight = Math.round(h * 0.07);
  const fontSize = Math.round(barHeight * 0.42);

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${style.color}" stop-opacity="0.88"/>
        <stop offset="100%" stop-color="${style.color}" stop-opacity="0.65"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${w}" height="${barHeight}" fill="url(#bar)"/>
    <text x="${w / 2}" y="${Math.round(barHeight * 0.62)}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="${fontSize}" fill="white" letter-spacing="3">
      ${style.label}
    </text>
  </svg>`;

  const svgBuf = Buffer.from(svg);
  const result = await img
    .resize(1080, 1350, { fit: 'cover', position: 'centre' })
    .composite([{ input: svgBuf, top: 0, left: 0 }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  return result;
}
