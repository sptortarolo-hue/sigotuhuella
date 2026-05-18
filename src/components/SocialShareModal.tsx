import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Pet, getPetImageUrls } from '@/src/lib/petService';
import { X, MessageCircle, Camera, Download, Sparkles, Loader2, Image as ImageIcon, ArrowLeft, MapPin, Phone } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { fabric } from 'fabric';
import { removeBackground } from '@imgly/background-removal';

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

const statusConfig: Record<string, { label: string; gradient: [string, string]; textColor: string }> = {
  lost: { label: 'SE PERDIÓ', gradient: ['#dc2626', '#ea580c'], textColor: '#ffffff' },
  retained: { label: 'RETENIDO', gradient: ['#2563eb', '#06b6d4'], textColor: '#ffffff' },
  sighted: { label: 'AVISTADO', gradient: ['#d97706', '#f59e0b'], textColor: '#ffffff' },
  accidented: { label: 'ACCIDENTADO', gradient: ['#7c3aed', '#ec4899'], textColor: '#ffffff' },
  needs_attention: { label: 'NECESITA ATENCIÓN', gradient: ['#d97706', '#ea580c'], textColor: '#ffffff' },
  for_adoption: { label: 'EN ADOPCIÓN', gradient: ['#059669', '#0d9488'], textColor: '#ffffff' },
  adopted: { label: 'ADOPTADO', gradient: ['#16a34a', '#059669'], textColor: '#ffffff' },
  reunited: { label: 'REENCUENTRO', gradient: ['#16a34a', '#0891b2'], textColor: '#ffffff' },
};

const getDimensions = (platform: Platform, useType: UseType) => {
  if (!platform || !useType) return { width: 1080, height: 1080, aspectRatio: '1:1' };
  const config = platformConfigs.find(p => p.platform === platform);
  if (!config) return { width: 1080, height: 1080, aspectRatio: '1:1' };
  const use = config.uses.find(u => u.id === useType);
  if (!use) return { width: 1080, height: 1080, aspectRatio: '1:1' };
  return { width: use.width, height: use.height, aspectRatio: use.aspectRatio };
};

export default function SocialShareModal({ pet, onClose }: SocialShareModalProps) {
  const [platform, setPlatform] = useState<Platform>(null);
  const [useType, setUseType] = useState<UseType>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [bgRemoving, setBgRemoving] = useState(false);
  const [bgRemoved, setBgRemoved] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.StaticCanvas | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const petUrl = `${origin}/pet/${pet.id}`;
  const images = getPetImageUrls(pet);
  const mainImage = images[0] || null;
  const isMobile = typeof navigator !== 'undefined' && !!navigator.share;

  const { width: targetWidth, height: targetHeight, aspectRatio } = getDimensions(platform, useType);
  const isTall = aspectRatio === '9:16';

  const sc = statusConfig[pet.status] || statusConfig.lost;
  const flyerName = pet.name || 'Sin nombre';
  const hasImage = !!mainImage;
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

  const drawFlyer = useCallback(async (canvas: fabric.StaticCanvas, imageUrl: string | null) => {
    canvas.clear();
    canvas.setWidth(targetWidth);
    canvas.setHeight(targetHeight);

    // Gradient background
    const gradient = new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: 0, y2: targetHeight },
      colorStops: [
        { offset: 0, color: sc.gradient[0] },
        { offset: 1, color: sc.gradient[1] },
      ],
    });
    canvas.backgroundColor = gradient;

    const pad = targetWidth * 0.05;
    const statusFontSize = targetWidth * 0.07;
    const nameFontSize = targetWidth * 0.05;
    const infoFontSize = targetWidth * 0.03;
    const descFontSize = targetWidth * 0.025;
    const brandFontSize = targetWidth * 0.018;

    let currentY = pad;

    // Status text
    const statusText = new fabric.Text(sc.label, {
      left: pad,
      top: currentY,
      fontSize: statusFontSize,
      fontWeight: '900',
      fill: sc.textColor,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'left',
    });
    canvas.add(statusText);
    currentY += statusText.height! + targetHeight * 0.03;

    // Pet image area
    const imageAreaHeight = targetHeight * (isTall ? 0.45 : 0.40);
    const imageAreaTop = currentY;

    if (imageUrl) {
      await new Promise<void>((resolve) => {
        fabric.Image.fromURL(imageUrl, (img) => {
          const maxW = targetWidth - pad * 2;
          const maxH = imageAreaHeight;
          const scale = Math.min(maxW / img.width!, maxH / img.height!, 1);
          img.scale(scale);
          img.set({
            left: (targetWidth - img.getScaledWidth()) / 2,
            top: imageAreaTop,
            originX: 'left',
            originY: 'top',
          });
          canvas.add(img);
          resolve();
        }, { crossOrigin: 'anonymous' });
      });
    } else {
      // Placeholder icon
      const placeholder = new fabric.Circle({
        radius: targetWidth * 0.12,
        left: (targetWidth - targetWidth * 0.24) / 2,
        top: imageAreaTop + (imageAreaHeight - targetWidth * 0.24) / 2,
        fill: 'rgba(255,255,255,0.2)',
      });
      canvas.add(placeholder);
    }

    currentY = imageAreaTop + imageAreaHeight + targetHeight * 0.03;

    // Pet name
    const nameText = new fabric.Text(flyerName, {
      left: pad,
      top: currentY,
      fontSize: nameFontSize,
      fontWeight: '800',
      fill: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    });
    canvas.add(nameText);
    currentY += nameText.height! + targetHeight * 0.02;

    // Location
    const locationText = new fabric.Text(`📍 ${pet.location || 'Sin ubicación'}`, {
      left: pad,
      top: currentY,
      fontSize: infoFontSize,
      fontWeight: '600',
      fill: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    });
    canvas.add(locationText);
    currentY += locationText.height! + targetHeight * 0.01;

    // Contact
    if (hasContact) {
      const contactText = new fabric.Text(`📞 ${pet.contact_info}`, {
        left: pad,
        top: currentY,
        fontSize: infoFontSize,
        fontWeight: '600',
        fill: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      });
      canvas.add(contactText);
      currentY += contactText.height! + targetHeight * 0.01;
    }

    // Description (for adoption)
    if (hasDescription && pet.status === 'for_adoption') {
      const descText = new fabric.Text(`"${pet.description}"`, {
        left: pad,
        top: currentY,
        fontSize: descFontSize,
        fontStyle: 'italic',
        fill: 'rgba(255,255,255,0.85)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      });
      canvas.add(descText);
      currentY += descText.height! + targetHeight * 0.02;
    }

    // Brand bar at bottom
    const brandBarHeight = targetHeight * 0.08;
    const brandBarTop = targetHeight - brandBarHeight;

    // Semi-transparent bar
    const brandBar = new fabric.Rect({
      left: 0,
      top: brandBarTop,
      width: targetWidth,
      height: brandBarHeight,
      fill: 'rgba(0,0,0,0.3)',
    });
    canvas.add(brandBar);

    // Brand text
    const brandText = new fabric.Text('SIGO TU HUELLA', {
      left: targetWidth / 2,
      top: brandBarTop + brandBarHeight / 2,
      fontSize: brandFontSize,
      fontWeight: '900',
      fill: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      charSpacing: 200,
    });
    canvas.add(brandText);

    canvas.renderAll();
  }, [targetWidth, targetHeight, isTall, sc, flyerName, pet.location, pet.contact_info, pet.description, pet.status, hasContact, hasDescription]);

  // Initialize and render canvas
  useEffect(() => {
    if (!platform || !useType || !canvasRef.current) return;

    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
    }

    const canvas = new fabric.StaticCanvas(canvasRef.current, {
      width: targetWidth,
      height: targetHeight,
      backgroundColor: '#ffffff',
    });
    fabricCanvasRef.current = canvas;

    const imageToUse = processedImage || mainImage;
    drawFlyer(canvas, imageToUse);
  }, [platform, useType, processedImage, mainImage, drawFlyer]);

  const handleGenerate = async () => {
    if (!fabricCanvasRef.current) return;
    setGenerating(true);
    try {
      // Re-render at full quality
      const imageToUse = processedImage || mainImage;
      await drawFlyer(fabricCanvasRef.current, imageToUse);

      const dataUrl = fabricCanvasRef.current.toDataURL({
        format: 'png',
        quality: 1,
        multiplier: 1,
      });

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
            await navigator.share({ files: [file], title: `${pet.name || 'Mascota'} - ${sc.label}`, text: shareText });
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
