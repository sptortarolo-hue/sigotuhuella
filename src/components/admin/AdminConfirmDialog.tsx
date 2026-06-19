import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface AdminConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  actionLabel?: string;
  variant?: 'danger' | 'warning';
}

export default function AdminConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  actionLabel = 'CONFIRMAR',
  variant = 'danger',
}: AdminConfirmDialogProps) {
  const [step, setStep] = useState<'confirm' | 'type'>('confirm');
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setStep('confirm');
    setTyped('');
    onClose();
  };

  const handleConfirm = async () => {
    if (step === 'confirm') {
      setStep('type');
      return;
    }
    if (typed !== actionLabel) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      handleClose();
    }
  };

  const colorClasses = variant === 'danger'
    ? { icon: 'text-red-500', iconBg: 'bg-red-100', button: 'bg-red-500 hover:bg-red-600' }
    : { icon: 'text-amber-500', iconBg: 'bg-amber-100', button: 'bg-amber-500 hover:bg-amber-600' };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-xl p-6 sm:p-8"
          >
            <button onClick={handleClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center gap-4">
              <div className={cn("w-14 h-14 rounded-full flex items-center justify-center", colorClasses.iconBg)}>
                <AlertTriangle className={cn("w-7 h-7", colorClasses.icon)} />
              </div>

              <h2 className="text-xl font-bold text-brand-primary">{title}</h2>
              <p className="text-gray-500 text-sm leading-relaxed">{message}</p>

              {step === 'type' && (
                <div className="w-full space-y-2">
                  <p className="text-xs text-gray-400 font-medium text-left">
                    Escribí <span className="font-bold text-red-500">{actionLabel}</span> para confirmar:
                  </p>
                  <input
                    type="text"
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    placeholder={actionLabel}
                    className="w-full px-4 py-3 border border-brand-accent rounded-xl text-sm outline-none focus:border-brand-primary transition-colors text-center font-bold"
                    autoFocus
                  />
                </div>
              )}

              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-3 border border-brand-accent rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  {step === 'confirm' ? 'Cancelar' : 'No'}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={step === 'type' && typed !== actionLabel}
                  className={cn(
                    "flex-1 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                    colorClasses.button
                  )}
                >
                  {loading ? 'Procesando...' : step === 'confirm' ? 'Continuar' : actionLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
