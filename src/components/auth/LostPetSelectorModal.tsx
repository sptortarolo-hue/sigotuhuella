import { useEffect } from 'react';
import { X, Plus, Dog, Cat, PawPrint, ArrowRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useNavigate } from 'react-router-dom';
import { getPetImageUrl } from '@/src/lib/petService';
import { Pet } from '@/src/lib/petService';

interface LostPetSelectorModalProps {
  open: boolean;
  onClose: () => void;
  pets: Pet[];
}

const getSpeciesIcon = (species?: string) => {
  if (species === 'cat') return <Cat className="w-5 h-5" />;
  if (species === 'dog') return <Dog className="w-5 h-5" />;
  return <PawPrint className="w-5 h-5" />;
};

export default function LostPetSelectorModal({ open, onClose, pets }: LostPetSelectorModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  const handleSelectPet = (pet: Pet) => {
    onClose();
    navigate(`/perdi-mi-mascota?petId=${pet.id}`);
  };

  const handleNewPet = () => {
    onClose();
    navigate('/perdi-mi-mascota');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onKeyDown={handleKeyDown}
          className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center lg:justify-center"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: '100%', scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: '100%', scale: 0.95 }}
            className="relative w-full max-w-sm lg:max-w-md bg-white rounded-t-[2.5rem] lg:rounded-[2.5rem] shadow-xl overflow-hidden animate-in max-h-[85vh] flex flex-col"
          >
            <div className="p-6 lg:p-8 flex flex-col flex-1 overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-all lg:flex"
                  aria-label="Volver"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-serif font-bold text-brand-primary flex-1 text-center">Perdí mi mascota</h2>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-all lg:hidden"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                Seleccioná la mascota que se perdió o reportá una nueva
              </p>

              {pets.length > 0 ? (
                <div className="space-y-3 flex-1 overflow-y-auto pr-2">
                  {pets.map((pet, index) => (
                    <motion.button
                      key={pet.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => handleSelectPet(pet)}
                      className={cn(
                        "w-full flex items-center gap-4 px-4 py-3 rounded-xl border border-brand-accent",
                        "bg-white hover:bg-brand-primary/5 transition-all",
                        "focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                      )}
                    >
                      <div className="w-14 h-14 rounded-xl bg-brand-bg flex items-center justify-center shrink-0 overflow-hidden">
                        {getPetImageUrl(pet) ? (
                          <img
                            src={getPetImageUrl(pet)}
                            alt={pet.name || ''}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-brand-primary/30">
                            {getSpeciesIcon(pet.species)}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-bold text-gray-900 truncate">{pet.name || 'Mascota'}</p>
                        <p className="text-sm text-gray-500">
                          {pet.species === 'cat' ? 'Gato' : pet.species === 'dog' ? 'Perro' : 'Otra especie'}
                          {pet.breed && ` · ${pet.breed}`}
                        </p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-brand-primary/50 shrink-0" />
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-brand-bg flex items-center justify-center mb-4">
                    <PawPrint className="w-8 h-8 text-brand-primary/30" />
                  </div>
                  <p className="text-gray-500 mb-4">No tenés mascotas registradas</p>
                </div>
              )}

              <button
                onClick={handleNewPet}
                className={cn(
                  "w-full mt-4 flex items-center justify-center gap-2 px-5 py-3 rounded-xl",
                  "bg-brand-primary/10 text-brand-primary border border-brand-primary/20",
                  "hover:bg-brand-primary/20 hover:border-brand-primary transition-all font-bold text-sm"
                )}
              >
                <Plus className="w-5 h-5" />
                <span>Otra mascota no cargada</span>
              </button>

              <button
                onClick={onClose}
                className="w-full mt-3 px-5 py-3 text-gray-500 rounded-xl font-bold text-sm hover:bg-brand-bg transition-all"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}