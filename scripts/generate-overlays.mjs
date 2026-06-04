import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const stickerDir = path.join(root, 'public', 'overlays', 'stickers');
const frameDir = path.join(root, 'public', 'overlays', 'frames');

const BRAND = {
  olive: '#5A5A40',
  terracotta: '#D48C70',
  cream: '#F5F5F0',
  accent: '#E6E6DF',
  white: '#FFFFFF',
  dark: '#3A3A2E',
};

async function svgToPng(svgContent, outputPath, size = 512) {
  const svgBuffer = Buffer.from(svgContent);
  await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background: '#00000000' })
    .png()
    .toFile(outputPath);
  console.log(`  Created: ${path.relative(root, outputPath)}`);
}

async function svgToPngExact(svgContent, outputPath, width, height) {
  const svgBuffer = Buffer.from(svgContent);
  await sharp(svgBuffer)
    .resize(width, height, { fit: 'contain', background: '#00000000' })
    .png()
    .toFile(outputPath);
  console.log(`  Created: ${path.relative(root, outputPath)}`);
}

const pawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <ellipse cx="256" cy="340" rx="100" ry="120" fill="${BRAND.olive}"/>
  <ellipse cx="130" cy="200" rx="55" ry="70" fill="${BRAND.olive}" transform="rotate(-15 130 200)"/>
  <ellipse cx="200" cy="140" rx="45" ry="60" fill="${BRAND.olive}" transform="rotate(-5 200 140)"/>
  <ellipse cx="310" cy="140" rx="45" ry="60" fill="${BRAND.olive}" transform="rotate(5 310 140)"/>
  <ellipse cx="380" cy="200" rx="55" ry="70" fill="${BRAND.olive}" transform="rotate(15 380 200)"/>
</svg>`;

const pawTerracottaSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <ellipse cx="256" cy="340" rx="100" ry="120" fill="${BRAND.terracotta}"/>
  <ellipse cx="130" cy="200" rx="55" ry="70" fill="${BRAND.terracotta}" transform="rotate(-15 130 200)"/>
  <ellipse cx="200" cy="140" rx="45" ry="60" fill="${BRAND.terracotta}" transform="rotate(-5 200 140)"/>
  <ellipse cx="310" cy="140" rx="45" ry="60" fill="${BRAND.terracotta}" transform="rotate(5 310 140)"/>
  <ellipse cx="380" cy="200" rx="55" ry="70" fill="${BRAND.terracotta}" transform="rotate(15 380 200)"/>
</svg>`;

const heartSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M256 448l-30-30C110 308 48 248 48 168 48 108 96 60 156 60c34 0 66 16 86 40h28c20-24 52-40 86-40 60 0 108 48 108 108 0 80-62 140-178 250z" fill="${BRAND.terracotta}"/>
</svg>`;

const heartPawSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M256 448l-30-30C110 308 48 248 48 168 48 108 96 60 156 60c34 0 66 16 86 40h28c20-24 52-40 86-40 60 0 108 48 108 108 0 80-62 140-178 250z" fill="${BRAND.terracotta}" opacity="0.9"/>
  <ellipse cx="256" cy="300" rx="40" ry="48" fill="${BRAND.cream}" opacity="0.9"/>
  <ellipse cx="210" cy="250" rx="22" ry="28" fill="${BRAND.cream}" opacity="0.9" transform="rotate(-10 210 250)"/>
  <ellipse cx="235" cy="230" rx="18" ry="24" fill="${BRAND.cream}" opacity="0.9"/>
  <ellipse cx="277" cy="230" rx="18" ry="24" fill="${BRAND.cream}" opacity="0.9"/>
  <ellipse cx="302" cy="250" rx="22" ry="28" fill="${BRAND.cream}" opacity="0.9" transform="rotate(10 302 250)"/>
</svg>`;

const boneSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g fill="${BRAND.olive}">
    <ellipse cx="110" cy="130" rx="60" ry="45"/>
    <ellipse cx="110" cy="180" rx="60" ry="45"/>
    <ellipse cx="402" cy="130" rx="60" ry="45"/>
    <ellipse cx="402" cy="180" rx="60" ry="45"/>
    <rect x="110" y="130" width="292" height="50" rx="25"/>
    <ellipse cx="110" cy="382" rx="60" ry="45"/>
    <ellipse cx="110" cy="332" rx="60" ry="45"/>
    <ellipse cx="402" cy="382" rx="60" ry="45"/>
    <ellipse cx="402" cy="332" rx="60" ry="45"/>
    <rect x="110" y="332" width="292" height="50" rx="25"/>
    <rect x="140" y="130" width="55" height="252" rx="27"/>
    <rect x="317" y="130" width="55" height="252" rx="27"/>
  </g>
</svg>`;

const starSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M256 40l60 140 152 14-114 104 30 150-128-72-128 72 30-150L44 194l152-14z" fill="${BRAND.terracotta}"/>
</svg>`;

function makeCornerSvg(corner, size = 256) {
  const [startX, startY, flipX, flipY] = {
    tl: [0, 0, 1, 1],
    tr: [size, 0, -1, 1],
    bl: [0, size, 1, -1],
    br: [size, size, -1, -1],
  }[corner];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <g transform="translate(${startX},${startY}) scale(${flipX},${flipY})">
      <path d="M0 0 L${size * 0.7} 0 L${size * 0.7} ${size * 0.05} L${size * 0.05} ${size * 0.05} L${size * 0.05} ${size * 0.7} L0 ${size * 0.7} Z" fill="${BRAND.olive}" opacity="0.8"/>
      <circle cx="${size * 0.05}" cy="${size * 0.05}" r="${size * 0.08}" fill="${BRAND.terracotta}" opacity="0.9"/>
      <path d="M${size * 0.12} ${size * 0.05} L${size * 0.35} ${size * 0.05}" stroke="${BRAND.terracotta}" stroke-width="${size * 0.02}" stroke-linecap="round" opacity="0.6"/>
      <path d="M${size * 0.05} ${size * 0.12} L${size * 0.05} ${size * 0.35}" stroke="${BRAND.terracotta}" stroke-width="${size * 0.02}" stroke-linecap="round" opacity="0.6"/>
    </g>
  </svg>`;
}

function makeFrameSvg(w, h, borderWidth = 20, cornerSize = 80) {
  const b = borderWidth;
  const c = cornerSize;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="0" y="0" width="${w}" height="${h}" fill="none"/>
    <rect x="0" y="0" width="${w}" height="${b}" fill="${BRAND.olive}" opacity="0.85"/>
    <rect x="0" y="${h - b}" width="${w}" height="${b}" fill="${BRAND.olive}" opacity="0.85"/>
    <rect x="0" y="0" width="${b}" height="${h}" fill="${BRAND.olive}" opacity="0.85"/>
    <rect x="${w - b}" y="0" width="${b}" height="${h}" fill="${BRAND.olive}" opacity="0.85"/>
    <circle cx="0" cy="0" r="${c * 0.7}" fill="${BRAND.terracotta}" opacity="0.8"/>
    <circle cx="${w}" cy="0" r="${c * 0.7}" fill="${BRAND.terracotta}" opacity="0.8"/>
    <circle cx="0" cy="${h}" r="${c * 0.7}" fill="${BRAND.terracotta}" opacity="0.8"/>
    <circle cx="${w}" cy="${h}" r="${c * 0.7}" fill="${BRAND.terracotta}" opacity="0.8"/>
    <line x1="${c}" y1="0" x2="${w - c}" y2="0" stroke="${BRAND.terracotta}" stroke-width="3" opacity="0.5"/>
    <line x1="${c}" y1="${h}" x2="${w - c}" y2="${h}" stroke="${BRAND.terracotta}" stroke-width="3" opacity="0.5"/>
    <line x1="0" y1="${c}" x2="0" y2="${h - c}" stroke="${BRAND.terracotta}" stroke-width="3" opacity="0.5"/>
    <line x1="${w}" y1="${c}" x2="${w}" y2="${h - c}" stroke="${BRAND.terracotta}" stroke-width="3" opacity="0.5"/>
  </svg>`;
}

function makePolaroidFrameSvg(w, h) {
  const bw = Math.round(w * 0.04);
  const topSide = Math.round(w * 0.03);
  const bottom = Math.round(h * 0.15);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="0" y="0" width="${w}" height="${h}" fill="${BRAND.cream}" opacity="0.95"/>
    <rect x="${bw}" y="${topSide}" width="${w - bw * 2}" height="${h - topSide - bottom}" fill="transparent"/>
    <rect x="${bw + 2}" y="${topSide + 2}" width="${w - bw * 2 - 4}" height="${h - topSide - bottom - 4}" fill="black" opacity="0.05"/>
    <line x1="${bw}" y1="${h - bottom}" x2="${w - bw}" y2="${h - bottom}" stroke="${BRAND.terracotta}" stroke-width="2" opacity="0.6"/>
    <text x="${w / 2}" y="${h - bottom / 2 + 5}" font-family="sans-serif" font-size="${Math.round(bottom * 0.35)}" fill="${BRAND.olive}" text-anchor="middle" opacity="0.7">Sigo Tu Huella</text>
  </svg>`;
}

function makeFilmstripFrameSvg(w, h) {
  const stripW = Math.round(w * 0.06);
  const holeSize = Math.round(stripW * 0.4);
  const holeGap = Math.round(holeSize * 2.5);
  const holeStart = Math.round(holeGap * 0.5);
  const numHoles = Math.floor((h - holeStart * 2) / holeGap);
  let holesLeft = '';
  let holesRight = '';
  for (let i = 0; i < numHoles; i++) {
    const y = holeStart + i * holeGap;
    holesLeft += `<rect x="${(stripW - holeSize) / 2}" y="${y}" width="${holeSize}" height="${holeSize}" rx="${holeSize * 0.2}" fill="${BRAND.accent}" opacity="0.8"/>`;
    holesRight += `<rect x="${w - stripW + (stripW - holeSize) / 2}" y="${y}" width="${holeSize}" height="${holeSize}" rx="${holeSize * 0.2}" fill="${BRAND.accent}" opacity="0.8"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="0" y="0" width="${stripW}" height="${h}" fill="${BRAND.olive}" opacity="0.9"/>
    <rect x="${w - stripW}" y="0" width="${stripW}" height="${h}" fill="${BRAND.olive}" opacity="0.9"/>
    ${holesLeft}
    ${holesRight}
    <line x1="${stripW}" y1="0" x2="${stripW}" y2="${h}" stroke="${BRAND.terracotta}" stroke-width="2" opacity="0.5"/>
    <line x1="${w - stripW}" y1="0" x2="${w - stripW}" y2="${h}" stroke="${BRAND.terracotta}" stroke-width="2" opacity="0.5"/>
  </svg>`;
}

async function generateStickers() {
  console.log('\n=== Generating Stickers ===');
  await svgToPng(pawSvg, path.join(stickerDir, 'paw-olive.png'), 512);
  await svgToPng(pawTerracottaSvg, path.join(stickerDir, 'paw-terracotta.png'), 512);
  await svgToPng(heartSvg, path.join(stickerDir, 'heart.png'), 512);
  await svgToPng(heartPawSvg, path.join(stickerDir, 'heart-paw.png'), 512);
  await svgToPng(boneSvg, path.join(stickerDir, 'bone.png'), 512);
  await svgToPng(starSvg, path.join(stickerDir, 'star.png'), 512);
}

async function generateCorners() {
  console.log('\n=== Generating Corner Ornaments ===');
  for (const corner of ['tl', 'tr', 'bl', 'br']) {
    const svg = makeCornerSvg(corner, 200);
    await svgToPngExact(svg, path.join(stickerDir, `corner-${corner}.png`), 200, 200);
  }
}

async function generateFrames() {
  console.log('\n=== Generating Frame Overlays ===');
  const formats = [
    { name: 'vertical', w: 1080, h: 1920 },
    { name: 'square', w: 1080, h: 1080 },
    { name: 'landscape', w: 1920, h: 1080 },
  ];

  for (const fmt of formats) {
    const classic = makeFrameSvg(fmt.w, fmt.h);
    await svgToPngExact(classic, path.join(frameDir, `classic-${fmt.name}.png`), fmt.w, fmt.h);

    const polaroid = makePolaroidFrameSvg(fmt.w, fmt.h);
    await svgToPngExact(polaroid, path.join(frameDir, `polaroid-${fmt.name}.png`), fmt.w, fmt.h);

    const filmstrip = makeFilmstripFrameSvg(fmt.w, fmt.h);
    await svgToPngExact(filmstrip, path.join(frameDir, `filmstrip-${fmt.name}.png`), fmt.w, fmt.h);
  }
}

async function main() {
  console.log('Generating overlay assets for Sigo Tu Huella video generator...');
  console.log(`Root: ${root}`);
  console.log(`Stickers: ${stickerDir}`);
  console.log(`Frames: ${frameDir}`);

  await generateStickers();
  await generateCorners();
  await generateFrames();

  console.log('\n=== All overlay assets generated! ===');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
