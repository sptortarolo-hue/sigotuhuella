import {
  FONT,
  EMOJI_FONT,
  W,
  H,
  COLS,
  MAX_CELL_SIZE,
  BRAND_BAR_H,
  BRAND_BAR_Y,
  TOP_PAD,
  BRAND_START,
  BRAND_END,
  getCanvas,
  roundRect,
  drawBgDecorations,
  drawWrappedText,
  drawBrandBar,
  defaultPrizeTitle,
} from './flyerUtils.js';

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

export async function renderRaffleFlyer({
  title,
  description,
  prizes,
  stats,
  totalNumbers,
  pricePerNumber,
  tickets,
  drawDate,
  logoImage,
}) {
  const canvasModule = await getCanvas();
  const { createCanvas } = canvasModule;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBgDecorations(ctx);

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
    y += descH + 35;
  }

  const priceH = 64 + 15;
  let prizesH = 0;
  if (prizes && prizes.length > 0) {
    prizesH = 42;
    for (let i = 0; i < Math.min(prizes.length, 4); i++) {
      prizesH += 32;
      if (prizes[i].description) prizesH += Math.floor(22 * 1.3 * 2) + 6;
    }
    if (prizes.length > 4) prizesH += 30;
  }
  const ctaGap = 45;
  const ctaBoxPad = 18;
  const ctaTextH = Math.floor(30 * 1.25 * 3);
  const ctaH = ctaTextH + ctaBoxPad * 2;
  const bottomNeeded = priceH + prizesH + 5 + ctaGap + ctaH + 20;

  const gridAvailable = BRAND_BAR_Y - y - bottomNeeded;
  const gridH = Math.max(Math.floor(gridAvailable), 150);

  const gridBottom = drawNumberGrid(ctx, y, gridH, tickets, totalNumbers);
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
    ctx.font = `700 ${30}px ${EMOJI_FONT}, ${FONT}`;
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
      ctx.fillText(defaultPrizeTitle(i + 1), W / 2, y);
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

  y += 20;

  ctx.save();
  ctx.strokeStyle = 'rgba(253, 230, 138, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W * 0.3, y);
  ctx.lineTo(W * 0.75, y);
  ctx.stroke();
  ctx.restore();

  y += 25;

  const ctaLines = [
    { text: 'Ayudanos, adquirí la tuya en', color: '#FDE68A' },
    { text: 'www.sigotuhuella.com.ar',      color: '#67E8F9' },
    { text: 'o por WhatsApp al 221 202 5190', color: '#34D399' },
  ];
  const ctaFontSize = 30;

  let maxW = 0;
  let totalH = 0;
  for (const { text } of ctaLines) {
    let fs = ctaFontSize;
    ctx.font = `800 ${fs}px ${FONT}`;
    const maxCtaW = W * 0.88;
    if (ctx.measureText(text).width > maxCtaW) {
      while (fs > 22 && ctx.measureText(text).width > maxCtaW) { fs -= 2; ctx.font = `800 ${fs}px ${FONT}`; }
    }
    maxW = Math.max(maxW, ctx.measureText(text).width);
    totalH += fs * 1.25;
  }

  const boxW = maxW + 36;
  const boxH = totalH + 36;
  const boxX = (W - boxW) / 2;

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, boxX, y, boxW, boxH, 14);
  ctx.fill();
  ctx.restore();

  y += 18;
  ctx.textBaseline = 'top';
  for (const { text, color } of ctaLines) {
    let fs = 30;
    ctx.font = `800 ${fs}px ${FONT}`;
    const maxCtaW = W * 0.88;
    if (ctx.measureText(text).width > maxCtaW) {
      while (fs > 22 && ctx.measureText(text).width > maxCtaW) { fs -= 2; ctx.font = `800 ${fs}px ${FONT}`; }
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, y);
    y += fs * 1.25;
  }
  y += 18;

  drawBrandBar(ctx, logoImage || null);

  return canvas.toBuffer('image/png');
}