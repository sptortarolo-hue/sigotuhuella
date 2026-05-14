import { useState, useEffect } from 'react';
import { getPets, Pet, PetStatus } from '@/src/lib/petService';
import PetCard from '@/src/components/PetCard';
import PetMap from '@/src/components/PetMap';
import MapLoader, { hasValidKey } from '@/src/components/MapLoader';
import { Search, Loader2, Grid, Map as MapIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

const DEFAULT_CENTER = { lat: -34.9961, lng: -57.8524 };

export default function PetGallery({ type }: { type: 'lost' | 'adoption' }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  useEffect(() => {
    const fetchPets = async () => {
      setLoading(true);
      try {
        const data = await getPets();
        const filtered = data.filter(p => {
          if (type === 'lost') {
            return p.status === PetStatus.LOST || p.status === PetStatus.FOUND;
          } else {
            return p.status === PetStatus.FOR_ADOPTION;
          }
        });
        setPets(filtered);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchPets();
  }, [type]);

  const displayedPets = pets.filter(p => 
    p.location.toLowerCase().includes(filter.toLowerCase()) ||
    (p.name && p.name.toLowerCase().includes(filter.toLowerCase())) ||
    p.description.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-12 text-center max-w-2xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-4">
          {type === 'lost' ? 'Perdidos y Encontrados' : 'Mascotas en Adopción'}
        </h1>
        <p className="text-gray-600 leading-relaxed">
          {type === 'lost' 
            ? 'Si perdiste a tu compañero o encontraste uno, aquí puedes ver los reportes más recientes en nuestros barrios.'
            : 'Conoce a los integrantes de "Sigo tu huella" que están buscando un hogar lleno de amor.'}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-4 items-center justify-center">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por ubicación o descripción..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all shadow-sm"
            />
          </div>

          <div className="p-1 bg-white rounded-2xl border border-brand-accent shadow-sm flex">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-bold",
                viewMode === 'grid' ? "bg-brand-primary text-white" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Grid className="w-4 h-4" />
              Grilla
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={cn(
                "p-3 rounded-xl transition-all flex items-center gap-2 text-sm font-bold",
                viewMode === 'map' ? "bg-brand-primary text-white" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <MapIcon className="w-4 h-4" />
              Mapa
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-brand-primary">
          <Loader2 className="w-10 h-10 animate-spin" />
          <span className="font-medium animate-pulse">Cargando mascotas...</span>
        </div>
      ) : displayedPets.length > 0 ? (
        <AnimatePresence mode="wait">
          {viewMode === 'grid' ? (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8"
            >
              {displayedPets.map((pet, idx) => (
                <motion.div
                  key={pet.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <PetCard pet={pet} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <MapLoader>
                <PetMap 
                  pets={displayedPets.filter(p => !!p.coordinates)} 
                  center={DEFAULT_CENTER} 
                />
              </MapLoader>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <div className="text-center py-20 bg-brand-accent/30 rounded-3xl border-2 border-dashed border-brand-accent">
          <p className="text-gray-500 font-medium">No se encontraron reportes en esta categoría por el momento.</p>
        </div>
      )}
    </div>
  );
}

