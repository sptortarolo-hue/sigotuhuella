import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, User, Users, PawPrint, Loader2 } from 'lucide-react';
import { api } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';

interface Props {
  mode: 'group' | 'transit';
  petId: string;
  pets: any[];
  users: any[];
  onClose: () => void;
  onSaved: () => void;
}

function petThumb(p: any): string | undefined {
  const img = p.images?.[0];
  if (!img) return undefined;
  if (img.image_data) return `data:${img.mime_type || 'image/jpeg'};base64,${img.image_data}`;
  if (img.external_url) return img.external_url;
  return undefined;
}

export default function PetGroupTransitModal({ mode, petId, pets, users, onClose, onSaved }: Props) {
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [target, setTarget] = useState<any>(null);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [caregiverName, setCaregiverName] = useState('');
  const [caregiverPhone, setCaregiverPhone] = useState('');
  const [caregiverEmail, setCaregiverEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredPets = (pets || []).filter((p: any) => {
    if (p.id === petId) return false;
    if (p.group_id && p.group_id !== petId) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (p.name && p.name.toLowerCase().includes(q)) || (p.location && p.location.toLowerCase().includes(q)) || (p.species && p.species.toLowerCase().includes(q)) || (p.breed && p.breed.toLowerCase().includes(q));
  }).slice(0, 30);

  const filteredUsers = (users || []).filter((u: any) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (u.display_name && u.display_name.toLowerCase().includes(q)) || (u.email && u.email.toLowerCase().includes(q));
  }).slice(0, 30);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (mode === 'group') {
        if (!target) { setError('Seleccioná un reporte a agrupar'); setSaving(false); return; }
        await api.pets.group(petId, target.id);
      } else {
        await api.pets.transit(petId, targetUser ? targetUser.id : null, {
          caregiverName: targetUser ? undefined : (caregiverName || undefined),
          caregiverPhone: targetUser ? undefined : (caregiverPhone || undefined),
          caregiverEmail: targetUser ? undefined : (caregiverEmail || undefined),
        });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Error al guardar');
    } finally {
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
        <div className="flex items-center justify-between p-6 pb-0">
          <h3 className="font-bold text-lg text-brand-primary">
            {mode === 'group' ? 'Agrupar reporte' : 'Poner en tránsito'}
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {mode === 'group' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Elegí otro reporte de la misma mascota para anidarlo bajo la ficha actual. El reporte agrupado quedará oculto del feed público.
              </p>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre, ubicación, especie..."
                  className="w-full pl-11 pr-4 py-3 bg-brand-bg rounded-2xl border border-brand-accent outline-none text-sm"
                />
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {filteredPets.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">Sin reportes disponibles</p>
                )}
                {filteredPets.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setTarget(p)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all",
                      target?.id === p.id ? "border-brand-primary bg-brand-primary/5" : "border-brand-accent hover:border-brand-primary/50"
                    )}
                  >
                    <div className="w-11 h-11 rounded-xl bg-brand-bg overflow-hidden shrink-0">
                      {petThumb(p) ? <img src={petThumb(p)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><PawPrint className="w-5 h-5" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm text-brand-primary block truncate">{p.name || 'Sin nombre'}</span>
                      <span className="text-xs text-gray-500 block truncate">{p.location} · {p.species}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-gray-100 text-gray-600 shrink-0">{p.status}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                La mascota pasará a estado <strong>En Tránsito</strong>. Podés asignarla a un usuario (aparecerá en su portal como Tránsito) o dejarla en la agrupación (accesible para todos los administradores).
              </p>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-bold uppercase text-gray-500">Asignar a la agrupación (todos los admins)</span>
                </div>
                <button
                  onClick={() => { setTargetUser(null); setUserSearch(''); }}
                  className={cn(
                    "w-full p-3 rounded-2xl border text-left transition-all",
                    !targetUser ? "border-brand-primary bg-brand-primary/5" : "border-brand-accent hover:border-brand-primary/50"
                  )}
                >
                  <span className="text-sm font-bold text-brand-primary flex items-center gap-2"><Users className="w-4 h-4" /> Agrupación Sigo Tu Huella</span>
                </button>
                {!targetUser && (
                  <div className="mt-3 p-4 bg-brand-bg/50 rounded-2xl border border-brand-accent space-y-3">
                    <p className="text-xs text-gray-500">
                      Si quien cuida la mascota no tiene usuario de la app, cargá sus datos. La ficha quedará disponible para todos los administradores.
                    </p>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Nombre de quien cuida</label>
                      <input
                        value={caregiverName}
                        onChange={e => setCaregiverName(e.target.value)}
                        placeholder="Ej: María Pérez"
                        className="w-full px-4 py-2.5 bg-white rounded-xl border border-brand-accent outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Teléfono de contacto</label>
                      <input
                        value={caregiverPhone}
                        onChange={e => setCaregiverPhone(e.target.value)}
                        placeholder="Ej: 221 555 1234"
                        className="w-full px-4 py-2.5 bg-white rounded-xl border border-brand-accent outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Email (opcional)</label>
                      <input
                        value={caregiverEmail}
                        onChange={e => setCaregiverEmail(e.target.value)}
                        placeholder="ejemplo@correo.com"
                        className="w-full px-4 py-2.5 bg-white rounded-xl border border-brand-accent outline-none text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-bold uppercase text-gray-500">Asignar a un usuario</span>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); }}
                    placeholder="Buscar usuario por nombre o email..."
                    className="w-full pl-11 pr-4 py-3 bg-brand-bg rounded-2xl border border-brand-accent outline-none text-sm"
                  />
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {filteredUsers.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Sin usuarios</p>
                  )}
                  {filteredUsers.map((u: any) => (
                    <button
                      key={u.id}
                      onClick={() => setTargetUser(u)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all",
                        targetUser?.id === u.id ? "border-brand-primary bg-brand-primary/5" : "border-brand-accent hover:border-brand-primary/50"
                      )}
                    >
                      <div className="w-9 h-9 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-brand-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-sm text-brand-primary block truncate">{u.display_name || 'Sin nombre'}</span>
                        <span className="text-xs text-gray-500 block truncate">{u.email}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
        </div>

        <div className="p-6 pt-0 flex justify-end gap-3">
          <button onClick={onClose} className="px-6 py-3 rounded-2xl border border-brand-accent text-sm font-bold text-gray-500 hover:bg-brand-bg transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (mode === 'group' && !target)}
            className="px-6 py-3 rounded-2xl bg-brand-primary text-white text-sm font-bold hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'group' ? 'Agrupar' : 'Poner en tránsito'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
