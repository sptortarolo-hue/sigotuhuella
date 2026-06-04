import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const confettiDir = path.join(root, 'public', 'overlays', 'confetti');

const W = 1080;
const H = 1920;
const FPS = 25;
const DURATION = 5;
const TOTAL_FRAMES = FPS * DURATION;
const NUM_PARTICLES = 80;

const COLORS = [
  '#D48C70', '#5A5A40', '#F5F5F0', '#E6E6DF',
  '#E8A598', '#8B8B6E', '#C4785E', '#9B9B80',
  '#F0C4B7', '#6D6D52',
];

class Particle {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.reset(true);
  }

  reset(initial = false) {
    this.x = Math.random() * this.w;
    this.y = initial ? Math.random() * this.h : -20 - Math.random() * 100;
    this.size = 6 + Math.random() * 14;
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.vx = (Math.random() - 0.5) * 3;
    this.vy = 2 + Math.random() * 4;
    this.rotation = Math.random() * 360;
    this.rotSpeed = (Math.random() - 0.5) * 10;
    this.shape = Math.floor(Math.random() * 3);
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleSpeed = 0.05 + Math.random() * 0.1;
  }

  update() {
    this.y += this.vy;
    this.x += this.vx + Math.sin(this.wobble) * 1.5;
    this.rotation += this.rotSpeed;
    this.wobble += this.wobbleSpeed;
    this.vy += 0.05;
    if (this.y > this.h + 30) this.reset();
  }

  toSvg() {
    const { x, y, size, color, rotation, shape } = this;
    const transform = `translate(${x},${y}) rotate(${rotation})`;
    if (shape === 0) {
      return `<rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size * 0.6}" rx="1" fill="${color}" transform="${transform}"/>`;
    } else if (shape === 1) {
      return `<circle cx="0" cy="0" r="${size / 2}" fill="${color}" transform="${transform}"/>`;
    } else {
      const s = size / 2;
      return `<polygon points="0,${-s} ${s * 0.6},${s * 0.4} ${-s * 0.6},${s * 0.4}" fill="${color}" transform="${transform}"/>`;
    }
  }
}

async function generateFrame(particles, frameIdx) {
  for (const p of particles) p.update();

  const shapes = particles.map(p => p.toSvg()).join('\n    ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${shapes}
  </svg>`;

  const framePath = path.join(confettiDir, `frame_${String(frameIdx).padStart(4, '0')}.png`);
  await sharp(Buffer.from(svg)).png().toFile(framePath);
  return framePath;
}

async function main() {
  fs.mkdirSync(confettiDir, { recursive: true });

  console.log(`Generating ${TOTAL_FRAMES} confetti frames (${W}x${H} @ ${FPS}fps, ${DURATION}s)...`);

  const particles = Array.from({ length: NUM_PARTICLES }, () => new Particle(W, H));
  for (let i = 0; i < 30; i++) {
    for (const p of particles) p.update();
  }

  const framePaths = [];
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    if (i % 25 === 0) console.log(`  Frame ${i}/${TOTAL_FRAMES}`);
    const fp = await generateFrame(particles, i);
    framePaths.push(fp);
  }

  console.log('Encoding confetti video with ffmpeg...');

  const listPath = path.join(confettiDir, 'frames.txt');
  fs.writeFileSync(listPath, framePaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));

  const outputPath = path.join(root, 'public', 'overlays', 'confetti.mov');
  try {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" ` +
      `-c:v qtrle -pix_fmt argb ` +
      `"${outputPath}"`,
      { stdio: 'pipe', timeout: 120000 }
    );
    console.log(`Confetti video created: ${outputPath}`);
  } catch (e) {
    console.log('qtrle not available, trying VP9 with alpha...');
    try {
      execSync(
        `ffmpeg -y -f concat -safe 0 -i "${listPath}" ` +
        `-c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 ` +
        `"${outputPath.replace('.mov', '.webm')}"`,
        { stdio: 'pipe', timeout: 120000 }
      );
      console.log(`Confetti video created (VP9): ${outputPath.replace('.mov', '.webm')}`);
    } catch (e2) {
      console.log('VP9 also failed, saving as PNG sequence (ffmpeg will use it at runtime)');
    }
  }

  for (const fp of framePaths) {
    fs.unlinkSync(fp);
  }
  if (fs.existsSync(listPath)) fs.unlinkSync(listPath);

  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
