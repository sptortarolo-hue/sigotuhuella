import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Pet, getPetImageUrls } from '@/src/lib/petService';
import { X, MessageCircle, Camera, Download, Loader2, ArrowLeft, Copy, Check, Share2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { getSharePreview, logShareConfirmation, getFbSearchGroups } from '@/src/lib/volunteerService';

type Platform = 'whatsapp' | 'facebook' | 'instagram';

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  lost: { label: 'SE PERDIO', color: '#EF4444' },
  retained: { label: 'RETENIDO', color: '#2563EB' },
  sighted: { label: 'AVISTADO', color: '#2563EB' },
  accidented: { label: 'ACCIDENTADO', color: '#EA580C' },
  needs_attention: { label: 'NECESITA ATENCION', color: '#D97706' },
  for_adoption: { label: 'EN ADOPCION', color: '#8B5CF6' },
  for_adoption_simple: { label: 'EN ADOPCION', color: '#F97316' },
  adopted: { label: 'ADOPTADO', color: '#10B981' },
  reunited: { label: 'REENCUENTRO', color: '#10B981' },
  transitada: { label: 'EN TRANSITO', color: '#0D9488' },
};

const PLATFORMS = [
  { id: 'whatsapp' as Platform, label: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500', bgColor: 'bg-emerald-50', textColor: 'text-emerald-600' },
  { id: 'facebook' as Platform, label: 'Facebook', icon: Camera, color: 'bg-blue-600', bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
  { id: 'instagram' as Platform, label: 'Instagram', icon: Camera, color: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400', bgColor: 'bg-pink-50', textColor: 'text-pink-600' },
];

function getFormatForPlatform(p: Platform) {
  if (p === 'instagram') return { w: 1080, h: 1350, label: '4:5' };
  return { w: 1080, h: 1080, label: '1:1' };
}

interface SharePostModalProps {
  pet: Pet;
  onClose: () => void;
}

interface PreviewData {
  platform: Platform;
  blob: Blob;
  url: string;
  caption: string;
}

function PlatformSelection({ onSelect }: { onSelect: (p: Platform) => void }) {
  return (
    <motion.div
      key="selection"
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className="relative w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="font-bold text-lg text-brand-dark">Compartir en Redes</h3>
      </div>
      <div className="p-5">
        <p className="text-sm text-gray-500 mb-4">Selecciona las plataformas donde quieres compartir:</p>
        <div className="space-y-2">
          {PLATFORMS.map(p => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-gray-300 transition"
              >
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white", p.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="font-medium text-gray-700">{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="p-4 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-400 text-center">Las imagenes se generan automaticamente con el formato ideal de cada red</p>
      </div>
    </motion.div>
  );
}

function CaptionScreen({
  pet,
  selectedPlatforms,
  captions,
  captionsLoading,
  captionsError,
  generating,
  generated,
  preview,
  onBack,
  onClose,
  onGenerate,
  onShare,
  onCancelPreview,
  onCopyCaption,
  onReorderPlatform,
  captionCopied,
  statusStyle,
}: {
  pet: Pet;
  selectedPlatforms: Platform[];
  captions: Record<string, string>;
  captionsLoading: boolean;
  captionsError: string | null;
  generating: string | null;
  generated: Record<string, boolean>;
  preview: PreviewData | null;
  onBack: () => void;
  onClose: () => void;
  onGenerate: (p: Platform) => void;
  onShare: (p: Platform) => void;
  onCancelPreview: () => void;
  onCopyCaption: (p: Platform) => void;
  onReorderPlatform: (p: Platform) => void;
  captionCopied: string | null;
  statusStyle: { label: string; color: string };
}) {
  if (preview) {
    return (
      <motion.div
        key="preview"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-bold text-lg text-brand-dark">Vista previa - {PLATFORMS.find(p => p.id === preview.platform)?.label}</h3>
          <button onClick={onCancelPreview} className="p-1 rounded-full hover:bg-gray-100 transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 flex-1">
          <div className="flex flex-col items-center gap-4 mb-5">
            <img src={preview.url} alt="Preview" className="max-w-full max-h-[50vh] rounded-xl shadow-lg" />
            <div className="w-full max-w-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-brand-dark">{PLATFORMS.find(p => p.id === preview.platform)?.label}</span>
                <button
                  onClick={() => onCopyCaption(preview.platform)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  {captionCopied === preview.platform ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {captionCopied === preview.platform ? 'Copiado' : 'Copiar caption'}
                </button>
              </div>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 p-3 rounded-xl">{preview.caption}</pre>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => onShare(preview.platform)}
              disabled={generating === preview.platform}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white bg-emerald-500 hover:bg-emerald-600 transition disabled:opacity-60"
            >
              {generating === preview.platform ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              Compartir
            </button>
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.download = (pet.name || 'mascota') + '-' + preview.platform + '-post.jpg';
                link.href = preview.url;
                link.click();
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition"
            >
              <Download className="w-4 h-4" />
              Descargar
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="caption"
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 rounded-full hover:bg-gray-100 transition">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <h3 className="font-bold text-lg text-brand-dark">Compartir en Redes</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 transition">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="overflow-y-auto p-4 sm:p-5 flex-1">
        <div className="flex gap-3 mb-5 overflow-x-auto pb-2">
          {Array.from(new Set(selectedPlatforms)).map((p, idx) => {
            const cfg = PLATFORMS.find(x => x.id === p)!;
            const Icon = cfg.icon;
            const isActive = idx === 0;
            return (
              <button
                key={p}
                onClick={() => idx > 0 && onReorderPlatform(p)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-medium whitespace-nowrap transition-all",
                  isActive
                    ? cfg.bgColor + " border-current shadow-lg " + cfg.textColor
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                )}
              >
                <Icon className="w-4 h-4" />
                {cfg.label}
                {generated[p] && <Check className="w-4 h-4 text-green-500" />}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {captionsLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-center gap-2 py-8 text-gray-400"
            >
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Generando caption para cada plataforma...</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {captionsError && !captionsLoading && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm"
            >
              {captionsError}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!captionsLoading && !captionsError && (
            <motion.div
              key="captions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3 mb-5"
            >
              {selectedPlatforms.map(p => {
                const cfg = PLATFORMS.find(x => x.id === p)!;
                const caption = captions[p];
                if (!caption) return null;
                return (
                  <div key={p} className="border border-gray-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn("text-xs font-bold uppercase", cfg.textColor)}>{cfg.label}</span>
                      <button
                        onClick={() => onCopyCaption(p)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition"
                      >
                        {captionCopied === p ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {captionCopied === p ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{caption}</pre>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="border-t border-gray-100 p-4 bg-gray-50 rounded-b-2xl">
        <div className="flex flex-col sm:flex-row gap-2">
          {selectedPlatforms.map(p => {
            const cfg = PLATFORMS.find(x => x.id === p)!;
            const isGenerating = generating === p;
            return (
              <button
                key={p}
                onClick={() => onGenerate(p)}
                disabled={isGenerating}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white transition",
                  cfg.color,
                  isGenerating && "opacity-60 cursor-not-allowed"
                )}
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : generated[p] ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {cfg.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-2">Genera la imagen para ver vista previa y compartir</p>
      </div>
    </motion.div>
  );
}

export default function SharePostModal({ pet, onClose }: SharePostModalProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [captionsLoading, setCaptionsLoading] = useState(false);
  const [captionsError, setCaptionsError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [captionCopied, setCaptionCopied] = useState<string | null>(null);
  const [showGroupSelector, setShowGroupSelector] = useState<Platform | null>(null);
  const [suggestedGroups, setSuggestedGroups] = useState<{ id: string; group_name: string; group_url: string }[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<{ name: string; url?: string }[]>([]);
  const [customGroupName, setCustomGroupName] = useState('');
  const [shareSaved, setShareSaved] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const images = getPetImageUrls(pet);
  const mainImage = images[0] || null;
  const isMobile = typeof navigator !== 'undefined' && !!navigator.share;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const petUrl = origin + '/pet/' + pet.id;
  const statusStyle = STATUS_STYLES[pet.status] || { label: 'MASCOTA', color: '#6B7280' };

  useEffect(() => {
    if (selectedPlatforms.length === 0) return;
    setCaptionsLoading(true);
    setCaptionsError(null);
    getSharePreview(pet.id)
      .then(data => setCaptions(data))
      .catch(e => {
        console.error('Share preview error:', e);
        setCaptionsError('No se pudieron cargar los textos. Podés generar la imagen igual.');
      })
      .finally(() => setCaptionsLoading(false));
  }, [pet.id, selectedPlatforms.length]);

  useEffect(() => {
    const logo = new Image();
    logo.crossOrigin = 'anonymous';
    logo.onload = () => setLogoImg(logo);
    logo.src = '/sigotuhuella.jpg';
  }, []);

  useEffect(() => {
    if (showGroupSelector === 'facebook') {
      getFbSearchGroups().then(groups => setSuggestedGroups(groups || [])).catch(() => {});
    }
  }, [showGroupSelector]);

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const loadMainImage = async (): Promise<HTMLImageElement> => {
    if (imgRef.current) return imgRef.current;
    if (!mainImage) throw new Error('No hay imagen disponible');
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { imgRef.current = img; resolve(img); };
      img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
      img.src = mainImage;
    });
  };

  const drawPostImage = async (canvas: HTMLCanvasElement, w: number, h: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');
    canvas.width = w;
    canvas.height = h;
    const img = await loadMainImage();
    const barH = Math.round(h * 0.067);
    const logoSize = Math.round(w * 0.074);
    const logoPad = Math.round(w * 0.015);
    ctx.filter = 'blur(20px)';
    const bgRatio = Math.max(w / img.width, h / img.height);
    const bgW = img.width * bgRatio;
    const bgH = img.height * bgRatio;
    ctx.drawImage(img, (w - bgW) / 2, (h - bgH) / 2, bgW, bgH);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, w, h);
    const fgRatio = Math.min(w / img.width, h / img.height);
    const fgW = img.width * fgRatio;
    const fgH = img.height * fgRatio;
    ctx.drawImage(img, (w - fgW) / 2, (h - fgH) / 2, fgW, fgH);
    ctx.fillStyle = statusStyle.color;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(0, h - barH, w, barH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold ' + Math.round(barH * 0.4) + 'px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(statusStyle.label, w / 2, h - barH / 2);
    if (logoImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(w - logoPad - logoSize / 2, logoPad + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, w - logoPad - logoSize, logoPad, logoSize, logoSize);
      ctx.restore();
    }
  };

  const handleGenerate = async (platform: Platform) => {
    if (!canvasRef.current) {
      alert('Canvas no listo. Intentá de nuevo en un momento.');
      return;
    }
    setGenerating(platform);
    try {
      const { w, h } = getFormatForPlatform(platform);
      await drawPostImage(canvasRef.current, w, h);
      const blob = await new Promise<Blob | null>(resolve => canvasRef.current!.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('No se pudo generar la imagen (blob null)');
      const url = URL.createObjectURL(blob);
      setPreview({
        platform,
        blob,
        url,
        caption: captions[platform] || petUrl,
      });
      setGenerated(prev => ({ ...prev, [platform]: true }));
    } catch (e) {
      console.error('Error generando imagen:', e);
      alert('Error al generar la imagen: ' + (e as Error).message);
    } finally {
      setGenerating(null);
    }
  };

  const handleShare = async (platform: Platform) => {
    if (!preview || preview.platform !== platform) return;
    setGenerating(platform);
    try {
      const file = new File([preview.blob], (pet.name || 'mascota') + '-' + platform + '-post.jpg', { type: 'image/jpeg' });
      const shareData = {
        title: (pet.name || 'Mascota') + ' - ' + statusStyle.label,
        text: preview.caption,
        url: petUrl,
        files: [file],
      };

      if (isMobile && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        // Desktop fallback
        if (platform === 'whatsapp') {
          window.open('https://wa.me/?text=' + encodeURIComponent(preview.caption + '\n\n' + petUrl), '_blank');
        } else if (platform === 'facebook') {
          window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(petUrl) + '&quote=' + encodeURIComponent(preview.caption), '_blank');
        } else if (platform === 'instagram') {
          await navigator.clipboard.writeText(preview.caption);
          alert('Caption copiado. La imagen está lista. Abrí Instagram, creá post nuevo, pegá el texto y subí la imagen.');
          window.open('https://www.instagram.com', '_blank', 'noopener,noreferrer');
        }
      }
      if (platform === 'facebook') setShowGroupSelector('facebook');
    } catch (e) {
      if ((e as any)?.name !== 'AbortError') {
        console.error('Share error:', e);
      }
    } finally {
      setGenerating(null);
    }
  };

  const cancelPreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const copyCaption = async (platform: Platform) => {
    try {
      await navigator.clipboard.writeText(captions[platform] || '');
      setCaptionCopied(platform);
      setTimeout(() => setCaptionCopied(null), 2000);
    } catch { }
  };

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms(prev => {
      const next = prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p];
      // dedupe por si acaso
      return [...new Set(next)];
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[90vh] flex flex-col"
      >
        <AnimatePresence mode="wait">
          {selectedPlatforms.length === 0 ? (
            <PlatformSelection key="selection-screen" onSelect={togglePlatform} />
          ) : (
            <CaptionScreen
              key="caption-screen"
              pet={pet}
              selectedPlatforms={selectedPlatforms}
              captions={captions}
              captionsLoading={captionsLoading}
              captionsError={captionsError}
              generating={generating}
              generated={generated}
              preview={preview}
              onBack={() => setSelectedPlatforms([])}
              onClose={onClose}
              onGenerate={handleGenerate}
              onShare={handleShare}
              onCancelPreview={cancelPreview}
              onCopyCaption={copyCaption}
              onReorderPlatform={p => setSelectedPlatforms(prev => [p, ...prev.filter(x => x !== p)])}
              captionCopied={captionCopied}
              statusStyle={statusStyle}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}