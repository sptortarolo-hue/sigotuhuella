import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { formatTag } from '@/src/lib/personalityTags';
import {
  PawPrint, Loader2, Syringe, Scissors, Bug, MapPin, Heart,
  ArrowLeft, ShieldCheck, Share2, Copy, Check,
  Camera, ExternalLink, Phone, MessageCircle, AlertTriangle, Info,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import FoundReportModal from '@/src/components/FoundReportModal';

const SPECIES_LABELS: Record<string, string> = {
  dog: 'Perro', cat: 'Gato', other: 'Otro',
};

const GENDER_ICONS: Record<string, string> = {
  male: '♂️', female: '♀️', unknown: '',
};

const GENDER_LABELS: Record<string, string> = {
  male: 'Macho', female: 'Hembra', unknown: 'No especificado',
};

export default function PublicPetProfile() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showFoundModal, setShowFoundModal] = useState(false);
  const [foundSuccess, setFoundSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scanSent, setScanSent] = useState(false);

  const profileUrl = `${window.location.origin}/mascota/${shareToken}`;

  useEffect(() => {
    fetchProfile();
  }, [shareToken]);

  useEffect(() => {
    if (data?.found && !scanSent) {
      setScanSent(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          api.qr.scan(shareToken!, { latitude: pos.coords.latitude, longitude: pos.coords.longitude }).catch(() => {});
        },
        () => {
          api.qr.scan(shareToken!).catch(() => {});
        },
        { timeout: 5000 }
      );
    }
  }, [data, scanSent, shareToken]);

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

  const shareWhatsApp = () => {
    const pet = data?.pet;
    const text = `🐾 Conocé a ${pet?.name || 'esta mascota'} — tiene identificación digital con Sigo Tu Huella\n\n${profileUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { }
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
          Este código QR aún no está asociado a ninguna mascota.
        </p>
        <Link to="/" className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all">
          Ir al inicio
        </Link>
      </div>
    );
  }

  const pet = data.pet;
  const speciesLabel = SPECIES_LABELS[pet.species] || pet.species;
  const genderIcon = GENDER_ICONS[pet.gender] || '';
  const genderLabel = GENDER_LABELS[pet.gender] || '';

  return (
    <div className="min-h-screen bg-brand-bg pb-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        {/* Top bar */}
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <ShieldCheck className="w-4 h-4" /> QR {pet.code}
          </div>
          <Link to="/" className="text-xs text-brand-primary hover:underline flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Sigo Tu Huella
          </Link>
        </div>

        {/* Header */}
        <div className="bg-gradient-to-r from-brand-primary to-brand-secondary rounded-[2.5rem] px-6 py-8 sm:py-10 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-white/20 bg-white/10 shrink-0 shadow-lg">
              {pet.has_avatar ? (
                <img src={`/my-pet-avatar/${pet.id}`} alt={pet.name}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <PawPrint className="w-12 h-12 text-white/60" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{pet.name}</h1>
              <p className="text-white/80 text-sm mt-1">
                {speciesLabel}{pet.breed ? ` · ${pet.breed}` : ''}{pet.color ? ` · ${pet.color}` : ''}
              </p>
              <p className="text-white/60 text-xs mt-0.5">
                {genderIcon} {genderLabel}{pet.age ? ` · ${pet.age}` : ''}
              </p>
              <div className="flex items-center justify-center sm:justify-start gap-2 mt-3">
                <button onClick={shareWhatsApp} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-white text-xs font-medium transition-all">
                  <Share2 className="w-3.5 h-3.5" /> Compartir
                </button>
                <button onClick={copyLink} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-white text-xs font-medium transition-all">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiado' : 'Copiar link'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Contact section */}
        <div className="bg-white rounded-[2.5rem] border border-brand-accent overflow-hidden shadow-sm -mt-3 relative z-10">
          <div className="p-6 sm:p-8 space-y-6">
            {/* Direct contact */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1">
                <Phone className="w-3 h-3" /> Contacto directo
              </p>
              <a href={`tel:${pet.owner_phone}`}
                className="block w-full py-4 bg-emerald-50 hover:bg-emerald-100 rounded-2xl text-center text-xl sm:text-2xl font-black text-emerald-700 transition-colors">
                {pet.owner_phone}
              </a>
              <div className="flex gap-2 mt-2">
                <a href={`tel:${pet.owner_phone}`}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all">
                  <Phone className="w-4 h-4" /> Llamar
                </a>
                <a href={`https://wa.me/${pet.owner_phone?.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-500 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
                {pet.emergency_phone && (
                  <a href={`tel:${pet.emergency_phone}`}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  </a>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-2 text-center">{pet.owner_name} — Dueño</p>
            </div>

            <hr className="border-brand-accent" />

            {/* Pet data */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1">
                <Info className="w-3 h-3" /> Datos de {pet.name}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <DataRow label="Especie" value={speciesLabel} />
                {pet.breed && <DataRow label="Raza" value={pet.breed} />}
                {pet.color && <DataRow label="Color" value={pet.color} />}
                {genderLabel && <DataRow label="Sexo" value={`${genderIcon} ${genderLabel}`} />}
                {pet.age && <DataRow label="Edad" value={pet.age} />}
                {pet.weight_kg && <DataRow label="Peso" value={`${pet.weight_kg} kg`} />}
                {pet.chip_id && <DataRow label="Microchip" value={pet.chip_id} className="col-span-2" />}
              </div>
            </div>

            {/* Health badges */}
            {(pet.is_vaccinated || pet.is_sterilized || pet.is_dewormed) && (
              <>
                <hr className="border-brand-accent" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1">
                    <Syringe className="w-3 h-3" /> Salud
                  </p>
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
                </div>
              </>
            )}

            {/* Behavior notes */}
            {pet.behavior_notes && (
              <>
                <hr className="border-brand-accent" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1">
                    <Heart className="w-3 h-3" /> Comportamiento
                  </p>
                  <p className="text-sm text-gray-600 bg-brand-bg rounded-2xl p-4">{pet.behavior_notes}</p>
                </div>
              </>
            )}

            {/* Medical notes */}
            {pet.medical_notes && (
              <>
                <hr className="border-brand-accent" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Notas médicas
                  </p>
                  <p className="text-sm text-gray-600 bg-brand-bg rounded-2xl p-4">{pet.medical_notes}</p>
                </div>
              </>
            )}

            {/* Personality tags */}
            {pet.personality_tags?.length > 0 && (
              <>
                <hr className="border-brand-accent" />
                <div className="flex flex-wrap gap-2">
                  {pet.personality_tags.map((tag: string) => (
                    <span key={tag} className="text-xs px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-full font-medium">
                      {formatTag(tag)}
                    </span>
                  ))}
                </div>
              </>
            )}

            {/* Bio */}
            {pet.bio && (
              <>
                <hr className="border-brand-accent" />
                <div className="p-4 bg-brand-bg rounded-2xl">
                  <p className="text-sm text-gray-600 italic">"{pet.bio}"</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Report found */}
        <div className="mt-6">
          {foundSuccess ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
              <p className="text-sm font-medium text-emerald-700">Se notificó al dueño exitosamente. Se comunicarán con vos.</p>
            </div>
          ) : (
            <button
              onClick={() => setShowFoundModal(true)}
              className="w-full py-3 border-2 border-brand-secondary/30 text-brand-secondary rounded-xl font-bold text-sm hover:bg-brand-secondary/5 transition-all flex items-center justify-center gap-2"
            >
              <MapPin className="w-4 h-4" /> Reportar como encontrada
            </button>
          )}
        </div>

        {/* CTA */}
        <div className="mt-6 bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500 mb-3">¿Tu mascota no está identificada?</p>
          <Link
            to="/solicitar-chapita"
            className="inline-flex items-center gap-2 px-8 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all"
          >
            <Camera className="w-4 h-4" /> Creá su perfil digital
            <ExternalLink className="w-3 h-3" />
          </Link>
          <p className="text-[10px] text-gray-400 mt-4">
            Identificación digital gratuita con Sigo Tu Huella
          </p>
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

function DataRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className || ''}>
      <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block">{label}</span>
      <span className="text-sm text-gray-700 font-medium">{value}</span>
    </div>
  );
}