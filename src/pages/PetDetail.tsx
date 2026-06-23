import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import { motion, AnimatePresence } from 'motion/react';
import { getPets, Pet, PetStatus, getPetImageUrls, formatPetDate } from '@/src/lib/petService';
import { MapPin, Calendar, Phone, MessageCircle, Share2, ArrowLeft, Info, Heart, Loader2, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/src/lib/utils';
import { shareOnWhatsApp } from '@/src/lib/whatsappShare';
import { shareOnFacebook } from '@/src/lib/facebookShare';
import { NEIGHBORHOODS } from '@/src/lib/neighborhoods';
import PetImage from '@/src/components/PetImage';
import { LinkifiedText } from '@/src/lib/linkify';
import ImageLightbox from '@/src/components/admin/ImageLightbox';

function parseNeighborhoods(n: any): string[] {
  if (Array.isArray(n)) return n;
  if (typeof n === 'string') try { return JSON.parse(n); } catch { return []; }
  return [];
}

export default function PetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePhone, setSharePhone] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [sharePhoneError, setSharePhoneError] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareResult, setShareResult] = useState<any>(null);

  const isValidPhone = (p: string) => /^549\d{10}$/.test(p.replace(/\D/g, ''));

  const handleSharePhoneChange = (value: string) => {
    setSharePhone(value);
    if (!value) { setSharePhoneError(''); return; }
    if (!isValidPhone(value)) {
      setSharePhoneError('Formato: 549XXXXXXXXXX');
    } else {
      setSharePhoneError('');
    }
  };

  useEffect(() => {
    const fetchPet = async () => {
      try {
        const data = await getPets(); // This list all pets, we filter by id
        const found = data.find(p => p.id === id);
        setPet(found || null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchPet();
  }, [id]);

  const handleShare = async () => {
    if (!shareEmail && !sharePhone) return;
    if (sharePhone && sharePhoneError) return;
    setShareLoading(true);
    setShareResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/pets/${id}/share`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: shareEmail || undefined, phone: sharePhone || undefined, message: shareMsg || undefined }),
      });
      const data = await res.json();
      if (res.ok) setShareResult(data);
      else alert(data.error || 'Error');
    } catch (e) { alert('Error al compartir'); }
    finally { setShareLoading(false); }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-brand-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <span className="font-bold uppercase tracking-widest text-xs">Cargando mascota...</span>
        </div>
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="h-screen flex items-center justify-center text-center px-4">
        <div className="max-w-md">
          <div className="w-20 h-20 bg-brand-bg rounded-full flex items-center justify-center mx-auto mb-6 text-gray-400">
            <Info className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-brand-primary mb-4">Mascota no encontrada</h1>
          <p className="text-gray-500 mb-8">Lo sentimos, la publicación que buscas ya no está disponible o el enlace es incorrecto.</p>
          <button onClick={() => navigate('/perdidos')} className="px-8 py-3 bg-brand-primary text-white rounded-2xl font-bold hover:shadow-lg transition-all">
            Volver a reportes
          </button>
        </div>
      </div>
    );
  }

  const images = pet.images?.map((img: any, idx: number) => {
    if (img.has_original) return `/og-image/${pet.id}/${idx}?full=1`;
    if (img.image_data) return `data:${img.mime_type};base64,${img.image_data}`;
    if (img.external_url) return img.external_url;
    return '';
  }).filter(Boolean) || [];

  const waMessage = `Hola! Estoy escribiendo por la publicación de ${pet.name || 'la mascota'} en Sigo Tu Huella. 
📍 Ubicación: ${pet.location}
${pet.description ? `\n📝 Descripción: ${pet.description}` : ''}
Me gustaría obtener más información.`;

  const contactWhatsApp = (contactField: 'contact_info' | 'contact_info_2' = 'contact_info') => {
    const phone = pet?.[contactField]?.replace(/\D/g, '');
    if (!phone) return;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(waMessage)}`;
    window.open(url, '_blank');
  };

  const statusColors = {
    [PetStatus.LOST]: 'bg-red-100 text-red-700',
    [PetStatus.RETAINED]: 'bg-blue-100 text-blue-700',
    [PetStatus.SIGHTED]: 'bg-amber-100 text-amber-700',
    [PetStatus.ACCIDENTED]: 'bg-purple-100 text-purple-700',
    [PetStatus.NEEDS_ATTENTION]: 'bg-amber-100 text-amber-700',
    [PetStatus.FOR_ADOPTION]: 'bg-brand-primary/20 text-brand-primary',
    [PetStatus.REUNITED]: 'bg-green-100 text-green-700',
  };

  const statusLabels = {
    [PetStatus.LOST]: 'Perdido',
    [PetStatus.RETAINED]: 'Retenido',
    [PetStatus.SIGHTED]: 'Avistado',
    [PetStatus.ACCIDENTED]: 'Accidentado',
    [PetStatus.NEEDS_ATTENTION]: 'Necesita Atención',
    [PetStatus.FOR_ADOPTION]: 'En Adopción',
    [PetStatus.REUNITED]: 'Reencuentro',
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary font-bold mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Galería de Imágenes */}
        <div className="space-y-4">
          <div className="relative aspect-square rounded-[2.5rem] overflow-hidden bg-gray-100 shadow-xl group cursor-pointer"
            onClick={() => { if (images.length > 0) { setLightboxImages(images); setLightboxIndex(currentImageIdx); } }}>
            {images.length > 0 ? (
              <>
                <PetImage
                  src={images[currentImageIdx]}
                  alt={pet.name || 'Mascota'}
                  className="transition-transform duration-500 group-hover:scale-105"
                />
                {images.length > 1 && (
                  <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/50 text-white text-xs font-bold rounded-full backdrop-blur-sm">
                    {currentImageIdx + 1} / {images.length}
                  </div>
                )}
              </>
            ) : pet.facebook_embed_html ? (
              <div className="w-full aspect-square bg-brand-bg flex items-center justify-center overflow-hidden">
                <div className="w-full h-full [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-none"
                  dangerouslySetInnerHTML={{ __html: pet.facebook_embed_html }} />
              </div>
            ) : (
              <div className="w-full aspect-square bg-brand-bg flex items-center justify-center">
                <img src="/sigotuhuella.jpg" alt="" className="w-2/3 h-2/3 object-contain opacity-15" />
              </div>
            )}
          </div>
          
          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {images.map((url, idx) => (
                <button 
                  key={idx} 
                  onClick={() => setCurrentImageIdx(idx)}
                  className={cn(
                    "w-20 h-20 rounded-2xl overflow-hidden border-2 transition-all",
                    currentImageIdx === idx ? "border-brand-primary scale-95 shadow-inner" : "border-transparent opacity-70 hover:opacity-100"
                  )}
                >
                  <img src={url} className="w-full h-full object-cover" alt={`Vista previa ${idx + 1}`}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Información Detallada */}
        <div className="flex flex-col h-full">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className={cn("px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide", statusColors[pet.status])}>
                {statusLabels[pet.status]}
              </div>
              {pet.source_type === 'whatsapp_owner' && (
                <div className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                  Difusión particular
                </div>
              )}
            </div>
            {pet.name && (
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-2">
                {pet.name}
              </h1>
            )}
            <p className="text-lg text-gray-500 italic flex items-center gap-2">
              {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otra especie'} 
              <span className="text-gray-300">•</span> 
              {pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : 'Sexo desconocido'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            <div className="bg-white p-4 rounded-2xl border border-brand-accent flex items-center gap-4">
              <div className="w-10 h-10 bg-brand-bg rounded-xl flex items-center justify-center text-brand-secondary">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Ubicación</p>
                <p className="text-sm font-bold text-gray-800">{pet.location}</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-brand-accent flex items-center gap-4">
              <div className="w-10 h-10 bg-brand-bg rounded-xl flex items-center justify-center text-brand-secondary">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Reportado el</p>
                <p className="text-sm font-bold text-gray-800">{format(formatPetDate(pet.created_at), 'PP', { locale: es })}</p>
              </div>
            </div>
          </div>

          {(pet.age || pet.size || pet.is_vaccinated || pet.is_sterilized || pet.is_dewormed) && (
            <div className="bg-white p-6 rounded-[2rem] border border-brand-accent mb-8 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                <Info className="w-4 h-4" /> Datos de la Mascota
              </h3>
              <div className="flex flex-wrap gap-2">
                {pet.age && <span className="px-3 py-1 bg-brand-bg border border-brand-accent rounded-full text-xs font-bold text-gray-700">Edad: {pet.age === 'cachorro' ? 'Cachorro' : pet.age === 'adulto' ? 'Adulto' : 'Senior'}</span>}
                {pet.size && <span className="px-3 py-1 bg-brand-bg border border-brand-accent rounded-full text-xs font-bold text-gray-700">Tamaño: {pet.size === 'small' ? 'Pequeño' : pet.size === 'medium' ? 'Mediano' : 'Grande'}</span>}
                {pet.is_vaccinated && <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-100 rounded-full text-xs font-bold">✓ Vacunado</span>}
                {pet.is_sterilized && <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-100 rounded-full text-xs font-bold">✓ Castrado</span>}
                {pet.is_dewormed && <span className="px-3 py-1 bg-green-50 text-green-700 border border-green-100 rounded-full text-xs font-bold">✓ Desparasitado</span>}
              </div>
              {parseNeighborhoods(pet.neighborhoods).length > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] uppercase font-bold text-gray-400 tracking-widest mb-2">Zona / Barrio</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parseNeighborhoods(pet.neighborhoods).map(id => {
                      const n = NEIGHBORHOODS.find(x => x.id === id);
                      return n ? (
                        <span key={n.id} className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: n.color }}>
                          {n.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white p-6 rounded-[2rem] border border-brand-accent mb-8 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Info className="w-4 h-4" /> Descripción
            </h3>
            <p className={cn("leading-relaxed whitespace-pre-wrap", pet.name ? "text-gray-600 text-base" : "text-gray-700 text-lg")}>
              {pet.description ? <LinkifiedText text={pet.description} /> : 'No se proporcionó una descripción detallada.'}
            </p>
            {pet.source_type === 'whatsapp_owner' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mt-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  Esta publicación es una <strong>difusión particular</strong>.
                  Sigo Tu Huella solo difunde el aviso, no gestiona la adopción.
                  Comunicate directamente con el dueño para más información.
                </p>
              </div>
            )}
          </div>

          <div className="mt-auto space-y-6">
            <div className="bg-white rounded-2xl border border-brand-accent shadow-sm p-4">
              {pet.contact_info ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => contactWhatsApp('contact_info')}
                    className="flex-1 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md bg-emerald-500 text-white hover:bg-emerald-600"
                  >
                    <MessageCircle className="w-5 h-5 shrink-0" />
                    <span className="text-sm">{pet.contact_info_2 ? 'Contactar 1' : 'Contactar'}</span>
                  </button>
                  {pet.contact_info_2 && (
                    <button
                      onClick={() => contactWhatsApp('contact_info_2')}
                      className="flex-1 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md bg-emerald-500 text-white hover:bg-emerald-600"
                    >
                      <MessageCircle className="w-5 h-5 shrink-0" />
                      <span className="text-sm">Contactar 2</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    disabled
                    className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all bg-gray-200 text-gray-400 cursor-not-allowed"
                  >
                    <MessageCircle className="w-5 h-5" />
                    Contactar
                  </button>
                  <p className="text-center text-xs text-gray-400">
                    El contacto no está disponible para esta publicación.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-brand-accent pt-4 space-y-3">
              <button
                onClick={() => shareOnWhatsApp(pet)}
                className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-md bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg hover:from-green-600 hover:to-emerald-700"
              >
                <Share2 className="w-5 h-5" />
                Difundir en WhatsApp
              </button>
              <button
                onClick={() => shareOnFacebook(pet)}
                className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-md bg-blue-600 text-white hover:shadow-lg hover:bg-blue-700"
              >
                <Share2 className="w-5 h-5" />
                Compartir en Facebook
              </button>
              {user && user.id === pet.created_by && (
                <button
                  onClick={() => { setShareEmail(''); setSharePhone(''); setShareMsg(''); setShareResult(null); setShowShareModal(true); }}
                  className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-md bg-brand-primary/10 text-brand-primary border border-brand-accent hover:bg-brand-primary/20"
                >
                  <Share2 className="w-5 h-5" />
                  Compartir acceso
                </button>
              )}
              {user && user.id !== pet.created_by && (
                <button
                  onClick={async () => {
                    setFollowLoading(true);
                    try {
                      await fetch(`/api/pets/${id}/follow`, { method: 'POST', credentials: 'include' });
                      setFollowing(true);
                    } catch (e) { console.error(e); }
                    finally { setFollowLoading(false); }
                  }}
                  disabled={followLoading || following}
                  className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-md ${
                    following
                      ? 'bg-pink-100 text-pink-500 border border-pink-200'
                      : 'bg-gradient-to-r from-pink-500 to-rose-600 text-white hover:shadow-lg hover:from-pink-600 hover:to-rose-700'
                  }`}
                >
                  {followLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5" />}
                  {following ? 'Siguiendo' : 'Seguir mascota'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Share modal */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-brand-primary/20 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] p-6 sm:p-8">
              <button onClick={() => setShowShareModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-bold text-gray-800 mb-1">Compartir acceso</h3>
              <p className="text-xs text-gray-400 mb-5">Invita por email o WhatsApp a quien quieras que colabore</p>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 mb-4 leading-relaxed">
                Completá el mail o el WhatsApp de la persona a la que le querés compartir el perfil de tu mascota.
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">Email</label>
                  <input type="email" value={shareEmail} onChange={e => setShareEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="w-full p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
                  />
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 font-medium my-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span>o</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">WhatsApp / Teléfono</label>
                  <input type="tel" value={sharePhone} onChange={e => handleSharePhoneChange(e.target.value)}
                    placeholder="549XXXXXXXXXX"
                    className="w-full p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
                  />
                  {sharePhoneError && <p className="text-xs text-red-500 mt-1">{sharePhoneError}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">Mensaje (opcional)</label>
                  <textarea value={shareMsg} onChange={e => setShareMsg(e.target.value)}
                    placeholder="Ej: Hola! Te comparto la ficha para que podamos coordinar"
                    rows={3}
                    className="w-full p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm resize-none"
                  />
                </div>

                <button onClick={handleShare} disabled={shareLoading || (!shareEmail && !sharePhone) || !!sharePhoneError}
                  className="w-full py-3 bg-brand-primary text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {shareLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                  {shareLoading ? 'Compartiendo...' : 'Compartir'}
                </button>

                {shareResult && (
                  <div className={`p-3 rounded-xl text-xs font-medium text-center ${
                    shareResult.shared ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                  }`}>
                    {shareResult.userExists
                      ? '✅ Usuario encontrado. Ya tiene acceso.'
                      : shareResult.shared
                      ? '✅ Acceso compartido.'
                      : shareResult.inviteLink
                      ? `📧 Invitación enviada. Link: ${shareResult.inviteLink}`
                      : '✅ Invitación enviada'}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  );
}
