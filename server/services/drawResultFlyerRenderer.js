import {
  FONT,
  EMOJI_FONT,
  W,
  H,
  BRAND_BAR_H,
  BRAND_BAR_Y,
  TOP_PAD,
  getCanvas,
  roundRect,
  drawBgDecorations,
  drawWrappedText,
  drawBrandBar,
  defaultPrizeTitle,
  getLogoImage,
} from './flyerUtils.js';

export async function renderDrawResultFlyer({
  title,
  description,
  prizes,
  winners,
  pricePerNumber,
  drawDate,
  logoImage,
}) {
  const canvasModule = await getCanvas();
  const { createCanvas } = canvasModule;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBgDecorations(ctx);

  let y = TOP_PAD;

  // Logo
  if (logoImage) {
    const logoR = 40;
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, y + logoR, logoR, 0, Math.PI * 2);
    ctx.clip();
    const la = logoImage.naturalWidth / logoImage.naturalHeight;
    let lw, lh;
    if (la > 1) { lh = logoR * 2.2; lw = lh * la; }
    else { lw = logoR * 2.2; lh = lw / la; }
    ctx.drawImage(logoImage, W / 2 - lw / 2, y + logoR - lh / 2, lw, lh);
    ctx.restore();
    y += logoR * 2 + 30;
  } else {
    y += 20;
  }

  // Title
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

  // Description
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

  // Subtitle
  ctx.font = `600 32px ${FONT}`;
  ctx.fillStyle = '#FDE68A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('🎉 Resultados del sorteo', W / 2, y);
  y += 45;

  // Divider
  ctx.strokeStyle = 'rgba(253, 230, 138, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W * 0.2, y);
  ctx.lineTo(W * 0.8, y);
  ctx.stroke();
  y += 30;

  // Winners list
  const sortedWinners = [...winners].sort((a, b) => a.position - b.position);
  const cardPadding = 30;
  const cardHeight = 130;
  const cardMargin = 16;
  const cardX = 60;
  const cardW = W - 120;

  for (const w of sortedWinners) {
    const cardY = y;

    // Card background - semi-transparent white on gradient
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, cardX, cardY, cardW, cardHeight, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    roundRect(ctx, cardX, cardY, cardW, cardHeight, 16);
    ctx.stroke();

    // Left accent bar (brand gradient)
    const accentGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardHeight);
    accentGrad.addColorStop(0, '#4F46E5');
    accentGrad.addColorStop(1, '#7C3AED');
    ctx.fillStyle = accentGrad;
    roundRect(ctx, cardX, cardY, 6, cardHeight, 3);
    ctx.fill();

    // Prize title
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = '#FDE68A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`🏆 ${w.prize_title || `${w.position}° Premio`}`, cardX + cardPadding, cardY + 16);

    // Winning number (big)
    ctx.font = `800 40px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`N° ${w.ticket_number}`, cardX + cardPadding, cardY + 50);

    // Buyer name
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const nameX = cardX + cardPadding + ctx.measureText(`N° ${w.ticket_number}  `).width + 10;
    ctx.fillText(w.buyer_name || 'Anónimo', nameX, cardY + 56);

    // Phone + amount
    ctx.font = `400 18px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const phoneText = w.buyer_phone ? `📱 ${w.buyer_phone}` : '';
    const amountText = w.prize_amount ? ` · $${w.prize_amount.toLocaleString('es-AR')}` : '';
    ctx.fillText(phoneText + amountText, cardX + cardPadding, cardY + 98);

    y += cardHeight + cardMargin;
  }

  y += 10;

  // Price + Draw date row
  if (pricePerNumber || drawDate) {
    ctx.save();
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.2, y);
    ctx.lineTo(W * 0.8, y);
    ctx.stroke();
    ctx.restore();
    y += 25;

    if (pricePerNumber) {
      const priceText = `$ ${parseFloat(pricePerNumber).toLocaleString('es-AR')} x número`;
      ctx.font = `800 36px ${FONT}`;
      ctx.fillStyle = '#FDE68A';
      const priceW = ctx.measureText(priceText).width;
      const pricePadX = 24;
      const pricePadY = 14;
      const priceBoxW = priceW + pricePadX * 2;
      const priceBoxH = 36 + pricePadY * 2;
      const priceBoxX = (W - priceBoxW) / 2;
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, priceBoxX, y, priceBoxW, priceBoxH, 12);
      ctx.fill();
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FDE68A';
      ctx.fillText(priceText, W / 2, y + priceBoxH / 2);
      y += priceBoxH + 15;
    }

    if (drawDate) {
      const dateObj = new Date(drawDate);
      const dateText = dateObj.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      ctx.font = `600 24px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(`Sorteo: ${dateText}`, W / 2, y);
      y += 35;
    }
  }

  // Brand bar
  drawBrandBar(ctx, logoImage || null);

  return canvas.toBuffer('image/png');
}