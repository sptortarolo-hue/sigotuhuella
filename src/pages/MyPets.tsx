import { useState, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { Pet, PetStatus, getPetCoordinates, deletePet, updatePet, getPetImageUrls } from '@/src/lib/petService';
import { filesToBase64 } from '@/src/lib/storageService';
import { useNavigate } from 'react-router-dom';
import PetCard from '@/src/components/PetCard';
import PetMap from '@/src/components/PetMap';
import MapLoader from '@/src/components/MapLoader';
import { Search, Loader2, Grid, Map as MapIcon, ArrowLeft, PawPrint, X, Save, HeartHandshake } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

const DEFAULT_CENTER = { lat: -34.9961, lng: -57.8524 };

export default function MyPets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  // Edit state
  const [showForm, setShowForm] = useState(false);
  const [editingPet, setEditingPet] = useState<Pet | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    species: 'dog' as 'dog' | 'cat' | 'other',
    breed: '',
    color: '',
    status: PetStatus.LOST,
    gender: 'unknown' as 'male' | 'female' | 'unknown',
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
    setFormData({ name: '', species: 'dog', breed: '', color: '', status: PetStatus.LOST, gender: 'unknown', location: '', contactInfo: '', description: '' });
    setPreviews([]);
    setSelectedFiles([]);
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
      location: pet.location || '',
      contactInfo: pet.contact_info || '',
      description: pet.description || '',
    });
    const urls = getPetImageUrls(pet);
    setPreviews(urls);
    setShowForm(true);
  };

  const handlePetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      let images: { data: string; mimeType: string }[] = [];
      if (selectedFiles.length > 0) {
        images = await filesToBase64(selectedFiles);
      }

      const dataToSave = {
        name: formData.name || null,
        species: formData.species,
        breed: formData.breed || null,
        color: formData.color || null,
        status: formData.status,
        gender: formData.gender,
        location: formData.location,
        contactInfo: formData.contactInfo,
        description: formData.description,
        images,
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
                  <button
                    onClick={() => handleReencuentro(pet.id)}
                    className="mt-3 w-full py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors"
                  >
                    <HeartHandshake className="w-4 h-4" />
                    Hubo reencuentro
                  </button>
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
                  <input type="file" accept="image/*" multiple onChange={e => { const files = Array.from(e.target.files || []); setSelectedFiles(files); setPreviews(files.map(f => URL.createObjectURL(f))); }} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" />
                  {previews.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {previews.map((src, i) => (
                        <img key={i} src={src} className="w-20 h-20 object-cover rounded-xl" />
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
    </div>
  );
}
