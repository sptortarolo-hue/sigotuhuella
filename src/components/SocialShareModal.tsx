import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Pet, getPetImageUrls } from '@/src/lib/petService';
import { X, MessageCircle, Camera, Download, Sparkles, Loader2, ImageIcon, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

type Platform = 'whatsapp' | 'facebook' | 'instagram' | null;
type UseType = 'story' | 'post' | null;

interface UseOption {
  id: UseType;
  label: string;
  description: string;
  aspectRatio: string;
  width: number;
  height: number;
}

interface PlatformConfig {
  platform: Platform;
  uses: UseOption[];
}

const platformConfigs: PlatformConfig[] = [
  {
    platform: 'whatsapp',
    uses: [
      { id: 'story', label: 'Estado', description: 'Para estados de WhatsApp', aspectRatio: '9:16', width: 1080, height: 1920 },
      { id: 'post', label: 'Imagen/Chat', description: 'Para enviar en chats', aspectRatio: '1:1', width: 1080, height: 1080 }
    ]
  },
  {
    platform: 'facebook',
    uses: [
      { id: 'story', label: 'Historia', description: 'Para stories', aspectRatio: '9:16', width: 1080, height: 1920 },
      { id: 'post', label: 'Publicación', description: 'Para feed', aspectRatio: '1:1', width: 1080, height: 1080 }
    ]
  },
  {
    platform: 'instagram',
    uses: [
      { id: 'story', label: 'Historia/Reel', description: 'Para stories y reels', aspectRatio: '9:16', width: 1080, height: 1920 },
      { id: 'post', label: 'Publicación', description: 'Para feed (4:5)', aspectRatio: '4:5', width: 1080, height: 1350 }
    ]
  }
];

interface SocialShareModalProps {
  pet: Pet;
  onClose: () => void;
}

interface DesignConfig {
  label: string;
  badgeColor: string;
  gradientStart: string;
  gradientEnd: string;
}

const statusDesigns: Record<string, DesignConfig> = {
  lost: { label: 'SE PERDIÓ', badgeColor: '#DC2626', gradientStart: '#7F1D1D', gradientEnd: '#DC2626' },
  retained: { label: 'RETENIDO', badgeColor: '#2563EB', gradientStart: '#1E3A5F', gradientEnd: '#2563EB' },
  sighted: { label: 'AVISTADO', badgeColor: '#2563EB', gradientStart: '#1E3A5F', gradientEnd: '#2563EB' },
  accidented: { label: 'ACCIDENTADO', badgeColor: '#EA580C', gradientStart: '#7C2D12', gradientEnd: '#EA580C' },
  needs_attention: { label: 'NECESITA ATENCIÓN', badgeColor: '#D97706', gradientStart: '#78350F', gradientEnd: '#D97706' },
  for_adoption: { label: 'EN ADOPCIÓN', badgeColor: '#8B5CF6', gradientStart: '#3B0764', gradientEnd: '#8B5CF6' },
  adopted: { label: '¡ADOPTADO!', badgeColor: '#10B981', gradientStart: '#064E3B', gradientEnd: '#10B981' },
  reunited: { label: '¡REENCUENTRO!', badgeColor: '#10B981', gradientStart: '#064E3B', gradientEnd: '#10B981' },
};

const getDimensions = (platform: Platform, useType: UseType) => {
  if (!platform || !useType) return { width: 1080, height: 1080, aspectRatio: '1:1' };
  const config = platformConfigs.find(p => p.platform === platform);
  if (!config) return { width: 1080, height: 1080, aspectRatio: '1:1' };
  const use = config.uses.find(u => u.id === useType);
  if (!use) return { width: 1080, height: 1080, aspectRatio: '1:1' };
  return { width: use.width, height: use.height, aspectRatio: use.aspectRatio };
};

type LayoutType = 'story' | 'portrait' | 'square';

const getLayoutType = (w: number, h: number): LayoutType => {
  const ratio = w / h;
  if (ratio < 0.6) return 'story';
  if (ratio < 0.9) return 'portrait';
  return 'square';
};


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

function drawCircularPhoto(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  img: HTMLImageElement | null,
  w: number
) {
  if (img) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = r * 0.4;
    ctx.shadowOffsetY = r * 0.15;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    const imgAspect = img.naturalWidth / img.naturalHeight;
    let drawW: number, drawH: number;
    if (imgAspect > 1) {
      drawH = r * 2.2;
      drawW = drawH * imgAspect;
    } else {
      drawW = r * 2.2;
      drawH = drawW / imgAspect;
    }
    ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(4, w * 0.006);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `${r * 0.8}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐾', cx, cy);
  }
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  w: number, cx: number, y: number,
  text: string, color: string, fontSize?: number
): number {
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
  ctx: CanvasRenderingContext2D,
  text: string, cx: number, y: number,
  maxWidth: number, fontSize: number, maxLines: number,
  fontStyle: string, color: string, lineSpacing: number
): number {
  ctx.font = `${fontStyle} ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
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

function drawBrandBar(ctx: CanvasRenderingContext2D, w: number, h: number, logoImg: HTMLImageElement | null) {
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
    if (la > 1) {
      lh = logoR * 2.2;
      lw = lh * la;
    } else {
      lw = logoR * 2.2;
      lh = lw / la;
    }
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
}

// === LAYOUT DRAWERS ===

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

function drawContentCard(ctx: CanvasRenderingContext2D, w: number, yStart: number, yEnd: number) {
  if (yStart >= yEnd) return;
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000000';
  roundRect(ctx, w * 0.06, yStart, w * 0.88, yEnd - yStart, w * 0.04);
  ctx.fill();
  ctx.restore();
}


// Layout: Story Hero (9:16, style 0)
function drawStoryHero(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  design: DesignConfig, name: string, petDetails: string | undefined,
  location: string | undefined, contactInfo: string | undefined,
  description: string | undefined, img: HTMLImageElement | null
) {
  const photoR = w * 0.28;
  const photoCy = h * 0.30;

  const cardY = photoCy + photoR - w * 0.02;
  const cardEndY = h - h * 0.06 - w * 0.02;
  drawContentCard(ctx, w, cardY, cardEndY);

  drawCircularPhoto(ctx, w / 2, photoCy, photoR, img, w);

  let yPos = photoCy + photoR + w * 0.035;
  yPos = drawBadge(ctx, w, w / 2, yPos, design.label, design.badgeColor);

  yPos += w * 0.035;
  const nameFs = w * 0.09;
  ctx.font = `800 ${nameFs}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillText(name, w / 2, yPos);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  yPos += nameFs * 1.15;

  if (petDetails) {
    const df = w * 0.028;
    ctx.font = `500 ${df}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(petDetails, w / 2, yPos);
    yPos += df * 1.8;
  }

  yPos += w * 0.015;

  if (location) {
    const lf = w * 0.035;
    ctx.font = `500 ${lf}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(location, w / 2, yPos);
    yPos += lf * 1.6;
  }

  if (contactInfo) {
    const cf = w * 0.035;
    ctx.font = `500 ${cf}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(contactInfo, w / 2, yPos);
    yPos += cf * 1.6;
  }

  if (description) {
    yPos = drawWrappedText(ctx, description, w / 2, yPos, w * 0.72, w * 0.03, 4, 'italic 500', 'rgba(255,255,255,0.85)', 1.4);
  }
}


// Layout: Portrait Magazine (4:5, style 0)
function drawPortraitMagazine(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  design: DesignConfig, name: string, petDetails: string | undefined,
  location: string | undefined, contactInfo: string | undefined,
  description: string | undefined, img: HTMLImageElement | null
) {
  const photoR = w * 0.22;
  const photoCy = h * 0.25;

  const cardY = photoCy + photoR - w * 0.02;
  const cardEndY = h - h * 0.06 - w * 0.02;
  drawContentCard(ctx, w, cardY, cardEndY);

  drawCircularPhoto(ctx, w / 2, photoCy, photoR, img, w);

  let yPos = photoCy + photoR + w * 0.03;
  yPos = drawBadge(ctx, w, w / 2, yPos, design.label, design.badgeColor);

  yPos += w * 0.03;
  const nameFs = w * 0.08;
  ctx.font = `800 ${nameFs}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillText(name, w / 2, yPos);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  yPos += nameFs * 1.1;

  if (petDetails) {
    const df = w * 0.026;
    ctx.font = `500 ${df}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(petDetails, w / 2, yPos);
    yPos += df * 1.7;
  }

  if (location) {
    const lf = w * 0.032;
    ctx.font = `500 ${lf}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(location, w / 2, yPos);
    yPos += lf * 1.5;
  }

  if (contactInfo) {
    const cf = w * 0.032;
    ctx.font = `500 ${cf}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(contactInfo, w / 2, yPos);
    yPos += cf * 1.5;
  }

  if (description) {
    yPos = drawWrappedText(ctx, description, w / 2, yPos, w * 0.72, w * 0.028, 2, 'italic 500', 'rgba(255,255,255,0.85)', 1.35);
  }
}



// Layout: Square Minimal (1:1, style 1)
function drawSquareMinimal(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  design: DesignConfig, name: string, petDetails: string | undefined,
  location: string | undefined, contactInfo: string | undefined,
  description: string | undefined, img: HTMLImageElement | null
) {
  const photoR = w * 0.22;
  const photoCy = h * 0.28;

  const cardY = photoCy + photoR - w * 0.02;
  const cardEndY = h - h * 0.06 - w * 0.02;
  drawContentCard(ctx, w, cardY, cardEndY);

  drawCircularPhoto(ctx, w / 2, photoCy, photoR, img, w);

  let yPos = photoCy + photoR + w * 0.03;
  yPos = drawBadge(ctx, w, w / 2, yPos, design.label, design.badgeColor);

  yPos += w * 0.025;
  const nameFs = w * 0.065;
  ctx.font = `800 ${nameFs}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillText(name, w / 2, yPos);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  yPos += nameFs * 1.0;

  if (location) {
    const lf = w * 0.028;
    ctx.font = `500 ${lf}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(location, w / 2, yPos);
    yPos += lf * 1.3;
  }

  if (contactInfo) {
    const cf = w * 0.028;
    ctx.font = `500 ${cf}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(contactInfo, w / 2, yPos);
    yPos += cf * 1.3;
  }

  if (description) {
    yPos = drawWrappedText(ctx, description, w / 2, yPos, w * 0.72, w * 0.024, 1, 'italic 500', 'rgba(255,255,255,0.85)', 1.3);
  }
}

function drawFlyerNative(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  design: DesignConfig,
  name: string,
  petDetails: string | undefined,
  location: string | undefined,
  contactInfo: string | undefined,
  description: string | undefined,
  status: string,
  img: HTMLImageElement | null,
  logoImg: HTMLImageElement | null,
  styleIndex: 0 | 1
) {
  drawBgDecorations(ctx, w, h, design.gradientStart, design.gradientEnd);

  const layoutType = getLayoutType(w, h);

  if (layoutType === 'square') {
    drawSquareMinimal(ctx, w, h, design, name, petDetails, location, contactInfo, description, img);
  } else if (layoutType === 'story') {
    drawStoryHero(ctx, w, h, design, name, petDetails, location, contactInfo, description, img);
  } else {
    drawPortraitMagazine(ctx, w, h, design, name, petDetails, location, contactInfo, description, img);
  }

  drawBrandBar(ctx, w, h, logoImg);
}

export default function SocialShareModal({ pet, onClose }: SocialShareModalProps) {
  const [platform, setPlatform] = useState<Platform>(null);
  const [useType, setUseType] = useState<UseType>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const petUrl = `${origin}/pet/${pet.id}`;
  const images = getPetImageUrls(pet);
  const mainImage = images[0] || null;
  const isMobile = typeof navigator !== 'undefined' && !!navigator.share;

  const { width: targetWidth, height: targetHeight, aspectRatio } = getDimensions(platform, useType);
  const styleIndex: 0 | 1 = getLayoutType(targetWidth, targetHeight) === 'square' ? 1 : 0;

  const design = statusDesigns[pet.status] || statusDesigns.lost;
  const flyerName = pet.name || 'Sin nombre';
  const shareText = petUrl;
  const petSpecies = pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species || '';
  const petGender = pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : '';
  const petDetailParts = [petSpecies, pet.breed, petGender, pet.age].filter(Boolean);
  const petDetails = petDetailParts.join(' · ');

  const previewScale = Math.min(280 / targetWidth, 400 / targetHeight, 1);

  // Load brand logo
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setLogoImg(img);
    img.onerror = () => setLogoImg(null);
    img.src = '/sigotuhuella.jpg';
  }, []);

  // Load image and draw on canvas
  const drawOnCanvas = useCallback((canvas: HTMLCanvasElement, img: HTMLImageElement | null) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    drawFlyerNative(ctx, targetWidth, targetHeight, design, flyerName, petDetails, pet.location, pet.contact_info, pet.description, pet.status, img, logoImg, styleIndex);
  }, [targetWidth, targetHeight, design, flyerName, petDetails, pet.location, pet.contact_info, pet.description, pet.status, logoImg]);

  useEffect(() => {
    if (!mainImage || !platform || !useType) return;

    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      if (canvasRef.current) drawOnCanvas(canvasRef.current, img);
    };
    img.onerror = () => {
      imgRef.current = null;
      if (canvasRef.current) drawOnCanvas(canvasRef.current, null);
    };
    img.src = mainImage;
  }, [mainImage, platform, useType, drawOnCanvas]);

  useEffect(() => {
    if (!platform || !useType || !canvasRef.current) return;
    drawOnCanvas(canvasRef.current, imgRef.current);
  }, [platform, useType, drawOnCanvas]);

  const handleGenerate = async () => {
    if (!canvasRef.current) return;
    setGenerating(true);
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = targetWidth;
      offscreen.height = targetHeight;

      let imgToUse: HTMLImageElement | null = imgRef.current;
      if (mainImage && !imgToUse) {
        imgToUse = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = mainImage;
        });
      }

      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('No se pudo obtener el contexto 2D');

      drawFlyerNative(
        ctx,
        targetWidth, targetHeight, design, flyerName, petDetails,
        pet.location, pet.contact_info, pet.description, pet.status,
        imgToUse, logoImg, styleIndex
      );

      const blob = await new Promise<Blob | null>(resolve => offscreen.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('No se pudo generar la imagen');

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${pet.name || 'mascota'}-${pet.status}-${platform}-${useType}.png`;
      link.href = url;
      link.click();

      if (isMobile && navigator.canShare) {
        try {
          const file = new File([blob], link.download, { type: 'image/png' });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: `${pet.name || 'Mascota'} - ${design.label}`, text: shareText });
          }
        } catch (shareErr) {
          if ((shareErr as any)?.name === 'AbortError') return;
          console.error('Share error:', shareErr);
        }
      }

      if (!isMobile) {
        if (platform === 'whatsapp') {
          window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
        } else if (platform === 'facebook') {
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(petUrl)}`, '_blank');
        }
      }

      URL.revokeObjectURL(url);

      setGenerated(true);
    } catch (e) {
      console.error('Error al generar:', e);
      alert('Error al generar el flyer. Probá de nuevo.');
    } finally {
      setGenerating(false);
    }
  };

  const platforms = [
    { id: 'whatsapp' as Platform, label: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500 hover:bg-emerald-600', bgColor: 'bg-emerald-50', textColor: 'text-emerald-600' },
    { id: 'facebook' as Platform, label: 'Facebook', icon: ImageIcon, color: 'bg-blue-600 hover:bg-blue-700', bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
    { id: 'instagram' as Platform, label: 'Instagram', icon: Camera, color: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400', bgColor: 'bg-pink-50', textColor: 'text-pink-600' },
  ];

  const getCurrentConfig = () => {
    if (!platform) return null;
    return platformConfigs.find(p => p.platform === platform);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-y-auto max-h-[90vh]"
      >
        <div className="p-6 sm:p-8 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50">
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-brand-primary">Flyer para Redes</h2>
          <button onClick={onClose} className="p-2 hover:bg-brand-accent rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {!platform ? (
            <div key="select">
              <p className="text-sm text-gray-500 mb-4 text-center">Seleccioná la red social para generar el flyer</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {platforms.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setPlatform(opt.id!)}
                    className={cn(
                      "group flex flex-col items-center gap-3 p-6 sm:p-8 rounded-[2rem] border border-brand-accent hover:shadow-xl hover:-translate-y-1 transition-all",
                      opt.bgColor
                    )}
                  >
                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg", opt.color)}>
                      <opt.icon className="w-7 h-7" />
                    </div>
                    <span className={cn("font-bold text-sm", opt.textColor)}>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : !useType ? (
            <div key="use-select">
              <button
                onClick={() => setPlatform(null)}
                className="flex items-center gap-2 text-sm text-gray-500 mb-4 hover:text-gray-700"
              >
                <ArrowLeft className="w-4 h-4" />
                Cambiar plataforma
              </button>
              <p className="text-center text-gray-600 mb-6">
                ¿Cómo vas a compartir en <span className="font-bold">{platforms.find(p => p.id === platform)?.label}</span>?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {getCurrentConfig()?.uses.map((use) => (
                  <button
                    key={use.id}
                    onClick={() => setUseType(use.id!)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-6 rounded-[2rem] border-2 border-brand-accent hover:shadow-xl hover:-translate-y-1 transition-all bg-brand-bg hover:bg-white",
                      platform === 'whatsapp' && "hover:border-emerald-500" ||
                      platform === 'facebook' && "hover:border-blue-500" ||
                      "hover:border-pink-500"
                    )}
                  >
                    <div className={cn(
                      "rounded-xl flex items-center justify-center font-bold text-white",
                      platform === 'whatsapp' ? "bg-emerald-500 w-12 h-12" :
                      platform === 'facebook' ? "bg-blue-600 w-12 h-12" :
                      "bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 w-12 h-12"
                    )}>
                      {use.aspectRatio}
                    </div>
                    <span className="font-bold text-brand-primary">{use.label}</span>
                    <span className="text-xs text-gray-500 text-center">{use.description}</span>
                    <span className="text-[10px] text-gray-400">{use.width}x{use.height} px</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div key={`${platform}-${useType}`} className="space-y-6">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setUseType(null)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Cambiar uso
                </button>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-brand-bg px-3 py-1 rounded-full">
                  {getCurrentConfig()?.uses.find(u => u.id === useType)?.aspectRatio}
                </span>
              </div>

              <div className="text-center">
                <p className="text-xs text-gray-400 mb-3 font-bold uppercase tracking-widest">Vista previa del flyer</p>
                <div className="rounded-3xl border-4 border-brand-accent shadow-xl mx-auto overflow-hidden" style={{ width: Math.round(targetWidth * previewScale), height: Math.round(targetHeight * previewScale) }}>
                  <canvas
                    ref={canvasRef}
                    className="block w-full h-full"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => { setUseType(null); setGenerated(false); }}
                  className="flex-1 py-3 border border-brand-accent text-gray-600 rounded-xl font-bold text-sm hover:bg-brand-bg transition-all"
                >
                  Cambiar formato
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
                  disabled={generating}
                  className={cn(
                    "flex-[2] py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white shadow-md hover:shadow-lg transition-all disabled:opacity-70",
                    platform === 'whatsapp' ? 'bg-emerald-500 hover:bg-emerald-600' :
                    platform === 'facebook' ? 'bg-blue-600 hover:bg-blue-700' :
                    'bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400'
                  )}
                >
                  {generating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                  ) : generated ? (
                    <><Download className="w-4 h-4" /> Descargar de nuevo</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Generar y compartir</>
                  )}
                </button>
              </div>

              {generated && (
                <div className="p-4 bg-green-50 rounded-2xl border border-green-200 text-center">
                  <p className="text-sm text-green-700 font-medium">
                    {isMobile
                      ? '✅ Flyer generado. Seleccioná la app para compartir.'
                      : platform === 'whatsapp'
                        ? '✅ Flyer descargado. Se abrió WhatsApp para compartir.'
                        : platform === 'facebook'
                          ? '✅ Flyer descargado. Se abrió Facebook para publicar.'
                          : '✅ Flyer descargado.'}
                  </p>
                </div>
              )}

              {platform === 'whatsapp' && (
                <p className="text-xs text-center text-gray-400">
                  {useType === 'story'
                    ? 'El flyer está optimizado para estados de WhatsApp (9:16).'
                    : 'El flyer está optimizado para compartir en chats (1:1).'}
                </p>
              )}
              {platform === 'facebook' && (
                <p className="text-xs text-center text-gray-400">
                  {useType === 'story'
                    ? 'El flyer está optimizado para historias de Facebook (9:16).'
                    : 'El flyer está optimizado para publicaciones en el feed (1:1).'}
                </p>
              )}
              {platform === 'instagram' && (
                <p className="text-xs text-center text-gray-400">
                  {useType === 'story'
                    ? 'El flyer está optimizado para historias y reels de Instagram (9:16).'
                    : 'El flyer está optimizado para publicaciones en el feed (4:5).'}
                </p>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
