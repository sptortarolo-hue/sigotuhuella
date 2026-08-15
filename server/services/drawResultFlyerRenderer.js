import {
  FONT,
  BRAND_START,
  BRAND_END,
  getCanvas,
  roundRect,
  drawBgDecorations,
  drawBrandBar,
  getLogoImage,
} from './flyerUtils.js';

// Formato 9:16
export const RW = 1080;
export const RH = 1920;
export const BRAND_BAR_H = 70;
export const BRAND_BAR_Y = RH - BRAND_BAR_H;

function truncate(ctx, text, maxWidth, fontSize, weight) {
  ctx.font = `${weight} ${fontSize}px ${FONT}`;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

export async function renderDrawResultFlyer({
  title,
  description,
  winners,
  pricePerNumber,
  drawDate,
  logoImage,
}) {
  const canvasModule = await getCanvas();
  const { createCanvas } = canvasModule;
  const canvas = createCanvas(RW, RH);
  const ctx = canvas.getContext('2d');

  drawBgDecorations(ctx, RW, RH);

  let y = 50;

  // Logo
  if (logoImage) {
    const logoR = 45;
    ctx.save();
    ctx.beginPath();
    ctx.arc(RW / 2, y + logoR, logoR, 0, Math.PI * 2);
    ctx.clip();
    const la = logoImage.naturalWidth / logoImage.naturalHeight;
    let lw, lh;
    if (la > 1) { lh = logoR * 2.2; lw = lh * la; }
    else { lw = logoR * 2.2; lh = lw / la; }
    ctx.drawImage(logoImage, RW / 2 - lw / 2, y + logoR - lh / 2, lw, lh);
    ctx.restore();
    y += logoR * 2 + 28;
  } else {
    y += 18;
  }

  // Title (máx 2 líneas)
  const titleMaxW = RW * 0.86;
  const titleFontSize = title.length > 30 ? 52 : title.length > 20 ? 58 : 64;
  let fs = titleFontSize;
  ctx.font = `800 ${fs}px ${FONT}`;
  if (ctx.measureText(title).width > titleMaxW) {
    while (fs > 30 && ctx.measureText(title).width > titleMaxW) { fs -= 2; ctx.font = `800 ${fs}px ${FONT}`; }
  }
  const words = title.split(' ');
  const titleLines = [];
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
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let i = 0; i < titleDisplay.length; i++) {
    ctx.fillText(titleDisplay[i], RW / 2, y);
    y += fs * 1.2;
  }
  y += 12;

  // Description
  if (description) {
    const descPadX = 24;
    const descPadY = 16;
    ctx.font = `600 28px ${FONT}`;
    const descMaxW = RW * 0.85 - descPadX * 2;
    const dWords = description.split(' ');
    const descLines = [[]];
    let lineW = 0;
    for (const word of dWords) {
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
    for (const l of descLines) { if (l.length > 0) descH += 28 * 1.4; }
    descH += descPadY * 2;
    const descBoxW = RW * 0.85;
    const descBoxX = (RW - descBoxW) / 2;
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
      ctx.fillText(l.join(' '), RW / 2, descY);
      descY += 28 * 1.4;
    }
    y += descH + 35;
  }

  // Subtitle
  ctx.font = `600 34px ${FONT}`;
  ctx.fillStyle = '#FDE68A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('🎉 Resultados del sorteo', RW / 2, y);
  y += 48;

  // Thank-you participants (bloque destacado)
  const thanksText = '¡Gracias a todos los que participaron y colaboraron adquiriendo un número!';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const thanksMaxW = RW * 0.8;
  const thanksLines = [[]];
  let tw = 0;
  for (const word of thanksText.split(' ')) {
    const wordW = ctx.measureText(word + ' ').width;
    if (tw + wordW > thanksMaxW && thanksLines[thanksLines.length - 1].length > 0) {
      thanksLines.push([]);
      tw = 0;
    }
    thanksLines[thanksLines.length - 1].push(word);
    tw += wordW;
  }
  const thanksH = thanksLines.length * 26 * 1.4 + 24;
  const thanksBoxW = RW * 0.86;
  const thanksBoxX = (RW - thanksBoxW) / 2;
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, thanksBoxX, y, thanksBoxW, thanksH, 16);
  ctx.fill();
  ctx.restore();
  let ty = y + 12;
  for (const l of thanksLines) {
    if (l.length === 0) continue;
    ctx.fillText(l.join(' '), RW / 2, ty);
    ty += 26 * 1.4;
  }
  y += thanksH + 20;

  // Divider
  ctx.strokeStyle = 'rgba(253, 230, 138, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RW * 0.2, y);
  ctx.lineTo(RW * 0.8, y);
  ctx.stroke();
  y += 26;

  // ─── GANADORES (cards dinámicas) ───
  const sortedWinners = [...winners].sort((a, b) => a.position - b.position);
  const cardX = 70;
  const cardW = RW - 140;
  const cardMargin = 20;
  const brandAccent = ctx.createLinearGradient(0, 0, 0, 120);
  brandAccent.addColorStop(0, BRAND_START);
  brandAccent.addColorStop(1, BRAND_END);

  // Espacio disponible para cards (hasta dejar margen antes de agradecimientos finales)
  const reservedBottom = 220; // agradecimiento a aportantes + precio + fecha + brand bar
  const maxCardsBottom = BRAND_BAR_Y - reservedBottom;

  for (let i = 0; i < sortedWinners.length; i++) {
    const w = sortedWinners[i];
    const prizeText = w.prize_title || `${w.position}° Premio`;
    const nameText = w.buyer_name || 'Anónimo';

    // Medir alto de la card según wrap
    const prizeFont = 38;
    const nameFont = 34;
    const prizeLines = [];
    ctx.font = `800 ${prizeFont}px ${FONT}`;
    const innerPad = 32;
    const prizeMaxW = cardW - innerPad * 2 - 14;
    let pLine = '';
    for (const word of prizeText.split(' ')) {
      const t = pLine + (pLine ? ' ' : '') + word;
      if (ctx.measureText(t).width > prizeMaxW && pLine) {
        prizeLines.push(pLine);
        pLine = word;
      } else {
        pLine = t;
      }
    }
    if (pLine) prizeLines.push(pLine);
    const prizeLineCount = Math.min(prizeLines.length, 2);

    // Nombre con truncado a una línea + N°
    const ticketText = `N° ${w.ticket_number}`;
    const ticketFont = 24;
    ctx.font = `700 ${ticketFont}px ${FONT}`;
    const ticketW = ctx.measureText(ticketText).width;
    ctx.font = `700 ${nameFont}px ${FONT}`;
    const nameMaxW = cardW - innerPad * 2;
    const displayName = truncate(ctx, nameText, nameMaxW, nameFont, '700');

    const cardHeight = 30 + prizeLineCount * prizeFont * 1.2 + 24 + nameFont * 1.3 + 18 + ticketFont * 1.2 + 26;
    const cardY = y;

    // Si la card no entra, parar (no dibujar más)
    if (cardY + cardHeight > maxCardsBottom) {
      break;
    }

    // Card background (más opaco para legibilidad)
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(ctx, cardX, cardY, cardW, cardHeight, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, cardX, cardY, cardW, cardHeight, 18);
    ctx.stroke();

    // Accent bar
    ctx.fillStyle = brandAccent;
    roundRect(ctx, cardX, cardY, 6, cardHeight, 3);
    ctx.fill();

    // Sombra de texto para legibilidad
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;

    // ── Premio (protagonista, grande) ──
    ctx.fillStyle = '#FFD54D';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let py = cardY + 24;
    for (let li = 0; li < prizeLineCount; li++) {
      ctx.font = `800 ${prizeFont}px ${FONT}`;
      ctx.fillText(prizeLines[li], cardX + innerPad, py);
      py += prizeFont * 1.2;
    }

    // ── Nombre del ganador (grande, blanco) ──
    const nameY = py + 18;
    ctx.font = `700 ${nameFont}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(displayName, cardX + innerPad, nameY);

    // ── N° de ticket (secundario) ──
    const ticketY = nameY + nameFont * 1.3 + 10;
    ctx.font = `700 ${ticketFont}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(ticketText, cardX + innerPad, ticketY);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    y = cardY + cardHeight + cardMargin;
  }

  y += 12;

  // ─── AGRADECIMIENTO A APORTANTES DE PREMIOS ───
  const sponsorText = 'Agradecemos a quienes aportaron los premios, a los que colaboraron y a nuestra comunidad. ¡Gracias por hacerlo posible! 🙏';
  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const spMaxW = RW * 0.82;
  const spLines = [[]];
  let spw = 0;
  for (const word of sponsorText.split(' ')) {
    const wordW = ctx.measureText(word + ' ').width;
    if (spw + wordW > spMaxW && spLines[spLines.length - 1].length > 0) {
      spLines.push([]);
      spw = 0;
    }
    spLines[spLines.length - 1].push(word);
    spw += wordW;
  }
  const spH = spLines.length * 24 * 1.5 + 22;
  const spBoxW = RW * 0.88;
  const spBoxX = (RW - spBoxW) / 2;
  if (y + spH > BRAND_BAR_Y - 20) y = BRAND_BAR_Y - 20 - spH;
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, spBoxX, y, spBoxW, spH, 16);
  ctx.fill();
  ctx.restore();
  let spy = y + 11;
  for (const l of spLines) {
    if (l.length === 0) continue;
    ctx.fillText(l.join(' '), RW / 2, spy);
    spy += 24 * 1.5;
  }
  y += spH + 18;

  // Precio + fecha
  if (pricePerNumber || drawDate) {
    if (pricePerNumber) {
      const priceText = `$ ${parseFloat(pricePerNumber).toLocaleString('es-AR')} x número`;
      ctx.font = `800 34px ${FONT}`;
      const priceW = ctx.measureText(priceText).width;
      const pricePadX = 22;
      const pricePadY = 12;
      const priceBoxW = priceW + pricePadX * 2;
      const priceBoxH = 34 + pricePadY * 2;
      const priceBoxX = (RW - priceBoxW) / 2;
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, priceBoxX, y, priceBoxW, priceBoxH, 12);
      ctx.fill();
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FDE68A';
      ctx.fillText(priceText, RW / 2, y + priceBoxH / 2);
      y += priceBoxH + 12;
    }

    if (drawDate) {
      const dateObj = new Date(drawDate);
      const dateText = dateObj.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      ctx.font = `600 24px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`Sorteo: ${dateText}`, RW / 2, y);
      y += 36;
    }
  }

  // Brand bar
  drawBrandBar(ctx, logoImage || null, RW, BRAND_BAR_Y);

  return canvas.toBuffer('image/png');
}
