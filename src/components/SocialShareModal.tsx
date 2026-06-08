import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Pet, getPetImageUrls } from '@/src/lib/petService';
import { X, MessageCircle, Camera, Download, Loader2, ImageIcon, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { statusDesigns, drawFlyer } from '@/src/lib/flyerRenderer';

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
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const petUrl = `${origin}/pet/${pet.id}`;
  const images = getPetImageUrls(pet);
  const mainImage = images[0] || null;
  const isMobile = typeof navigator !== 'undefined' && !!navigator.share;

  const { width: targetWidth, height: targetHeight, aspectRatio } = getDimensions(platform, useType);


  const design = statusDesigns[pet.status] || statusDesigns.lost;
  const flyerName = useMemo(() => pet.name || 'Sin nombre', [pet.name]);
  const shareText = petUrl;
  const petSpecies = pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species || '';
  const petGender = pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : '';
  const petDetails = useMemo(() => {
    const parts = [petSpecies, pet.breed, petGender, pet.age].filter(Boolean);
    return parts.join(' · ');
  }, [petSpecies, pet.breed, petGender, pet.age]);

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
    drawFlyer(ctx, targetWidth, targetHeight, design, {
      name: flyerName,
      status: pet.status,
      species: pet.species,
      breed: pet.breed,
      gender: pet.gender,
      age: pet.age,
      location: pet.location,
      contact_info: pet.contact_info,
      description: pet.description,
      instagram: (pet as any).instagram || undefined,
      case_number: (pet as any).case_number || undefined,
    }, img, logoImg);
  }, [targetWidth, targetHeight, design, flyerName, pet.status, pet.species, pet.breed, pet.gender, pet.age, pet.location, pet.contact_info, pet.description, (pet as any).instagram, (pet as any).case_number, logoImg]);

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
      let imgToUse: HTMLImageElement | null = imgRef.current;
      if (mainImage && !imgToUse) {
        imgToUse = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = mainImage;
        });
        drawOnCanvas(canvasRef.current, imgToUse);
      }

      const blob = await new Promise<Blob | null>(resolve => canvasRef.current!.toBlob(resolve, 'image/png'));
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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-brand-primary/30 backdrop-brightness-75" />
        <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-y-auto max-h-[90vh] user-select-none"
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
                <div className="rounded-3xl border-4 border-brand-accent shadow-xl mx-auto overflow-hidden pointer-events-none touch-none select-none" style={{ width: Math.round(targetWidth * previewScale), height: Math.round(targetHeight * previewScale) }}>
                  <canvas
                    ref={canvasRef}
                    className="block w-full h-full pointer-events-none select-none"
                    draggable={false}
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
                    <><Download className="w-4 h-4" /> Compartir</>
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
