import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, PawPrint, Loader2, Layers, AlertTriangle } from 'lucide-react';
import { api } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';
import { getPetImageUrl } from '@/src/lib/petService';

const STATUS_COLORS: Record<string, string> = {
  lost: 'bg-red-100 text-red-700',
  found: 'bg-green-100 text-green-700',
  sighted: 'bg-blue-100 text-blue-700',
  retained: 'bg-amber-100 text-amber-700',
  transitada: 'bg-teal-100 text-teal-700',
  reunited: 'bg-purple-100 text-purple-700',
  for_adoption: 'bg-pink-100 text-pink-700',
};

interface Props {
  petId: string;
  petName: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function PetDuplicateGroupModal({ petId, petName, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [similar, setSimilar] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.pets.similar(petId);
        if (alive) setSimilar(res.similar || []);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Error al buscar duplicados');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [petId]);

  const handleGroup = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      // selected = el pet duplicado encontrado; petId = el actual.
      // La API determina automáticamente cuál es root (el que tiene case, más viejo, etc).
      await api.pets.group(selected, petId);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Error al agrupar');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-5 border-b border-brand-accent">
          <div>
            <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2">
              <Layers className="w-5 h-5" /> Duplicados de "{petName}"
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Mascotas con apariencia muy similar detectada por IA</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center py-12 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm">Buscando duplicados...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-12 text-red-400">
              <AlertTriangle className="w-8 h-8 mb-3" />
              <p className="text-sm">{error}</p>
            </div>
          ) : similar.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-gray-400">
              <PawPrint className="w-8 h-8 mb-3" />
              <p className="text-sm">No se encontraron duplicados para esta mascota.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {similar.map((s: any) => (
                <button
                  key={s.pet.id}
                  onClick={() => setSelected(s.pet.id === selected ? null : s.pet.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left",
                    selected === s.pet.id ? "border-brand-primary bg-brand-primary/5" : "border-gray-100 hover:border-gray-200 bg-white"
                  )}
                >
                  <div className="w-14 h-14 rounded-xl bg-white border border-brand-accent overflow-hidden shrink-0">
                    {getPetImageUrl(s.pet, 0) ? (
                      <img src={getPetImageUrl(s.pet, 0)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300"><PawPrint className="w-6 h-6" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-brand-primary truncate">{s.pet.name || 'Sin nombre'}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0", STATUS_COLORS[s.pet.status] || 'bg-gray-100 text-gray-500')}>
                        {s.pet.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{s.pet.location || 'Sin ubicación'}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {s.pet.species === 'dog' ? 'Perro' : s.pet.species === 'cat' ? 'Gato' : s.pet.species || ''}
                      {s.pet.breed ? ` · ${s.pet.breed}` : ''}{s.pet.color ? ` · ${s.pet.color}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={cn(
                      "text-lg font-bold",
                      s.score >= 0.9 ? "text-green-600" : s.score >= 0.8 ? "text-amber-600" : "text-gray-500"
                    )}>
                      {Math.round(s.score * 100)}%
                    </div>
                    <p className="text-[10px] text-gray-400">{s.reason}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-brand-accent flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {similar.length > 0 ? `${similar.length} duplicado(s) encontrado(s)` : 'Sin duplicados'}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
              Cerrar
            </button>
            <button
              onClick={handleGroup}
              disabled={!selected || saving}
              className="px-5 py-2 bg-brand-primary text-white text-sm font-bold rounded-xl hover:bg-brand-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              {saving ? 'Unificando...' : 'Unificar con seleccionado'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
