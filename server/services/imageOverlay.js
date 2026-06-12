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
  const style = STATUS_STYLES[status] || { label: status || 'MASCOTA', color: '#6B7280' };
  const barHeight = 90;
  const fontSize = 34;

  const buf = Buffer.from(imageData, 'base64');
  const hex = style.color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const bar = await sharp({ create: { width: 1080, height: barHeight, channels: 4, background: { r, g, b, alpha: 0.85 } } }).png().toBuffer();

  const result = await sharp(buf)
    .resize(1080, 1350, { fit: 'cover', position: 'centre' })
    .composite([{ input: bar, top: 0, left: 0 }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  const textSvg = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <text x="540" y="${Math.round(barHeight * 0.62)}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="${fontSize}" fill="white">${style.label}</text>
  </svg>`;

  try {
    const withText = await sharp(result)
      .composite([{ input: Buffer.from(textSvg), top: 0, left: 0 }])
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return withText;
  } catch (err) {
    console.log(`[Overlay] SVG text failed, returning bar only: ${err.message}`);
    return result;
  }
}
