import { useState, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { Pet, PetStatus, getPetCoordinates } from '@/src/lib/petService';
import { useNavigate } from 'react-router-dom';
import PetCard from '@/src/components/PetCard';
import PetMap from '@/src/components/PetMap';
import MapLoader from '@/src/components/MapLoader';
import { Search, Loader2, Grid, Map as MapIcon, ArrowLeft, PawPrint } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

const DEFAULT_CENTER = { lat: -34.9961, lng: -57.8524 };

export default function MyPets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

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

  const displayedPets = pets.filter(p =>
    p.location?.toLowerCase().includes(filter.toLowerCase()) ||
    (p.name && p.name.toLowerCase().includes(filter.toLowerCase())) ||
    (p.description && p.description.toLowerCase().includes(filter.toLowerCase()))
  );

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
            <input type="text" placeholder="Buscar..." value={filter} onChange={e => setFilter(e.target.value)}
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
            {displayedPets.map(pet => <PetCard key={pet.id} pet={pet} />)}
          </div>
        ) : (
          <MapLoader><PetMap pets={displayedPets.filter(p => !!getPetCoordinates(p))} center={DEFAULT_CENTER} /></MapLoader>
        )
      ) : (
        <div className="text-center py-20 bg-brand-accent/30 rounded-3xl border-2 border-dashed border-brand-accent">
          <p className="text-gray-500 font-medium">No publicaste ninguna mascota aún.</p>
        </div>
      )}
    </div>
  );
}
