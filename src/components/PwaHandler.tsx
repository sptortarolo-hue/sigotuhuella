import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function PwaHandler() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Check if already installed
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    }
  };

  return (
    <AnimatePresence>
      {showInstallBanner && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[100]"
        >
          <div className="bg-brand-primary text-white p-6 rounded-[2rem] shadow-2xl flex flex-col gap-4 border border-white/10 backdrop-blur-xl">
            <button 
              onClick={() => setShowInstallBanner(false)}
              className="absolute top-4 right-4 p-1 hover:bg-white/10 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex gap-4 items-center">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight">Instalar Aplicación</h3>
                <p className="text-sm text-white/80">Accedé a Sigo Tu Huella más rápido instalándola en tu pantalla de inicio.</p>
              </div>
            </div>

            <button
              onClick={handleInstall}
              className="w-full py-3 bg-white text-brand-primary rounded-xl font-bold hover:bg-brand-bg transition-colors shadow-lg"
            >
              Instalar ahora
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
