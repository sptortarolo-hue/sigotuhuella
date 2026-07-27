import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT = 'sans-serif';
const W = 1080;
const H = 1350;
const COLS = 10;
const BRAND_BAR_H = 70;
const BRAND_BAR_Y = H - BRAND_BAR_H;
const TOP_PAD = 50;
const MAX_CELL_SIZE = 80;
let _canvasModule = null;

async function getCanvas() {
  if (!_canvasModule) {
    _canvasModule = await import('canvas').catch(() => {
      throw new Error('canvas (node-canvas) no disponible en este servidor');
    });
  }
  return _canvasModule;
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

function drawBgDecorations(ctx, colorStart, colorEnd) {
  ctx.clearRect(0, 0, W, H);
  const bgGrad = ctx.createLinearGradient(0, 0, W * 0.3, H);
  bgGrad.addColorStop(0, colorStart);
  bgGrad.addColorStop(1, colorEnd);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(W * 0.85, H * 0.12, W * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W * 0.1, H * 0.88, W * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W * 0.75, H * 0.75, W * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W * 0.15, H * 0.12, W * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawWrappedText(ctx, text, cx, y, maxWidth, fontSize, maxLines, color, lineSpacing) {
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

function drawNumberGrid(ctx, startY, gridHeight, tickets, totalNumbers) {
  const gap = 3;
  const cellW = COLS * (MAX_CELL_SIZE + gap) - gap;
  const totalCells = Math.min(totalNumbers, 200);
  const rows = Math.ceil(totalCells / COLS);

  let cellSize = Math.floor((gridHeight + gap) / rows) - gap;
  cellSize = Math.min(cellSize, MAX_CELL_SIZE);
  cellSize = Math.max(cellSize, 12);

  const step = cellSize + gap;
  const actualGridW = COLS * step - gap;
  const actualGridH = rows * step - gap;
  const startX = (W - actualGridW) / 2;
  const startYCentered = startY + (gridHeight - actualGridH) / 2;
  const gridBottom = startYCentered + actualGridH;

  const ticketMap = {};
  if (tickets) {
    for (const t of tickets) {
      ticketMap[t.number] = t;
    }
  }

  for (let i = 1; i <= totalCells; i++) {
    const col = (i - 1) % COLS;
    const row = Math.floor((i - 1) / COLS);
    const t = ticketMap[i];
    let color;
    if (!t) {
      color = '#4ADE80';
    } else if (t.status === 'paid') {
      color = '#F87171';
    } else {
      color = '#FBBF24';
    }
    const x = startX + col * step;
    const cellY = startYCentered + row * step;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    roundRect(ctx, x, cellY, cellSize, cellSize, Math.max(3, cellSize * 0.12));
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.floor(cellSize * 0.45)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i), x + cellSize / 2, cellY + cellSize / 2);
  }

  if (totalNumbers > totalCells) {
    const remaining = totalNumbers - totalCells;
    ctx.font = `500 ${22}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`y ${remaining} números más`, W / 2, gridBottom + 10);
  }

  return gridBottom;
}

function drawBrandBar(ctx, logoImg) {
  const brandY = BRAND_BAR_Y;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W * 0.1, brandY);
  ctx.lineTo(W * 0.9, brandY);
  ctx.stroke();

  const logoR = 30;
  const logoY = brandY + 30;
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(W * 0.32, logoY, logoR, 0, Math.PI * 2);
    ctx.clip();
    const la = logoImg.naturalWidth / logoImg.naturalHeight;
    let lw, lh;
    if (la > 1) { lh = logoR * 2.2; lw = lh * la; }
    else { lw = logoR * 2.2; lh = lw / la; }
    ctx.drawImage(logoImg, W * 0.32 - lw / 2, logoY - lh / 2, lw, lh);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(W * 0.32, logoY, logoR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `${logoR * 1.5}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐾', W * 0.32, logoY);
  }

  ctx.font = `800 ${38}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SIGO TU HUELLA', W * 0.32 + logoR + 15, logoY);

  ctx.font = `600 ${26}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('sigotuhuella.com.ar', W * 0.88, logoY);
}

export async function renderRaffleFlyer({
  title, description, prizes, stats, totalNumbers, pricePerNumber, tickets, drawDate, logoImage,
}) {
  const canvasModule = await getCanvas();
  const { createCanvas } = canvasModule;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const colorStart = '#4F46E5';
  const colorEnd = '#7C3AED';

  drawBgDecorations(ctx, colorStart, colorEnd);

  const remaining = BRAND_BAR_Y - y;
  const gridH = Math.floor(remaining * 0.70);

  let y = TOP_PAD;

  const titleFontSize = title.length > 30 ? 52 : title.length > 20 ? 58 : 66;
  ctx.font = `800 ${titleFontSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const titleMaxW = W * 0.88;
  let fs = titleFontSize;
  if (ctx.measureText(title).width > titleMaxW) {
    while (fs > 30 && ctx.measureText(title).width > titleMaxW) {
      fs -= 2;
      ctx.font = `800 ${fs}px ${FONT}`;
    }
  }
  const titleLines = [];
  const words = title.split(' ');
  let line = '';
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > titleMaxW && line) {
      titleLines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) titleLines.push(line);
  const titleDisplay = titleLines.slice(0, 2);
  for (let i = 0; i < titleDisplay.length; i++) {
    ctx.fillText(titleDisplay[i], W / 2, y);
    y += titleFontSize * 1.2;
  }
  y += 10;

  if (description) {
    const descPadX = 24;
    const descPadY = 16;
    ctx.font = `600 28px ${FONT}`;
    const descMaxW = W * 0.85 - descPadX * 2;
    const words = description.split(' ');
    const descLines = [[]];
    let lineW = 0;
    for (const word of words) {
      const wordW = ctx.measureText(word + ' ').width;
      if (lineW + wordW > descMaxW && descLines[descLines.length - 1].length > 0) {
        if (descLines.length >= 4) break;
        descLines.push([]);
        lineW = 0;
      }
      descLines[descLines.length - 1].push(word);
      lineW += wordW;
    }
    let descH = 0;
    for (const l of descLines) {
      if (l.length > 0) descH += 28 * 1.4;
    }
    descH += descPadY * 2;
    const descBoxW = W * 0.85;
    const descBoxX = (W - descBoxW) / 2;
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, descBoxX, y, descBoxW, descH, 14);
    ctx.fill();
    ctx.restore();
    let descY = y + descPadY;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textBaseline = 'top';
    for (const l of descLines) {
      if (l.length === 0) continue;
      ctx.textAlign = 'center';
      ctx.fillText(l.join(' '), W / 2, descY);
      descY += 28 * 1.4;
    }
    y += descH + 10;
  }

  const gridTop = y;
  const gridBottom = drawNumberGrid(ctx, gridTop, gridH, tickets, totalNumbers);
  y = gridBottom + 15;

  const priceText = `$ ${parseFloat(pricePerNumber).toLocaleString('es-AR')} x número`;
  ctx.font = `800 ${36}px ${FONT}`;
  ctx.fillStyle = '#FDE68A';
  const priceW = ctx.measureText(priceText).width;
  const pricePadX = 24;
  const pricePadY = 14;
  const priceBoxW = priceW + pricePadX * 2;
  const priceBoxH = 36 + pricePadY * 2;
  const priceBoxX = (W - priceBoxW) / 2;
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#000000';
  roundRect(ctx, priceBoxX, y, priceBoxW, priceBoxH, 12);
  ctx.fill();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(priceText, W / 2, y + priceBoxH / 2);
  y += priceBoxH + 15;

  if (prizes && prizes.length > 0) {
    ctx.font = `700 ${30}px ${FONT}`;
    ctx.fillStyle = '#FDE68A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('🏆 Premios', W / 2, y);
    y += 42;
    for (let i = 0; i < Math.min(prizes.length, 4); i++) {
      const p = prizes[i];
      ctx.font = `500 ${26}px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`${i + 1}° ${p.title}`, W / 2, y);
      y += 32;
      if (p.description) {
        y = drawWrappedText(ctx, p.description, W / 2, y, W * 0.75, 22, 2, 'rgba(255,255,255,0.55)', 1.3);
        y += 6;
      }
    }
    if (prizes.length > 4) {
      ctx.font = `400 ${22}px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`+${prizes.length - 4} premios más`, W / 2, y);
      y += 30;
    }
  }

  y += 5;

  const ctaLines = [
    'Ayudanos, adquirí la tuya en',
    'www.sigotuhuella.com.ar',
    'o por WhatsApp al 221 202 5190',
  ];
  const ctaFontSize = 30;
  ctx.font = `800 ${ctaFontSize}px ${FONT}`;
  ctx.fillStyle = '#FDE68A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const ctaMaxW = W * 0.88;
  for (const ctaLine of ctaLines) {
    let ctaFs = ctaFontSize;
    ctx.font = `800 ${ctaFs}px ${FONT}`;
    if (ctx.measureText(ctaLine).width > ctaMaxW) {
      while (ctaFs > 22 && ctx.measureText(ctaLine).width > ctaMaxW) {
        ctaFs -= 2;
        ctx.font = `800 ${ctaFs}px ${FONT}`;
      }
    }
    ctx.fillText(ctaLine, W / 2, y);
    y += ctaFs * 1.25;
  }

  drawBrandBar(ctx, logoImage || null);

  return canvas.toBuffer('image/png');
}
