import { existsSync } from 'fs';

const W = 1080;
const H = 1350;
const FONT = 'sans-serif';

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

function drawBrandBar(ctx, logoImg) {
  const brandY = H - 80;
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W * 0.1, brandY);
  ctx.lineTo(W * 0.9, brandY);
  ctx.stroke();

  const logoR = 28;
  const logoY = brandY + 35;
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
  }

  ctx.font = `800 34px ${FONT}`;
  ctx.fillStyle = '#374151';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SIGO TU HUELLA', W * 0.32 + logoR + 12, logoY);

  ctx.font = `500 24px ${FONT}`;
  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'right';
  ctx.fillText('sigotuhuella.com.ar', W * 0.88, logoY);
}

export async function renderDrawResultFlyer({ title, prizes, winners, logoImage }) {
  const canvasModule = await getCanvas();
  const { createCanvas } = canvasModule;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Subtle border
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 4;
  roundRect(ctx, 8, 8, W - 16, H - 16, 24);
  ctx.stroke();

  // Top accent bar
  const barGrad = ctx.createLinearGradient(0, 0, W, 0);
  barGrad.addColorStop(0, '#4F46E5');
  barGrad.addColorStop(1, '#7C3AED');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 0, W, 8);

  let y = 50;

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
  ctx.font = `800 52px ${FONT}`;
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Word-wrap title
  const maxTitleW = W - 120;
  const titleWords = title.split(' ');
  let titleLines = [''];
  for (const word of titleWords) {
    const test = titleLines[titleLines.length - 1] + (titleLines[titleLines.length - 1] ? ' ' : '') + word;
    if (ctx.measureText(test).width > maxTitleW && titleLines[titleLines.length - 1]) {
      titleLines.push(word);
    } else {
      titleLines[titleLines.length - 1] = test;
    }
  }
  for (const line of titleLines.slice(0, 2)) {
    ctx.fillText(line, W / 2, y);
    y += 60;
  }
  y += 10;

  // Subtitle
  ctx.font = `600 32px ${FONT}`;
  ctx.fillStyle = '#6B7280';
  ctx.textAlign = 'center';
  ctx.fillText('🎉 Resultados del sorteo', W / 2, y);
  y += 55;

  // Divider
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, y);
  ctx.lineTo(W - 80, y);
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

    // Card background
    ctx.fillStyle = '#F9FAFB';
    roundRect(ctx, cardX, cardY, cardW, cardHeight, 16);
    ctx.fill();
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    roundRect(ctx, cardX, cardY, cardW, cardHeight, 16);
    ctx.stroke();

    // Left accent bar
    const accentGrad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardHeight);
    accentGrad.addColorStop(0, '#4F46E5');
    accentGrad.addColorStop(1, '#7C3AED');
    ctx.fillStyle = accentGrad;
    roundRect(ctx, cardX, cardY, 6, cardHeight, 3);
    ctx.fill();

    // Prize title
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = '#4F46E5';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`🏆 ${w.prize_title || `${w.position}° Premio`}`, cardX + cardPadding, cardY + 16);

    // Winning number (big)
    ctx.font = `800 40px ${FONT}`;
    ctx.fillStyle = '#4F46E5';
    ctx.fillText(`N° ${w.ticket_number}`, cardX + cardPadding, cardY + 50);

    // Buyer name
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = '#111827';
    const nameX = cardX + cardPadding + ctx.measureText(`N° ${w.ticket_number}  `).width + 10;
    ctx.fillText(w.buyer_name || 'Anónimo', nameX, cardY + 56);

    // Phone + amount
    ctx.font = `400 18px ${FONT}`;
    ctx.fillStyle = '#6B7280';
    const phoneText = w.buyer_phone ? `📱 ${w.buyer_phone}` : '';
    const amountText = w.prize_amount ? ` · $${w.prize_amount.toLocaleString('es-AR')}` : '';
    ctx.fillText(phoneText + amountText, cardX + cardPadding, cardY + 98);

    y += cardHeight + cardMargin;
  }

  y += 10;

  // Draw date if available
  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'center';
  ctx.fillText('Sorteo realizado con Sigo Tu Huella', W / 2, y);

  // Brand bar
  drawBrandBar(ctx, logoImage);

  return canvas.toBuffer('image/png');
}
