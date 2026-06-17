import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, Heart, HandCoins, Sparkles, X, PawPrint, Users, Share2, Camera, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { useAuth } from '@/src/hooks/useAuth';

const tabs = [
  { label: 'Home', icon: Home, path: '/' },
  { label: 'Perdidos', icon: Search, path: '/perdidos' },
  { label: 'Adopción', icon: Heart, path: '/adopcion' },
  { label: 'Colaborar', icon: HandCoins, path: '/colaborar' },
  { label: 'Más', icon: Sparkles, path: null },
];

const moreOptions = [
  { label: 'Novedades', icon: Sparkles, path: '/novedades' },
  { label: 'Sumate', icon: Users, path: '/sumate' },
  { label: 'Difusión', icon: Share2, path: '/difusion' },
  { label: 'Generar Flyer', icon: Camera, path: '/flyer' },
];

export default function PublicMobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string | null) => {
    if (!path) return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-brand-accent lg:hidden">
        <div className="flex items-center justify-around h-16 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              onClick={() => tab.path ? navigate(tab.path) : setMoreOpen(true)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-colors",
                isActive(tab.path) ? "text-brand-primary" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <tab.icon className={cn("w-5 h-5", isActive(tab.path) && "fill-brand-primary/15")} />
              <span className="text-[10px] font-semibold">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/30"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[2.5rem] max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-6 pt-6 pb-2">
                <h2 className="text-xl font-bold text-brand-primary">Más</h2>
                <button onClick={() => setMoreOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <div className="px-6 pb-6 space-y-1">
                {moreOptions.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => { setMoreOpen(false); navigate(opt.path); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-brand-bg transition-colors"
                  >
                    <span className="text-brand-primary">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
                <div className="border-t border-brand-accent my-2" />
                {!user ? (
                  <button
                    onClick={() => { setMoreOpen(false); navigate('/login'); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium text-brand-primary hover:bg-brand-bg transition-colors"
                  >
                    <LogIn className="w-5 h-5" /> Iniciar Sesión
                  </button>
                ) : (
                  <button
                    onClick={() => { setMoreOpen(false); navigate('/dashboard'); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium text-brand-primary hover:bg-brand-bg transition-colors"
                  >
                    <PawPrint className="w-5 h-5" /> Mi Panel
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
