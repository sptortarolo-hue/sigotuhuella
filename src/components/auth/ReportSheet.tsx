import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, PawPrint, Eye, Heart, HandCoins, Users, MessageCircle } from 'lucide-react';
import { useEffect } from 'react';

const reportOptions = [
  {
    icon: <PawPrint className="w-6 h-6" />,
    label: 'Perdí mi mascota',
    desc: 'Reporte de mascota perdida',
    path: '/reportar',
    urgent: true,
  },
  {
    icon: <Eye className="w-6 h-6" />,
    label: 'Vi una mascota',
    desc: 'Avistaje en la vía pública',
    path: '/reportar-rapido',
    urgent: false,
  },
  {
    icon: <Heart className="w-6 h-6" />,
    label: 'Encontré una mascota',
    desc: 'Tengo una mascota retenida',
    path: '/reportar',
    urgent: false,
  },
];

const secondaryOptions = [
  { icon: <Heart className="w-4 h-4" />, label: 'Quiero adoptar', path: '/adopcion' },
  { icon: <Users className="w-4 h-4" />, label: 'Ser voluntario', path: '/sumate' },
  { icon: <HandCoins className="w-4 h-4" />, label: 'Colaborar', path: '/colaborar' },
  { icon: <MessageCircle className="w-4 h-4" />, label: 'Contactar equipo', path: '/colaborar' },
];

export default function ReportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleAction = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h2 className="text-xl font-bold text-brand-primary">Reportar</h2>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="px-6 pb-6 space-y-3">
              {reportOptions.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => handleAction(opt.path)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                    opt.urgent
                      ? 'border-red-200 bg-red-50 hover:bg-red-100 hover:shadow-md'
                      : 'border-brand-accent hover:border-brand-primary/50 hover:shadow-sm'
                  }`}
                >
                  <div className={`p-2 rounded-xl ${
                    opt.urgent ? 'bg-red-100 text-red-600' : 'bg-brand-primary/10 text-brand-primary'
                  }`}>
                    {opt.icon}
                  </div>
                  <div>
                    <p className={`font-bold text-sm ${opt.urgent ? 'text-red-700' : 'text-gray-800'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </button>
              ))}

              <div className="pt-4 border-t border-brand-accent">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">También</p>
                <div className="grid grid-cols-2 gap-2">
                  {secondaryOptions.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => handleAction(opt.path)}
                      className="flex items-center gap-2 px-3 py-3 rounded-xl border border-brand-accent hover:border-brand-primary/50 text-sm font-medium text-gray-700 hover:bg-brand-bg transition-all"
                    >
                      <span className="text-brand-primary shrink-0">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
