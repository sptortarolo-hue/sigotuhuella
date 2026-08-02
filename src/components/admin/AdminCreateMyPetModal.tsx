import { useState, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, PawPrint, Save, Camera } from 'lucide-react';
import { api } from '@/src/lib/api';
import { compressImage, fileToBase64 } from '@/src/lib/storageService';

const SPECIES_OPTIONS = [
  { value: 'dog', label: '🐶 Perro' },
  { value: 'cat', label: '🐱 Gato' },
  { value: 'other', label: '🐾 Otro' },
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

interface AdminCreateMyPetModalProps {
  isOpen: boolean;
  userId: string | null;
  userName?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function AdminCreateMyPetModal({ isOpen, userId, userName, onClose, onSaved }: AdminCreateMyPetModalProps) {
  const [form, setForm] = useState({
    name: '',
    species: 'dog' as string,
    breed: '',
    color: '',
    gender: 'unknown' as string,
    birth_date: '',
    chip_id: '',
    weight_kg: '',
    bio: '',
    personality_tags: [] as string[],
    pet_type: 'own' as string,
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const toggleTag = (tag: string) => {
    setForm(prev => ({
      ...prev,
      personality_tags: prev.personality_tags.includes(tag)
        ? prev.personality_tags.filter(t => t !== tag)
        : [...prev.personality_tags, tag],
    }));
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 800, 0.85);
      setAvatarFile(compressed);
      setAvatarPreview(URL.createObjectURL(compressed));
    } catch {
      alert('Error al procesar la imagen');
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    if (!form.name.trim()) { alert('El nombre es obligatorio'); return; }
    setSaving(true);
    try {
      const payload: any = {
        name: form.name,
        species: form.species,
        breed: form.breed || null,
        color: form.color || null,
        gender: form.gender,
        birth_date: form.birth_date || null,
        chip_id: form.chip_id || null,
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
        bio: form.bio || null,
        personality_tags: form.personality_tags,
        pet_type: form.pet_type,
      };
      if (avatarFile) {
        const { data, mimeType } = await fileToBase64(avatarFile);
        payload.avatar_image = data;
        payload.avatar_mime_type = mimeType;
      }
      await api.myPets.createForUser(userId, payload);
      onSaved();
      handleCloseSilently();
    } catch (err: any) {
      alert(err.message || 'Error al crear mascota');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleCloseSilently = () => {
    reset();
    onClose();
  };

  const reset = () => {
    setForm({
      name: '', species: 'dog', breed: '', color: '', gender: 'unknown',
      birth_date: '', chip_id: '', weight_kg: '', bio: '', personality_tags: [], pet_type: 'own',
    });
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-brand-accent shrink-0">
              <div>
                <h2 className="text-xl font-bold text-brand-primary">Agregar Mascota</h2>
                {userName && <p className="text-xs text-gray-400">Dueño/a: {userName}</p>}
              </div>
              <button onClick={handleClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl bg-brand-bg overflow-hidden shrink-0 border-2 border-brand-accent flex items-center justify-center">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <PawPrint className="w-8 h-8 text-gray-300" />
                  )}
                </div>
                <label className="flex-1 px-4 py-2.5 border border-brand-accent rounded-xl text-sm font-bold text-brand-primary hover:bg-brand-bg/50 transition-colors cursor-pointer inline-flex items-center justify-center gap-2">
                  <Camera className="w-4 h-4" /> Foto (opcional)
                  <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
                </label>
                {avatarPreview && (
                  <button onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                    className="text-xs text-gray-400 hover:text-red-500">
                    Quitar
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Nombre *</label>
                  <input type="text" value={form.name}
                    onChange={e => update('name', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Especie</label>
                  <select value={form.species}
                    onChange={e => update('species', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm bg-white">
                    {SPECIES_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Raza</label>
                  <input type="text" value={form.breed}
                    onChange={e => update('breed', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Color</label>
                  <input type="text" value={form.color}
                    onChange={e => update('color', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Sexo</label>
                  <select value={form.gender}
                    onChange={e => update('gender', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm bg-white">
                    {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Nacimiento</label>
                  <input type="date" value={form.birth_date}
                    onChange={e => update('birth_date', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Microchip</label>
                  <input type="text" value={form.chip_id}
                    onChange={e => update('chip_id', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Peso (kg)</label>
                  <input type="number" step="0.1" min="0" value={form.weight_kg}
                    onChange={e => update('weight_kg', e.target.value)}
                    className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Tipo</label>
                <select value={form.pet_type}
                  onChange={e => update('pet_type', e.target.value)}
                  className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm bg-white">
                  <option value="own">Propia</option>
                  <option value="foster">Tránsito</option>
                  <option value="adoption">Adopción</option>
                  <option value="community">Comunitaria</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">Bio</label>
                <textarea value={form.bio}
                  onChange={e => update('bio', e.target.value)}
                  rows={2}
                  className="w-full p-3 rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Personalidad</label>
                <div className="flex flex-wrap gap-2">
                  {PERSONALITY_TAGS.map(tag => {
                    const active = form.personality_tags.includes(tag);
                    return (
                      <button key={tag} type="button" onClick={() => toggleTag(tag)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                          active ? 'bg-brand-primary/20 text-brand-primary border border-brand-primary' : 'border border-dashed border-gray-300 text-gray-400 hover:text-brand-primary hover:border-brand-primary'
                        }`}>
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 sm:px-8 py-5 border-t border-brand-accent shrink-0">
              <button onClick={handleClose}
                className="flex-1 px-4 py-3 border border-brand-accent rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-4 py-3 bg-brand-primary text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Agregar mascota
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}