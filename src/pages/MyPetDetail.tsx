import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { compressImage, fileToBase64 } from '@/src/lib/storageService';
import { formatTag } from '@/src/lib/personalityTags';
import ImageCropper from '@/src/components/ImageCropper';
import {
  PawPrint, ArrowLeft, Loader2, Syringe, Scissors, Bug, Weight,
  Calendar, Plus, X, Save, Camera, Trash2, Sparkles, Heart,
  Dog, Cat, Edit3, Image as ImageIcon, Activity, Clock,
  QrCode, Share2, Stethoscope, Copy, Check, FileText, Play,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import HealthTips from '@/src/components/HealthTips';

const EVENT_TYPES = [
  { value: 'birthday', label: 'Cumpleaños', icon: '🎂' },
  { value: 'adoption', label: 'Adopción', icon: '🏠' },
  { value: 'milestone', label: 'Hito', icon: '⭐' },
  { value: 'grooming', label: 'Peluquería', icon: '✂️' },
  { value: 'other', label: 'Otro', icon: '📋' },
];

const RECORD_TYPES = [
  { value: 'vaccine', label: 'Vacuna', icon: '💉' },
  { value: 'medication', label: 'Medicación', icon: '💊' },
  { value: 'appointment', label: 'Turno', icon: '🩺' },
  { value: 'surgery', label: 'Cirugía', icon: '🏥' },
  { value: 'study', label: 'Estudio', icon: '🔬' },
  { value: 'expense', label: 'Gasto', icon: '💰' },
  { value: 'note', label: 'Nota', icon: '📝' },
  { value: 'weight', label: 'Peso', icon: '⚖️' },
];

const RECORD_ICONS: Record<string, string> = {
  vaccine: '💉', medication: '💊', appointment: '🩺', surgery: '🏥',
  study: '🔬', expense: '💰', note: '📝', weight: '⚖️',
};

function getAge(birthDate: string) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (months < 0) { years--; months += 12; }
  if (years === 0) return `${months} mes${months !== 1 ? 'es' : ''}`;
  if (months === 0) return `${years} año${years !== 1 ? 's' : ''}`;
  return `${years}a ${months}m`;
}

function daysUntil(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

type Tab = 'ficha' | 'galeria' | 'timeline' | 'salud';

export default function MyPetDetail() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [pet, setPet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('ficha');

  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({ event_type: 'vaccine', title: '', description: '', event_date: '', next_date: '' });
  const [eventLoading, setEventLoading] = useState(false);

  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordForm, setRecordForm] = useState({ record_type: 'vaccine', title: '', description: '', record_date: '', next_date: '', vet_name: '', clinic_name: '', medication_name: '', dosage: '', amount: '', link_url: '' });
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordPhotos, setRecordPhotos] = useState<File[]>([]);
  const [recordPhotoPreviews, setRecordPhotoPreviews] = useState<string[]>([]);
  const recordPhotoInputRef = useRef<HTMLInputElement>(null);

  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoMusic, setVideoMusic] = useState('emotional');
  const [videoFormat, setVideoFormat] = useState('vertical');
  const [videoPerPhotoDur, setVideoPerPhotoDur] = useState(2);
  const [videoSelectedIds, setVideoSelectedIds] = useState<string[]>([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoResult, setVideoResult] = useState<{url: string; thumbUrl: string | null} | null>(null);
  const videoModalRef = useRef<HTMLDivElement>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropMode, setCropMode] = useState<'photo' | 'avatar' | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrRequested, setQrRequested] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [vetShareEnabled, setVetShareEnabled] = useState(false);
  const [vetShareToken, setVetShareToken] = useState<string | null>(null);
  const [vetShareLoading, setVetShareLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pasaporteLoading, setPasaporteLoading] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (!id) return;
    fetchPet();
  }, [user, id]);

  const fetchPet = async () => {
    try {
      setLoading(true);
      const data = await api.myPets.get(id!);
      setPet(data.myPet);
      setQrRequested(data.myPet.qr_requested || false);
      setVetShareEnabled(data.myPet.vet_share_enabled || false);
      setVetShareToken(data.myPet.vet_share_token || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (pet?.qr_id?.share_token) {
      const token = pet.qr_id.share_token;
      QRCode.toDataURL(`${window.location.origin}/mascota/${token}`, {
        width: 200, margin: 1, color: { dark: '#5A5A40', light: '#ffffff' },
      }).then(setQrDataUrl).catch(() => {});
    }
  }, [pet?.qr_id]);

  useEffect(() => {
    if (!previewPhotoUrl) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewPhotoUrl(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [previewPhotoUrl]);

  const weightRecords = useMemo(() => {
    if (!pet?.records) return [];
    return pet.records
      .filter((r: any) => r.record_type === 'weight' && r.amount)
      .map((r: any) => ({
        date: r.record_date || r.created_at,
        weight: parseFloat(r.amount),
      }))
      .filter((r: any) => !isNaN(r.weight))
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [pet?.records]);

  const recordPhotoIds = useMemo(() => {
    const ids = new Set<string>();
    (pet?.records || []).forEach((r: any) => (r.photo_ids || []).forEach((pid: string) => ids.add(pid)));
    return ids;
  }, [pet?.records]);

  const galleryPhotos = useMemo(() => {
    return (pet?.photos || []).filter((p: any) => !recordPhotoIds.has(p.id));
  }, [pet?.photos, recordPhotoIds]);

  const timelineItems = useMemo(() => {
    const items: any[] = [];
    (pet?.events || []).forEach((e: any) => items.push({ ...e, _type: 'event', _date: e.event_date }));
    (pet?.records || []).forEach((r: any) => items.push({ ...r, _type: 'record', _date: r.record_date || r.created_at }));
    return items.sort((a, b) => new Date(b._date).getTime() - new Date(a._date).getTime());
  }, [pet?.events, pet?.records]);

  const handleRequestQr = async () => {
    try {
      setQrLoading(true);
      await api.myPets.requestQr(id!);
      setQrRequested(true);
    } catch (e: any) {
      alert(e.message || 'Error al solicitar QR');
    } finally {
      setQrLoading(false);
    }
  };

  const handleVetShareToggle = async () => {
    try {
      setVetShareLoading(true);
      const result = await api.myPets.vetShare(id!, !vetShareEnabled);
      setVetShareEnabled(!vetShareEnabled);
      if (result.vet_share_token) setVetShareToken(result.vet_share_token);
    } catch (e: any) {
      alert(e.message || 'Error');
    } finally {
      setVetShareLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadPasaporte = async () => {
    try {
      setPasaporteLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/my-pets/${id}/pasaporte`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pasaporte-${pet?.name || 'mascota'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setPasaporteLoading(false);
    }
  };

  const handleAddEvent = async () => {
    if (!eventForm.title || !eventForm.event_date) return;
    try {
      setEventLoading(true);
      await api.myPets.events.create(id!, eventForm);
      setShowEventForm(false);
      setEventForm({ event_type: 'vaccine', title: '', description: '', event_date: '', next_date: '' });
      await fetchPet();
    } catch (e) { console.error(e); }
    finally { setEventLoading(false); }
  };

  const handleRecordPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = 3 - recordPhotos.length;
    const toAdd = files.slice(0, remaining);
    if (toAdd.length === 0) return;
    const previews: string[] = [];
    for (const file of toAdd) {
      const compressed = await compressImage(file, 1200, 0.85);
      const { data } = await fileToBase64(compressed);
      previews.push(data);
    }
    setRecordPhotos(prev => [...prev, ...toAdd]);
    setRecordPhotoPreviews(prev => [...prev, ...previews]);
    if (recordPhotoInputRef.current) recordPhotoInputRef.current.value = '';
  };

  const removeRecordPhoto = (index: number) => {
    setRecordPhotos(prev => prev.filter((_, i) => i !== index));
    setRecordPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddRecord = async () => {
    if (!recordForm.title) return;
    try {
      setRecordLoading(true);
      const uploadedIds: string[] = [];
      for (const file of recordPhotos) {
        const compressed = await compressImage(file, 1200, 0.85);
        const { data, mimeType } = await fileToBase64(compressed);
        const res = await api.myPets.photos.create(id!, {
          image_data: data, mime_type: mimeType, caption: '', taken_at: new Date().toISOString(),
        });
        uploadedIds.push(res.photo.id);
      }
      const payload: any = { ...recordForm };
      if (payload.amount === '') payload.amount = null;
      payload.photo_ids = uploadedIds.length > 0 ? uploadedIds : undefined;
      await api.myPets.records.create(id!, payload);
      setShowRecordForm(false);
      setRecordForm({ record_type: 'vaccine', title: '', description: '', record_date: '', next_date: '', vet_name: '', clinic_name: '', medication_name: '', dosage: '', amount: '', link_url: '' });
      setRecordPhotos([]);
      setRecordPhotoPreviews([]);
      await fetchPet();
    } catch (e) { console.error(e); }
    finally { setRecordLoading(false); }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhotoLoading(true);
      const compressed = await compressImage(file, 1200, 0.85);
      setCropFile(compressed);
      setCropMode('photo');
    } catch (e) {
      console.error(e);
      alert('Error al procesar la foto.');
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob, cropX: number, cropY: number) => {
    if (!cropFile || !cropMode) return;
    try {
      if (cropMode === 'photo') {
        const { data, mimeType } = await fileToBase64(cropFile);
        await api.myPets.photos.create(id!, {
          image_data: data,
          mime_type: mimeType,
          caption: '',
          taken_at: new Date().toISOString(),
          crop_x: cropX,
          crop_y: cropY,
        });
        await fetchPet();
      } else if (cropMode === 'avatar') {
        const { data, mimeType } = await fileToBase64(cropFile);
        await api.myPets.update(id!, { avatar_image: data, avatar_mime_type: mimeType, avatar_crop_x: cropX, avatar_crop_y: cropY });
        await fetchPet();
      }
    } catch (e) {
      console.error(e);
      alert('Error al subir la foto.');
    } finally {
      setCropFile(null);
      setCropMode(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleCropCancel = () => {
    setCropFile(null);
    setCropMode(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatarLoading(true);
      const compressed = await compressImage(file, 800, 0.8);
      setCropFile(compressed);
      setCropMode('avatar');
    } catch (e) {
      console.error(e);
      alert('Error al procesar la foto.');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('¿Eliminar esta foto?')) return;
    try {
      await api.myPets.photos.delete(id!, photoId);
      await fetchPet();
    } catch (e) { console.error(e); }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('¿Eliminar este evento?')) return;
    try {
      await api.myPets.events.delete(id!, eventId);
      await fetchPet();
    } catch (e) { console.error(e); }
  };

  const shareToFeed = async (event: any) => {
    try {
      const photoIds = (pet?.photos || []).slice(0, 3).map((p: any) => p.id);
      await api.feed.create({
        my_pet_id: id,
        title: event.title,
        description: event.description || '',
        event_id: event.id,
        photo_ids: photoIds.length > 0 ? photoIds : null,
      });
    } catch (e) { console.error(e); }
  };

  const handleSaveBio = async () => {
    try {
      await api.myPets.update(id!, { bio: bioDraft || null });
      await fetchPet();
      setEditingBio(false);
    } catch (e) { console.error(e); }
  };

  const startEditBio = () => {
    setBioDraft(pet.bio || '');
    setEditingBio(true);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-brand-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  if (!pet) return <div className="p-8 text-center text-gray-400">Mascota no encontrada</div>;

  const reminders = [...(pet.events || []), ...(pet.records || [])]
    .filter((r: any) => r.next_date && new Date(r.next_date) >= new Date())
    .map((r: any) => ({ ...r, due_date: r.next_date }))
    .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'ficha', label: 'Ficha', icon: <PawPrint className="w-4 h-4" /> },
    { key: 'galeria', label: 'Galería', icon: <ImageIcon className="w-4 h-4" /> },
    { key: 'timeline', label: 'Timeline', icon: <Clock className="w-4 h-4" /> },
    { key: 'salud', label: 'Libreta Sanitaria', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <>
      {cropMode && cropFile && (
        <ImageCropper file={cropFile} aspect={1} onCropComplete={handleCropComplete} onCancel={handleCropCancel} />
      )}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
      <button onClick={() => navigate('/mi-mascota')} className="flex items-center gap-2 text-gray-400 hover:text-brand-primary transition-colors mb-4 text-sm">
        <ArrowLeft className="w-4 h-4" /> Volver a mis mascotas
      </button>

      <div className="relative -mx-4 sm:-mx-6 lg:-mx-8 mb-6 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-b-[3rem] px-6 py-8 shadow-xl overflow-hidden">
        <div className="flex items-center gap-4">
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarLoading}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-white/20 bg-white/10 shrink-0 relative group"
            title="Cambiar foto de perfil"
          >
            {pet.avatar_image ? (
              <img src={`/my-pet-avatar/${pet.id}?t=${Date.now()}`} alt={pet.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <PawPrint className="w-10 h-10 text-white/60" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              {avatarLoading ? (
                <Loader2 className="w-6 h-6 text-white animate-spin opacity-0 group-hover:opacity-100" />
              ) : (
                <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-white truncate">{pet.name}</h1>
            <p className="text-white/80 text-sm">
              {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otro'}
              {pet.breed ? ` · ${pet.breed}` : ''}
              {pet.birth_date ? ` · ${getAge(pet.birth_date)}` : ''}
            </p>
            {pet.personality_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {pet.personality_tags.map((tag: string) => (
                  <span key={tag} className="text-[10px] sm:text-xs px-2 py-0.5 bg-white/20 text-white rounded-full">{formatTag(tag)}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {reminders.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6"
        >
          <h4 className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-2 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Próximos recordatorios
          </h4>
          <div className="space-y-1">
            {reminders.slice(0, 3).map((r: any, i: number) => {
              const days = daysUntil(r.due_date);
              return (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-amber-800">{r.title}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${days <= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      <div className="flex gap-1 bg-brand-bg rounded-2xl p-1 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-white text-brand-primary shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.icon} <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'ficha' && (
          <motion.div key="ficha" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="bg-white rounded-[2rem] border border-brand-accent p-6 sm:p-8"
          >
            {editingBio ? (
              <div className="mb-6">
                <textarea value={bioDraft} onChange={e => setBioDraft(e.target.value)}
                  className="w-full p-4 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm resize-none" rows={3}
                  placeholder="Contanos cómo es tu mascota, sus señas particulares..."
                />
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1 mb-3">Esta información es importante para encontrarla si se pierde</p>
                <div className="flex gap-2">
                  <button onClick={handleSaveBio} className="px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:shadow-lg transition-all flex items-center gap-1">
                    <Save className="w-3 h-3" /> Guardar
                  </button>
                  <button onClick={() => setEditingBio(false)} className="px-4 py-2 border border-brand-accent text-gray-500 rounded-xl text-xs font-bold hover:bg-brand-bg transition-all">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : pet.bio ? (
              <div className="mb-6 p-4 bg-brand-bg rounded-2xl flex items-start gap-3">
                <p className="text-sm text-gray-600 italic flex-1">"{pet.bio}"</p>
                <button onClick={startEditBio} className="p-1.5 hover:bg-brand-accent rounded-lg transition-colors shrink-0" title="Editar descripción">
                  <Edit3 className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ) : (
              <div className="mb-6">
                <button onClick={startEditBio} className="w-full p-4 border-2 border-dashed border-brand-accent rounded-2xl text-sm text-gray-400 hover:text-brand-primary hover:border-brand-primary/50 transition-all flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Agregar descripción
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Nombre', value: pet.name },
                { label: 'Especie', value: pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otro' },
                { label: 'Raza', value: pet.breed },
                { label: 'Color', value: pet.color },
                { label: 'Sexo', value: pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : 'Desconocido' },
                { label: 'Nacimiento', value: pet.birth_date ? new Date(pet.birth_date).toLocaleDateString('es-AR') : null },
                { label: 'Edad', value: getAge(pet.birth_date) },
                { label: 'Chip ID', value: pet.chip_id },
                { label: 'Peso', value: pet.weight_kg ? `${pet.weight_kg} kg` : null },
              ].filter(f => f.value).map(field => (
                <div key={field.label} className="p-3 bg-brand-bg rounded-xl">
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-gray-400">{field.label}</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{field.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
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

            <div className="mt-6 pt-4 border-t border-brand-accent space-y-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                  <QrCode className="w-4 h-4" /> Identificación QR
                </h4>
                {qrDataUrl ? (
                  <div className="p-4 bg-brand-bg rounded-2xl flex items-center gap-4">
                    <img src={qrDataUrl} alt="QR" className="w-32 h-32 rounded-xl" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-brand-primary">{pet.qr_id?.code}</p>
                      <p className="text-xs text-gray-400 mt-1">Escaneá para ver el perfil público</p>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => copyToClipboard(`${window.location.origin}/mascota/${pet.qr_id?.share_token}`, 'qr')}
                          className="px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-brand-primary/20 transition-colors"
                        >
                          {copied === 'qr' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copied === 'qr' ? 'Copiado' : 'Copiar link'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : qrRequested ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700">
                    Solicitud de QR enviada. El admin te lo asignará pronto.
                  </div>
                ) : (
                  <button
                    onClick={handleRequestQr}
                    disabled={qrLoading}
                    className="px-4 py-2.5 bg-brand-primary/10 text-brand-primary rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-brand-primary/20 transition-colors disabled:opacity-50"
                  >
                    {qrLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <QrCode className="w-3 h-3" />}
                    Solicitar identificación QR
                  </button>
                )}
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                  <Stethoscope className="w-4 h-4" /> Compartir con veterinario
                </h4>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleVetShareToggle}
                    disabled={vetShareLoading}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      vetShareEnabled
                        ? 'bg-brand-primary text-white'
                        : 'bg-brand-bg text-gray-500 border border-brand-accent hover:border-brand-primary/50'
                    }`}
                  >
                    {vetShareLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {vetShareEnabled ? 'Compartiendo' : 'Compartir ficha'}
                  </button>
                  {vetShareEnabled && vetShareToken && (
                    <button
                      onClick={() => copyToClipboard(`${window.location.origin}/vet/${vetShareToken}`, 'vet')}
                      className="px-3 py-2 bg-brand-primary/10 text-brand-primary rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-brand-primary/20 transition-colors"
                    >
                      {copied === 'vet' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied === 'vet' ? 'Copiado' : 'Copiar link vet'}
                    </button>
                  )}
                </div>
                {vetShareEnabled && (
                  <p className="text-[10px] text-gray-400 mt-2">
                    Tu veterinario podrá ver ficha médica, registros y tu contacto.
                  </p>
                )}
              </div>

              <div className="pt-2">
                <button
                  onClick={downloadPasaporte}
                  disabled={pasaporteLoading}
                  className="px-4 py-2.5 bg-brand-primary/10 text-brand-primary rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-brand-primary/20 transition-colors disabled:opacity-50 w-full justify-center"
                >
                  {pasaporteLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                  Descargar pasaporte PDF
                </button>
              </div>
            </div>

            <HealthTips petId={id} />

            <div className="mt-6 pt-4 border-t border-brand-accent flex justify-end">
              <button onClick={() => navigate('/mi-mascota')}
                className="px-4 py-2 text-xs text-gray-400 hover:text-brand-primary flex items-center gap-1 transition-colors"
              >
                <Edit3 className="w-3 h-3" /> Editar desde el listado
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === 'galeria' && (
          <motion.div key="galeria" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex justify-end gap-2 mb-4">
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={photoLoading}
                className="px-4 py-2 bg-brand-primary text-white rounded-xl font-bold text-xs hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {photoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />} Subir foto
              </button>
              {galleryPhotos.length >= 3 && (
                <button onClick={() => { setVideoSelectedIds(galleryPhotos.map((p: any) => p.id)); setVideoResult(null); setVideoTitle(''); setShowVideoModal(true); }}
                  className="px-4 py-2 bg-amber-500 text-white rounded-xl font-bold text-xs hover:shadow-lg transition-all flex items-center gap-2">
                  <Play className="w-3 h-3" /> Video
                </button>
              )}
            </div>

            {galleryPhotos.length === 0 ? (
              <div className="bg-white rounded-[2rem] border border-dashed border-brand-accent p-8 text-center">
                <Camera className="w-12 h-12 text-brand-accent mx-auto mb-3" />
                <p className="text-gray-400">Todavía no hay fotos</p>
                <button onClick={() => photoInputRef.current?.click()}
                  className="mt-4 px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold">
                  Subir primera foto
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {galleryPhotos.map((photo: any) => (
                  <div key={photo.id} className="relative group rounded-2xl overflow-hidden aspect-square bg-brand-bg">
                    <img
                      src={`/my-pet-photo/${photo.id}`}
                      alt={photo.caption || 'Foto'}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      onError={(e) => { (e.target as HTMLImageElement).src = '/sigotuhuella.jpg'; }}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id); }}
                      className="absolute top-2 right-2 p-1.5 bg-red-500/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    {photo.caption && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8">
                        <p className="text-white text-xs truncate">{photo.caption}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'timeline' && (
          <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex justify-end mb-4">
              <button onClick={() => setShowEventForm(true)}
                className="px-4 py-2 bg-brand-primary text-white rounded-xl font-bold text-xs hover:shadow-lg transition-all flex items-center gap-2"
              >
                <Plus className="w-3 h-3" /> Agregar evento
              </button>
            </div>

            {timelineItems.length === 0 ? (
              <div className="bg-white rounded-[2rem] border border-dashed border-brand-accent p-8 text-center">
                <Clock className="w-12 h-12 text-brand-accent mx-auto mb-3" />
                <p className="text-gray-400">Todavía no hay actividad en el timeline</p>
                <button onClick={() => setShowEventForm(true)}
                  className="mt-4 px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold">
                  Agregar primer evento
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {timelineItems.map((item: any, i: number) => {
                  const isEvent = item._type === 'event';
                  const icon = isEvent
                    ? (EVENT_TYPES.find(t => t.value === item.event_type)?.icon || '📋')
                    : (RECORD_ICONS[item.record_type] || '📋');
                  return (
                    <motion.div key={`${item._type}-${item.id}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      className="flex gap-4 items-start"
                    >
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-lg shrink-0">
                          {icon}
                        </div>
                        {i < timelineItems.length - 1 && <div className="w-0.5 h-full bg-brand-accent mt-1" />}
                      </div>
                      <div className="flex-1 bg-white rounded-2xl border border-brand-accent p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-sm font-bold text-gray-800">{item.title}</h4>
                            <p className="text-xs text-gray-400">
                              {new Date(item._date).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                              {item.next_date && (
                                <span className="ml-2 text-amber-600">
                                  Próximo: {new Date(item.next_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                            </p>
                            {item.description && <p className="text-xs text-gray-500 mt-1">{item.description}</p>}
                            {!isEvent && (
                              <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-gray-400">
                                {item.vet_name && <span>· Vet: {item.vet_name}</span>}
                                {item.clinic_name && <span>· {item.clinic_name}</span>}
                                {item.medication_name && <span>· {item.medication_name} {item.dosage}</span>}
                                {item.amount && item.record_type !== 'weight' && <span className="text-emerald-600 font-medium">· ${item.amount}</span>}
                                {item.record_type === 'weight' && item.amount && <span className="text-brand-primary font-medium">· {item.amount} kg</span>}
                              </div>
                            )}
                            {!isEvent && item.link_url && (
                              <a href={item.link_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-700 underline break-all"
                              >
                                <span className="text-base">🔗</span> {item.link_url}
                              </a>
                            )}
                            {item.photo_ids?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {item.photo_ids.map((pid: string) => (
                                  <img key={pid} src={`/my-pet-photo/${pid}`}
                                    className="w-12 h-12 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => setPreviewPhotoUrl(`/my-pet-photo/${pid}?full=1`)}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isEvent && (
                              <button onClick={() => shareToFeed(item)}
                                className="p-1 hover:bg-brand-primary/10 rounded-lg transition-colors text-gray-300 hover:text-brand-primary"
                                title="Compartir en comunidad"
                              >
                                <Share2 className="w-3 h-3" />
                              </button>
                            )}
                            {isEvent && (
                              <button onClick={() => handleDeleteEvent(item.id)}
                                className="p-1 hover:bg-red-50 rounded-lg transition-colors text-gray-300 hover:text-red-500"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            <AnimatePresence>
              {showEventForm && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                >
                  <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => setShowEventForm(false)} />
                  <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    className="relative w-full max-w-md bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-2xl"
                  >
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-lg font-bold text-brand-primary">Nuevo evento</h3>
                      <button onClick={() => setShowEventForm(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Tipo</label>
                        <div className="flex flex-wrap gap-2">
                          {EVENT_TYPES.map(t => (
                            <button key={t.value}
                              onClick={() => setEventForm(prev => ({ ...prev, event_type: t.value }))}
                              className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1 transition-all ${
                                eventForm.event_type === t.value
                                  ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary'
                                  : 'bg-brand-bg text-gray-500 border border-transparent hover:border-brand-accent'
                              }`}
                            >
                              {t.icon} {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Título</label>
                        <input value={eventForm.title} onChange={e => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" placeholder="Ej: Cumpleaños de Luna" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Fecha</label>
                          <input type="date" value={eventForm.event_date} onChange={e => setEventForm(prev => ({ ...prev, event_date: e.target.value }))}
                            className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Próximo</label>
                          <input type="date" value={eventForm.next_date} onChange={e => setEventForm(prev => ({ ...prev, next_date: e.target.value }))}
                            className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Detalle</label>
                        <textarea value={eventForm.description} onChange={e => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                          className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm resize-none" rows={2} />
                        </div>
                      </div>
                      <button onClick={handleAddEvent} disabled={eventLoading || !eventForm.title || !eventForm.event_date}
                        className="w-full mt-5 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {eventLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar evento
                      </button>
                    </motion.div>
                  </motion.div>
                )}
            </AnimatePresence>
          </motion.div>
        )}

          {activeTab === 'salud' && (
          <motion.div key="salud" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex justify-end mb-4">
              <button onClick={() => setShowRecordForm(true)}
                className="px-4 py-2 bg-brand-primary text-white rounded-xl font-bold text-xs hover:shadow-lg transition-all flex items-center gap-2"
              >
                <Plus className="w-3 h-3" /> Agregar registro
              </button>
            </div>

            {weightRecords.length >= 2 && (
              <div className="bg-white rounded-2xl border border-brand-accent p-4 mb-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                  <Weight className="w-4 h-4" /> Evolución de peso
                </h4>
                <div className="h-40 flex items-end gap-1 px-2">
                  {weightRecords.map((wr: any, i: number) => {
                    const maxW = Math.max(...weightRecords.map((w: any) => w.weight));
                    const minW = Math.min(...weightRecords.map((w: any) => w.weight));
                    const range = maxW - minW || 1;
                    const height = 20 + ((wr.weight - minW) / range) * 80;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${wr.weight} kg — ${new Date(wr.date).toLocaleDateString('es-AR')}`}>
                        <span className="text-[10px] font-bold text-brand-primary">{wr.weight}</span>
                        <div className="w-full bg-brand-secondary/80 rounded-t-md" style={{ height: `${height}%` }} />
                        <span className="text-[8px] text-gray-400">{new Date(wr.date).toLocaleDateString('es-AR', { month: 'short' })}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {pet.records?.length === 0 ? (
              <div className="bg-white rounded-[2rem] border border-dashed border-brand-accent p-8 text-center">
                <Activity className="w-12 h-12 text-brand-accent mx-auto mb-3" />
                <p className="text-gray-400">Todavía no hay registros médicos</p>
                <button onClick={() => setShowRecordForm(true)}
                  className="mt-4 px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold">
                  Agregar primer registro
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {pet.records.map((record: any) => (
                  <div key={record.id} className="bg-white rounded-2xl border border-brand-accent p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-brand-secondary">
                          {RECORD_ICONS[record.record_type]} {RECORD_TYPES.find(t => t.value === record.record_type)?.label || record.record_type}
                        </span>
                        <h4 className="text-sm font-bold text-gray-800">{record.title}</h4>
                        {record.description && <p className="text-xs text-gray-500 mt-0.5">{record.description}</p>}
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-400">
                          {record.record_date && <span>{new Date(record.record_date).toLocaleDateString('es-AR')}</span>}
                          {record.vet_name && <span>· Vet: {record.vet_name}</span>}
                          {record.clinic_name && <span>· {record.clinic_name}</span>}
                          {record.medication_name && <span>· {record.medication_name} {record.dosage}</span>}
                          {record.amount && record.record_type !== 'weight' && <span className="text-emerald-600 font-medium">· ${record.amount}</span>}
                    {record.record_type === 'weight' && record.amount && <span className="text-brand-primary font-medium">· {record.amount} kg</span>}
                          {record.next_date && (
                            <span className="text-amber-600 font-medium">
                              · Próximo: {new Date(record.next_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>
                      {record.link_url && (
                        <a href={record.link_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 mt-3 text-xs text-blue-600 hover:text-blue-700 underline break-all"
                        >
                          <span className="text-base">🔗</span> {record.link_url}
                        </a>
                      )}
                      {record.photo_ids?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {record.photo_ids.map((pid: string) => (
                            <img key={pid} src={`/my-pet-photo/${pid}`}
                              className="w-12 h-12 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => setPreviewPhotoUrl(`/my-pet-photo/${pid}?full=1`)}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <AnimatePresence>
              {showRecordForm && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                >
                  <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => setShowRecordForm(false)} />
                  <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    className="relative w-full max-w-lg bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-2xl"
                  >
                    <div className="p-6 sm:p-8 border-b border-brand-accent flex items-center justify-between">
                      <h3 className="text-lg font-bold text-brand-primary">Nuevo registro médico</h3>
                      <button onClick={() => setShowRecordForm(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
                    </div>
                    <div className="p-6 sm:p-8 overflow-y-auto space-y-4">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Tipo</label>
                        <div className="flex flex-wrap gap-2">
                          {RECORD_TYPES.map(t => (
                            <button key={t.value}
                              onClick={() => setRecordForm(prev => ({ ...prev, record_type: t.value }))}
                              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                                recordForm.record_type === t.value
                                  ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary'
                                  : 'bg-brand-bg text-gray-500 border border-transparent hover:border-brand-accent'
                              }`}
                            >
                              {t.icon} {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Título</label>
                        <input value={recordForm.title} onChange={e => setRecordForm(prev => ({ ...prev, title: e.target.value }))}
                          className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" placeholder="Ej: Vacuna triple" />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Detalle</label>
                        <textarea value={recordForm.description} onChange={e => setRecordForm(prev => ({ ...prev, description: e.target.value }))}
                          className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm resize-none" rows={2} />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">
                          Fotos {recordPhotos.length > 0 && <span className="text-brand-secondary">({recordPhotos.length}/3)</span>}
                        </label>
                        <input ref={recordPhotoInputRef} type="file" accept="image/*" capture="environment" multiple
                          className="hidden" onChange={handleRecordPhotoSelect} />
                        <div className="flex flex-wrap gap-2">
                          {recordPhotoPreviews.map((preview, i) => (
                            <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden bg-brand-bg">
                              <img src={`data:image/jpeg;base64,${preview}`} alt=""
                                className="w-full h-full object-cover" />
                              <button onClick={() => removeRecordPhoto(i)}
                                className="absolute top-0.5 right-0.5 p-0.5 bg-red-500/80 text-white rounded-md text-[10px]">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          {recordPhotos.length < 3 && (
                            <button onClick={() => recordPhotoInputRef.current?.click()}
                              className="w-16 h-16 rounded-xl border-2 border-dashed border-brand-accent flex items-center justify-center text-brand-accent hover:border-brand-primary hover:text-brand-primary transition-colors">
                              <Camera className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">
                          Link a estudio <span className="text-brand-secondary">(opcional)</span>
                        </label>
                        <input value={recordForm.link_url} onChange={e => setRecordForm(prev => ({ ...prev, link_url: e.target.value }))}
                          className="w-full p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" placeholder="https://drive.google.com/..." />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Fecha</label>
                          <input type="date" value={recordForm.record_date} onChange={e => setRecordForm(prev => ({ ...prev, record_date: e.target.value }))}
                            className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Próximo</label>
                          <input type="date" value={recordForm.next_date} onChange={e => setRecordForm(prev => ({ ...prev, next_date: e.target.value }))}
                            className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Veterinario</label>
                          <input value={recordForm.vet_name} onChange={e => setRecordForm(prev => ({ ...prev, vet_name: e.target.value }))}
                            className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Clínica</label>
                          <input value={recordForm.clinic_name} onChange={e => setRecordForm(prev => ({ ...prev, clinic_name: e.target.value }))}
                            className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" />
                        </div>
                      </div>
                      {(recordForm.record_type === 'vaccine' || recordForm.record_type === 'medication') && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Medicamento</label>
                            <input value={recordForm.medication_name} onChange={e => setRecordForm(prev => ({ ...prev, medication_name: e.target.value }))}
                              className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" />
                          </div>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Dosis</label>
                            <input value={recordForm.dosage} onChange={e => setRecordForm(prev => ({ ...prev, dosage: e.target.value }))}
                              className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" />
                          </div>
                        </div>
                      )}
              {recordForm.record_type === 'expense' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Monto ($)</label>
                  <input type="number" step="0.01" value={recordForm.amount} onChange={e => setRecordForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" />
                </div>
              )}
              {recordForm.record_type === 'weight' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Peso (kg)</label>
                  <input type="number" step="0.1" value={recordForm.amount} onChange={e => setRecordForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" placeholder="Ej: 12.5" />
                </div>
              )}
                    </div>
                    <div className="p-6 sm:p-8 border-t border-brand-accent">
                      <button onClick={handleAddRecord} disabled={recordLoading || !recordForm.title}
                        className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {recordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar registro
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {showVideoModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => { setShowVideoModal(false); setVideoResult(null); }} />
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            ref={videoModalRef}
            className="relative w-full max-w-lg bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-2xl"
          >
            <div className="p-6 sm:p-8 border-b border-brand-accent flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-brand-primary flex items-center gap-2">
                <Play className="w-5 h-5" /> Crear video
              </h3>
              <button onClick={() => { setShowVideoModal(false); setVideoResult(null); }} className="p-2 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            {videoResult ? (
              <div className="p-6 sm:p-8 overflow-y-auto space-y-6 text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <span className="text-3xl">✅</span>
                </div>
                <p className="text-sm font-bold text-gray-800">Video generado correctamente</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <a href={videoResult.url} download
                    className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg transition-all"
                  >
                    <Play className="w-4 h-4" /> Descargar video
                  </a>
                  {navigator.share && (
                    <button onClick={() => navigator.share({ title: pet.name, text: videoTitle || `Video de ${pet.name}`, url: videoResult.url })}
                      className="px-6 py-3 bg-brand-bg text-brand-primary rounded-xl font-bold text-sm flex items-center justify-center gap-2 border border-brand-accent hover:shadow-lg transition-all"
                    >
                      <span className="text-lg">📤</span> Compartir
                    </button>
                  )}
                </div>
                <button onClick={() => setVideoResult(null)} className="text-xs text-gray-400 hover:text-brand-primary transition-colors">
                  Crear otro video
                </button>
              </div>
            ) : (
              <div className="p-6 sm:p-8 overflow-y-auto space-y-5">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Título (opcional)</label>
                  <input value={videoTitle} onChange={e => setVideoTitle(e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" placeholder="Ej: Mis mejores momentos" />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">
                    Fotos ({videoSelectedIds.length}/{Math.min(galleryPhotos.length, 20)} seleccionadas)
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
                    {galleryPhotos.slice(0, 20).map((photo: any) => {
                      const selected = videoSelectedIds.includes(photo.id);
                      return (
                        <button key={photo.id} onClick={() => {
                          setVideoSelectedIds(prev => selected ? prev.filter(id => id !== photo.id) : [...prev, photo.id]);
                          setVideoResult(null);
                        }}
                          className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${selected ? 'border-brand-primary ring-2 ring-brand-primary/30' : 'border-transparent hover:border-brand-accent'}`}
                        >
                          <img src={`/my-pet-photo/${photo.id}`} alt="" className="w-full h-full object-cover" />
                          {selected && (
                            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand-primary text-white flex items-center justify-center text-[10px] font-bold">
                              ✓
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {galleryPhotos.length > 20 && (
                    <p className="text-[10px] text-gray-400 mt-1">Mostrando las primeras 20 fotos</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Música</label>
                    <select value={videoMusic} onChange={e => setVideoMusic(e.target.value)}
                      className="w-full p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm bg-white"
                    >
                      <option value="emotional">🎵 Emocional</option>
                      <option value="latin">🎵 Latina</option>
                      <option value="calm">🎵 Calma</option>
                      <option value="energetic">🎵 Energética</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Formato</label>
                    <div className="flex gap-1 p-1 bg-brand-bg rounded-xl">
                      {[
                        { value: 'vertical', label: '↕️' },
                        { value: 'square', label: '⬜' },
                        { value: 'landscape', label: '↔️' },
                      ].map(f => (
                        <button key={f.value} onClick={() => setVideoFormat(f.value)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${videoFormat === f.value ? 'bg-white shadow-sm text-brand-primary' : 'text-gray-400'}`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Duración por foto</label>
                  <div className="flex gap-2">
                    {[1.5, 2, 3].map(d => (
                      <button key={d} onClick={() => setVideoPerPhotoDur(d)}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${videoPerPhotoDur === d ? 'bg-brand-primary/10 text-brand-primary border-brand-primary' : 'bg-white text-gray-500 border-brand-accent hover:border-brand-primary/50'}`}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!videoResult && (
              <div className="p-6 sm:p-8 border-t border-brand-accent shrink-0">
                <button onClick={async () => {
                  if (videoSelectedIds.length < 3) return;
                  try {
                    setVideoLoading(true);
                    setVideoResult(null);
                    const r = await api.myPets.generateVideo(id!, {
                      photo_ids: videoSelectedIds,
                      title: videoTitle,
                      music: videoMusic,
                      format: videoFormat,
                      per_photo_dur: videoPerPhotoDur,
                    });
                    setVideoResult({ url: r.videoUrl, thumbUrl: r.thumbnailUrl || null });
                  } catch (e: any) {
                    alert(e.message || 'Error al generar video');
                  } finally {
                    setVideoLoading(false);
                  }
                }}
                  disabled={videoLoading || videoSelectedIds.length < 3}
                  className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 hover:shadow-lg transition-all"
                >
                  {videoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {videoLoading ? 'Generando...' : `Generar video (${videoSelectedIds.length} fotos)`}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}

      {previewPhotoUrl && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <img src={previewPhotoUrl}
            className="max-w-full max-h-[90vh] object-contain rounded-2xl"
            onClick={(e) => e.stopPropagation()} />
        </motion.div>
      )}
    </div></>
  );
}
