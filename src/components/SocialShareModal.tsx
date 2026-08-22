import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Pet, getPetImageUrls, getPublicContact } from '@/src/lib/petService';
import { X, MessageCircle, Camera, Download, Loader2, ImageIcon, ArrowLeft, Copy, Check, Users, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { statusDesigns, drawFlyer } from '@/src/lib/flyerRenderer';
import { logShare, logShareConfirmation, getFbSearchGroups } from '@/src/lib/volunteerService';

type Platform = 'whatsapp' | 'facebook' | 'instagram' | null;
type UseType = 'story' | 'post' | null;

const STATUS_LABELS: Record<string, string> = {
  lost: '🚨 MASCOTA PERDIDA',
  sighted: '👁️ AVISTAMIENTO',
  retained: '🏠 MASCOTA RETENIDA',
  accidented: '⚠️ MASCOTA ACCIDENTADA',
  for_adoption: '💛 EN ADOPCIÓN',
  for_adoption_simple: '💛 EN ADOPCIÓN',
  reunited: '💚 REENCONTRADA',
  adopted: '💚 ADOPTADA',
  transitada: '🐾 EN TRÁNSITO',
  needs_attention: '🆘 NECESITA ATENCIÓN',
};

const SPECIES_LABELS: Record<string, string> = { dog: 'Perro', cat: 'Gato', other: 'Mascota' };
const GENDER_LABELS: Record<string, string> = { male: 'Macho', female: 'Hembra', unknown: '' };

function buildCaption(pet: Pet): string {
  const statusTag = STATUS_LABELS[pet.status] || '🐾 MASCOTA';
  const species = SPECIES_LABELS[pet.species] || 'Mascota';
  const gender = GENDER_LABELS[pet.gender] || '';
  const parts = [
    statusTag,
    pet.case_number ? `🔖 Caso: ${pet.case_number}` : '',
    pet.name ? `Nombre: ${pet.name}` : '',
    `${species}${pet.breed ? ' - ' + pet.breed : ''}`,
    gender ? `${gender}${pet.age ? ` · ${pet.age}` : ''}` : (pet.age || ''),
    pet.color ? `🎨 ${pet.color}` : '',
    pet.location ? `📍 ${pet.location}${pet.contact_info ? ` · ${pet.contact_info}` : ''}` : (pet.contact_info ? `📞 ${pet.contact_info}` : ''),
    '',
    pet.description ? pet.description.substring(0, 400) : '',
    '',
    `🔗 ${window.location.origin}/pet/${pet.id}`,
  ];
  return parts.filter(Boolean).join('\n');
}

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
  const [captionCopied, setCaptionCopied] = useState(false);
  const [showGroupSelector, setShowGroupSelector] = useState(false);
  const [suggestedGroups, setSuggestedGroups] = useState<{ id: string; group_name: string; group_url: string }[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<{ name: string; url?: string }[]>([]);
  const [customGroupName, setCustomGroupName] = useState('');
  const [shareSaved, setShareSaved] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
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

  const caption = useMemo(() => buildCaption(pet), [pet]);

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCaptionCopied(true);
      setTimeout(() => setCaptionCopied(false), 2000);
    } catch { }
  };

  // Load brand logo
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setLogoImg(img);
    img.onerror = () => setLogoImg(null);
    img.src = '/sigotuhuella.jpg';
  }, []);

  // Load suggested FB groups from volunteer subscriptions
  useEffect(() => {
    let alive = true;
    getFbSearchGroups().then(groups => {
      if (alive) setSuggestedGroups(groups || []);
    }).catch(() => {});
    return () => { alive = false; };
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
      contact_info: getPublicContact(pet).value,
      description: pet.description,
      instagram: undefined,
      case_number: (pet as any).case_number || undefined,
    }, img, logoImg);
  }, [targetWidth, targetHeight, design, flyerName, pet.status, pet.species, pet.breed, pet.gender, pet.age, pet.location, pet.contact_info, pet.description, (pet as any).case_number, logoImg]);

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

              <div className="bg-brand-bg rounded-2xl p-4 border border-brand-accent">
                <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">Texto para copiar</p>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-32 overflow-y-auto">{caption}</pre>
                <button
                  onClick={copyCaption}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary rounded-xl text-xs font-bold transition-all"
                >
                  {captionCopied ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar texto</>}
                </button>
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
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 rounded-2xl border border-green-200 text-center">
                    <p className="text-sm text-green-700 font-medium">
                      {isMobile
                        ? '✅ Imagen lista. Seleccioná la app para compartir.'
                        : platform === 'whatsapp'
                          ? '✅ Imagen descargada. Se abrió WhatsApp para compartir.'
                          : platform === 'facebook'
                            ? '✅ Imagen descargada. Se abrió Facebook para publicar.'
                            : '✅ Imagen descargada.'}
                    </p>
                  </div>

                  {/* Selector de grupos */}
                  <div className="bg-brand-bg rounded-2xl p-4 border border-brand-accent">
                    <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-widest flex items-center gap-2">
                      <Users className="w-3.5 h-3.5" /> ¿En qué grupo compartiste?
                    </p>
                    <p className="text-[11px] text-gray-400 mb-3">Seleccioná los grupos donde publicaste (opcional)</p>

                    {suggestedGroups.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {suggestedGroups.map(g => {
                          const isSelected = selectedGroups.some(s => s.name === g.group_name);
                          return (
                            <button
                              key={g.id}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedGroups(prev => prev.filter(s => s.name !== g.group_name));
                                } else {
                                  setSelectedGroups(prev => [...prev, { name: g.group_name, url: g.group_url }]);
                                }
                              }}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border",
                                isSelected
                                  ? "bg-brand-primary text-white border-brand-primary"
                                  : "bg-white text-gray-600 border-brand-accent hover:border-brand-primary"
                              )}
                            >
                              {isSelected ? <Check className="w-3 h-3" /> : null}
                              {g.group_name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customGroupName}
                        onChange={e => setCustomGroupName(e.target.value)}
                        placeholder="Grupo personalizado..."
                        className="flex-1 px-3 py-2 rounded-xl text-xs border border-brand-accent focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 outline-none"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && customGroupName.trim()) {
                            e.preventDefault();
                            setSelectedGroups(prev => [...prev, { name: customGroupName.trim() }]);
                            setCustomGroupName('');
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (customGroupName.trim()) {
                            setSelectedGroups(prev => [...prev, { name: customGroupName.trim() }]);
                            setCustomGroupName('');
                          }
                        }}
                        disabled={!customGroupName.trim()}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-colors disabled:opacity-40"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {selectedGroups.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {selectedGroups.map((g, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[11px] font-bold">
                            {g.name}
                            <button onClick={() => setSelectedGroups(prev => prev.filter((_, j) => j !== i))} className="hover:text-red-500">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={async () => {
                        setShareSaving(true);
                        try {
                          await logShareConfirmation(pet.id, platform || 'facebook', selectedGroups);
                          setShareSaved(true);
                        } catch { }
                        setShareSaving(false);
                      }}
                      disabled={shareSaving || shareSaved}
                      className={cn(
                        "mt-3 w-full py-2.5 rounded-xl font-bold text-sm transition-all",
                        shareSaved
                          ? "bg-green-100 text-green-700"
                          : "bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-50"
                      )}
                    >
                      {shareSaving ? (
                        <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</span>
                      ) : shareSaved ? (
                        <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Difusión registrada</span>
                      ) : (
                        <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Ya compartí</span>
                      )}
                    </button>
                  </div>
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
