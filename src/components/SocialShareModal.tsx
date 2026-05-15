import React, { useState, useRef } from 'react';
import { Pet, PetStatus, getPetImageUrl, getPetImageUrls } from '@/src/lib/petService';
import { X, MessageCircle, Camera, Download, Sparkles, Loader2, Image as ImageIcon } from 'lucide-react';
import { toPng } from 'html-to-image';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

type Platform = 'whatsapp' | 'facebook' | 'instagram' | null;

interface SocialShareModalProps {
  pet: Pet;
  onClose: () => void;
}

const statusBg = (s: string) => s === 'lost' ? 'bg-red-600' : s === 'retained' ? 'bg-blue-600' : s === 'sighted' ? 'bg-amber-600' : s === 'accidented' ? 'bg-purple-600' : s === 'for_adoption' ? 'bg-brand-secondary' : 'bg-green-600';
const statusLabel = (s: string) => {
  const labels: Record<string, string> = { lost: 'PERDIDO', retained: 'RETENIDO', sighted: 'AVISTADO', accidented: 'ACCIDENTADO', for_adoption: 'EN ADOPCIÓN', adopted: 'ADOPTADO', reunited: 'REENCUENTRO' };
  return labels[s] || 'REPORTE';
};

export default function SocialShareModal({ pet, onClose }: SocialShareModalProps) {
  const [platform, setPlatform] = useState<Platform>(null);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [message, setMessage] = useState('');
  const flyerRef = useRef<HTMLDivElement>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const petUrl = `${origin}/pet/${pet.id}`;
  const images = getPetImageUrls(pet);
  const mainImage = images[0] || null;

  const defaultMessage = `Hola! En Sigo Tu Huella vi esta publicación y quería compartirla con vos. 
🐾 ${pet.name || 'Mascota'} - ${statusLabel(pet.status)}
📍 ${pet.location}
Más info: ${petUrl}`;

  const handleGenerate = async () => {
    if (!flyerRef.current) return;
    setGenerating(true);
    try {
      const dataUrl = await toPng(flyerRef.current, { quality: 0.95, pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `${pet.name || 'mascota'}-${pet.status}.png`;
      link.href = dataUrl;
      link.click();

      if (platform === 'whatsapp') {
        const text = encodeURIComponent(message || defaultMessage);
        setTimeout(() => window.open(`https://wa.me/?text=${text}`, '_blank'), 500);
      }

      setGenerated(true);
    } catch (e) {
      console.error('Error generating image:', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = () => {
    setGenerated(false);
    setTimeout(() => handleGenerate(), 100);
  };

  const platforms = [
    { id: 'whatsapp' as Platform, label: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500 hover:bg-emerald-600', bgColor: 'bg-emerald-50', textColor: 'text-emerald-600' },
    { id: 'facebook' as Platform, label: 'Facebook', icon: ImageIcon, color: 'bg-blue-600 hover:bg-blue-700', bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
    { id: 'instagram' as Platform, label: 'Instagram', icon: Camera, color: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400', bgColor: 'bg-pink-50', textColor: 'text-pink-600' },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl overflow-y-auto max-h-[90vh]"
      >
        <div className="p-6 sm:p-8 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50">
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-brand-primary">Flyer para Redes</h2>
          <button onClick={onClose} className="p-2 hover:bg-brand-accent rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {!platform ? (
            <div>
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
          ) : (
            <div className="space-y-6">
              {/* Preview del flyer */}
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-3 font-bold uppercase tracking-widest">Vista previa del flyer</p>
                <div
                  ref={flyerRef}
                  className="w-full max-w-sm mx-auto rounded-3xl overflow-hidden border-4 border-brand-accent shadow-xl bg-white"
                >
                  {/* Header con estado */}
                  <div className={cn("p-4 text-white font-serif font-black text-3xl text-center uppercase tracking-tighter", statusBg(pet.status))}>
                    {statusLabel(pet.status)}
                  </div>

                  {/* Imagen */}
                  <div className="relative aspect-square bg-gray-100">
                    {mainImage ? (
                      <img src={mainImage} alt={pet.name || ''} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <ImageIcon className="w-16 h-16" />
                      </div>
                    )}
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-2xl p-3 shadow-lg text-left border border-brand-accent">
                      <p className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-0.5">Nombre</p>
                      <p className="font-serif font-bold text-brand-primary text-xl tracking-tight leading-none">
                        {pet.name || 'Sin nombre'}
                      </p>
                    </div>
                  </div>

                  {/* Datos */}
                  <div className="p-5 bg-white">
                    <div className="flex gap-3 mb-3">
                      <div className="bg-brand-bg p-3 rounded-xl border border-brand-accent flex-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Ubicación</p>
                        <p className="text-xs sm:text-sm font-bold text-brand-primary truncate">{pet.location}</p>
                      </div>
                      {pet.contact_info && (
                        <div className="bg-brand-bg p-3 rounded-xl border border-brand-accent flex-1">
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Contacto</p>
                          <p className="text-xs sm:text-sm font-bold text-brand-primary">{pet.contact_info}</p>
                        </div>
                      )}
                    </div>
                    {pet.description && (
                      <p className="text-xs text-gray-600 leading-relaxed italic border-l-4 border-brand-secondary pl-3">
                        "{pet.description}"
                      </p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="bg-brand-bg p-3 border-t border-brand-accent text-center">
                    <p className="text-[8px] font-black tracking-widest text-brand-primary uppercase">
                      Sigo Tu Huella • Comunidad de Rescate
                    </p>
                  </div>
                </div>
              </div>

              {/* Mensaje editable */}
              <div>
                <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">Mensaje para acompañar (opcional)</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={defaultMessage}
                  rows={3}
                  className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent text-sm outline-none resize-none"
                />
              </div>

              {/* Acciones */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => { setPlatform(null); setGenerated(false); }}
                  className="flex-1 py-3 border border-brand-accent text-gray-600 rounded-xl font-bold text-sm hover:bg-brand-bg transition-all"
                >
                  Cambiar red
                </button>
                <button
                  onClick={handleGenerate}
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
                    <><Sparkles className="w-4 h-4" /> Generar y {platform === 'whatsapp' ? 'compartir' : 'descargar'}</>
                  )}
                </button>
              </div>

              {generated && (
                <div className="p-4 bg-green-50 rounded-2xl border border-green-200 text-center">
                  <p className="text-sm text-green-700 font-medium">
                    {platform === 'whatsapp' 
                      ? '✅ Flyer descargado. Se abrirá WhatsApp para que envíes el mensaje.'
                      : '✅ Flyer descargado. Ahora podés subirlo a la red social.'}
                  </p>
                  <button
                    onClick={handleRegenerate}
                    className="mt-2 text-xs text-green-600 hover:underline font-bold"
                  >
                    ¿No se ve bien? Regenerar
                  </button>
                </div>
              )}

              {platform === 'whatsapp' && (
                <p className="text-xs text-center text-gray-400">
                  Se descargará el flyer como imagen PNG y se abrirá WhatsApp con un mensaje predefinido para que lo compartas.
                </p>
              )}
              {platform === 'facebook' && (
                <p className="text-xs text-center text-gray-400">
                  El flyer se descargará como imagen PNG. Subilo a tu muro de Facebook junto con el mensaje que escribiste.
                </p>
              )}
              {platform === 'instagram' && (
                <p className="text-xs text-center text-gray-400">
                  El flyer se descargará como imagen PNG. Subilo a Instagram desde la app con el mensaje que escribiste.
                </p>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
