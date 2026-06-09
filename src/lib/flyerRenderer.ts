export interface FlyerDesignConfig {
  label: string;
  badgeColor: string;
  gradientStart: string;
  gradientEnd: string;
}

export const statusDesigns: Record<string, FlyerDesignConfig> = {
  lost: { label: 'SE PERDIÓ', badgeColor: '#EF4444', gradientStart: '#991B1B', gradientEnd: '#EF4444' },
  retained: { label: 'RETENIDO', badgeColor: '#2563EB', gradientStart: '#1E3A5F', gradientEnd: '#2563EB' },
  sighted: { label: 'AVISTADO', badgeColor: '#2563EB', gradientStart: '#1E3A5F', gradientEnd: '#2563EB' },
  accidented: { label: 'ACCIDENTADO', badgeColor: '#EA580C', gradientStart: '#7C2D12', gradientEnd: '#EA580C' },
  needs_attention: { label: 'NECESITA ATENCIÓN', badgeColor: '#D97706', gradientStart: '#78350F', gradientEnd: '#D97706' },
  for_adoption: { label: 'EN ADOPCIÓN', badgeColor: '#8B5CF6', gradientStart: '#3B0764', gradientEnd: '#8B5CF6' },
  adopted: { label: '¡ADOPTADO!', badgeColor: '#10B981', gradientStart: '#064E3B', gradientEnd: '#10B981' },
  reunited: { label: '¡REENCUENTRO!', badgeColor: '#10B981', gradientStart: '#064E3B', gradientEnd: '#10B981' },
};

type LayoutType = 'story' | 'portrait' | 'square';

function getLayoutType(w: number, h: number): LayoutType {
  const ratio = w / h;
  if (ratio < 0.6) return 'story';
  if (ratio < 0.9) return 'portrait';
  return 'square';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

export function drawRectPhoto(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  img: HTMLImageElement | null, radius: number
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  if (img) {
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const areaAspect = w / h;
    let drawW: number, drawH: number, drawX: number, drawY: number;
    if (imgAspect > areaAspect) {
      drawH = h;
      drawW = h * imgAspect;
      drawX = x - (drawW - w) / 2;
      drawY = y;
    } else {
      drawW = w;
      drawH = w / imgAspect;
      drawX = x;
      drawY = y - (drawH - h) / 2;
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    const grad = ctx.createLinearGradient(0, y + h * 0.65, 0, y + h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + h * 0.65, w, h * 0.35);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${h * 0.25}px system-ui`;
    ctx.fillText('🐾', x + w / 2, y + h / 2);
  }
  ctx.restore();
}

function drawBadge(ctx: CanvasRenderingContext2D, w: number, cx: number, y: number, text: string, color: string, fontSize?: number): number {
  const fs = fontSize ?? w * 0.055;
  ctx.font = `800 ${fs}px system-ui, -apple-system, sans-serif`;
  const textW = ctx.measureText(text).width;
  const padX = w * 0.035;
  const padY = fs * 0.35;
  const bw = textW + padX * 2;
  const bh = fs + padY * 2;
  const bx = cx - bw / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, bx, y, bw, bh, bh / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${fs}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(text, cx, y + bh / 2);
  return y + bh;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D, text: string, cx: number, y: number,
  maxWidth: number, fontSize: number, maxLines: number,
  fontStyle: string, color: string, lineSpacing: number, align?: CanvasTextAlign
): number {
  ctx.font = `${fontStyle} ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'top';
  const words = text.split(' ');
  let line = '';
  let lineCount = 0;
  let curY = y;
  for (const word of words) {
    if (lineCount >= maxLines) break;
    const testLine = line + word + ' ';
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line.trim(), cx, curY);
      line = word + ' ';
      curY += fontSize * lineSpacing;
      lineCount++;
    } else {
      line = testLine;
    }
  }
  if (line.trim() && lineCount < maxLines) {
    ctx.fillText(line.trim(), cx, curY);
    curY += fontSize * lineSpacing;
  }
  return curY;
}

function drawBrandBar(ctx: CanvasRenderingContext2D, w: number, h: number, logoImg: HTMLImageElement | null, caseNumber?: string) {
  const brandY = h - h * 0.06;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.15, brandY);
  ctx.lineTo(w * 0.85, brandY);
  ctx.stroke();
  const logoR = w * 0.028;
  const logoY = brandY + logoR;
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(w * 0.32, logoY, logoR, 0, Math.PI * 2);
    ctx.clip();
    const la = logoImg.naturalWidth / logoImg.naturalHeight;
    let lw: number, lh: number;
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
    ctx.font = `${logoR * 1.5}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐾', w * 0.32, logoY);
  }
  const brandFontSize = w * 0.035;
  ctx.font = `800 ${brandFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SIGO TU HUELLA', w * 0.32 + logoR + w * 0.025, logoY);
  if (caseNumber) {
    ctx.font = `600 ${w * 0.028}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(caseNumber, w * 0.88, logoY);
  }
}

function drawBgDecorations(ctx: CanvasRenderingContext2D, w: number, h: number, colorStart: string, colorEnd: string) {
  ctx.clearRect(0, 0, w, h);
  const bgGrad = ctx.createLinearGradient(0, 0, w * 0.3, h);
  bgGrad.addColorStop(0, colorStart);
  bgGrad.addColorStop(1, colorEnd);
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
  ctx.arc(w * 0.2, h * 0.15, w * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.04;
  for (let x = w * 0.45; x < w * 0.95; x += 30) {
    for (let y = h * 0.45; y < h * 0.85; y += 30) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export interface FlyerData {
  name?: string;
  status: string;
  species?: string;
  breed?: string;
  gender?: string;
  age?: string;
  location?: string;
  contact_info?: string;
  instagram?: string;
  description?: string;
  case_number?: string;
}

function drawCardFlyer(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  design: FlyerDesignConfig, name: string, petDetails: string | undefined,
  location: string | undefined, contactInfo: string | undefined,
  instagram: string | undefined, description: string | undefined,
  img: HTMLImageElement | null
) {
  const layoutType = getLayoutType(w, h);
  let badgeH: number, photoTop: number, photoH: number,
      photoW: number, photoRadius: number,
      maxDescLines: number, descFontSize: number,
      infoFontSize: number, detailsFontSize: number,
      nameFontSize: number, brandH: number;
  const hasName = name && name !== 'Sin nombre';
  const descText = description && description.length > 150 ? description.slice(0, 150) + '…' : description;
  if (layoutType === 'story') {
    badgeH = h * 0.17; photoTop = h * 0.22; photoH = h * 0.38;
    photoW = w * 0.84; photoRadius = w * 0.025;
    maxDescLines = 99; descFontSize = hasName ? w * 0.038 : w * 0.050;
    infoFontSize = w * 0.038; detailsFontSize = hasName ? w * 0.028 : w * 0.034;
    nameFontSize = w * 0.065; brandH = h * 0.055;
  } else if (layoutType === 'portrait') {
    badgeH = h * 0.16; photoTop = h * 0.19; photoH = h * 0.38;
    photoW = w * 0.84; photoRadius = w * 0.025;
    maxDescLines = 99; descFontSize = hasName ? w * 0.032 : w * 0.042;
    infoFontSize = w * 0.036; detailsFontSize = hasName ? w * 0.026 : w * 0.032;
    nameFontSize = w * 0.06; brandH = h * 0.055;
  } else {
    badgeH = h * 0.16; photoTop = h * 0.19; photoH = h * 0.32;
    photoW = w * 0.84; photoRadius = w * 0.025;
    maxDescLines = 99; descFontSize = hasName ? w * 0.030 : w * 0.040;
    infoFontSize = w * 0.034; detailsFontSize = hasName ? w * 0.024 : w * 0.030;
    nameFontSize = w * 0.055; brandH = h * 0.055;
  }
  const photoX = (w - photoW) / 2;
  const photoY = photoTop;
  const contentX = w * 0.08;
  const contentMaxW = w * 0.84;
  const brandY = h - brandH - h * 0.01;
  const badgePad = h * 0.015;
  const maxBadgeTextW = w * 0.78;
  ctx.font = `800 ${badgeH * 0.55}px system-ui, -apple-system, sans-serif`;
  let badgeFs = badgeH * 0.55;
  const textW = ctx.measureText(design.label).width;
  if (textW > maxBadgeTextW) badgeFs = badgeFs * (maxBadgeTextW / textW);
  badgeFs = Math.max(badgeH * 0.25, Math.min(badgeFs, badgeH * 0.6));
  ctx.save();
  ctx.fillStyle = design.badgeColor;
  roundRect(ctx, w * 0.04, badgePad, w * 0.92, badgeH - badgePad, w * 0.025);
  ctx.fill();
  ctx.restore();
  ctx.font = `800 ${badgeFs}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(design.label, w / 2, badgePad + (badgeH - badgePad) / 2);
  drawRectPhoto(ctx, photoX, photoY, photoW, photoH, img, photoRadius);

  // Pre-calculate description wrapped lines
  const infoItems: string[] = [];
  if (location) infoItems.push(location);
  if (contactInfo) infoItems.push(contactInfo);
  if (instagram) infoItems.push(instagram);

  let descLineCount = 0;
  if (descText) {
    const descInnerW = w * 0.80;
    ctx.font = `italic 500 ${descFontSize}px system-ui, -apple-system, sans-serif`;
    const words = descText.split(' ');
    let line = '';
    for (const word of words) {
      if (descLineCount >= maxDescLines) break;
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > descInnerW && line) {
        descLineCount++;
        line = word + ' ';
      } else {
        line = testLine;
      }
    }
    if (line.trim() && descLineCount < maxDescLines) descLineCount++;
  }

  // White box — description + info items (black text)
  const descLineH = descFontSize * 1.35;
  const infoLineH = infoFontSize * 1.35;
  const hasDesc = descLineCount > 0;
  const gapDescInfo = infoFontSize * 0.25;
  const totalLines = (hasDesc ? descLineCount : 0) + infoItems.length;

  let infoBoxTop = brandY;
  if (totalLines > 0) {
    const boxPadX = w * 0.04;
    const boxPadY = infoFontSize * 0.3;
    const boxRadius = w * 0.015;
    const boxW = w * 0.88;
    const boxX = (w - boxW) / 2;
    const descSectionH = hasDesc ? descLineCount * descLineH : 0;
    const infoSectionH = infoItems.length * infoLineH;
    const extraGap = hasDesc && infoItems.length > 0 ? gapDescInfo : 0;
    const boxH = descSectionH + infoSectionH + boxPadY * 2 + extraGap;
    const boxBottom = brandY - h * 0.01;
    infoBoxTop = boxBottom - boxH;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, boxX, infoBoxTop, boxW, boxH, boxRadius);
    ctx.fill();
    ctx.restore();

    let textY = infoBoxTop + boxPadY;
    if (hasDesc) {
      textY = drawWrappedText(ctx, descText, boxX + boxPadX, textY, boxW - boxPadX * 2, descFontSize, descLineCount, 'italic 500', '#000000', 1.35, 'left');
      textY += extraGap;
    }
    if (infoItems.length > 0) {
      ctx.font = `700 ${infoFontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#000000';
      for (const item of infoItems) {
        ctx.fillText(item, boxX + boxPadX, textY);
        textY += infoLineH;
      }
    }
  }

  const contentEndY = Math.min(infoBoxTop - h * 0.015, brandY - h * 0.05);
  let contentY = photoY + photoH + h * 0.035;
  if (hasName && contentY + nameFontSize < contentEndY) {
    ctx.font = `800 ${nameFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillText(name, contentX, contentY);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    contentY += nameFontSize * 1.2;
  }
  if (petDetails && contentY + detailsFontSize < contentEndY) {
    ctx.font = `500 ${detailsFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(petDetails, contentX, contentY);
    contentY += detailsFontSize * 1.5;
  }
}

export function drawFlyer(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  design: FlyerDesignConfig,
  data: FlyerData,
  img: HTMLImageElement | null,
  logoImg: HTMLImageElement | null
) {
  const species = data.species === 'dog' ? 'Perro' : data.species === 'cat' ? 'Gato' : data.species || '';
  const gender = data.gender === 'male' ? 'Macho' : data.gender === 'female' ? 'Hembra' : '';
  const parts = [species, data.breed, gender, data.age].filter(Boolean);
  const petDetails = parts.join(' · ');

  // Instagram as @handle
  const instagramLine = data.instagram ? `📷 @${data.instagram.replace('@', '')}` : undefined;
  // Combine contact + instagram into the contact field
  let contactInfo = data.contact_info || undefined;
  if (contactInfo && instagramLine) contactInfo = `${contactInfo}  ·  ${instagramLine}`;
  else if (instagramLine) contactInfo = instagramLine;

  drawBgDecorations(ctx, w, h, design.gradientStart, design.gradientEnd);
  drawCardFlyer(ctx, w, h, design, data.name || '', petDetails, data.location, contactInfo, undefined, data.description, img);
  drawBrandBar(ctx, w, h, logoImg, data.case_number);
}
