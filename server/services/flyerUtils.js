import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const FONT = 'sans-serif';
export const EMOJI_FONT = 'Noto Color Emoji';
export const W = 1080;
export const H = 1350;
export const COLS = 10;
export const MAX_CELL_SIZE = 80;
export const BRAND_BAR_H = 70;
export const BRAND_BAR_Y = H - BRAND_BAR_H;
export const TOP_PAD = 50;

export const BRAND_START = '#4F46E5';
export const BRAND_END = '#7C3AED';

function defaultPrizeTitle(n) {
  if (n === 1) return '1er Premio';
  if (n === 2) return '2do Premio';
  if (n === 3) return '3er Premio';
  return `${n}to Premio`;
}

let _canvasModule = null;

export async function getCanvas() {
  if (!_canvasModule) {
    _canvasModule = await import('canvas').catch(() => {
      throw new Error('canvas (node-canvas) no disponible en este servidor');
    });
    try {
      const fontPath = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf';
      if (existsSync(fontPath)) {
        _canvasModule.registerFont(fontPath, { family: 'Noto Color Emoji' });
      }
    } catch (e) { /* ignore */ }
  }
  return _canvasModule;
}

export function roundRect(ctx, x, y, w, h, r) {
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

export function drawBgDecorations(ctx, w = W, h = H) {
  ctx.clearRect(0, 0, w, h);
  const bgGrad = ctx.createLinearGradient(0, 0, w * 0.3, h);
  bgGrad.addColorStop(0, BRAND_START);
  bgGrad.addColorStop(1, BRAND_END);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(w * 0.85, h * 0.12, w * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.1, h * 0.88, w * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.75, h * 0.75, w * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.15, h * 0.12, w * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function drawWrappedText(ctx, text, cx, y, maxWidth, fontSize, maxLines, color, lineSpacing) {
  ctx.font = `600 ${fontSize}px ${FONT}`;
  ctx.fillStyle = color || '#ffffff';
  ctx.textBaseline = 'top';
  const words = text.split(' ');
  const lines = [[]];
  let lineW = 0;
  for (const word of words) {
    const wordW = ctx.measureText(word + ' ').width;
    if (lineW + wordW > maxWidth && lines[lines.length - 1].length > 0) {
      if (lines.length >= maxLines) break;
      lines.push([]);
      lineW = 0;
    }
    lines[lines.length - 1].push(word);
    lineW += wordW;
  }
  let curY = y;
  for (let i = 0; i < lines.length && i < maxLines; i++) {
    const lineText = lines[i].join(' ');
    if (!lineText) continue;
    ctx.textAlign = 'center';
    ctx.fillText(lineText, cx, curY);
    curY += fontSize * lineSpacing;
  }
  return curY;
}

export function drawBrandBar(ctx, logoImg, w = W, brandY = BRAND_BAR_Y) {
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.1, brandY);
  ctx.lineTo(w * 0.9, brandY);
  ctx.stroke();

  const logoR = 30;
  const logoY = brandY + 30;
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(w * 0.32, logoY, logoR, 0, Math.PI * 2);
    ctx.clip();
    const la = logoImg.naturalWidth / logoImg.naturalHeight;
    let lw, lh;
    if (la > 1) { lh = logoR * 2.2; lw = lh * la; }
    else { lw = logoR * 2.2; lh = lw / la; }
    ctx.drawImage(logoImg, w * 0.32 - lw / 2, logoY - lh / 2, lw, lh);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(w * 0.32, logoY, logoR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `${logoR * 1.5}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐾', w * 0.32, logoY);
  }

  ctx.font = `800 ${38}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SIGO TU HUELLA', w * 0.32 + logoR + 15, logoY);

  ctx.font = `600 ${26}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('sigotuhuella.com.ar', w * 0.88, logoY);
}

export async function getLogoImage() {
  const logoPath = join(__dirname, '..', '..', 'public', 'sigotuhuella.jpg');
  if (!existsSync(logoPath)) return null;
  try {
    const canvasModule = await getCanvas();
    const buf = await import('fs').then(fs => fs.promises.readFile(logoPath));
    const loadImage = canvasModule.loadImage;
    return await loadImage(buf);
  } catch { return null; }
}

export { defaultPrizeTitle };