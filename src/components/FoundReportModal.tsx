import React, { useState } from 'react';
import { api } from '@/src/lib/api';
import { X, Loader2, Phone, MapPin, User, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  shareToken: string;
  petName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function FoundReportModal({ shareToken, petName, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    finder_name: '',
    finder_phone: '',
    finder_location: '',
    finder_notes: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.finder_phone) return;
    try {
      setLoading(true);
      await api.qr.found(shareToken, form);
      onSuccess();
    } catch (e: any) {
      alert(e.message || 'Error al enviar reporte');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-md bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-2xl"
      >
        <div className="p-6 sm:p-8 border-b border-brand-accent flex items-center justify-between">
          <h3 className="text-lg font-bold text-brand-primary">Reportar como encontrada</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 sm:p-8 overflow-y-auto space-y-4">
          <p className="text-sm text-gray-500">
            Completá tus datos para que el dueño de <strong>{petName}</strong> pueda contactarte.
          </p>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1">
              <User className="w-3 h-3" /> Tu nombre
            </label>
            <input
              value={form.finder_name}
              onChange={e => setForm(prev => ({ ...prev, finder_name: e.target.value }))}
              className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
              placeholder="Tu nombre"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1">
              <Phone className="w-3 h-3" /> Teléfono *
            </label>
            <input
              value={form.finder_phone}
              onChange={e => setForm(prev => ({ ...prev, finder_phone: e.target.value }))}
              className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
              placeholder="Ej: 221 555-1234"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Ubicación
            </label>
            <input
              value={form.finder_location}
              onChange={e => setForm(prev => ({ ...prev, finder_location: e.target.value }))}
              className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
              placeholder="Dónde la encontraste"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> Notas
            </label>
            <textarea
              value={form.finder_notes}
              onChange={e => setForm(prev => ({ ...prev, finder_notes: e.target.value }))}
              className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm resize-none"
              rows={2}
              placeholder="Algún detalle adicional..."
            />
          </div>
        </div>

        <div className="p-6 sm:p-8 border-t border-brand-accent">
          <button
            onClick={handleSubmit}
            disabled={loading || !form.finder_phone}
            className="w-full py-3 bg-brand-secondary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
            Notificar al dueño
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
