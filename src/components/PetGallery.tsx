import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getPets, Pet, PetStatus, getPetImageUrl } from '@/src/lib/petService';
import { NEIGHBORHOODS } from '@/src/lib/neighborhoods';
import PetCard from '@/src/components/PetCard';
import PetMap from '@/src/components/PetMap';
import MapLoader from '@/src/components/MapLoader';
import { Search, Loader2, Grid, Map as MapIcon, BookOpen, PawPrint, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { Helmet } from 'react-helmet-async';

const DEFAULT_CENTER = { lat: -34.9961, lng: -57.8524 };

const BASE_PILLS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: PetStatus.LOST, label: 'Perdidas' },
  { value: PetStatus.RETAINED, label: 'Retenidas' },
  { value: PetStatus.SIGHTED, label: 'Avistadas' },
];

const MORE_PILLS: { value: string; label: string }[] = [
  { value: PetStatus.ACCIDENTED, label: 'Accidentadas' },
  { value: PetStatus.NEEDS_ATTENTION, label: 'Necesita Atención' },
  { value: PetStatus.TRANSITADA, label: 'En Tránsito' },
];

export default function PetGallery({ type }: { type: 'lost' | 'adoption' }) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [reunitedPets, setReunitedPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  useEffect(() => {
    const fetchPets = async () => {
      setLoading(true);
      try {
        const data = await getPets();
        if (type === 'lost') {
          const active = data.filter(p =>
            p.status === PetStatus.LOST ||
            p.status === PetStatus.RETAINED ||
            p.status === PetStatus.SIGHTED ||
            p.status === PetStatus.ACCIDENTED ||
            p.status === PetStatus.NEEDS_ATTENTION ||
            p.status === PetStatus.TRANSITADA
          );
          setPets(active);
          setReunitedPets(data.filter(p => p.status === PetStatus.REUNITED));
        } else {
          setPets(
            data.filter(p =>
              (p.status === PetStatus.FOR_ADOPTION || p.status === PetStatus.FOR_ADOPTION_SIMPLE)
              && !p.has_pending_adoption
            )
          );
          setReunitedPets([]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchPets();
  }, [type]);

  useEffect(() => {
    if (loading) return;
    const saved = sessionStorage.getItem('pet_list_scroll');
    if (saved) {
      sessionStorage.removeItem('pet_list_scroll');
      requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10)));
    }
  }, [loading]);

  const displayedPets = useMemo(() => {
    let result = pets;

    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }

    if (filter.trim()) {
      const q = filter.toLowerCase();
      result = result.filter(p => {
        const ns = (() => {
          if (Array.isArray(p.neighborhoods)) return p.neighborhoods;
          if (typeof p.neighborhoods === 'string') try { return JSON.parse(p.neighborhoods); } catch { return []; }
          return [];
        })();
        const neighborhoodNames = ns.map(id => NEIGHBORHOODS.find(n => n.id === id)?.name || '').join(' ');
        return (
          p.location.toLowerCase().includes(q) ||
          neighborhoodNames.toLowerCase().includes(q) ||
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.contact_info && p.contact_info.includes(q)) ||
          (p.species && p.species.toLowerCase().includes(q)) ||
          (p.breed && p.breed.toLowerCase().includes(q)) ||
          (p.color && p.color.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [pets, filter, statusFilter]);

  const visiblePills = useMemo(() => {
    const moreActive = MORE_PILLS.find(m => m.value === statusFilter);
    return moreActive ? [...BASE_PILLS, moreActive] : BASE_PILLS;
  }, [statusFilter]);

  return (
    <div>
      <Helmet>
        <title>{type === 'adoption' ? 'Mascotas en Adopción - Sigo Tu Huella' : 'Mascotas perdidas - Sigo Tu Huella'}</title>
        <meta name="description" content={type === 'adoption'
          ? 'Conocé a los integrantes de Sigo Tu Huella que están buscando un hogar lleno de amor.'
          : 'Encontrá las mascotas perdidas en Sicardi y Garibaldi. Ayudá a reencontrarlas con su familia.'} />
      </Helmet>

      {/* Header (solo desktop) */}
      <header className="hidden lg:block max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-4">
            {type === 'lost' ? 'Mascotas Reportadas' : 'Mascotas en Adopción'}
          </h1>
          <p className="text-gray-600 leading-relaxed">
          {type === 'lost'
            ? 'Mascotas perdidas, retenidas, avistadas o accidentadas en Sicardi, Garibaldi y Correas. Filtra por estado o busca por cualquier dato.'
            : 'Conoce a los integrantes de "Sigo tu huella" que están buscando un hogar lleno de amor.'}
        </p>

        {type === 'adoption' && (
          <Link to="/manual/adopcion" className="inline-flex items-center gap-1.5 mt-4 text-xs sm:text-sm text-gray-400 hover:text-brand-primary font-bold transition-colors">
            <BookOpen className="w-3.5 h-3.5" /> ¿Cómo funciona la adopción? Ver la guía →
          </Link>
        )}
        </div>
      </header>

      {/* Barra sticky: pills + buscador + segmented */}
      <div className="sticky top-14 lg:top-0 z-40 bg-white/95 backdrop-blur-md border-b border-brand-accent shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 space-y-3">
          {type === 'lost' && (
            <div className="flex items-center gap-2 overflow-x-auto -mb-1 pb-1">
              {visiblePills.map(pill => (
                <button
                  key={pill.value}
                  onClick={() => setStatusFilter(pill.value)}
                  className={cn(
                    "shrink-0 px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition-colors",
                    statusFilter === pill.value
                      ? "bg-brand-primary text-white"
                      : "bg-brand-primary/5 text-brand-primary hover:bg-brand-primary/10"
                  )}
                >
                  {pill.label}
                </button>
              ))}
              <div className="relative shrink-0">
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-primary pointer-events-none" />
                <select
                  value={MORE_PILLS.some(m => m.value === statusFilter) ? statusFilter : ''}
                  onChange={(e) => setStatusFilter(e.target.value || 'all')}
                  className="appearance-none pl-4 pr-9 py-1.5 rounded-full text-xs sm:text-sm font-bold bg-brand-primary/5 text-brand-primary cursor-pointer outline-none border border-brand-accent focus:border-brand-primary"
                >
                  <option value="">Más ▾</option>
                  {MORE_PILLS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, ubicación, especie, raza, color, contacto..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 bg-white rounded-xl sm:rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all shadow-sm text-sm"
              />
            </div>

            {type === 'lost' && (
              <div className="p-1 bg-white rounded-xl sm:rounded-2xl border border-brand-accent shadow-sm flex shrink-0">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "p-2 sm:p-3 rounded-lg sm:rounded-xl transition-all flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold",
                    viewMode === 'grid' ? "bg-brand-primary text-white" : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  <Grid className="w-4 h-4" />
                  Lista
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  className={cn(
                    "p-2 sm:p-3 rounded-lg sm:rounded-xl transition-all flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold",
                    viewMode === 'map' ? "bg-brand-primary text-white" : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  <MapIcon className="w-4 h-4" />
                  Mapa
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-brand-primary">
            <Loader2 className="w-10 h-10 animate-spin" />
            <span className="font-medium animate-pulse">Cargando mascotas...</span>
          </div>
        ) : displayedPets.length > 0 ? (
          <AnimatePresence mode="wait">
            {viewMode === 'grid' || type === 'adoption' ? (
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
                    pets={displayedPets}
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

        {/* Reencuentros (solo lost, debajo del grid) */}
        {type === 'lost' && viewMode === 'grid' && reunitedPets.length > 0 && (
          <section className="mt-14">
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-brand-primary mb-2">Reencuentros</h2>
            <p className="text-gray-600 mb-6 text-sm sm:text-base">
              Mascotas que ya volvieron a casa gracias a la comunidad. ¡Gracias por difundir!
            </p>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {reunitedPets.map(pet => {
                const img = getPetImageUrl(pet);
                return (
                  <Link
                    key={pet.id}
                    to={`/pet/${pet.id}`}
                    className="shrink-0 w-36 sm:w-44 group"
                  >
                    <div className="aspect-square rounded-2xl overflow-hidden bg-brand-accent/40">
                      {img ? (
                        <img
                          src={img}
                          alt={pet.name || 'Mascota reencontrada'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-brand-primary">
                          <PawPrint className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-bold text-brand-primary truncate">
                      {pet.name || 'Mascota reencontrada'}
                    </p>
                    <p className="text-xs text-gray-400 font-medium">Reencontrado/a</p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* FAB Mapa (modo grid) */}
      {type === 'lost' && viewMode === 'grid' && !loading && displayedPets.length > 0 && (
        <button
          onClick={() => setViewMode('map')}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-3.5 bg-brand-primary text-white rounded-2xl shadow-xl font-bold text-sm sm:text-base hover:-translate-y-0.5 hover:shadow-2xl transition-all"
        >
          <MapIcon className="w-5 h-5" />
          Ver Mapa
        </button>
      )}

      {/* Volver a Lista (modo mapa) */}
      {type === 'lost' && viewMode === 'map' && (
        <button
          onClick={() => setViewMode('grid')}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-5 py-3 bg-white text-brand-primary border border-brand-accent rounded-2xl shadow-xl font-bold text-sm sm:text-base hover:shadow-2xl transition-all"
        >
          <Grid className="w-4 h-4" />
          Volver a Lista
        </button>
      )}
    </div>
  );
}
