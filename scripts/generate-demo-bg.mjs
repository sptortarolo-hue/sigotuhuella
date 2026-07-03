import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';

const STATUS_COLORS = {
  'perdido':    { fill: '#d4a574', accent: '#e8c9a0' },
  'retenido':   { fill: '#8fb0c9', accent: '#c4d4e0' },
  'avistado':   { fill: '#8fbcb0', accent: '#c4ddd4' },
  'adopcion':   { fill: '#b8a0d4', accent: '#d4c4e8' },
  'adoptado':   { fill: '#8fbc90', accent: '#c4ddc4' },
  'reencuentro':{ fill: '#a0c478', accent: '#c8e0a0' },
  'accidentado':{ fill: '#d4a060', accent: '#e8c490' },
  'atencion':   { fill: '#d4c040', accent: '#e8d870' },
};

const OUT = 'public/ai-bg';
mkdirSync(OUT, { recursive: true });

for (const [status, colors] of Object.entries(STATUS_COLORS)) {
  for (const species of ['perro', 'gato']) {
    const id = `${species}-${status}`;
    const w = 1080, h = 1350;
    const cx = w / 2, cy = h / 2;

    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bg" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="${colors.accent}"/>
          <stop offset="100%" stop-color="${colors.fill}"/>
        </radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#bg)"/>
      ${species === 'perro' ? `
        <ellipse cx="200" cy="300" rx="80" ry="60" fill="none" stroke="${colors.accent}" stroke-width="3" opacity="0.3"/>
        <ellipse cx="140" cy="260" rx="30" ry="20" fill="${colors.accent}" opacity="0.2"/>
        <ellipse cx="260" cy="260" rx="30" ry="20" fill="${colors.accent}" opacity="0.2"/>
        <ellipse cx="880" cy="1000" rx="80" ry="60" fill="none" stroke="${colors.accent}" stroke-width="3" opacity="0.3"/>
        <ellipse cx="820" cy="960" rx="30" ry="20" fill="${colors.accent}" opacity="0.2"/>
        <ellipse cx="940" cy="960" rx="30" ry="20" fill="${colors.accent}" opacity="0.2"/>
      ` : `
        <circle cx="200" cy="250" r="50" fill="none" stroke="${colors.accent}" stroke-width="3" opacity="0.3"/>
        <ellipse cx="170" cy="210" rx="20" ry="12" fill="${colors.accent}" opacity="0.2"/>
        <ellipse cx="230" cy="210" rx="20" ry="12" fill="${colors.accent}" opacity="0.2"/>
        <circle cx="850" cy="1050" r="50" fill="none" stroke="${colors.accent}" stroke-width="3" opacity="0.3"/>
        <ellipse cx="820" cy="1010" rx="20" ry="12" fill="${colors.accent}" opacity="0.2"/>
        <ellipse cx="880" cy="1010" rx="20" ry="12" fill="${colors.accent}" opacity="0.2"/>
      `}
    </svg>`;

    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(`${OUT}/${id}.png`, buf);
    console.log(`✅ ${id}.png`);
  }
}

console.log(`---\nGenerados en ${OUT}/`);
