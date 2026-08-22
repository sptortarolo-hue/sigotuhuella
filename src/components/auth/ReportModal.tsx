import { useEffect } from 'react';
import { X, Dog, Search, PawPrint, MapPin, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useNavigate } from 'react-router-dom';

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  onLostPetClick: () => void;
}

export default function ReportModal({ open, onClose, onLostPetClick }: ReportModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  const handleAvistaje = () => {
    onClose();
    navigate('/reportar-rapido');
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
            className="relative w-full max-w-sm lg:max-w-md bg-white rounded-t-[2.5rem] lg:rounded-[2.5rem] shadow-xl overflow-hidden animate-in"
          >
            <div className="p-6 lg:p-8">
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-all lg:flex"
                  aria-label="Volver"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-serif font-bold text-brand-primary flex-1 text-center">Reportar</h2>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-all lg:hidden"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    onClose();
                    onLostPetClick();
                  }}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-brand-accent",
                    "bg-white hover:bg-brand-primary/5 transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  )}
                >
                  <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
                    <Dog className="w-6 h-6 text-brand-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-bold text-gray-900">Perdí mi mascota</p>
                    <p className="text-sm text-gray-500">Seleccioná una de tus mascotas o reportá una nueva</p>
                  </div>
                  <PawPrint className="w-5 h-5 text-brand-primary/50" />
                </button>

                <button
                  onClick={handleAvistaje}
                  className={cn(
                    "w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-brand-accent",
                    "bg-white hover:bg-brand-primary/5 transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  )}
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <Search className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-bold text-gray-900">Avistaje</p>
                    <p className="text-sm text-gray-500">Reportá una mascota que viste en la calle</p>
                  </div>
                  <MapPin className="w-5 h-5 text-emerald-500" />
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full mt-4 px-5 py-3 text-gray-500 rounded-xl font-bold text-sm hover:bg-brand-bg transition-all"
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