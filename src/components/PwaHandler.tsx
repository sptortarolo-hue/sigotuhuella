import React, { useEffect, useState, useRef } from 'react';
import { Download, Bell, BellOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subscribe, isSubscribed, isSupported } from '@/src/lib/pushService';

export default function PwaHandler() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [closeReason, setCloseReason] = useState<'manual' | 'auto' | null>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const autoTimerRef = useRef(0);
  const rAFRef = useRef(0);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    isSupported().then(async (supported) => {
      if (!supported) return;
      const already = await isSubscribed();
      if (already) return;
      if (Notification.permission === 'denied') return;
      const dismissed = sessionStorage.getItem('notif-banner-dismissed');
      if (dismissed) return;

      const timer = setTimeout(() => setShowNotifBanner(true), 3000);
      return () => clearTimeout(timer);
    });
  }, []);

  useEffect(() => {
    if (!showInstallBanner) return;
    setCloseReason(null);

    const circle = circleRef.current;
    if (!circle) return;

    const circumference = 2 * Math.PI * 10;
    circle.style.transition = 'none';
    circle.style.strokeDashoffset = String(circumference);

    rAFRef.current = requestAnimationFrame(() => {
      circle.style.transition = 'stroke-dashoffset 5s linear';
      circle.style.strokeDashoffset = '0';
    });

    autoTimerRef.current = window.setTimeout(() => {
      setCloseReason('auto');
      setShowInstallBanner(false);
    }, 5000);

    return () => {
      cancelAnimationFrame(rAFRef.current);
      clearTimeout(autoTimerRef.current);
    };
  }, [showInstallBanner]);

  const handleClose = () => {
    setCloseReason('manual');
    setShowInstallBanner(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallBanner(false);
      setTimeout(() => setShowNotifBanner(true), 2000);
    }
  };

  const handleNotifClose = () => {
    setShowNotifBanner(false);
    sessionStorage.setItem('notif-banner-dismissed', '1');
  };

  const handleNotifEnable = async () => {
    const ok = await subscribe();
    setShowNotifBanner(false);
    if (!ok) sessionStorage.setItem('notif-banner-dismissed', '1');
  };

  const circumference = 2 * Math.PI * 10;

  return (
    <>
      <AnimatePresence>
        {showInstallBanner && (
          <motion.div
            key="pwa-banner"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={
              closeReason === 'auto'
                ? { scale: 0.9, opacity: 0, y: 0 }
                : { y: 100, opacity: 0 }
            }
            transition={{ type: 'spring', duration: 0.4 }}
            className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[100]"
          >
            <div className="relative bg-brand-primary text-white p-6 rounded-[2rem] shadow-2xl flex flex-col gap-4 border border-white/10 backdrop-blur-xl">
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-0.5 hover:bg-white/10 rounded-full"
              >
                <svg width="26" height="26" viewBox="0 0 24 24">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    opacity="0.2"
                  />
                  <circle
                    ref={circleRef}
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference}
                    transform="rotate(-90 12 12)"
                  />
                  <line x1="8" y1="8" x2="16" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="16" y1="8" x2="8" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
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

      <AnimatePresence>
        {showNotifBanner && (
          <motion.div
            key="notif-banner"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[100]"
          >
            <div className="relative bg-brand-secondary text-white p-6 rounded-[2rem] shadow-2xl flex flex-col gap-4 border border-white/10 backdrop-blur-xl">
              <button
                onClick={handleNotifClose}
                className="absolute top-4 right-4 p-0.5 hover:bg-white/10 rounded-full"
              >
                <BellOff className="w-5 h-5" />
              </button>

              <div className="flex gap-4 items-center">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">Activar Notificaciones</h3>
                  <p className="text-sm text-white/80">Recibí alertas de mascotas perdidas, reencuentros y novedades de la comunidad.</p>
                </div>
              </div>

              <button
                onClick={handleNotifEnable}
                className="w-full py-3 bg-white text-brand-secondary rounded-xl font-bold hover:bg-brand-bg transition-colors shadow-lg"
              >
                Activar ahora
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
