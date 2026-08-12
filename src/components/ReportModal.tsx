import React, { useState } from 'react';
import { api } from '@/src/lib/api';
import { X, Loader2, Flag, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

export const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Spam o publicidad' },
  { value: 'abuso', label: 'Lenguaje ofensivo o abuso' },
  { value: 'info_falsa', label: 'Información falsa o engañosa' },
  { value: 'maltrato', label: 'Maltrato o abandono animal' },
  { value: 'otro', label: 'Otro motivo' },
];

interface Props {
  open: boolean;
  targetType: 'post' | 'comment' | 'pet';
  targetId: string;
  onClose: () => void;
}

export default function ReportModal({ open, targetType, targetId, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (!open) return null;

  const reset = () => {
    setReason('');
    setDescription('');
    setSent(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason) return;
    try {
      setLoading(true);
      await api.feed.report(targetType, targetId, { reason, description: description.trim() || undefined });
      setSent(true);
    } catch (e: any) {
      alert(e.message || 'Error al reportar contenido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={handleClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-md bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-2xl"
      >
        <div className="p-6 sm:p-8 border-b border-brand-accent flex items-center justify-between">
          <h3 className="text-lg font-bold text-brand-primary flex items-center gap-2">
            <Flag className="w-5 h-5" /> Reportar contenido
          </h3>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 sm:p-8 overflow-y-auto">
          {sent ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
              <p className="font-bold text-gray-800 mb-1">Reporte enviado</p>
              <p className="text-sm text-gray-500">Gracias. Nuestro equipo de moderación revisará el contenido.</p>
              <button
                onClick={handleClose}
                className="mt-6 px-6 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">¿Por qué querés reportar este contenido?</p>
              <div className="space-y-2">
                {REPORT_REASONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setReason(r.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      reason === r.value
                        ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                        : 'border-brand-accent text-gray-600 hover:border-brand-primary/50'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Detalles (opcional)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm resize-none"
                  rows={3}
                  placeholder="Contanos qué pasó..."
                />
              </div>
              <button
                onClick={handleSubmit}
                disabled={loading || !reason}
                className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
                Enviar reporte
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
