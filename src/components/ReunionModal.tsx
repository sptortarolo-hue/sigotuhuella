import { useState, useEffect } from 'react';
import { X, Loader2, HeartHandshake, User, Phone, Mail, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '@/src/lib/api';
import { updatePet, PetStatus } from '@/src/lib/petService';

interface ReunionModalProps {
  petId: string;
  petName: string;
  isAdoption?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function ReunionModal({ petId, petName, isAdoption, onClose, onSaved }: ReunionModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerAddress, setOwnerAddress] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.pets.ownerData(petId);
        setOwnerName(data.owner_name || '');
        setOwnerPhone(data.owner_phone || '');
        setOwnerEmail(data.owner_email || '');
        setOwnerAddress(data.owner_address || '');
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [petId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePet(petId, {
        status: isAdoption ? PetStatus.ADOPTED : PetStatus.REUNITED,
        owner_name: ownerName || null,
        owner_phone: ownerPhone || null,
        owner_email: ownerEmail || null,
        owner_address: ownerAddress || null,
      } as any);
      onSaved();
    } catch (e) {
      console.error(e);
      alert('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <HeartHandshake className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  {isAdoption ? 'Adopción' : 'Reencuentro'}
                </h2>
                <p className="text-xs text-gray-400">{petName}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-brand-accent rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400 leading-relaxed">
                  {isAdoption
                    ? 'Completá los datos del adoptante. Los campos son opcionales.'
                    : 'Completá los datos del dueño. Los campos se sugieren automáticamente si están disponibles.'}
                </p>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5 mb-1">
                    <User className="w-3 h-3" /> Nombre del {isAdoption ? 'adoptante' : 'dueño'}
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={e => setOwnerName(e.target.value)}
                    placeholder="Ej: Juan Pérez"
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5 mb-1">
                    <Phone className="w-3 h-3" /> Teléfono
                  </label>
                  <input
                    type="tel"
                    value={ownerPhone}
                    onChange={e => setOwnerPhone(e.target.value)}
                    placeholder="Ej: 2215551234"
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5 mb-1">
                    <Mail className="w-3 h-3" /> Email
                  </label>
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={e => setOwnerEmail(e.target.value)}
                    placeholder="Ej: juan@email.com"
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5 mb-1">
                    <MapPin className="w-3 h-3" /> Dirección
                  </label>
                  <input
                    type="text"
                    value={ownerAddress}
                    onChange={e => setOwnerAddress(e.target.value)}
                    placeholder="Ej: Calle 7 entre 52 y 53"
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary transition-colors"
                  />
                </div>
              </>
            )}
          </div>

          <div className="p-6 border-t border-brand-accent flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-brand-accent text-brand-primary rounded-xl font-bold hover:bg-brand-accent/80 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <HeartHandshake className="w-4 h-4" />
              )}
              {saving ? 'Guardando...' : 'Confirmar'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
