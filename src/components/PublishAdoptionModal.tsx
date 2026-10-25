import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Heart, X, Check, Loader2, Images } from 'lucide-react';
import { api, apiUrl } from '@/src/lib/api';
import { useAuth } from '@/src/hooks/useAuth';
import { PhoneInput } from '@/src/components/PhoneInput';

export interface PublishAdoptionPet {
  id: string;
  name: string;
  species?: string;
  bio?: string | null;
  behavior_notes?: string | null;
  avatar_image?: string | null;
}

interface PublishAdoptionModalProps {
  pet: PublishAdoptionPet;
  onClose: () => void;
  onPublished?: (petId: string) => void;
  /** true = primero muestra el ofrecimiento y recién después el formulario */
  startAtOffer?: boolean;
}

const MAX_PHOTOS = 20;

export default function PublishAdoptionModal({ pet, onClose, onPublished, startAtOffer = false }: PublishAdoptionModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'offer' | 'form' | 'done'>(startAtOffer ? 'offer' : 'form');
  const [photos, setPhotos] = useState<{ id: string; caption?: string }[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [avatarSelected, setAvatarSelected] = useState(true);
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [phoneValid, setPhoneValid] = useState(true);
  const [kind, setKind] = useState<'managed' | 'simple'>('managed');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [publishedId, setPublishedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.myPets.photos.list(pet.id)
      .then((r: any) => { if (alive) setPhotos(r?.photos || []); })
      .catch(() => { /* sin galería: se puede publicar solo con el avatar */ })
      .finally(() => { if (alive) setPhotosLoading(false); });
    return () => { alive = false; };
  }, [pet.id]);

  const hasAvatar = !!pet.avatar_image;
  const totalSelected = (avatarSelected && hasAvatar ? 1 : 0) + selectedPhotoIds.length;
  const canSubmit = location.trim().length > 0 && totalSelected > 0 && phoneValid && !loading;

  const descriptionPreview = [pet.bio, pet.behavior_notes ? `🐕 Comportamiento: ${pet.behavior_notes}` : '']
    .filter(Boolean).join('\n\n') || '(sin descripción)';

  const handlePhoneChange = (value: string, e164?: string) => {
    setPhone(value);
    setPhoneValid(!value || !!e164);
  };

  const togglePhoto = (id: string) => {
    setSelectedPhotoIds(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id);
      if (prev.length + (avatarSelected && hasAvatar ? 1 : 0) >= MAX_PHOTOS) return prev;
      return [...prev, id];
    });
  };

  const handlePublish = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.myPets.publishAdoption(pet.id, {
        location: location.trim(),
        phone: phone || undefined,
        kind,
        photoIds: selectedPhotoIds,
        includeAvatar: avatarSelected && hasAvatar,
      });
      setPublishedId(data?.pet?.id || null);
      setStep('done');
      onPublished?.(data?.pet?.id);
    } catch (e: any) {
      setError(e?.message || 'Error al publicar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-md bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-xl">
          <X className="w-5 h-5 text-gray-400" />
        </button>

        {step === 'offer' && (
          <div className="text-center">
            <div className="w-14 h-14 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Heart className="w-7 h-7 text-rose-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">¿Publicar a {pet.name} en adopción?</h3>
            <p className="text-xs text-gray-500 mb-6">
              Va a aparecer en la app para que los vecinos la vean y te contacten por WhatsApp.
              En el próximo paso elegís la ubicación, el contacto y las fotos.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={() => setStep('form')}
                className="w-full py-3 bg-brand-primary text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all"
              >
                Publicar ahora
              </button>
              <button onClick={onClose}
                className="w-full py-3 border border-brand-accent text-gray-500 rounded-xl text-sm font-bold hover:bg-brand-bg transition-colors"
              >
                Más tarde
              </button>
            </div>
          </div>
        )}

        {step === 'form' && (
          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">Publicar en adopción</h3>
            <p className="text-xs text-gray-400 mb-5">Elegí qué fotos querés mostrar y dónde está {pet.name}.</p>

            <div className="mb-5">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-2">
                <Images className="w-3.5 h-3.5" /> Fotos ({totalSelected}/{MAX_PHOTOS} seleccionadas)
              </label>
              {photosLoading ? (
                <div className="flex items-center justify-center py-6 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
                  {hasAvatar && (
                    <button onClick={() => setAvatarSelected(v => !v)}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${avatarSelected ? 'border-brand-primary ring-2 ring-brand-primary/30' : 'border-transparent hover:border-brand-accent'}`}
                    >
                      <img src={apiUrl(`/my-pet-avatar/${pet.id}`)} alt="Foto de perfil"
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/sigotuhuella.jpg'; }} />
                      {avatarSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand-primary text-white flex items-center justify-center text-[10px] font-bold">✓</div>
                      )}
                      <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] font-bold py-0.5">PERFIL</span>
                    </button>
                  )}
                  {photos.map((photo) => {
                    const selected = selectedPhotoIds.includes(photo.id);
                    return (
                      <button key={photo.id} onClick={() => togglePhoto(photo.id)}
                        className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${selected ? 'border-brand-primary ring-2 ring-brand-primary/30' : 'border-transparent hover:border-brand-accent'}`}
                      >
                        <img src={apiUrl(`/my-pet-photo/${photo.id}`)} alt={photo.caption || 'Foto'}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = '/sigotuhuella.jpg'; }} />
                        {selected && (
                          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand-primary text-white flex items-center justify-center text-[10px] font-bold">✓</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {!photosLoading && !hasAvatar && photos.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-2">Esta mascota no tiene fotos. Agregá fotos en su ficha antes de publicar.</p>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Ubicación *</label>
                <input value={location} onChange={e => setLocation(e.target.value)}
                  className="w-full p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
                  placeholder="Ej: Tolosa, La Plata" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Teléfono de contacto</label>
                <PhoneInput value={phone} onChange={handlePhoneChange} placeholder="549XXXXXXXXXX" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Tipo de adopción</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button onClick={() => setKind('managed')}
                    className={`p-3 rounded-xl border text-xs font-bold text-left transition-all ${kind === 'managed' ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-brand-accent text-gray-600 hover:border-brand-primary/50'}`}
                  >
                    Gestionada
                    <span className="block text-[10px] font-normal text-gray-400 mt-0.5">Perfil completo, chapita QR y traspaso por la app</span>
                  </button>
                  <button onClick={() => setKind('simple')}
                    className={`p-3 rounded-xl border text-xs font-bold text-left transition-all ${kind === 'simple' ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-brand-accent text-gray-600 hover:border-brand-primary/50'}`}
                  >
                    Solo difusión
                    <span className="block text-[10px] font-normal text-gray-400 mt-0.5">Coordinás la entrega directamente por WhatsApp</span>
                  </button>
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-2xl">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Descripción de la publicación</p>
                <p className="text-xs text-gray-600 italic whitespace-pre-line">{descriptionPreview}</p>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-xl text-xs border border-red-100">{error}</div>
            )}

            <div className="flex gap-3 mt-5">
              <button onClick={onClose}
                className="flex-1 py-3 border border-brand-accent text-gray-500 rounded-xl text-xs font-bold hover:bg-brand-bg transition-colors"
              >
                Cancelar
              </button>
              <button onClick={handlePublish} disabled={!canSubmit}
                className="flex-1 py-3 bg-brand-primary text-white rounded-xl text-xs font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
                Publicar en adopción
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-4">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-2xl flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-sm font-bold text-gray-800 mb-1">¡Publicación creada!</p>
            <p className="text-xs text-gray-500 mb-5">
              {pet.name} ya aparece en la sección de adopciones de la app. Compartí el link para ayudar a difundirla.
            </p>
            <div className="flex flex-col gap-3">
              {publishedId && (
                <Link to={`/pet/${publishedId}`}
                  className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all inline-block"
                >
                  Ver publicación
                </Link>
              )}
              <button onClick={onClose}
                className="px-6 py-3 border border-brand-accent text-gray-500 rounded-xl text-sm font-bold hover:bg-brand-bg transition-colors"
              >
                Listo
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
