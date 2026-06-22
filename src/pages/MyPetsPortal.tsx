import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { fileToBase64 } from '@/src/lib/storageService';
import { formatTag, PERSONALITY_TAG_EMOJIS } from '@/src/lib/personalityTags';
import ImageCropper from '@/src/components/ImageCropper';
import {
  PawPrint, Plus, Loader2, X, Save, Dog, Cat, Heart,
  Syringe, Scissors, Bug, Weight, Calendar, Sparkles, ChevronRight,
  QrCode, ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QrClaimModal from '@/src/components/QrClaimModal';

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
  return `${years} año${years !== 1 ? 's' : ''} ${months}m`;
}

export default function MyPetsPortal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [myPets, setMyPets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formLoading, setFormLoading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [showQrClaim, setShowQrClaim] = useState(false);

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
    if (!confirm('¿Eliminar esta mascota? Se borrarán todas las fotos, eventos y registros.')) return;
    try {
      await api.myPets.delete(id);
      await fetchPets();
    } catch (e) { console.error(e); }
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
            onClick={() => setShowQrClaim(true)}
            className="w-full sm:w-auto px-4 py-2.5 bg-brand-primary/10 text-brand-primary rounded-xl font-bold text-sm hover:bg-brand-primary/20 transition-all flex items-center justify-center gap-2 border border-brand-primary/20"
          >
            <QrCode className="w-4 h-4" /> Asociar QR
          </button>
        </div>
      </div>

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
                  <img src={`/my-pet-avatar/${pet.id}`} alt={pet.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <PawPrint className="w-20 h-20 text-brand-accent" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4 pt-12">
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
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Tipo</label>
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
                  <input type="tel" value={form.emergency_phone || ''} onChange={e => setForm(prev => ({ ...prev, emergency_phone: e.target.value }))}
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm"
                    placeholder="Teléfono alternativo (opcional)" />
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

      {cropFile && (
        <ImageCropper file={cropFile} aspect={1} onCropComplete={handleCropComplete} onCancel={handleCropCancel} />
      )}
    </div>
  );
}
