import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';
import { api, apiUrl } from '@/src/lib/api';
import { fileToBase64 } from '@/src/lib/storageService';
import { formatDate } from '@/src/lib/formatDate';
import { formatTag, PERSONALITY_TAG_EMOJIS } from '@/src/lib/personalityTags';
import ImageCropper from '@/src/components/ImageCropper';
import {
  PawPrint, Plus, Loader2, X, Save, Dog, Cat, Heart,
  Syringe, Scissors, Bug, Weight, Calendar, Sparkles, ChevronRight,
  QrCode, ShieldCheck, Share2, Phone, Check, Clock, AlertTriangle, User,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QrClaimModal from '@/src/components/QrClaimModal';
import { PhoneInput } from '@/src/components/PhoneInput';

const SPECIES_OPTIONS = [
  { value: 'dog', label: 'Perro', icon: <Dog className="w-5 h-5" /> },
  { value: 'cat', label: 'Gato', icon: <Cat className="w-5 h-5" /> },
  { value: 'other', label: 'Otro', icon: <PawPrint className="w-5 h-5" /> },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Macho' },
  { value: 'female', label: 'Hembra' },
  { value: 'unknown', label: 'No sé' },
];

const PERSONALITY_TAGS = [
  'juguetón', 'tranquilo', 'cariñoso', 'miedoso', 'explorador',
  'dormilón', 'guardián', 'sociable', 'independiente', 'travieso',
  'leal', 'curioso', 'mimoso', 'atlético', 'glotón',
];

const PET_TYPE_OPTIONS = [
  { value: 'own', label: 'Propia', desc: 'Mascota de la familia' },
  { value: 'foster', label: 'Tránsito', desc: 'Está de paso en casa' },
  { value: 'adoption', label: 'Adopción', desc: 'Busca un hogar' },
  { value: 'community', label: 'Comunitaria', desc: 'De la cuadra/barrio' },
];

const PET_TYPE_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  own: { label: 'Propia', bg: 'bg-white/20', text: 'text-white' },
  foster: { label: 'Tránsito', bg: 'bg-amber-500/70', text: 'text-white' },
  adoption: { label: 'Adopción', bg: 'bg-rose-500/70', text: 'text-white' },
  community: { label: 'Comunitaria', bg: 'bg-purple-500/70', text: 'text-white' },
};

const emptyForm = {
  name: '', species: 'dog' as 'dog' | 'cat' | 'other', breed: '', color: '',
  gender: 'unknown' as string, birth_date: '', chip_id: '', bio: '',
  personality_tags: [] as string[], is_vaccinated: false, is_sterilized: false,
  is_dewormed: false, weight_kg: '',
  behavior_notes: '', medical_notes: '', emergency_phone: '',
  pet_type: 'own',
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
  return `${years} año${years !== 1 ? 's' : ''} y ${months} mes${months !== 1 ? 'es' : ''}`;
}

export default function MyPetsPortal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [myPets, setMyPets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAdoptions, setPendingAdoptions] = useState<any[]>([]);
  const [pendingAdoptionsLoading, setPendingAdoptionsLoading] = useState(false);
  const [incomingAdoptions, setIncomingAdoptions] = useState<any[]>([]);
  const [incomingAdoptionsLoading, setIncomingAdoptionsLoading] = useState(false);
  const [incomingClaimingId, setIncomingClaimingId] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formLoading, setFormLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [showQrClaim, setShowQrClaim] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePhone, setSharePhone] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [sharePhoneValid, setSharePhoneValid] = useState(true);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareResult, setShareResult] = useState<{ shared?: boolean; invited?: boolean; inviteLink?: string } | null>(null);
  const [shareSelectedPets, setShareSelectedPets] = useState<Set<string>>(new Set());
  const [showAdoptionModal, setShowAdoptionModal] = useState(false);
  const [adoptionPet, setAdoptionPet] = useState<any>(null);
  const [adopterName, setAdopterName] = useState('');
  const [adopterPhone, setAdopterPhone] = useState('');
  const [adopterPhoneValid, setAdopterPhoneValid] = useState(false);
  const [adoptionLoading, setAdoptionLoading] = useState(false);
  const [adoptionDone, setAdoptionDone] = useState(false);
  const [deletePet, setDeletePet] = useState<any>(null);
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'final'>('confirm');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleSharePhoneChange = (value: string, e164?: string) => {
    setSharePhone(value);
    setSharePhoneValid(!value || !!e164);
  };

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchPets();
  }, [user]);

  const fetchPets = async () => {
    try {
      setLoading(true);
      const data = await api.myPets.list();
      setMyPets(data.myPets || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchPendingAdoptions = async () => {
    try {
      setPendingAdoptionsLoading(true);
      const data = await api.adoptionAssignments.pending();
      setPendingAdoptions(data.assignments || []);
    } catch (e) { console.error(e); }
    finally { setPendingAdoptionsLoading(false); }
  };

  const fetchIncomingAdoptions = async () => {
    try {
      setIncomingAdoptionsLoading(true);
      const data = await api.adoptionAssignments.myPending();
      setIncomingAdoptions(data.assignments || []);
    } catch (e) { console.error(e); }
    finally { setIncomingAdoptionsLoading(false); }
  };

  useEffect(() => {
    if (user) fetchPendingAdoptions();
    if (user) fetchIncomingAdoptions();
  }, [user]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
  };

  const handleCropComplete = (croppedBlob: Blob) => {
    const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(croppedBlob));
    setCropFile(null);
  };

  const handleCropCancel = () => {
    setCropFile(null);
  };

  const handleSubmit = async () => {
    if (!form.name) return;
    try {
      setFormLoading(true);
      let avatarData = undefined;
      let avatarMime = undefined;
      if (avatarFile) {
        const { data, mimeType } = await fileToBase64(avatarFile);
        avatarData = data;
        avatarMime = mimeType;
      }

      const payload: any = { ...form };
      if (avatarData) { payload.avatar_image = avatarData; payload.avatar_mime_type = avatarMime; }
      if (payload.weight_kg === '') payload.weight_kg = null;

      if (editingId) {
        await api.myPets.update(editingId, payload);
      } else {
        await api.myPets.create(payload);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...emptyForm });
      setAvatarFile(null);
      setAvatarPreview(null);
      await fetchPets();
    } catch (e) { console.error(e); }
    finally { setFormLoading(false); }
  };

  const handleEdit = (pet: any) => {
    setEditingId(pet.id);
    setForm({
      name: pet.name, species: pet.species, breed: pet.breed || '', color: pet.color || '',
      gender: pet.gender || 'unknown', birth_date: pet.birth_date || '', chip_id: pet.chip_id || '',
      bio: pet.bio || '', personality_tags: pet.personality_tags || [],
      is_vaccinated: pet.is_vaccinated, is_sterilized: pet.is_sterilized,
      is_dewormed: pet.is_dewormed, weight_kg: pet.weight_kg || '',
      behavior_notes: pet.behavior_notes || '', medical_notes: pet.medical_notes || '',
      emergency_phone: pet.emergency_phone || '',
      pet_type: pet.pet_type || 'own',
    });
    setAvatarPreview(null);
    setAvatarFile(null);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    setDeleteLoading(true);
    try {
      await api.myPets.delete(id);
      await fetchPets();
      setDeletePet(null);
      setDeleteStep('confirm');
    } catch (e) { console.error(e); alert('Error al eliminar la mascota'); }
    finally { setDeleteLoading(false); }
  };

  const handleShare = async () => {
    if (!shareEmail && !sharePhone) return;
    if (sharePhone && !sharePhoneValid) return;
    if (shareSelectedPets.size === 0) return;
    setShareLoading(true);
    setShareResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/invites'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          myPetIds: Array.from(shareSelectedPets),
          email: shareEmail || undefined,
          phone: sharePhone || undefined,
          message: shareMsg || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShareResult({ shared: data.results?.some((r: any) => r.shared), invited: data.results?.some((r: any) => r.invited), inviteLink: data.inviteLink });
      } else {
        alert(data.error || 'Error al compartir');
      }
    } catch (e) {
      alert('Error al compartir');
    } finally {
      setShareLoading(false);
    }
  };

  const toggleSharePet = (petId: string) => {
    setShareSelectedPets(prev => {
      const next = new Set(prev);
      if (next.has(petId)) next.delete(petId);
      else next.add(petId);
      return next;
    });
  };

  const toggleTag = (tag: string) => {
    setForm(prev => ({
      ...prev,
      personality_tags: prev.personality_tags.includes(tag)
        ? prev.personality_tags.filter(t => t !== tag)
        : [...prev.personality_tags, tag],
    }));
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-brand-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary flex items-center gap-3">
            <PawPrint className="w-7 h-7" /> Mis Mascotas
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">El portal de tus compañeros</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setAvatarPreview(null); setAvatarFile(null); setShowForm(true); }}
            className="w-full sm:w-auto px-4 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Registrar
          </button>
          <button
            onClick={() => {
              setShareEmail(''); setSharePhone(''); setShareMsg(''); setShareResult(null);
              setShareSelectedPets(new Set(myPets.map(p => p.id)));
              setShowShareModal(true);
            }}
            className="w-full sm:w-auto px-4 py-2.5 bg-brand-primary/10 text-brand-primary rounded-xl font-bold text-sm hover:bg-brand-primary/20 transition-all flex items-center justify-center gap-2 border border-brand-primary/20"
          >
            <Share2 className="w-4 h-4" /> Compartir mascotas
          </button>
          <button
            onClick={() => setShowQrClaim(true)}
            className="w-full sm:w-auto px-4 py-2.5 bg-brand-primary/10 text-brand-primary rounded-xl font-bold text-sm hover:bg-brand-primary/20 transition-all flex items-center justify-center gap-2 border border-brand-primary/20"
          >
            <QrCode className="w-4 h-4" /> Asociar QR
          </button>
        </div>
      </div>

      {incomingAdoptions.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="w-5 h-5 text-brand-primary" />
            <h2 className="text-lg font-bold text-brand-primary">Adopción en espera</h2>
            {incomingAdoptionsLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>
          <div className="space-y-3">
            {incomingAdoptions.map((ass: any) => (
              <div key={ass.id} className="bg-white rounded-2xl border border-brand-accent p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <PawPrint className="w-4 h-4 text-brand-primary shrink-0" />
                      <h3 className="text-sm font-bold text-gray-800 truncate">{ass.pet_name}</h3>
                      <span className="text-[10px] px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded-full font-medium">
                        {ass.species === 'dog' ? 'Perro' : ass.species === 'cat' ? 'Gato' : ass.species}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" /> {ass.inviter_name || 'Alguien'}</span>
                    </div>
                    {ass.qr_code && (
                      <p className="text-[10px] text-gray-400 mt-1">QR asignado: {ass.qr_code}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      Creada: {formatDate(ass.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={async () => {
                        if (!confirm(`¿Confirmás que ${ass.pet_name} pasa a ser tuya? La mascota y su chapita QR se asociarán a tu cuenta.`)) return;
                        setIncomingClaimingId(ass.id);
                        try {
                          await api.adoptionAssignments.claim(ass.token);
                          await fetchIncomingAdoptions();
                          await fetchPets();
                        } catch (e: any) {
                          alert(e.message || 'Error al confirmar');
                        } finally {
                          setIncomingClaimingId(null);
                        }
                      }}
                      disabled={incomingClaimingId === ass.id}
                      className="shrink-0 px-3 py-1.5 bg-brand-primary text-white rounded-xl text-xs font-medium hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {incomingClaimingId === ass.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Confirmar adopción
                    </button>
                  </div>
                </div>
                <div className="mt-3 p-2 bg-brand-accent/20 rounded-xl border border-brand-accent text-[11px] text-gray-600">
                  {ass.status === 'completed' && !ass.adopter_id
                    ? '✅ El dueño ya confirmó la entrega. Confirmá vos para recibirla en tu cuenta.'
                    : '⏳ Te confiaron esta mascota. Confirmá para recibirla junto con su chapita QR.'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingAdoptions.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-brand-primary">Adopciones pendientes</h2>
            {pendingAdoptionsLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>
          <div className="space-y-3">
            {pendingAdoptions.map((ass: any) => (
              <div key={ass.id} className="bg-white rounded-2xl border border-amber-200 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <PawPrint className="w-4 h-4 text-brand-primary shrink-0" />
                      <h3 className="text-sm font-bold text-gray-800 truncate">{ass.pet_name}</h3>
                      <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                        {ass.species === 'dog' ? 'Perro' : ass.species === 'cat' ? 'Gato' : ass.species}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" /> {ass.adopter_name}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {ass.adopter_phone}</span>
                    </div>
                    {ass.qr_code && (
                      <p className="text-[10px] text-gray-400 mt-1">QR asignado: {ass.qr_code}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      Creada: {formatDate(ass.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0 sm:flex-row sm:items-center">
                    <button
                      onClick={async () => {
                        if (!confirm(`¿Confirmás que ${ass.pet_name} fue adoptada por ${ass.adopter_name}? Dejarás de ser su responsable y la mascota pasará a su nombre.`)) return;
                        setConfirmingId(ass.id);
                        try {
                          await api.adoptionAssignments.confirm(ass.token);
                          await fetchPendingAdoptions();
                          await fetchPets();
                        } catch (e: any) {
                          alert(e.message || 'Error al confirmar');
                        } finally {
                          setConfirmingId(null);
                        }
                      }}
                      disabled={confirmingId === ass.id}
                      className="shrink-0 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-medium hover:bg-emerald-100 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {confirmingId === ass.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Confirmar adopción
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`¿Cancelar la adopción de ${ass.pet_name}? La mascota volverá a estar disponible.`)) return;
                        setReturningId(ass.id);
                        try {
                          await api.adoptionAssignments.return(ass.token);
                          await fetchPendingAdoptions();
                        } catch (e: any) {
                          alert(e.message || 'Error al cancelar');
                        } finally {
                          setReturningId(null);
                        }
                      }}
                      disabled={returningId === ass.id}
                      className="shrink-0 px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-xs font-medium hover:bg-red-100 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {returningId === ass.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                      Cancelar
                    </button>
                  </div>
                </div>
                <div className="mt-3 p-2 bg-amber-50 rounded-xl border border-amber-100 text-[11px] text-amber-700">
                  ⏳ El adoptante puede confirmar al abrir el link, o podés confirmar vos desde acá para cerrar la adopción. Si no se concreta, podés cancelar y la mascota vuelve a tu lista.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {myPets.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] border border-dashed border-brand-accent p-8 sm:p-12 text-center"
        >
          <PawPrint className="w-16 h-16 text-brand-accent mx-auto mb-4" />
          <h3 className="text-xl font-bold text-brand-primary mb-2">Todavía no registraste mascotas</h3>
          <p className="text-gray-500 mb-6">Registra a tus compañeros para llevar su ficha, galería, timeline y salud.</p>
          <button
            onClick={() => { setEditingId(null); setForm({ ...emptyForm }); setAvatarPreview(null); setAvatarFile(null); setShowForm(true); }}
            className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all"
          >
            <Plus className="w-4 h-4 inline mr-2" /> Registrar mi primera mascota
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {myPets.map((pet) => (
            <motion.div
              key={pet.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="group bg-white rounded-[2rem] border border-brand-accent overflow-hidden hover:shadow-lg hover:border-brand-primary/30 transition-all cursor-pointer"
              onClick={() => navigate(`/mi-mascota/${pet.id}`)}
            >
              <div className="relative aspect-square bg-brand-bg">
                {pet.avatar_image ? (
                  <img src={apiUrl(`/my-pet-avatar/${pet.id}`)} alt={pet.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <PawPrint className="w-20 h-20 text-brand-accent" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 pt-12">
                  {pet.pet_type && pet.pet_type !== 'own' && (
                    <div className="absolute top-3 left-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-sm ${PET_TYPE_BADGE[pet.pet_type]?.bg || 'bg-white/20'} ${PET_TYPE_BADGE[pet.pet_type]?.text || 'text-white'}`}>
                        {PET_TYPE_BADGE[pet.pet_type]?.label}
                      </span>
                    </div>
                  )}
                  {!pet.has_pending_adoption && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletePet(pet); setDeleteStep('confirm'); }}
                      className="absolute top-3 right-3 p-2 rounded-full bg-white/90 backdrop-blur-sm text-red-500 hover:bg-red-50 hover:text-red-600 shadow-sm transition-colors"
                      title="Eliminar mascota"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">{pet.name}</h3>
                    {pet.qr_id && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-full text-[10px] text-white font-medium">
                        <QrCode className="w-3 h-3" /> Identificado
                      </span>
                    )}
                  </div>
                  <p className="text-white/80 text-xs">
                    {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otro'}
                    {pet.breed ? ` · ${pet.breed}` : ''}
                    {pet.birth_date ? ` · ${getAge(pet.birth_date)}` : ''}
                  </p>
                </div>
              </div>
              <div className="p-4">
                {pet.personality_tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                {pet.personality_tags.slice(0, 4).map((tag: string) => (
                  <span key={tag} className="text-[10px] sm:text-xs px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded-full">{formatTag(tag)}</span>
                    ))}
                    {pet.personality_tags.length > 4 && (
                      <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-brand-accent text-gray-500 rounded-full">+{pet.personality_tags.length - 4}</span>
                    )}
                  </div>
                )}
                {pet.pet_type === 'adoption' && !pet.has_pending_adoption && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowAdoptionModal(true); setAdoptionPet(pet); setAdopterName(''); setAdopterEmail(''); setAdopterPhone(''); }}
                    className="w-full mb-3 py-2 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-rose-100 transition-colors border border-rose-200"
                  >
                    <Heart className="w-3.5 h-3.5" /> Dar en adopción
                  </button>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex gap-2 flex-wrap">
                    {pet.is_vaccinated && <Syringe className="w-4 h-4 text-emerald-500" title="Vacunado" />}
                    {pet.is_sterilized && <Scissors className="w-4 h-4 text-blue-500" title="Esterilizado" />}
                    {pet.is_dewormed && <Bug className="w-4 h-4 text-amber-500" title="Desparasitado" />}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <span>{pet.photo_count || 0} fotos</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ─── SHARE SECTION ─── */}
      {myPets.length > 0 && (
        <div className="hidden sm:block mt-8 bg-white rounded-2xl border border-brand-accent p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-primary/10 text-brand-primary shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-700">Compartir mascotas</p>
              <p className="text-xs text-gray-400">Invita por email o whatsapp a compartir el perfil de tus mascotas</p>
            </div>
            <button
              onClick={() => {
                setShareEmail(''); setSharePhone(''); setShareMsg(''); setShareResult(null);
                setShareSelectedPets(new Set(myPets.map(p => p.id)));
                setShowShareModal(true);
              }}
              className="shrink-0 px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:shadow-lg transition-all flex items-center gap-2"
            >
              <Share2 className="w-3.5 h-3.5" /> Compartir
            </button>
          </div>
        </div>
      )}

      {/* ─── SHARE MODAL ─── */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-brand-primary/20 backdrop-blur-sm"
          >
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] p-6 sm:p-8"
            >
              <button onClick={() => setShowShareModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-bold text-gray-800 mb-1">Compartir mascotas</h3>
              <p className="text-xs text-gray-400 mb-5">Invita por email o whatsapp a compartir el perfil de tus mascotas</p>

              {/* Pet selection */}
              <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-2">Mascotas a compartir</label>
              <div className="space-y-1.5 mb-4 max-h-40 overflow-y-auto">
                {myPets.map(pet => (
                  <label key={pet.id}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-brand-bg cursor-pointer transition-colors"
                  >
                    <input type="checkbox" checked={shareSelectedPets.has(pet.id)}
                      onChange={() => toggleSharePet(pet.id)}
                      className="w-4 h-4 rounded accent-brand-primary"
                    />
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-brand-bg shrink-0">
                      {pet.avatar_image ? (
                        <img src={apiUrl(`/my-pet-avatar/${pet.id}`)} alt={pet.name} className="w-full h-full object-cover" />
                      ) : (
                        <PawPrint className="w-4 h-4 text-brand-accent m-2" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{pet.name}</span>
                  </label>
                ))}
              </div>

              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 mb-4 leading-relaxed">
                Completá el mail o el WhatsApp de la persona a la que le querés compartir el perfil de tus mascotas.
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
                  <PhoneInput value={sharePhone} onChange={handleSharePhoneChange}
                    placeholder="549XXXXXXXXXX"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 block mb-1">Mensaje (opcional)</label>
                  <textarea value={shareMsg} onChange={e => setShareMsg(e.target.value)}
                    placeholder="Ej: Hola! Te comparto las fichas de mis mascotas para que podamos coordinar"
                    rows={3}
                    className="w-full p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm resize-none"
                  />
                </div>

                <button onClick={handleShare}
                  disabled={shareLoading || (!shareEmail && !sharePhone) || shareSelectedPets.size === 0 || !sharePhoneValid}
                  className="w-full py-3 bg-brand-primary text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {shareLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                  {shareLoading ? 'Compartiendo...' : 'Compartir'}
                </button>

                {shareResult && (
                  <div className={`p-3 rounded-xl text-xs font-medium text-center ${
                    shareResult.shared ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                  }`}>
                    {shareResult.shared
                      ? '✅ Usuario encontrado. Ya tiene acceso a las fichas.'
                      : shareResult.invited
                      ? `📧 Invitación enviada. Compartí este link si querés: ${shareResult.inviteLink}`
                      : '✅ Acceso compartido exitosamente.'}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => setShowForm(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-2xl"
            >
              <div className="p-6 sm:p-8 border-b border-brand-accent flex items-center justify-between">
                <h2 className="text-xl font-bold text-brand-primary">
                  {editingId ? 'Editar mascota' : 'Registrar mascota'}
                </h2>
                <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="p-6 sm:p-8 overflow-y-auto space-y-5">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-brand-accent hover:border-brand-primary bg-brand-bg flex items-center justify-center overflow-hidden transition-colors shrink-0"
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <PawPrint className="w-8 h-8 text-brand-accent" />
                    )}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
                  <div className="flex-1">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Nombre</label>
                    <input
                      value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm"
                      placeholder="Nombre de tu mascota"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Especie</label>
                  <div className="grid grid-cols-3 gap-2">
                    {SPECIES_OPTIONS.map(opt => (
                      <button key={opt.value}
                        onClick={() => setForm(prev => ({ ...prev, species: opt.value as any }))}
                        className={`p-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                          form.species === opt.value
                            ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                            : 'border-brand-accent hover:border-brand-primary/50 text-gray-600'
                        }`}
                      >
                        {opt.icon} {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Clasificación</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PET_TYPE_OPTIONS.map(opt => (
                      <button key={opt.value}
                        onClick={() => setForm(prev => ({ ...prev, pet_type: opt.value }))}
                        className={`p-3 rounded-xl border text-sm font-medium text-left transition-all ${
                          form.pet_type === opt.value
                            ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                            : 'border-brand-accent hover:border-brand-primary/50 text-gray-600'
                        }`}
                      >
                        <div className="font-semibold">{opt.label}</div>
                        <div className="text-[10px] opacity-70">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Raza</label>
                    <input value={form.breed} onChange={e => setForm(prev => ({ ...prev, breed: e.target.value }))}
                      className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" placeholder="Ej: Labrador" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Color</label>
                    <input value={form.color} onChange={e => setForm(prev => ({ ...prev, color: e.target.value }))}
                      className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" placeholder="Ej: Dorado" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Sexo</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {GENDER_OPTIONS.map(opt => (
                        <button key={opt.value}
                          onClick={() => setForm(prev => ({ ...prev, gender: opt.value }))}
                          className={`p-2 rounded-xl border text-xs font-medium transition-all ${
                            form.gender === opt.value
                              ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                              : 'border-brand-accent hover:border-brand-primary/50 text-gray-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Fecha de nacimiento</label>
                    <input type="date" value={form.birth_date} onChange={e => setForm(prev => ({ ...prev, birth_date: e.target.value }))}
                      className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Chip ID</label>
                    <input value={form.chip_id} onChange={e => setForm(prev => ({ ...prev, chip_id: e.target.value }))}
                      className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" placeholder="Nro. de microchip" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Peso (kg)</label>
                    <input type="number" step="0.1" value={form.weight_kg} onChange={e => setForm(prev => ({ ...prev, weight_kg: e.target.value }))}
                      className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" placeholder="Ej: 12.5" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Descripción / Señas particulares</label>
                  <textarea value={form.bio} onChange={e => setForm(prev => ({ ...prev, bio: e.target.value }))}
                    className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm resize-none" rows={2}
                    placeholder="Contanos cómo es tu mascota, sus señas particulares, manchas, cicatrices, comportamiento..." />
                  <p className="text-[10px] sm:text-xs text-gray-400 mt-1">Esta información es importante para encontrarla si se pierde</p>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Personalidad</label>
                  <div className="flex flex-wrap gap-2">
              {PERSONALITY_TAGS.map(tag => (
                <button key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    form.personality_tags.includes(tag)
                      ? 'bg-brand-primary text-white'
                      : 'bg-brand-bg text-gray-500 hover:bg-brand-accent'
                  }`}
                >
                  {PERSONALITY_TAG_EMOJIS[tag]} {tag}
                </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Salud</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'is_vaccinated', label: 'Vacunado', icon: <Syringe className="w-3 h-3" /> },
                      { key: 'is_sterilized', label: 'Esterilizado', icon: <Scissors className="w-3 h-3" /> },
                      { key: 'is_dewormed', label: 'Desparasitado', icon: <Bug className="w-3 h-3" /> },
                    ].map(item => (
                      <button key={item.key}
                        onClick={() => setForm(prev => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))}
                        className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                          form[item.key as keyof typeof form]
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-brand-bg text-gray-400 border border-brand-accent'
                        }`}
                      >
                        {item.icon} {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Comportamiento</label>
                  <textarea value={form.behavior_notes || ''} onChange={e => setForm(prev => ({ ...prev, behavior_notes: e.target.value }))}
                    className="w-full p-3 rounded-xl border border-brand-accent bg-brand-bg outline-none text-sm resize-none" rows={2}
                    placeholder="¿Cómo es su comportamiento? (miedos, cómo acercarse, etc.)" />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Notas médicas</label>
                  <textarea value={form.medical_notes || ''} onChange={e => setForm(prev => ({ ...prev, medical_notes: e.target.value }))}
                    className="w-full p-3 rounded-xl border border-brand-accent bg-brand-bg outline-none text-sm resize-none" rows={2}
                    placeholder="Alergias, medicación, condiciones (opcional)" />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Teléfono de emergencia</label>
                  <PhoneInput value={form.emergency_phone || ''} onChange={(value, e164) => setForm(prev => ({ ...prev, emergency_phone: e164 || value }))}
                    placeholder="Teléfono alternativo (opcional)"
                    className="bg-brand-bg"
                  />
                </div>
              </div>

              <div className="p-6 sm:p-8 border-t border-brand-accent">
                <button
                  onClick={handleSubmit} disabled={formLoading || !form.name}
                  className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingId ? 'Guardar cambios' : 'Registrar mascota'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQrClaim && (
          <QrClaimModal
            onClose={() => setShowQrClaim(false)}
            onSuccess={async () => { setShowQrClaim(false); await fetchPets(); }}
            myPets={myPets}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdoptionModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-brand-primary/20 backdrop-blur-sm"
          >
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] p-6 sm:p-8"
            >
              <button onClick={() => setShowAdoptionModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>

              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Heart className="w-7 h-7 text-rose-500" />
                </div>
                <h3 className="text-lg font-bold text-gray-800">Dar en adopción</h3>
                <p className="text-xs text-gray-400 mt-1">Ingresá los datos de la persona que se lleva a {adoptionPet?.name}</p>
                <Link to="/manual/adopcion" className="text-[10px] text-brand-primary hover:underline font-bold mt-1 inline-block">
                  ¿Cómo funciona la adopción?
                </Link>
              </div>

              {adoptionDone ? (
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-green-600" />
                  </div>
                  <p className="text-sm font-medium text-green-700 mb-2">¡Adopción pendiente creada!</p>
                  <p className="text-xs text-gray-500 mb-4">
                    {adopterName} recibirá un link para registrarse y confirmar. La mascota aparece en tu sección "Adopciones pendientes".
                  </p>
                  <button onClick={() => setShowAdoptionModal(false)}
                    className="px-6 py-2.5 bg-brand-primary text-white rounded-xl text-sm font-bold"
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">Nombre del adoptante *</label>
                    <input type="text" value={adopterName} onChange={e => setAdopterName(e.target.value)}
                      className="w-full p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
                      placeholder="Nombre" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">WhatsApp *</label>
                    <PhoneInput value={adopterPhone} onChange={(value, e164) => { setAdopterPhone(value); setAdopterPhoneValid(!!e164); }}
                      placeholder="+54 9 221 123456" />
                  </div>

                  <button
                    onClick={async () => {
                      if (!adopterName || !adopterPhoneValid) { alert('Completá nombre y un WhatsApp válido (549XXXXXXXXXX)'); return; }
                      setAdoptionLoading(true);
                      try {
                        const shareToken = adoptionPet?.qr_id?.share_token;
                        await api.requestChapita({
                          pet: {
                            name: adoptionPet.name,
                            species: adoptionPet.species,
                            breed: adoptionPet.breed,
                            color: adoptionPet.color,
                            gender: adoptionPet.gender,
                            bio: adoptionPet.bio,
                            is_vaccinated: adoptionPet.is_vaccinated,
                            is_sterilized: adoptionPet.is_sterilized,
                            is_dewormed: adoptionPet.is_dewormed,
                            location: '',
                          },
                          share_token: shareToken || undefined,
                          for_adopter: true,
                          my_pet_id: adoptionPet.id,
                          adopter: { name: adopterName, phone: adopterPhone },
                        });
                        setAdoptionDone(true);
                        await fetchPets();
                        await fetchPendingAdoptions();
                      } catch (e: any) {
                        alert(e.message || 'Error al procesar');
                      } finally {
                        setAdoptionLoading(false);
                      }
                    }}
                    disabled={adoptionLoading}
                    className="w-full py-3 bg-rose-500 text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {adoptionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
                    {adoptionLoading ? 'Procesando...' : 'Confirmar entrega'}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ELIMINAR MASCOTA (doble confirmación) ─── */}
      <AnimatePresence>
        {deletePet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm"
              onClick={() => { if (!deleteLoading) setDeletePet(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-xl p-6 sm:p-8"
            >
              <button
                onClick={() => { if (!deleteLoading) setDeletePet(null); }}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center bg-red-100">
                  <Trash2 className="w-7 h-7 text-red-500" />
                </div>
                {deleteStep === 'confirm' ? (
                  <>
                    <h2 className="text-xl font-bold text-brand-primary">¿Eliminar a {deletePet.name}?</h2>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      Esta mascota se quitará de tu portal "Mis mascotas".
                    </p>
                    <div className="flex gap-3 w-full mt-2">
                      <button
                        onClick={() => setDeletePet(null)}
                        className="flex-1 px-4 py-3 border border-brand-accent rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => setDeleteStep('final')}
                        className="flex-1 px-4 py-3 bg-red-500 rounded-xl text-sm font-bold text-white hover:bg-red-600 transition-all"
                      >
                        Continuar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-brand-primary">¿Seguro que querés eliminarla?</h2>
                    <p className="text-gray-500 text-sm leading-relaxed">
                      Se borrarán todas las fotos, eventos y registros de {deletePet.name}. Esta acción no se puede deshacer.
                    </p>
                    <div className="flex gap-3 w-full mt-2">
                      <button
                        onClick={() => setDeleteStep('confirm')}
                        disabled={deleteLoading}
                        className="flex-1 px-4 py-3 border border-brand-accent rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        Volver
                      </button>
                      <button
                        onClick={() => handleDelete(deletePet.id)}
                        disabled={deleteLoading}
                        className="flex-1 px-4 py-3 bg-red-500 rounded-xl text-sm font-bold text-white hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        {deleteLoading ? 'Eliminando...' : 'Eliminar definitivamente'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {cropFile && (
        <ImageCropper file={cropFile} aspect={1} onCropComplete={handleCropComplete} onCancel={handleCropCancel} />
      )}
    </div>
  );
}
