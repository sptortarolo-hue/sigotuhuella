import React, { useState, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { Pet, PetStatus, getPetCoordinates, deletePet, updatePet, getPetImageUrls } from '@/src/lib/petService';
import { filesToBase64 } from '@/src/lib/storageService';
import { useNavigate } from 'react-router-dom';
import PetCard from '@/src/components/PetCard';
import PetMap from '@/src/components/PetMap';
import MapLoader from '@/src/components/MapLoader';
import PetRecordsModal from '@/src/components/PetRecordsModal';
import ImageCropper from '@/src/components/ImageCropper';
import { Search, Loader2, Grid, Map as MapIcon, ArrowLeft, PawPrint, X, Save, HeartHandshake, Activity, Heart, ChevronRight, ChevronLeft, Check, Calendar, Weight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { ALL_TAGS, formatTag } from '@/src/lib/personalityTags';

const DEFAULT_CENTER = { lat: -34.9961, lng: -57.8524 };

export default function MyPets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [activeRecordsPet, setActiveRecordsPet] = useState<{id: string, name: string} | null>(null);

  const [convertWizard, setConvertWizard] = useState<{ pet: Pet; step: 1 | 2 } | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertBio, setConvertBio] = useState('');
  const [convertBirthDate, setConvertBirthDate] = useState('');
  const [convertWeight, setConvertWeight] = useState('');
  const [convertTags, setConvertTags] = useState<string[]>([]);

  const openConvertWizard = (pet: Pet) => {
    setConvertBio(pet.description || '');
    setConvertBirthDate('');
    setConvertWeight('');
    setConvertTags([]);
    setConvertWizard({ pet, step: 1 });
  };

  const handleConvert = async () => {
    if (!convertWizard) return;
    setConvertLoading(true);
    try {
      const extra: any = {};
      if (convertBio) extra.bio = convertBio;
      if (convertBirthDate) extra.birth_date = convertBirthDate;
      if (convertWeight) extra.weight_kg = parseFloat(convertWeight);
      if (convertTags.length > 0) extra.personality_tags = convertTags;
      const result = await api.myPets.convert(convertWizard.pet.id, Object.keys(extra).length > 0 ? extra : undefined);
      setConvertWizard(null);
      navigate(`/mi-mascota/${result.myPet.id}`);
    } catch (e) {
      console.error(e);
      alert('Error al convertir la mascota.');
    } finally {
      setConvertLoading(false);
    }
  };

  // Edit state
  const [showForm, setShowForm] = useState(false);
  const [editingPet, setEditingPet] = useState<Pet | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [imagesToKeep, setImagesToKeep] = useState<string[]>([]);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [croppingIndex, setCroppingIndex] = useState<number | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const handleCropComplete = (blob: Blob) => {
    if (croppingIndex === null) return;
    const file = new File([blob], 'pet.jpg', { type: 'image/jpeg' });
    setSelectedFiles(prev => {
      const next = [...prev];
      next[croppingIndex] = file;
      return next;
    });
    setPreviews(prev => {
      const next = [...prev];
      next[croppingIndex] = URL.createObjectURL(blob);
      return next;
    });
    // Next pending file
    if (pendingFiles.length > 0) {
      const next = pendingFiles[0];
      setPendingFiles(prev => prev.slice(1));
      setCropFile(next);
      setCroppingIndex(croppingIndex + 1);
    } else {
      setCropFile(null);
      setCroppingIndex(null);
    }
  };

  const handleCropCancel = () => {
    setCropFile(null);
    setCroppingIndex(null);
    setPendingFiles([]);
  };

  const [formData, setFormData] = useState({
    name: '',
    species: 'dog' as 'dog' | 'cat' | 'other',
    breed: '',
    color: '',
    status: PetStatus.LOST,
    gender: 'unknown' as 'male' | 'female' | 'unknown',
    age: '',
    size: '',
    isVaccinated: false,
    isSterilized: false,
    isDewormed: false,
    location: '',
    contactInfo: '',
    description: '',
  });

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    const fetch = async () => {
      try {
        const data = await api.users.myPets(user.id);
        setPets(data.pets || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetch();
  }, [user]);

  const displayedPets = pets.filter(p => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      (p.location && p.location.toLowerCase().includes(q)) ||
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.contact_info && p.contact_info.toLowerCase().includes(q)) ||
      (p.species && p.species.toLowerCase().includes(q)) ||
      (p.breed && p.breed.toLowerCase().includes(q)) ||
      (p.color && p.color.toLowerCase().includes(q))
    );
  });

  const handleReencuentro = async (petId: string) => {
    if (!confirm('¿Marcar esta mascota como "Hubo reencuentro"?')) return;
    try {
      await updatePet(petId, { status: PetStatus.REUNITED });
      const data = await api.users.myPets(user!.id);
      setPets(data.pets || []);
    } catch (e) {
      console.error(e);
      alert('Error al actualizar el estado.');
    }
  };

  const resetPetForm = () => {
    setFormData({ name: '', species: 'dog', breed: '', color: '', status: PetStatus.LOST, gender: 'unknown', age: '', size: '', isVaccinated: false, isSterilized: false, isDewormed: false, location: '', contactInfo: '', description: '' });
    setPreviews([]);
    setSelectedFiles([]);
    setImagesToKeep([]);
    setEditingPet(null);
  };

  const editPet = async (pet: Pet) => {
    setEditingPet(pet);
    setFormData({
      name: pet.name || '',
      species: pet.species as any,
      breed: pet.breed || '',
      color: pet.color || '',
      status: pet.status,
      gender: pet.gender || 'unknown',
      age: pet.age || '',
      size: pet.size || '',
      isVaccinated: pet.is_vaccinated,
      isSterilized: pet.is_sterilized,
      isDewormed: pet.is_dewormed,
      location: pet.location || '',
      contactInfo: pet.contact_info || '',
      description: pet.description || '',
    });
    const urls = getPetImageUrls(pet);
    setPreviews(urls);
    setImagesToKeep(pet.images?.map(img => img.id) || []);
    setShowForm(true);
  };

  const handlePetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      let newImages: { data: string; mimeType: string }[] = [];
      if (selectedFiles.length > 0) {
        newImages = await filesToBase64(selectedFiles);
      }

      const dataToSave = {
        name: formData.name || null,
        species: formData.species,
        breed: formData.breed || null,
        color: formData.color || null,
        status: formData.status,
        gender: formData.gender,
        age: formData.age || null,
        size: formData.size || null,
        isVaccinated: formData.isVaccinated,
        isSterilized: formData.isSterilized,
        isDewormed: formData.isDewormed,
        location: formData.location,
        contactInfo: formData.contactInfo,
        description: formData.description,
        imagesToKeep,
        newImages,
      };

      if (editingPet) await updatePet(editingPet.id, dataToSave);

      setShowForm(false);
      resetPetForm();
      const data = await api.users.myPets(user!.id);
      setPets(data.pets || []);
    } catch (e) { console.error(e); alert('Error al guardar'); }
    finally { setFormLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta publicación definitivamente?')) return;
    try {
      await deletePet(id);
      const data = await api.users.myPets(user!.id);
      setPets(data.pets || []);
    } catch (e) {
      console.error(e);
      alert('Error al eliminar');
    }
  };

  return (
    <>
      {cropFile && (
        <ImageCropper file={cropFile} aspect={1} onCropComplete={handleCropComplete} onCancel={handleCropCancel} />
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary font-bold mb-8">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <header className="mb-12 text-center max-w-2xl mx-auto">
        <div className="inline-flex p-3 bg-brand-primary/10 text-brand-primary rounded-2xl mb-4"><PawPrint className="w-8 h-8" /></div>
        <h1 className="text-4xl font-serif font-bold text-brand-primary mb-2">Mis Publicaciones</h1>
        <p className="text-gray-500">{pets.length} mascota{pets.length !== 1 ? 's' : ''} reportada{pets.length !== 1 ? 's' : ''}</p>

        <div className="mt-8 flex flex-col sm:flex-row gap-4 items-center justify-center">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" placeholder="Buscar por nombre, ubicación, especie, contacto..." value={filter} onChange={e => setFilter(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-brand-accent outline-none shadow-sm" />
          </div>
          <div className="p-1 bg-white rounded-2xl border border-brand-accent shadow-sm flex">
            <button onClick={() => setViewMode('grid')} className={cn("p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-bold", viewMode === 'grid' ? "bg-brand-primary text-white" : "text-gray-400")}>
              <Grid className="w-4 h-4" /> Grilla
            </button>
            <button onClick={() => setViewMode('map')} className={cn("p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-bold", viewMode === 'map' ? "bg-brand-primary text-white" : "text-gray-400")}>
              <MapIcon className="w-4 h-4" /> Mapa
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-brand-primary" /></div>
      ) : displayedPets.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {displayedPets.map(pet => (
              <div key={pet.id} className="relative">
                <PetCard
                  pet={pet}
                  showAdminActions
                  onEdit={editPet}
                  onDelete={handleDelete}
                />
                {pet.status !== PetStatus.REUNITED && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleReencuentro(pet.id)}
                      className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors"
                    >
                      <HeartHandshake className="w-4 h-4" />
                      Reencuentro
                    </button>
                    <button
                      onClick={() => setActiveRecordsPet({ id: pet.id, name: pet.name || 'Mascota' })}
                      className="flex-1 py-2.5 bg-brand-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-brand-primary/90 transition-colors"
                    >
                      <Activity className="w-4 h-4" />
                      Historial Médico
                    </button>
                  </div>
                )}
                {pet.status === PetStatus.REUNITED && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => openConvertWizard(pet)}
                      className="flex-1 py-2.5 bg-brand-secondary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-brand-secondary/90 transition-colors"
                    >
                      <Heart className="w-4 h-4" /> Mi Mascota
                    </button>
            <button
              onClick={() => setActiveRecordsPet({ id: pet.id, name: pet.name || 'Mascota' })}
              className="flex-1 py-2.5 bg-brand-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-brand-primary/90 transition-colors"
            >
              <Activity className="w-4 h-4" />
              Historial Médico
            </button>
          </div>
        )}
              </div>
            ))}
          </div>
        ) : (
          <MapLoader><PetMap pets={displayedPets.filter(p => !!getPetCoordinates(p))} center={DEFAULT_CENTER} /></MapLoader>
        )
      ) : (
        <div className="text-center py-20 bg-brand-accent/30 rounded-3xl border-2 border-dashed border-brand-accent">
          <p className="text-gray-500 font-medium">No publicaste ninguna mascota aún.</p>
        </div>
      )}

      {/* Edit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowForm(false)} className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-8 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50">
                <h2 className="text-2xl font-serif font-bold text-brand-primary">Editar Publicación</h2>
                <button onClick={() => setShowForm(false)} className="p-2 hover:bg-brand-accent rounded-full"><X className="w-6 h-6" /></button>
              </div>
              <form onSubmit={handlePetSubmit} className="p-8 overflow-y-auto space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Nombre</label>
                    <input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Especie</label>
                    <select className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.species} onChange={e => setFormData({...formData, species: e.target.value as any})}>
                      <option value="dog">Perro</option>
                      <option value="cat">Gato</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Edad</label>
                    <select className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})}>
                      <option value="">No sé / No aplica</option>
                      <option value="cachorro">Cachorro</option>
                      <option value="adulto">Adulto</option>
                      <option value="senior">Senior</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Tamaño</label>
                    <select className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})}>
                      <option value="">No sé / No aplica</option>
                      <option value="small">Pequeño</option>
                      <option value="medium">Mediano</option>
                      <option value="large">Grande</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" className="w-4 h-4 rounded text-brand-primary" checked={formData.isVaccinated} onChange={e => setFormData({...formData, isVaccinated: e.target.checked})} /> Vacunado
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" className="w-4 h-4 rounded text-brand-primary" checked={formData.isSterilized} onChange={e => setFormData({...formData, isSterilized: e.target.checked})} /> Castrado
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" className="w-4 h-4 rounded text-brand-primary" checked={formData.isDewormed} onChange={e => setFormData({...formData, isDewormed: e.target.checked})} /> Desparasitado
                  </label>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Estado</label>
                  <select className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                    <option value={PetStatus.LOST}>Perdido</option>
                    <option value={PetStatus.RETAINED}>Retenido</option>
                    <option value={PetStatus.SIGHTED}>Avistado</option>
                    <option value={PetStatus.ACCIDENTED}>Accidentado</option>
                    <option value={PetStatus.NEEDS_ATTENTION}>Necesita Atención</option>
                    <option value={PetStatus.FOR_ADOPTION}>Para Adopción</option>
                  </select>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Ubicación</label>
                    <input required type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Contacto (WhatsApp / Teléfono)</label>
                    <input type="tel" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.contactInfo} onChange={e => setFormData({...formData, contactInfo: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Descripción</label>
                  <textarea required rows={3} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Imágenes</label>
                  <input type="file" accept="image/*" multiple onChange={e => { 
                    const raw = Array.from(e.target.files || []) as File[];
                    if (raw.length === 0) return;
                    setPendingFiles(raw.slice(1));
                    setCropFile(raw[0]);
                    setCroppingIndex(selectedFiles.length);
                  }} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" />
                  {previews.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {previews.map((src, i) => (
                        <div key={i} className="relative">
                          <img src={src} className="w-20 h-20 object-cover rounded-xl border border-brand-accent" />
                          <button type="button" onClick={() => {
                            if (i < imagesToKeep.length) {
                              const newImagesToKeep = [...imagesToKeep];
                              newImagesToKeep.splice(i, 1);
                              setImagesToKeep(newImagesToKeep);
                            } else {
                              const fileIndex = i - imagesToKeep.length;
                              const newFiles = [...selectedFiles];
                              newFiles.splice(fileIndex, 1);
                              setSelectedFiles(newFiles);
                            }
                            const newPreviews = [...previews];
                            newPreviews.splice(i, 1);
                            setPreviews(newPreviews);
                          }} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 w-6 h-6 flex items-center justify-center text-xs">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" disabled={formLoading} className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold">{formLoading ? <Loader2 className="animate-spin" /> : <Save className="w-5 h-5 inline mr-2" />} Guardar</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeRecordsPet && (
          <PetRecordsModal
            petId={activeRecordsPet.id}
            petName={activeRecordsPet.name}
            onClose={() => setActiveRecordsPet(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {convertWizard && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConvertWizard(null)} className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-6 sm:p-8 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50">
                <h2 className="text-xl sm:text-2xl font-serif font-bold text-brand-primary">
                  {convertWizard.step === 1 ? 'Datos que se copiarán' : 'Completá su perfil'}
                </h2>
                <button onClick={() => setConvertWizard(null)} className="p-2 hover:bg-brand-accent rounded-full"><X className="w-6 h-6" /></button>
              </div>

              <div className="p-6 sm:p-8 overflow-y-auto">
                {convertWizard.step === 1 && (() => {
                  const p = convertWizard.pet;
                  const speciesLabel = p.species === 'dog' ? 'Perro' : p.species === 'cat' ? 'Gato' : 'Otro';
                  const genderLabel = p.gender === 'male' ? 'Macho' : p.gender === 'female' ? 'Hembra' : 'Desconocido';
                  const rows = [
                    ['Nombre', p.name],
                    ['Especie', speciesLabel],
                    ['Raza', p.breed],
                    ['Color', p.color],
                    ['Sexo', genderLabel],
                    ['Vacunado', p.is_vaccinated ? 'Sí' : 'No'],
                    ['Castrado', p.is_sterilized ? 'Sí' : 'No'],
                    ['Desparasitado', p.is_dewormed ? 'Sí' : 'No'],
                  ];
                  return (
                    <div className="space-y-4">
                      <p className="text-sm text-gray-500">Estos datos se copiarán de la publicación original al nuevo perfil Mi Mascota:</p>
                      <div className="space-y-2">
                        {rows.map(([label, value]) => (
                          <div key={label} className="flex justify-between items-center py-2 border-b border-brand-accent/50">
                            <span className="text-xs font-bold uppercase text-gray-400">{label}</span>
                            <span className={cn("text-sm font-medium", value ? "text-gray-800" : "text-gray-300 italic")}>{value || 'Sin dato'}</span>
                          </div>
                        ))}
                      </div>
                      {p.description && (
                        <div>
                          <p className="text-xs font-bold uppercase text-gray-400 mb-1">Descripción → Bio</p>
                          <p className="text-sm text-gray-700 bg-brand-bg rounded-xl p-3">{p.description}</p>
                          <p className="text-xs text-brand-secondary mt-1">Podés editar la bio en el siguiente paso</p>
                        </div>
                      )}
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <p className="text-xs text-amber-700">Fecha de nacimiento, peso y personalidad no tienen equivalente en la publicación original. Podés completarlos en el siguiente paso.</p>
                      </div>
                      <button onClick={() => setConvertWizard({ ...convertWizard, step: 2 })} className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand-primary/90 transition-colors">
                        Siguiente <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })()}

                {convertWizard.step === 2 && (
                  <div className="space-y-5">
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-400">Bio</label>
                      <textarea rows={3} className="w-full mt-1 px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm" value={convertBio} onChange={e => setConvertBio(e.target.value)} placeholder="Contá algo sobre tu mascota..." />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1"><Calendar className="w-3 h-3" /> Fecha de nacimiento</label>
                        <input type="date" className="w-full mt-1 px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm" value={convertBirthDate} onChange={e => setConvertBirthDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1"><Weight className="w-3 h-3" /> Peso (kg)</label>
                        <input type="number" step="0.1" min="0" className="w-full mt-1 px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm" value={convertWeight} onChange={e => setConvertWeight(e.target.value)} placeholder="Ej: 8.5" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase text-gray-400 block mb-2">Personalidad</label>
                      <div className="flex flex-wrap gap-2">
                        {ALL_TAGS.map(tag => (
                          <button key={tag} type="button" onClick={() => setConvertTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                            className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition-all border", convertTags.includes(tag) ? "bg-brand-primary text-white border-brand-primary" : "bg-brand-bg text-gray-600 border-brand-accent hover:border-brand-primary")}>
                            {formatTag(tag)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setConvertWizard({ ...convertWizard, step: 1 })} className="flex-1 py-3 bg-brand-accent text-brand-primary rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand-accent/80 transition-colors">
                        <ChevronLeft className="w-4 h-4" /> Volver
                      </button>
                      <button onClick={handleConvert} disabled={convertLoading} className="flex-1 py-3 bg-brand-secondary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand-secondary/90 transition-colors disabled:opacity-50">
                        {convertLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Crear Mi Mascota
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}
