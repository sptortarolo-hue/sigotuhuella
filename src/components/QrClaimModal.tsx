import React, { useState } from 'react';
import { api } from '@/src/lib/api';
import { X, Loader2, QrCode, Check } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  onClose: () => void;
  onSuccess: (code: string, shareToken: string) => void;
  myPets: any[];
}

export default function QrClaimModal({ onClose, onSuccess, myPets }: Props) {
  const [code, setCode] = useState('');
  const [selectedPetId, setSelectedPetId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const petsWithoutQr = myPets.filter(p => !p.qr_id);

  const handleSubmit = async () => {
    if (!code.trim() || !selectedPetId) return;
    try {
      setLoading(true);
      setError('');
      const result = await api.qr.claim(code.trim().toUpperCase(), selectedPetId);
      onSuccess(result.code, result.share_token);
    } catch (e: any) {
      setError(e.message || 'Error al asociar QR');
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
          <h3 className="text-lg font-bold text-brand-primary flex items-center gap-2">
            <QrCode className="w-5 h-5" /> Asociar código QR
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 sm:p-8 overflow-y-auto space-y-5">
          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Código QR</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm font-mono tracking-wider"
              placeholder="Ej: AAA-0001"
              maxLength={8}
            />
            <p className="text-[10px] text-gray-400 mt-1">Ingresá el código impreso en el QR</p>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Asociar a mascota</label>
            {petsWithoutQr.length === 0 ? (
              <p className="text-sm text-gray-400">Todas tus mascotas ya tienen QR asignado.</p>
            ) : (
              <div className="space-y-2">
                {petsWithoutQr.map(pet => (
                  <button
                    key={pet.id}
                    onClick={() => setSelectedPetId(pet.id)}
                    className={`w-full p-3 rounded-xl border text-sm text-left flex items-center gap-3 transition-all ${
                      selectedPetId === pet.id
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                        : 'border-brand-accent hover:border-brand-primary/50 text-gray-600'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center shrink-0 overflow-hidden">
                      {pet.avatar_image ? (
                        <img src={`/my-pet-avatar/${pet.id}`} alt={pet.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg">🐾</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{pet.name}</p>
                      <p className="text-xs text-gray-400">
                        {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otro'}
                        {pet.breed ? ` · ${pet.breed}` : ''}
                      </p>
                    </div>
                    {selectedPetId === pet.id && <Check className="w-4 h-4 text-brand-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="p-6 sm:p-8 border-t border-brand-accent">
          <button
            onClick={handleSubmit}
            disabled={loading || !code.trim() || !selectedPetId}
            className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            Asociar QR
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
