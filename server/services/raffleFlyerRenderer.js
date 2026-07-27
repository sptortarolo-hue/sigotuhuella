import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT = 'sans-serif';
const W = 1080;
const H = 1350;
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

function drawBadge(ctx, y, label, bgColor) {
  const badgeH = 70;
  const badgeW = ctx.measureText(label).width + 70;
  const badgeX = (W - badgeW) / 2;
  ctx.save();
  ctx.fillStyle = bgColor;
  roundRect(ctx, badgeX, y, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.restore();
  ctx.font = `800 ${badgeH * 0.55}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, y + badgeH / 2);
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

function drawNumberGrid(ctx, y, tickets, totalNumbers) {
  const cellSize = 20;
  const gap = 3;
  const cols = 10;
  const cellW = cellSize + gap;
  const totalCells = Math.min(totalNumbers, 200);
  const rows = Math.ceil(totalCells / cols);
  const gridW = cols * cellW - gap;
  const gridH = rows * cellW - gap;
  const startX = (W - gridW) / 2;
  const startY = y;

  const ticketMap = {};
  if (tickets) {
    for (const t of tickets) {
      ticketMap[t.number] = t;
    }
  }

  for (let i = 1; i <= totalCells; i++) {
    const col = (i - 1) % cols;
    const row = Math.floor((i - 1) / cols);
    const t = ticketMap[i];
    let color;
    if (!t) {
      color = '#4ADE80';
    } else if (t.status === 'paid') {
      color = '#F87171';
    } else {
      color = '#FBBF24';
    }
    const x = startX + col * cellW;
    const cellY = startY + row * cellW;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    roundRect(ctx, x, cellY, cellSize, cellSize, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (totalNumbers > totalCells) {
    const remaining = totalNumbers - totalCells;
    ctx.font = `500 ${26}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`y ${remaining} números más`, W / 2, startY + gridH + 12);
  }

  return startY + gridH + (totalNumbers > totalCells ? 50 : 30);
}

function drawBrandBar(ctx, logoImg) {
  const brandY = H - 70;
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

  let y = 40;
  drawBadge(ctx, y, '🎟  RIFA', '#F59E0B');
  y += 100;

  const titleFontSize = title.length > 30 ? 52 : title.length > 20 ? 58 : 66;
  ctx.font = `800 ${titleFontSize}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const titleMaxW = W * 0.88;
  let displayTitle = title;
  if (ctx.measureText(title).width > titleMaxW) {
    let fs = titleFontSize;
    while (fs > 30 && ctx.measureText(displayTitle).width > titleMaxW) {
      fs -= 2;
      ctx.font = `800 ${fs}px ${FONT}`;
    }
    ctx.font = `800 ${fs}px ${FONT}`;
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
  y += 20;

  if (prizes && prizes.length > 0) {
    ctx.font = `700 ${34}px ${FONT}`;
    ctx.fillStyle = '#FDE68A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('🏆 Premios', W / 2, y);
    y += 48;
    ctx.font = `500 ${30}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < Math.min(prizes.length, 4); i++) {
      const p = prizes[i];
      const text = `${i + 1}° ${p.title}`;
      ctx.fillText(text, W / 2, y);
      y += 36;
      if (p.description) {
        ctx.font = `400 ${24}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        const descY = drawWrappedText(ctx, p.description, W / 2, y, W * 0.7, 24, 1, 'rgba(255,255,255,0.6)', 1.3);
        y = descY + 4;
        ctx.font = `500 ${30}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
      }
    }
    if (prizes.length > 4) {
      ctx.font = `400 ${24}px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`+${prizes.length - 4} premios más`, W / 2, y);
      y += 36;
    }
    y += 20;
  }

  const priceText = `$ ${parseFloat(pricePerNumber).toLocaleString('es-AR')} x número`;
  ctx.font = `800 ${44}px ${FONT}`;
  ctx.fillStyle = '#FDE68A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const priceW = ctx.measureText(priceText).width;
  const pricePx = 24;
  const pricePy = 16;
  const priceBoxW = priceW + pricePx * 2;
  const priceBoxX = (W - priceBoxW) / 2;
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#000000';
  roundRect(ctx, priceBoxX, y, priceBoxW, 44 + pricePy * 2, 16);
  ctx.fill();
  ctx.restore();
  ctx.fillText(priceText, W / 2, y + pricePy);
  y += 44 + pricePy * 2 + 16;

  if (drawDate) {
    const d = new Date(drawDate);
    const dateStr = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.font = `500 ${32}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`📅 Sorteo: ${dateStr}`, W / 2, y);
    y += 48;
  }

  const sold = stats?.sold || 0;
  const available = totalNumbers - sold;
  const total = totalNumbers;
  const pctSold = total > 0 ? sold / total : 0;

  const barW = 600;
  const barH = 28;
  const barX = (W - barW) / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, barX, y, barW, barH, barH / 2);
  ctx.fill();
  if (pctSold > 0) {
    ctx.fillStyle = '#F87171';
    const soldW = barW * Math.min(pctSold, 1);
    roundRect(ctx, barX, y, soldW, barH, barH / 2);
    ctx.fill();
    if (pctSold < 0.95) {
      ctx.fillStyle = '#4ADE80';
      roundRect(ctx, barX + soldW, y, barW - soldW, barH, barH / 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#4ADE80';
    roundRect(ctx, barX, y, barW, barH, barH / 2);
    ctx.fill();
  }
  ctx.restore();
  y += barH + 8;

  ctx.font = `700 ${34}px ${FONT}`;
  ctx.fillStyle = '#4ADE80';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`🔥 ${available} disponibles`, W / 2, y);
  y += 44;
  ctx.font = `500 ${28}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(`${sold} vendidos de ${total}`, W / 2, y);
  y += 55;

  const gridBottom = drawNumberGrid(ctx, y, tickets, totalNumbers);
  y = gridBottom + 20;

  const linkText = '🔗 sigotuhuella.com.ar';
  ctx.font = `600 ${30}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(linkText, W / 2, y);
  y += 42;

  ctx.font = `500 ${24}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('Comprá tu número antes de que se agoten', W / 2, y);

  drawBrandBar(ctx, logoImage || null);

  return canvas.toBuffer('image/png');
}
