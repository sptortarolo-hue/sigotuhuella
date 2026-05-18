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
      { id: 'story', label: 'Estado', description: 'Para estados de WhatsApp', aspectRatio: '9:16', width: 752, height: 1334 },
      { id: 'post', label: 'Imagen/Chat', description: 'Para enviar en chats', aspectRatio: '1:1', width: 800, height: 800 }
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
  gradient: [string, string];
  badgeBg: string;
  category: 'urgent' | 'positive' | 'adoption' | 'info';
}

const statusDesigns: Record<string, DesignConfig> = {
  lost: { label: 'SE PERDIÓ', gradient: ['#dc2626', '#ea580c'], badgeBg: 'rgba(220,38,38,0.9)', category: 'urgent' },
  retained: { label: 'RETENIDO', gradient: ['#2563eb', '#06b6d4'], badgeBg: 'rgba(37,99,235,0.9)', category: 'info' },
  sighted: { label: 'AVISTADO', gradient: ['#d97706', '#f59e0b'], badgeBg: 'rgba(217,119,6,0.9)', category: 'info' },
  accidented: { label: 'ACCIDENTADO', gradient: ['#7c3aed', '#ec4899'], badgeBg: 'rgba(124,58,237,0.9)', category: 'urgent' },
  needs_attention: { label: 'NECESITA ATENCIÓN', gradient: ['#d97706', '#ea580c'], badgeBg: 'rgba(217,119,6,0.9)', category: 'urgent' },
  for_adoption: { label: 'EN ADOPCIÓN', gradient: ['#7c3aed', '#06b6d4'], badgeBg: 'rgba(124,58,237,0.9)', category: 'adoption' },
  adopted: { label: '¡ADOPTADO!', gradient: ['#16a34a', '#0891b2'], badgeBg: 'rgba(22,163,74,0.9)', category: 'positive' },
  reunited: { label: '¡REENCUENTRO!', gradient: ['#16a34a', '#0891b2'], badgeBg: 'rgba(22,163,74,0.9)', category: 'positive' },
};

const getDimensions = (platform: Platform, useType: UseType) => {
  if (!platform || !useType) return { width: 1080, height: 1080, aspectRatio: '1:1' };
  const config = platformConfigs.find(p => p.platform === platform);
  if (!config) return { width: 1080, height: 1080, aspectRatio: '1:1' };
  const use = config.uses.find(u => u.id === useType);
  if (!use) return { width: 1080, height: 1080, aspectRatio: '1:1' };
  return { width: use.width, height: use.height, aspectRatio: use.aspectRatio };
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

function drawFlyerNative(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  design: DesignConfig,
  name: string,
  location: string | undefined,
  contactInfo: string | undefined,
  description: string | undefined,
  status: string,
  img: HTMLImageElement | null
) {
  ctx.clearRect(0, 0, w, h);

  // === BACKGROUND GRADIENT ===
  const bgGrad = ctx.createLinearGradient(0, 0, w * 0.3, h);
  bgGrad.addColorStop(0, design.gradient[0]);
  bgGrad.addColorStop(1, design.gradient[1]);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // === GEOMETRIC DECORATIONS ===
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#ffffff';

  // Large circles
  ctx.beginPath();
  ctx.arc(w * 0.85, h * 0.12, w * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.1, h * 0.88, w * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Small accent circles
  ctx.beginPath();
  ctx.arc(w * 0.75, h * 0.75, w * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.2, h * 0.15, w * 0.06, 0, Math.PI * 2);
  ctx.fill();

  // Diagonal lines for urgent category
  if (design.category === 'urgent') {
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = -h; i < w + h; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
  }

  // Dots pattern for adoption category
  if (design.category === 'adoption') {
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffffff';
    for (let x = w * 0.6; x < w * 0.95; x += 25) {
      for (let y = h * 0.5; y < h * 0.85; y += 25) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Wave for positive category
  if (design.category === 'positive') {
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x < w; x += 5) {
      const y = h * 0.9 + Math.sin(x * 0.02) * 20;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.globalAlpha = 1;

  // === LAYOUT CALCULATIONS ===
  const pad = w * 0.06;
  const isTall = h > w;

  // Photo area
  const photoRadius = isTall ? w * 0.22 : w * 0.25;
  const photoCx = w / 2;
  const photoCy = isTall ? h * 0.28 : h * 0.32;

  // === PET PHOTO (circular with border + shadow) ===
  if (img) {
    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = photoRadius * 0.4;
    ctx.shadowOffsetY = photoRadius * 0.15;

    // Clip circle
    ctx.beginPath();
    ctx.arc(photoCx, photoCy, photoRadius, 0, Math.PI * 2);
    ctx.clip();

    // Draw image centered and cropped
    const imgAspect = img.naturalWidth / img.naturalHeight;
    let drawW: number, drawH: number, drawX: number, drawY: number;
    if (imgAspect > 1) {
      drawH = photoRadius * 2.2;
      drawW = drawH * imgAspect;
    } else {
      drawW = photoRadius * 2.2;
      drawH = drawW / imgAspect;
    }
    drawX = photoCx - drawW / 2;
    drawY = photoCy - drawH / 2;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    // White border
    ctx.beginPath();
    ctx.arc(photoCx, photoCy, photoRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(4, w * 0.006);
    ctx.stroke();
  } else {
    // Placeholder
    ctx.beginPath();
    ctx.arc(photoCx, photoCy, photoRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Paw icon placeholder
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `${photoRadius * 0.8}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐾', photoCx, photoCy);
  }

  // === STATUS BADGE ===
  const badgeFontSize = w * 0.035;
  ctx.font = `800 ${badgeFontSize}px system-ui, -apple-system, sans-serif`;
  const badgeText = design.label;
  const badgeTextW = ctx.measureText(badgeText).width;
  const badgePadX = w * 0.04;
  const badgePadY = w * 0.015;
  const badgeW = badgeTextW + badgePadX * 2;
  const badgeH = badgeFontSize + badgePadY * 2;
  const badgeX = (w - badgeW) / 2;
  const badgeY = photoCy + photoRadius + w * 0.04;

  // Badge background
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();

  // Badge text
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, w / 2, badgeY + badgeH / 2);

  // === PET NAME ===
  const nameY = badgeY + badgeH + w * 0.04;
  const nameFontSize = w * 0.07;
  ctx.font = `800 ${nameFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Text shadow for depth
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillText(name, w / 2, nameY);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // === INFO SECTION ===
  let infoY = nameY + nameFontSize * 1.3;
  const infoFontSize = w * 0.03;
  ctx.font = `500 ${infoFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center';

  if (location) {
    ctx.fillText(`📍 ${location}`, w / 2, infoY);
    infoY += infoFontSize * 1.6;
  }

  if (contactInfo) {
    ctx.fillText(`📞 ${contactInfo}`, w / 2, infoY);
    infoY += infoFontSize * 1.6;
  }

  // Description for adoption
  if (description && status === 'for_adoption') {
    const descFontSize = w * 0.025;
    ctx.font = `italic 500 ${descFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const maxDescW = w * 0.7;
    const words = description.split(' ');
    let line = '';
    let descY = infoY;
    for (const word of words) {
      const testLine = line + word + ' ';
      if (ctx.measureText(testLine).width > maxDescW && line) {
        ctx.fillText(line.trim(), w / 2, descY);
        line = word + ' ';
        descY += descFontSize * 1.4;
      } else {
        line = testLine;
      }
    }
    if (line.trim()) {
      ctx.fillText(line.trim(), w / 2, descY);
    }
  }

  // === BRAND BAR (minimalist) ===
  const brandY = h - h * 0.08;

  // Separator line
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.2, brandY);
  ctx.lineTo(w * 0.8, brandY);
  ctx.stroke();

  // Brand text
  const brandFontSize = w * 0.02;
  ctx.font = `700 ${brandFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'center';
  ctx.fillText('🐾  SIGO TU HUELLA', w / 2, brandY + brandFontSize * 1.5);
}

export default function SocialShareModal({ pet, onClose }: SocialShareModalProps) {
  const [platform, setPlatform] = useState<Platform>(null);
  const [useType, setUseType] = useState<UseType>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [bgRemoving, setBgRemoving] = useState(false);
  const [bgRemoved, setBgRemoved] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const petUrl = `${origin}/pet/${pet.id}`;
  const images = getPetImageUrls(pet);
  const mainImage = images[0] || null;
  const isMobile = typeof navigator !== 'undefined' && !!navigator.share;

  const { width: targetWidth, height: targetHeight, aspectRatio } = getDimensions(platform, useType);

  const design = statusDesigns[pet.status] || statusDesigns.lost;
  const flyerName = pet.name || 'Sin nombre';
  const hasContact = !!pet.contact_info;
  const hasDescription = !!pet.description;
  const shareText = petUrl;

  const previewScale = Math.min(280 / targetWidth, 400 / targetHeight, 1);

  // Background removal
  useEffect(() => {
    if (!mainImage || processedImage) return;
    let cancelled = false;
    const processImage = async () => {
      setBgRemoving(true);
      try {
        const response = await fetch(mainImage);
        const blob = await response.blob();
        const { removeBackground } = await import('@imgly/background-removal');
        const resultBlob = await removeBackground(blob);
        if (!cancelled) {
          const url = URL.createObjectURL(resultBlob);
          setProcessedImage(url);
          setBgRemoved(true);
        }
      } catch (e) {
        console.error('BG removal failed, using original:', e);
        if (!cancelled) {
          setProcessedImage(mainImage);
          setBgRemoved(true);
        }
      } finally {
        if (!cancelled) setBgRemoving(false);
      }
    };
    processImage();
    return () => { cancelled = true; };
  }, [mainImage]);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (processedImage && processedImage.startsWith('blob:')) {
        URL.revokeObjectURL(processedImage);
      }
    };
  }, [processedImage]);

  // Load image and draw on canvas
  const drawOnCanvas = useCallback((canvas: HTMLCanvasElement, img: HTMLImageElement | null) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    drawFlyerNative(ctx, targetWidth, targetHeight, design, flyerName, pet.location, pet.contact_info, pet.description, pet.status, img);
  }, [targetWidth, targetHeight, design, flyerName, pet.location, pet.contact_info, pet.description, pet.status]);

  useEffect(() => {
    const imageUrl = processedImage || mainImage;
    if (!imageUrl || !platform || !useType) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      if (canvasRef.current) drawOnCanvas(canvasRef.current, img);
    };
    img.onerror = () => {
      imgRef.current = null;
      if (canvasRef.current) drawOnCanvas(canvasRef.current, null);
    };
    img.src = imageUrl;
  }, [processedImage, mainImage, platform, useType, drawOnCanvas]);

  // Initial draw without image
  useEffect(() => {
    if (!platform || !useType || !canvasRef.current) return;
    drawOnCanvas(canvasRef.current, imgRef.current);
  }, [platform, useType, drawOnCanvas]);

  const handleGenerate = async () => {
    if (!canvasRef.current) return;
    setGenerating(true);
    try {
      const imageUrl = processedImage || mainImage;

      // Create offscreen canvas for export
      const offscreen = document.createElement('canvas');
      offscreen.width = targetWidth;
      offscreen.height = targetHeight;

      let imgToUse: HTMLImageElement | null = imgRef.current;
      if (imageUrl && !imgToUse) {
        imgToUse = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = imageUrl;
        });
      }

      drawFlyerNative(
        offscreen.getContext('2d')!,
        targetWidth, targetHeight, design, flyerName,
        pet.location, pet.contact_info, pet.description, pet.status,
        imgToUse
      );

      const dataUrl = offscreen.toDataURL('image/png', 1.0);

      const link = document.createElement('a');
      link.download = `${pet.name || 'mascota'}-${pet.status}-${platform}-${useType}.png`;
      link.href = dataUrl;
      link.click();

      if (isMobile && navigator.canShare) {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
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
                {bgRemoving ? (
                  <div className="flex flex-col items-center gap-3 py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-brand-secondary" />
                    <p className="text-sm text-gray-500">Procesando imagen con IA...</p>
                  </div>
                ) : (
                  <div className="rounded-3xl border-4 border-brand-accent shadow-xl mx-auto overflow-hidden" style={{ width: Math.round(targetWidth * previewScale), height: Math.round(targetHeight * previewScale) }}>
                    <canvas
                      ref={canvasRef}
                      className="block w-full h-full"
                    />
                  </div>
                )}
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
                  disabled={generating || bgRemoving}
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

              {bgRemoved && (
                <p className="text-xs text-center text-gray-400">
                  ✨ Fondo de la foto removido automáticamente con IA
                </p>
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
