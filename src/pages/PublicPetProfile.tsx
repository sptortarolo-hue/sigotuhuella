import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { formatTag } from '@/src/lib/personalityTags';
import {
  PawPrint, Loader2, Syringe, Scissors, Bug, Phone, MapPin, Heart,
  MessageCircle, ArrowLeft, ShieldCheck, Image as ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import FoundReportModal from '@/src/components/FoundReportModal';

export default function PublicPetProfile() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showFoundModal, setShowFoundModal] = useState(false);
  const [foundSuccess, setFoundSuccess] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [shareToken]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const result = await api.qr.public(shareToken!);
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg text-brand-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  if (!data || !data.found) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg px-4 text-center">
        <div className="w-20 h-20 bg-brand-primary/10 rounded-3xl flex items-center justify-center mb-6">
          <PawPrint className="w-10 h-10 text-brand-primary" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">Identificación Digital</h1>
        <p className="text-gray-500 mb-8 max-w-md">
          Este código QR aún no está asociado a ninguna mascota. Si encontraste una mascota con este código,
          comunicate con nosotros.
        </p>
        <Link to="/" className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all">
          Ir al inicio
        </Link>
      </div>
    );
  }

  const pet = data.pet;

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4" /> Identificado con QR {pet.code}
          </div>
          <Link to="/" className="text-xs text-brand-primary hover:underline flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Sigo Tu Huella
          </Link>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-brand-accent overflow-hidden shadow-sm">
          <div className="relative bg-gradient-to-r from-brand-primary to-brand-secondary px-6 py-8">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-white/20 bg-white/10 shrink-0">
                {pet.has_avatar !== false ? (
                  <img src={`/my-pet-avatar/${pet.id}`} alt={pet.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <PawPrint className="w-10 h-10 text-white/60" />
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">{pet.name}</h1>
                <p className="text-white/80 text-sm">
                  {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otro'}
                  {pet.breed ? ` · ${pet.breed}` : ''}
                  {pet.color ? ` · ${pet.color}` : ''}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {pet.bio && (
              <div className="p-4 bg-brand-bg rounded-2xl">
                <p className="text-sm text-gray-600 italic">"{pet.bio}"</p>
              </div>
            )}

            {pet.personality_tags?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pet.personality_tags.map((tag: string) => (
                  <span key={tag} className="text-xs px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-full font-medium">
                    {formatTag(tag)}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {pet.is_vaccinated && (
                <span className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-medium">
                  <Syringe className="w-3 h-3" /> Vacunado
                </span>
              )}
              {pet.is_sterilized && (
                <span className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-medium">
                  <Scissors className="w-3 h-3" /> Esterilizado
                </span>
              )}
              {pet.is_dewormed && (
                <span className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-xs font-medium">
                  <Bug className="w-3 h-3" /> Desparasitado
                </span>
              )}
            </div>

            {pet.photos?.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" /> Fotos
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {pet.photos.slice(0, 6).map((photo: any) => (
                    <div key={photo.id} className="aspect-square rounded-2xl overflow-hidden bg-brand-bg">
                      <img
                        src={`/my-pet-photo/${photo.id}`}
                        alt={photo.caption || 'Foto'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 bg-brand-bg rounded-2xl">
              <p className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                <Heart className="w-3 h-3" /> Dueño
              </p>
              <p className="text-sm font-medium text-gray-700">{pet.owner_name}</p>
            </div>

            {foundSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                <p className="text-sm font-medium text-emerald-700">Se notificó al dueño exitosamente. Se comunicarán con vos.</p>
              </div>
            ) : (
              <button
                onClick={() => setShowFoundModal(true)}
                className="w-full py-3 bg-brand-secondary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" /> Reportar como encontrada
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-6 uppercase tracking-widest">
          Sigo Tu Huella — Identificación Digital
        </p>
      </div>

      <AnimatePresence>
        {showFoundModal && (
          <FoundReportModal
            shareToken={shareToken!}
            petName={pet.name}
            onClose={() => setShowFoundModal(false)}
            onSuccess={() => { setShowFoundModal(false); setFoundSuccess(true); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
