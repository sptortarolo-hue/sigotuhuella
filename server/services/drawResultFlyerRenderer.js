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
  const titleFontSize = title.length > 30 ? 60 : title.length > 20 ? 66 : 74;
  let fs = titleFontSize;
  ctx.font = `800 ${fs}px ${FONT}`;
  if (ctx.measureText(title).width > titleMaxW) {
    while (fs > 34 && ctx.measureText(title).width > titleMaxW) { fs -= 2; ctx.font = `800 ${fs}px ${FONT}`; }
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
  y += 20;

  // Description
  if (description) {
    const descPadX = 26;
    const descPadY = 18;
    ctx.font = `600 32px ${FONT}`;
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
    for (const l of descLines) { if (l.length > 0) descH += 32 * 1.4; }
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
      descY += 32 * 1.4;
    }
    y += descH + 45;
  }

  // Subtitle
  ctx.font = `600 40px ${FONT}`;
  ctx.fillStyle = '#FDE68A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('🎉 Resultados del sorteo', RW / 2, y);
  y += 58;

  // Thank-you participants (bloque destacado)
  const thanksText = '¡Gracias a todos los que participaron y colaboraron adquiriendo un número!';
  ctx.font = `600 30px ${FONT}`;
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
  const thanksH = thanksLines.length * 30 * 1.4 + 26;
  const thanksBoxW = RW * 0.86;
  const thanksBoxX = (RW - thanksBoxW) / 2;
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, thanksBoxX, y, thanksBoxW, thanksH, 16);
  ctx.fill();
  ctx.restore();
  let ty = y + 13;
  for (const l of thanksLines) {
    if (l.length === 0) continue;
    ctx.fillText(l.join(' '), RW / 2, ty);
    ty += 30 * 1.4;
  }
  y += thanksH + 34;

  // Divider
  ctx.strokeStyle = 'rgba(253, 230, 138, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RW * 0.2, y);
  ctx.lineTo(RW * 0.8, y);
  ctx.stroke();
  y += 34;

  // ─── GANADORES (cards dinámicas) ───
  // Título destacado de la sección
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.font = `800 46px ${FONT}`;
  ctx.fillStyle = '#FFD54D';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('🏆 Ganadores', RW / 2, y);
  ctx.restore();
  y += 58;

  const sortedWinners = [...winners].sort((a, b) => a.position - b.position);
  const cardMargin = 38;
  const brandAccent = ctx.createLinearGradient(0, 0, 0, 120);
  brandAccent.addColorStop(0, BRAND_START);
  brandAccent.addColorStop(1, BRAND_END);

  // Cards centradas (más angostas para destacar el bloque)
  const cardW = RW - 260;
  const cardX = (RW - cardW) / 2;

  // Espacio disponible para cards (hasta dejar margen antes de agradecimientos finales)
  const reservedBottom = 300; // agradecimiento a aportantes + fecha + CTA + brand bar
  const maxCardsBottom = BRAND_BAR_Y - reservedBottom;

  for (let i = 0; i < sortedWinners.length; i++) {
    const w = sortedWinners[i];
    const prizeText = w.prize_title || `${w.position}° Premio`;
    const nameText = w.buyer_name || 'Anónimo';

    // Medir alto de la card según wrap
    const prizeFont = 50;
    const nameFont = 44;
    const descFont = 28;
    const prizeLines = [];
    ctx.font = `800 ${prizeFont}px ${FONT}`;
    const innerPad = 36;
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

    // Descripción del premio (wrap hasta 2 líneas)
    const descLines = [];
    if (w.prize_description) {
      ctx.font = `500 ${descFont}px ${FONT}`;
      const descMaxW = cardW - innerPad * 2 - 10;
      let dLine = '';
      for (const word of String(w.prize_description).split(' ')) {
        const t = dLine + (dLine ? ' ' : '') + word;
        if (ctx.measureText(t).width > descMaxW && dLine) {
          if (descLines.length >= 1) break;
          descLines.push(dLine);
          dLine = word;
        } else {
          dLine = t;
        }
      }
      if (dLine && descLines.length < 2) descLines.push(dLine);
    }
    const descLineCount = descLines.length;

    // Nombre con truncado a una línea + N°
    const ticketText = `N° ${w.ticket_number}`;
    const ticketFont = 30;
    ctx.font = `700 ${ticketFont}px ${FONT}`;
    const ticketW = ctx.measureText(ticketText).width;
    ctx.font = `700 ${nameFont}px ${FONT}`;
    const nameMaxW = cardW - innerPad * 2;
    const displayName = truncate(ctx, nameText, nameMaxW, nameFont, '700');

    const cardHeight = 38 + prizeLineCount * prizeFont * 1.15
      + (descLineCount > 0 ? 22 + descLineCount * descFont * 1.2 : 16)
      + nameFont * 1.25 + 16 + ticketFont * 1.2 + 30;
    const cardY = y;

    // Si la card no entra, parar (no dibujar más)
    if (cardY + cardHeight > maxCardsBottom) {
      break;
    }

    // Card background (más opaco para legibilidad)
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(ctx, cardX, cardY, cardW, cardHeight, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 213, 77, 0.45)';
    ctx.lineWidth = 2;
    roundRect(ctx, cardX, cardY, cardW, cardHeight, 20);
    ctx.stroke();

    // Accent bar
    ctx.fillStyle = brandAccent;
    roundRect(ctx, cardX, cardY, 7, cardHeight, 3);
    ctx.fill();

    // Sombra de texto para legibilidad
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;

    // ── Premio (protagonista, grande) ──
    ctx.fillStyle = '#FFD54D';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let py = cardY + 28;
    for (let li = 0; li < prizeLineCount; li++) {
      ctx.font = `800 ${prizeFont}px ${FONT}`;
      ctx.fillText(prizeLines[li], cardX + innerPad, py);
      py += prizeFont * 1.15;
    }

    // ── Descripción del premio ──
    if (descLineCount > 0) {
      const descY = py + 18;
      ctx.font = `500 ${descFont}px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let di = 0; di < descLines.length; di++) {
        ctx.fillText(descLines[di], cardX + innerPad, descY + di * descFont * 1.2);
      }
      py = descY + descLineCount * descFont * 1.2 + 6;
    } else {
      py += 18;
    }

    // ── Nombre del ganador (grande, blanco) ──
    const nameY = py + 12;
    ctx.font = `700 ${nameFont}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(displayName, cardX + innerPad, nameY);

    // ── N° de ticket (secundario) ──
    const ticketY = nameY + nameFont * 1.25 + 10;
    ctx.font = `700 ${ticketFont}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(ticketText, cardX + innerPad, ticketY);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    y = cardY + cardHeight + cardMargin;
  }

  y += 18;

  // ─── AGRADECIMIENTO A APORTANTES DE PREMIOS ───
  const sponsorText = 'Agradecemos a quienes aportaron los premios, a los que colaboraron y a nuestra comunidad. ¡Gracias por hacerlo posible! 🙏';
  ctx.font = `500 28px ${FONT}`;
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
  const spH = spLines.length * 28 * 1.5 + 26;
  const spBoxW = RW * 0.88;
  const spBoxX = (RW - spBoxW) / 2;
  if (y + spH > BRAND_BAR_Y - 20) y = BRAND_BAR_Y - 20 - spH;
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, spBoxX, y, spBoxW, spH, 16);
  ctx.fill();
  ctx.restore();
  let spy = y + 13;
  for (const l of spLines) {
    if (l.length === 0) continue;
    ctx.fillText(l.join(' '), RW / 2, spy);
    spy += 28 * 1.5;
  }
  y += spH + 26;

  // Fecha del sorteo
  if (drawDate) {
    const dateObj = new Date(drawDate);
    const dateText = dateObj.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`Sorteo: ${dateText}`, RW / 2, y);
    y += 46;
  }

  // CTA: web + chatbot (pie)
  const ctaLines = [
    { text: 'Conocé más en', color: '#FDE68A' },
    { text: 'www.sigotuhuella.com.ar', color: '#67E8F9' },
    { text: 'Consultá por WhatsApp 221 202 5190', color: '#34D399' },
  ];
  const ctaFontSize = 34;
  let ctaMaxW = 0;
  let ctaTotalH = 0;
  for (const { text } of ctaLines) {
    let fs = ctaFontSize;
    ctx.font = `800 ${fs}px ${FONT}`;
    const maxCtaW = RW * 0.88;
    if (ctx.measureText(text).width > maxCtaW) {
      while (fs > 24 && ctx.measureText(text).width > maxCtaW) { fs -= 2; ctx.font = `800 ${fs}px ${FONT}`; }
    }
    ctaMaxW = Math.max(ctaMaxW, ctx.measureText(text).width);
    ctaTotalH += fs * 1.2;
  }
  const ctaBoxW = ctaMaxW + 36;
  const ctaBoxH = ctaTotalH + 32;
  const ctaBoxX = (RW - ctaBoxW) / 2;
  // Si no entra donde está y, empujar hacia arriba para no pisar el brand bar
  if (y + ctaBoxH > BRAND_BAR_Y - 16) {
    y = BRAND_BAR_Y - 16 - ctaBoxH;
  }
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, ctaBoxX, y, ctaBoxW, ctaBoxH, 14);
  ctx.fill();
  ctx.restore();
  y += 16;
  ctx.textBaseline = 'top';
  for (const { text, color } of ctaLines) {
    let fs = ctaFontSize;
    ctx.font = `800 ${fs}px ${FONT}`;
    const maxCtaW = RW * 0.88;
    if (ctx.measureText(text).width > maxCtaW) {
      while (fs > 24 && ctx.measureText(text).width > maxCtaW) { fs -= 2; ctx.font = `800 ${fs}px ${FONT}`; }
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, RW / 2, y);
    y += fs * 1.2;
  }
  y += 16;

  // Brand bar
  drawBrandBar(ctx, logoImage || null, RW, BRAND_BAR_Y);

  return canvas.toBuffer('image/png');
}
