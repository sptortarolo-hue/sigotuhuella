import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/src/lib/api';
import {
  PawPrint, Loader2, Syringe, Scissors, Bug, Phone, Mail, Weight,
  Calendar, Activity, Clock, ShieldCheck, ArrowLeft, Stethoscope,
  ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const RECORD_TYPE_LABELS: Record<string, string> = {
  vaccine: 'Vacuna', medication: 'Medicación', appointment: 'Turno',
  surgery: 'Cirugía', study: 'Estudio', expense: 'Gasto', note: 'Nota', weight: 'Peso',
};

const EVENT_TYPE_ICONS: Record<string, string> = {
  vaccine: '💉', deworm: '💊', vet: '🩺', surgery: '🏥',
  birthday: '🎂', adoption: '🏠', milestone: '⭐', weight: '⚖️',
  grooming: '✂️', other: '📋',
};

export default function VetPetProfile() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, [token]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/vet/${token}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Token inválido'); return; }
      setData(json.pet);
    } catch (e) {
      setError('Error al cargar perfil');
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

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg px-4 text-center">
        <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mb-6">
          <Stethoscope className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-brand-primary mb-3">Acceso no disponible</h1>
        <p className="text-gray-500 mb-6">{error}</p>
        <Link to="/" className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm">
          Ir al inicio
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const pet = data;

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Stethoscope className="w-4 h-4" /> Ficha Veterinaria Compartida
          </div>
          <Link to="/" className="text-xs text-brand-primary hover:underline flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Sigo Tu Huella
          </Link>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-brand-accent overflow-hidden shadow-sm mb-6">
          <div className="relative bg-gradient-to-r from-brand-primary to-brand-secondary px-6 py-8">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-white/20 bg-white/10 shrink-0">
                {pet.avatar_image ? (
                  <img src={`/my-pet-avatar/${pet.id}`} alt={pet.name}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    className="w-full h-full object-cover" />
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
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="grid grid-cols-2 gap-4 mb-6">
              {[
                { label: 'Color', value: pet.color },
                { label: 'Sexo', value: pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : 'Desconocido' },
                { label: 'Nacimiento', value: pet.birth_date ? new Date(pet.birth_date).toLocaleDateString('es-AR') : null },
                { label: 'Peso', value: pet.weight_kg ? `${pet.weight_kg} kg` : null },
                { label: 'Chip ID', value: pet.chip_id },
                { label: 'Dueño', value: pet.owner_name },
              ].filter(f => f.value).map(field => (
                <div key={field.label} className="p-3 bg-brand-bg rounded-xl">
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-gray-400">{field.label}</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{field.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
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

            <div className="p-4 bg-brand-bg rounded-2xl">
              <p className="text-xs text-gray-400 mb-2">Contacto del dueño</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {pet.owner_phone && (
                  <a href={`tel:${pet.owner_phone}`} className="flex items-center gap-1 text-brand-primary hover:underline">
                    <Phone className="w-3 h-3" /> {pet.owner_phone}
                  </a>
                )}
                {pet.owner_email && (
                  <a href={`mailto:${pet.owner_email}`} className="flex items-center gap-1 text-brand-primary hover:underline">
                    <Mail className="w-3 h-3" /> {pet.owner_email}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {pet.records?.length > 0 && (
          <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 mb-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Registros Médicos
            </h3>
            <div className="space-y-3">
              {pet.records.map((record: any) => (
                <div key={record.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                    className="w-full text-left p-4 bg-brand-bg rounded-2xl hover:bg-brand-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-secondary">
                          {RECORD_TYPE_LABELS[record.record_type] || record.record_type}
                        </span>
                        <h4 className="text-sm font-bold text-gray-800 truncate">{record.title}</h4>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-400">
                          {record.record_date && <span>{new Date(record.record_date).toLocaleDateString('es-AR')}</span>}
                          {record.vet_name && <span>· Vet: {record.vet_name}</span>}
                          {record.amount && (
                            <span className={record.record_type === 'weight' ? 'text-brand-primary font-medium' : 'text-emerald-600 font-medium'}>
                              · {record.record_type === 'weight' ? `${record.amount} kg` : `$${record.amount}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 mt-1">
                        {expandedId === record.id ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedId === record.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 bg-brand-bg rounded-b-2xl -mt-2">
                          {record.description && (
                            <p className="text-xs text-gray-500 mt-2">{record.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-400">
                            {record.clinic_name && <span>· Clínica: {record.clinic_name}</span>}
                            {record.medication_name && <span>· {record.medication_name} {record.dosage}</span>}
                            {record.next_date && (
                              <span className="text-amber-600 font-medium">
                                · Próximo: {new Date(record.next_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                          {record.link_url && (
                            <a href={record.link_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-3 text-xs text-blue-600 hover:text-blue-700 underline break-all"
                            >
                              <ExternalLink className="w-3 h-3" /> {record.link_url}
                            </a>
                          )}
                          {record.photo_ids?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {record.photo_ids.map((pid: string) => (
                                <img key={pid} src={`/my-pet-photo/${pid}`}
                                  className="w-16 h-16 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity border border-brand-accent"
                                  onClick={() => setPreviewPhotoUrl(`/my-pet-photo/${pid}?full=1`)}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        )}

        {pet.events?.length > 0 && (
          <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 mb-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Timeline
            </h3>
            <div className="space-y-3">
              {pet.events.map((event: any) => (
                <div key={event.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
                    className="w-full text-left flex gap-3 items-start p-3 bg-brand-bg rounded-2xl hover:bg-brand-accent/50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-brand-bg flex items-center justify-center text-sm shrink-0">
                      {EVENT_TYPE_ICONS[event.event_type] || '📋'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-gray-800 truncate">{event.title}</h4>
                      <p className="text-xs text-gray-400">
                        {new Date(event.event_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="shrink-0 mt-1">
                      {expandedId === event.id ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedId === event.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 bg-brand-bg rounded-b-2xl -mt-2">
                          {event.description && (
                            <p className="text-xs text-gray-500 mt-2">{event.description}</p>
                          )}
                          {event.next_date && (
                            <p className="text-xs text-amber-600 font-medium mt-1">
                              Próximo: {new Date(event.next_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                            </p>
                          )}
                          {event.photo_id && (
                            <div className="mt-3">
                              <img src={`/my-pet-photo/${event.photo_id}`}
                                className="w-24 h-24 object-cover rounded-xl cursor-pointer hover:opacity-80 transition-opacity border border-brand-accent"
                                onClick={() => setPreviewPhotoUrl(`/my-pet-photo/${event.photo_id}?full=1`)}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-[10px] text-gray-400 mt-6 uppercase tracking-widest">
          Sigo Tu Huella — Ficha Veterinaria Compartida
        </p>
      </div>

      <AnimatePresence>
        {previewPhotoUrl && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80"
            onClick={() => setPreviewPhotoUrl(null)}
          >
            <img src={previewPhotoUrl}
              className="max-w-full max-h-[90vh] object-contain rounded-2xl"
              onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}