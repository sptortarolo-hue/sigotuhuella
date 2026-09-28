import { useState, useEffect } from 'react';
import { Search, Loader2, SlidersHorizontal, PawPrint } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getPetTaxonomy, searchPets, Pet, PetStatus, PetTaxonomy } from '@/src/lib/petService';
import PetCard from '@/src/components/PetCard';
import { cn } from '@/src/lib/utils';
import { Helmet } from 'react-helmet-async';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Cualquier estado' },
  { value: PetStatus.LOST, label: 'Perdidos' },
  { value: PetStatus.FOR_ADOPTION_SIMPLE, label: 'En adopción' },
  { value: PetStatus.RETAINED, label: 'Retenidos' },
  { value: PetStatus.SIGHTED, label: 'Avistados' },
  { value: PetStatus.TRANSITADA, label: 'En tránsito' },
];

export default function BuscarMascotas() {
  const [species, setSpecies] = useState('all');
  const [breed, setBreed] = useState('all');
  const [size, setSize] = useState('all');
  const [color, setColor] = useState('all');
  const [ageGroup, setAgeGroup] = useState('all');
  const [coat, setCoat] = useState('all');
  const [status, setStatus] = useState('all');
  const [textQuery, setTextQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [taxonomy, setTaxonomy] = useState<PetTaxonomy | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPetTaxonomy().then(setTaxonomy).catch(() => setTaxonomy(null));
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const filters: Record<string, string> = {};
        if (species !== 'all') filters.species = species;
        if (breed !== 'all') filters.breed = breed;
        if (size !== 'all') filters.size = size;
        if (color !== 'all') filters.color = color;
        if (ageGroup !== 'all') filters.age_group = ageGroup;
        if (coat !== 'all') filters.coat = coat;
        if (status !== 'all') filters.status = status;
        const results = await searchPets(filters);
        let filtered = results;
        if (textQuery.trim()) {
          const q = textQuery.toLowerCase();
          filtered = filtered.filter(p =>
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.breed && p.breed.toLowerCase().includes(q)) ||
            (p.color && p.color.toLowerCase().includes(q)) ||
            (p.location && p.location.toLowerCase().includes(q))
          );
        }
        setPets(filtered);
      } catch (e) {
        console.error(e);
        setPets([]);
      } finally {
        setLoading(false);
      }
    };
    const t = setTimeout(run, 150);
    return () => clearTimeout(t);
  }, [species, breed, size, color, ageGroup, coat, status, textQuery]);

  const availableBreeds = species === 'all'
    ? [...(taxonomy?.breeds.dog || []), ...(taxonomy?.breeds.cat || []), ...(taxonomy?.breeds.other || [])]
    : (taxonomy?.breeds?.[species as keyof PetTaxonomy['breeds']] || []);
  const selectCls = "w-full px-3 py-2.5 rounded-xl border border-brand-accent bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all";

  return (
    <div>
      <Helmet>
        <title>Buscador de perros y gatos - Sigo Tu Huella</title>
        <meta name="description" content="Buscá entre las mascotas reportadas en Sicardi y Garibaldi: filtrá por especie, raza, tamaño, color, edad y más." />
      </Helmet>

      <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-6">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-3">
            Buscador de mascotas
          </h1>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
            Filtrá perros y gatos por especie, raza, tamaño, color y más para encontrar a tu compañero.
          </p>
        </div>
      </header>

      {/* Barra de búsqueda + toggle de filtros */}
      <div className="sticky top-14 lg:top-0 z-40 bg-white/95 backdrop-blur-md border-b border-brand-accent shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, raza, color, ubicación..."
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 bg-white rounded-xl sm:rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all shadow-sm text-sm"
              />
            </div>
            <button
              onClick={() => setShowFilters(s => !s)}
              className={cn(
                "shrink-0 px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl border text-sm font-bold flex items-center gap-2 transition-all",
                showFilters
                  ? "bg-brand-primary text-white border-brand-primary"
                  : "bg-white text-brand-primary border-brand-accent hover:border-brand-primary/50"
              )}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filtros</span>
            </button>
          </div>

          <AnimatePresence initial={false}>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-3 pt-3">
                  <select value={species} onChange={e => { setSpecies(e.target.value); setBreed('all'); }} className={selectCls}>
                    <option value="all">Especie</option>
                    <option value="dog">Perros</option>
                    <option value="cat">Gatos</option>
                    <option value="other">Otras</option>
                  </select>
                  <select value={breed} onChange={e => setBreed(e.target.value)} className={selectCls} disabled={species === 'all' && breed !== 'all'}>
                    <option value="all">Raza</option>
                    {availableBreeds.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <select value={size} onChange={e => setSize(e.target.value)} className={selectCls}>
                    <option value="all">Tamaño</option>
                    {taxonomy?.sizes?.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <select value={color} onChange={e => setColor(e.target.value)} className={selectCls}>
                    <option value="all">Color</option>
                    {taxonomy?.colors?.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select value={coat} onChange={e => setCoat(e.target.value)} className={selectCls}>
                    <option value="all">Pelo</option>
                    {taxonomy?.coat_lengths?.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)} className={selectCls}>
                    <option value="all">Edad</option>
                    {taxonomy?.age_groups?.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                  <select value={status} onChange={e => setStatus(e.target.value)} className={selectCls}>
                    {STATUS_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-brand-primary">
            <Loader2 className="w-10 h-10 animate-spin" />
            <span className="font-medium animate-pulse">Buscando mascotas...</span>
          </div>
        ) : pets.length > 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8"
          >
            {pets.map((pet, idx) => (
              <motion.div
                key={pet.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx, 10) * 0.05 }}
              >
                <PetCard pet={pet} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="text-center py-20 bg-brand-accent/30 rounded-3xl border-2 border-dashed border-brand-accent">
            <PawPrint className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No se encontraron mascotas con esos filtros.</p>
            <p className="text-sm text-gray-400 mt-1">Probá quitar algún filtro o buscar con otros términos.</p>
          </div>
        )}
      </main>
    </div>
  );
}