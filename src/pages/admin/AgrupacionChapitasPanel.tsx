import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, Plus, X, QrCode, History, Package, Heart, RefreshCw, Users,
  CheckCircle2, AlertCircle, Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api, apiUrl } from '@/src/lib/api';
import { getAllAgrupaciones } from '@/src/lib/volunteerService';
import { useAuth } from '@/src/hooks/useAuth';
import PublishAdoptionModal, { type PublishAdoptionPet } from '@/src/components/PublishAdoptionModal';
import { cn } from '@/src/lib/utils';

const SPECIES_LABELS: Record<string, string> = { dog: 'Perro', cat: 'Gato', other: 'Otro' };
const SPECIES_ICONS: Record<string, string> = { dog: '🐕', cat: '🐈', other: '🐾' };

interface Agrupacion {
  id: string;
  name: string;
}

interface QrCodeItem {
  id: string;
  code: string;
  agrupacion_id?: string | null;
  agrupacion_name?: string | null;
}

interface InventoryItem {
  id: string;
  code: string;
  assigned_at?: string | null;
  my_pet_id?: string | null;
  pet_name?: string | null;
  species?: string | null;
  birth_date?: string | null;
  has_avatar?: boolean;
  transferred?: boolean;
  adoption_pet_id?: string | null;
  adoption_status?: string | null;
}

interface Allocation {
  id: string;
  from_code: string;
  to_code: string;
  quantity: number;
  notes?: string | null;
  created_by_name?: string | null;
  created_at: string;
}

interface AgrupacionPet {
  id: string;
  name: string;
  species: string;
  breed?: string | null;
  color?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  bio?: string | null;
  created_at: string;
  has_avatar: boolean;
  qr_id?: string | null;
  qr_code?: string | null;
  owner_name?: string | null;
  adoption_pet_id?: string | null;
  adoption_status?: string | null;
  transferred?: boolean;
  adoption_pending?: boolean;
}

interface Props {
  mode: 'admin' | 'coordinator';
}

export default function AgrupacionChapitasPanel({ mode }: Props) {
  const { coordinatorOf } = useAuth();
  const isAdmin = mode === 'admin';

  const [agrupaciones, setAgrupaciones] = useState<Agrupacion[]>([]);
  const [selectedAgrupacion, setSelectedAgrupacion] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState('');

  // Asignar lote (admin)
  const [fromCode, setFromCode] = useState('');
  const [toCode, setToCode] = useState('');
  const [loteNotes, setLoteNotes] = useState('');
  const [allocating, setAllocating] = useState(false);
  const [loteResult, setLoteResult] = useState<string | null>(null);
  const [unassigned, setUnassigned] = useState<QrCodeItem[]>([]);

  // Inventario + mascotas
  const [inventory, setInventory] = useState<{
    disponibles: InventoryItem[];
    asignadas: InventoryItem[];
    allocations: Allocation[];
    summary: { disponibles: number; asignadas: number; total: number };
  } | null>(null);
  const [pets, setPets] = useState<AgrupacionPet[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Registrar mascota (modal)
  const [showRegister, setShowRegister] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    name: '', species: 'dog', breed: '', color: '', gender: 'unknown', birth_date: '', bio: '',
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [assignQr, setAssignQr] = useState(false);
  const [selectedQr, setSelectedQr] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Asignar chapita a mascota existente (modal)
  const [assignPet, setAssignPet] = useState<AgrupacionPet | null>(null);
  const [assignQrId, setAssignQrId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Adopción
  const [adoptionPet, setAdoptionPet] = useState<PublishAdoptionPet | null>(null);

  // Cargar agrupaciones: admin = todas, coordinador = las suyas
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingList(true);
      try {
        if (isAdmin) {
          const all = await getAllAgrupaciones();
          if (alive) setAgrupaciones(all.map((a: any) => ({ id: a.id, name: a.name })));
        } else {
          setAgrupaciones(coordinatorOf.map((a) => ({ id: a.id, name: a.name })));
        }
      } catch (e: any) {
        if (alive) setError(e.message || 'Error al cargar agrupaciones');
      } finally {
        if (alive) setLoadingList(false);
      }
    })();
    return () => { alive = false; };
  }, [isAdmin, coordinatorOf]);

  // Seleccionar la primera agrupación disponible
  useEffect(() => {
    if (!selectedAgrupacion && agrupaciones.length > 0) {
      setSelectedAgrupacion(agrupaciones[0].id);
    }
  }, [agrupaciones, selectedAgrupacion]);

  // Pool sin asignar (solo admin: para preview del rango)
  const loadUnassigned = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await api.qr.unassigned();
      setUnassigned(data.identifiers || []);
    } catch {
      /* silencioso: el preview es opcional */
    }
  }, [isAdmin]);

  useEffect(() => { loadUnassigned(); }, [loadUnassigned]);

  // Inventario + mascotas de la agrupación seleccionada
  const loadData = useCallback(async () => {
    if (!selectedAgrupacion) return;
    setLoadingData(true);
    setError('');
    try {
      const [inv, petsData] = await Promise.all([
        api.qr.agrupacionInventory(selectedAgrupacion),
        api.myPets.agrupacionPets(selectedAgrupacion),
      ]);
      setInventory(inv);
      setPets(petsData.pets || []);
    } catch (e: any) {
      setError(e.message || 'Error al cargar datos de la agrupación');
    } finally {
      setLoadingData(false);
    }
  }, [selectedAgrupacion]);

  useEffect(() => { loadData(); }, [loadData]);

  // Preview: códigos libres dentro del rango elegido (pool general, sin agrupación)
  const rangePreview = (() => {
    if (!fromCode || !toCode) return null;
    const from = fromCode.trim().toUpperCase();
    const to = toCode.trim().toUpperCase();
    if (!/^[A-Z]{3}-\d{4}$/.test(from) || !/^[A-Z]{3}-\d{4}$/.test(to)) return null;
    if (from > to) return null;
    return unassigned.filter((q) => !q.agrupacion_id && q.code >= from && q.code <= to).length;
  })();

  const handleAllocate = async () => {
    if (!selectedAgrupacion || !fromCode.trim() || !toCode.trim()) return;
    setAllocating(true);
    setLoteResult(null);
    setError('');
    try {
      const res = await api.qr.allocateAgrupacion(selectedAgrupacion, fromCode, toCode, loteNotes || undefined);
      setLoteResult(`Asignadas ${res.assigned} chapitas (${res.from_code} a ${res.to_code}) a ${res.agrupacion_name}${res.skipped > 0 ? ` — ${res.skipped} del rango ya no estaban libres` : ''}`);
      setFromCode(''); setToCode(''); setLoteNotes('');
      await Promise.all([loadData(), loadUnassigned()]);
    } catch (e: any) {
      setError(e.message || 'Error al asignar lote');
    } finally {
      setAllocating(false);
    }
  };

  const handleAvatarFile = (file: File | null) => {
    if (!file) { setAvatarPreview(null); setAvatarBase64(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAvatarPreview(result);
      setAvatarBase64(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  const resetRegisterForm = () => {
    setRegisterForm({ name: '', species: 'dog', breed: '', color: '', gender: 'unknown', birth_date: '', bio: '' });
    setAvatarPreview(null); setAvatarBase64(null);
    setAssignQr(false); setSelectedQr('');
    setFormError('');
  };

  const handleRegisterPet = async () => {
    if (!selectedAgrupacion) return;
    setSaving(true);
    setFormError('');
    try {
      const created = await api.myPets.create({
        ...registerForm,
        agrupacion_id: selectedAgrupacion,
        ...(avatarBase64 ? { avatar_image: avatarBase64, avatar_mime_type: 'image/jpeg' } : {}),
      });
      const myPet = created.myPet;
      if (assignQr && selectedQr) {
        await api.qr.assignAgrupacion(selectedQr, myPet.id);
      }
      setShowRegister(false);
      resetRegisterForm();
      await loadData();
    } catch (e: any) {
      setFormError(e.message || 'Error al registrar mascota');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignQrToPet = async () => {
    if (!assignPet || !assignQrId) return;
    setAssigning(true);
    try {
      await api.qr.assignAgrupacion(assignQrId, assignPet.id);
      setAssignPet(null);
      setAssignQrId('');
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Error al asignar chapita');
    } finally {
      setAssigning(false);
    }
  };

  const selectedName = agrupaciones.find((a) => a.id === selectedAgrupacion)?.name || '';

  if (!isAdmin && coordinatorOf.length === 0) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 text-center">
        <p className="text-gray-500 text-sm">No coordinás ninguna agrupación activa.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Selector de agrupación */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-5 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-brand-primary/10 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 sm:w-7 sm:h-7 text-brand-primary" />
          </div>
          <div className="flex-1">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1 block">
              {isAdmin ? 'Agrupación' : 'Tu agrupación'}
            </label>
            {loadingList ? (
              <Loader2 className="w-5 h-5 animate-spin text-brand-primary" />
            ) : agrupaciones.length === 0 ? (
              <p className="text-sm text-gray-500">No hay agrupaciones activas.</p>
            ) : (
              <select
                value={selectedAgrupacion}
                onChange={(e) => setSelectedAgrupacion(e.target.value)}
                className="w-full sm:w-auto min-w-0 sm:min-w-72 px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary"
              >
                {agrupaciones.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
          </div>
          <button
            onClick={() => { loadData(); loadUnassigned(); }}
            disabled={loadingData || !selectedAgrupacion}
            className="p-3 rounded-xl border border-brand-accent text-gray-500 hover:text-brand-primary hover:border-brand-primary transition-all disabled:opacity-50 shrink-0"
            title="Refrescar"
          >
            <RefreshCw className={cn('w-5 h-5', loadingData && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Asignar lote (solo admin) */}
      {isAdmin && (
        <div className="bg-white rounded-[2.5rem] border border-brand-accent p-5 sm:p-8">
          <h3 className="text-lg font-serif font-bold text-brand-primary mb-2 flex items-center gap-2">
            <QrCode className="w-5 h-5" /> Asignar lote de chapitas
          </h3>
          <p className="text-sm text-gray-500 mb-5">
            Reservá un rango de códigos (desde–hasta) para la agrupación seleccionada.
            Las chapitas quedan bajo control exclusivo de su coordinador y no vuelven al pool general.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Desde (ej: AAA-0001)</label>
              <input
                type="text" value={fromCode} placeholder="AAA-0001"
                onChange={(e) => setFromCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Hasta (ej: AAA-0050)</label>
              <input
                type="text" value={toCode} placeholder="AAA-0050"
                onChange={(e) => setToCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Nota (opcional)</label>
              <input
                type="text" value={loteNotes} placeholder="Ej: entrega lote 2026 — campaña identificación"
                onChange={(e) => setLoteNotes(e.target.value)}
                className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary"
              />
            </div>
          </div>
          {rangePreview !== null && (
            <div className="mt-4 p-3 bg-brand-bg rounded-xl text-sm text-gray-600">
              <strong className="text-brand-primary">{rangePreview}</strong> chapita{rangePreview !== 1 ? 's' : ''} libre{rangePreview !== 1 ? 's' : ''} en ese rango
              {rangePreview === 0 && ' — revisá los códigos (asignadas, dadas de baja o de otra agrupación)'}.
            </div>
          )}
          {loteResult && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {loteResult}
            </div>
          )}
          <button
            onClick={handleAllocate}
            disabled={allocating || !selectedAgrupacion || !fromCode.trim() || !toCode.trim()}
            className="mt-5 w-full sm:w-auto px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {allocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            Asignar lote
          </button>
        </div>
      )}

      {/* Inventario */}
      {selectedAgrupacion && (
        <div className="bg-white rounded-[2.5rem] border border-brand-accent p-5 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <h3 className="text-lg font-serif font-bold text-brand-primary flex items-center gap-2">
              <Package className="w-5 h-5" /> Inventario de chapitas {selectedName && <span className="text-gray-400 font-normal text-sm">— {selectedName}</span>}
            </h3>
            <button
              onClick={() => { setShowRegister(true); resetRegisterForm(); }}
              disabled={!selectedAgrupacion}
              className="w-full sm:w-auto px-5 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Registrar mascota
            </button>
          </div>

          {loadingData || !inventory ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
                <div className="p-4 bg-brand-bg rounded-2xl text-center">
                  <p className="text-2xl sm:text-3xl font-serif font-bold text-brand-primary">{inventory.summary.disponibles}</p>
                  <p className="text-xs text-gray-500 mt-1">Disponibles</p>
                </div>
                <div className="p-4 bg-brand-bg rounded-2xl text-center">
                  <p className="text-2xl sm:text-3xl font-serif font-bold text-brand-primary">{inventory.summary.asignadas}</p>
                  <p className="text-xs text-gray-500 mt-1">Asignadas</p>
                </div>
              </div>

              {inventory.disponibles.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Códigos disponibles</p>
                  <div className="flex flex-wrap gap-2">
                    {inventory.disponibles.map((q) => (
                      <span key={q.id} className="px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-mono font-bold">
                        {q.code}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {inventory.summary.total === 0 && (
                <p className="text-sm text-gray-500 py-4 text-center">
                  Esta agrupación todavía no tiene chapitas asignadas.
                  {isAdmin ? ' Usá "Asignar lote de chapitas" arriba.' : ' Pedile al equipo de Sigo Tu Huella que te asigne un lote.'}
                </p>
              )}

              {/* Historial de asignaciones */}
              {inventory.allocations.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" /> Historial de lotes asignados
                  </p>
                  <div className="overflow-x-auto rounded-2xl border border-brand-accent">
                    <table className="w-full text-left min-w-max">
                      <thead className="bg-brand-bg">
                        <tr className="text-[10px] sm:text-xs uppercase tracking-widest text-gray-400">
                          <th className="px-4 py-3">Rango</th>
                          <th className="px-4 py-3">Cantidad</th>
                          <th className="px-4 py-3">Nota</th>
                          <th className="px-4 py-3">Asignó</th>
                          <th className="px-4 py-3">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventory.allocations.map((al) => (
                          <tr key={al.id} className="border-t border-brand-accent text-xs sm:text-sm">
                            <td className="px-4 py-3 font-mono font-bold text-brand-primary whitespace-nowrap">{al.from_code} → {al.to_code}</td>
                            <td className="px-4 py-3">{al.quantity}</td>
                            <td className="px-4 py-3 text-gray-500">{al.notes || '—'}</td>
                            <td className="px-4 py-3 text-gray-500">{al.created_by_name || '—'}</td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(al.created_at).toLocaleDateString('es-AR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Mascotas de la agrupación */}
      {selectedAgrupacion && (
        <div className="bg-white rounded-[2.5rem] border border-brand-accent p-5 sm:p-8">
          <h3 className="text-lg font-serif font-bold text-brand-primary mb-5">
            Mascotas de la agrupación <span className="text-gray-400 font-normal text-sm">({pets.length})</span>
          </h3>

          {loadingData ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
            </div>
          ) : pets.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">
              Todavía no hay mascotas registradas bajo esta agrupación.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {pets.map((pet) => (
                <div key={pet.id} className="rounded-2xl border border-brand-accent overflow-hidden bg-white flex flex-col">
                  <div className="aspect-video bg-brand-bg relative">
                    {pet.has_avatar ? (
                      <img src={apiUrl(`/api/my-pets/${pet.id}/avatar`)} alt={pet.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">
                        {SPECIES_ICONS[pet.species] || '🐾'}
                      </div>
                    )}
                    {pet.qr_code && (
                      <span className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-brand-primary text-white text-[10px] sm:text-xs font-mono font-bold flex items-center gap-1 shadow">
                        <QrCode className="w-3 h-3" /> {pet.qr_code}
                      </span>
                    )}
                    {pet.transferred && (
                      <span className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-purple-100 border border-purple-200 text-purple-700 text-[10px] sm:text-xs font-bold">
                        Adoptada
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex flex-col flex-1">
                    <p className="font-bold text-brand-primary text-sm sm:text-base">{pet.name}</p>
                    <p className="text-xs text-gray-500">
                      {SPECIES_LABELS[pet.species] || pet.species}{pet.breed ? ` · ${pet.breed}` : ''}
                    </p>
                    {pet.adoption_pending ? (
                      <span className="mt-2 inline-flex w-fit px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] sm:text-xs font-bold">
                        Adopción en curso
                      </span>
                    ) : pet.adoption_pet_id ? (
                      <span className="mt-2 inline-flex w-fit px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] sm:text-xs font-bold">
                        {pet.adoption_status === 'adopted' ? 'Con nuevo hogar' : 'Publicada en adopción'}
                      </span>
                    ) : null}
                    <div className="flex flex-col sm:flex-row gap-2 mt-auto pt-4">
                      {!pet.qr_code && !pet.transferred && inventory && inventory.disponibles.length > 0 && (
                        <button
                          onClick={() => { setAssignPet(pet); setAssignQrId(''); }}
                          className="flex-1 px-3 py-2 rounded-xl bg-brand-primary/10 text-brand-primary text-xs font-bold hover:bg-brand-primary/20 transition-all flex items-center justify-center gap-1.5"
                        >
                          <QrCode className="w-3.5 h-3.5" /> Asignar chapita
                        </button>
                      )}
                      {!pet.transferred && !pet.adoption_pending && (
                        <button
                          onClick={() => setAdoptionPet({
                            id: pet.id, name: pet.name, species: pet.species, bio: pet.bio,
                          })}
                          className="flex-1 px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold hover:bg-rose-100 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Heart className="w-3.5 h-3.5" /> {pet.adoption_pet_id && pet.adoption_status !== 'adopted' ? 'Ver adopción' : 'Dar en adopción'}
                        </button>
                      )}
                      <Link
                        to={`/mi-mascota/${pet.id}`}
                        className="px-3 py-2 rounded-xl border border-brand-accent text-gray-500 text-xs font-bold hover:border-brand-primary hover:text-brand-primary transition-all flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> Ver
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: registrar mascota */}
      <AnimatePresence>
        {showRegister && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => !saving && setShowRegister(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-xl"
            >
              <div className="flex items-center justify-between p-6 sm:p-8 pb-0">
                <h3 className="text-lg font-serif font-bold text-brand-primary">Registrar mascota en {selectedName}</h3>
                <button onClick={() => !saving && setShowRegister(false)}
                  className="p-2 text-gray-400 hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 sm:p-8 overflow-y-auto">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Nombre *</label>
                      <input type="text" value={registerForm.name}
                        onChange={(e) => setRegisterForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Especie *</label>
                      <select value={registerForm.species}
                        onChange={(e) => setRegisterForm(prev => ({ ...prev, species: e.target.value }))}
                        className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary">
                        <option value="dog">Perro</option>
                        <option value="cat">Gato</option>
                        <option value="other">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Raza</label>
                      <input type="text" value={registerForm.breed}
                        onChange={(e) => setRegisterForm(prev => ({ ...prev, breed: e.target.value }))}
                        className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Color</label>
                      <input type="text" value={registerForm.color}
                        onChange={(e) => setRegisterForm(prev => ({ ...prev, color: e.target.value }))}
                        className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Sexo</label>
                      <select value={registerForm.gender}
                        onChange={(e) => setRegisterForm(prev => ({ ...prev, gender: e.target.value }))}
                        className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary">
                        <option value="unknown">No sé</option>
                        <option value="male">Macho</option>
                        <option value="female">Hembra</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Fecha de nacimiento aprox.</label>
                      <input type="date" value={registerForm.birth_date}
                        onChange={(e) => setRegisterForm(prev => ({ ...prev, birth_date: e.target.value }))}
                        className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Descripción</label>
                    <textarea rows={2} value={registerForm.bio}
                      onChange={(e) => setRegisterForm(prev => ({ ...prev, bio: e.target.value }))}
                      className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Foto</label>
                    <div className="flex items-center gap-3">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="preview" className="w-16 h-16 rounded-2xl object-cover border border-brand-accent" />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-brand-bg border border-brand-accent flex items-center justify-center text-2xl">🐾</div>
                      )}
                      <input type="file" accept="image/*"
                        onChange={(e) => handleAvatarFile(e.target.files?.[0] || null)}
                        className="text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-brand-primary/10 file:text-brand-primary file:font-bold file:text-sm file:cursor-pointer" />
                    </div>
                  </div>
                  <div className="p-4 bg-brand-bg rounded-2xl">
                    <label className="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={assignQr}
                        onChange={(e) => { setAssignQr(e.target.checked); if (!e.target.checked) setSelectedQr(''); }}
                        className="w-4 h-4 rounded border-gray-300" />
                      Asignar chapita del pool ahora
                    </label>
                    {assignQr && (
                      <div className="mt-3">
                        {inventory && inventory.disponibles.length > 0 ? (
                          <select value={selectedQr}
                            onChange={(e) => setSelectedQr(e.target.value)}
                            className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary font-mono">
                            <option value="">Elegir chapita…</option>
                            {inventory.disponibles.map((q) => (
                              <option key={q.id} value={q.id}>{q.code}</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs text-amber-600">No hay chapitas disponibles en el pool de la agrupación.</p>
                        )}
                      </div>
                    )}
                  </div>
                  {formError && (
                    <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
                      <AlertCircle className="w-4 h-4 shrink-0" /> {formError}
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button onClick={handleRegisterPet} disabled={saving || !registerForm.name.trim() || !registerForm.species}
                      className="w-full sm:w-auto px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Registrar mascota
                    </button>
                    <button onClick={() => setShowRegister(false)} disabled={saving}
                      className="w-full sm:w-auto px-6 py-3 text-gray-500 rounded-xl font-bold text-sm hover:bg-brand-bg transition-all">
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: asignar chapita a mascota existente */}
      <AnimatePresence>
        {assignPet && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => !assigning && setAssignPet(null)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-xl"
            >
              <div className="flex items-center justify-between p-6 sm:p-8 pb-0">
                <h3 className="text-lg font-serif font-bold text-brand-primary">Asignar chapita a {assignPet.name}</h3>
                <button onClick={() => !assigning && setAssignPet(null)}
                  className="p-2 text-gray-400 hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 sm:p-8 overflow-y-auto">
                {inventory && inventory.disponibles.length > 0 ? (
                  <>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Chapita disponible</label>
                    <select value={assignQrId}
                      onChange={(e) => setAssignQrId(e.target.value)}
                      className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary font-mono">
                      <option value="">Elegir chapita…</option>
                      {inventory.disponibles.map((q) => (
                        <option key={q.id} value={q.id}>{q.code}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-2">
                      El QR queda asociado a {assignPet.name}: al escanearlo se muestra su perfil.
                    </p>
                    <button onClick={handleAssignQrToPet} disabled={assigning || !assignQrId}
                      className="mt-5 w-full px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                      {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                      Asignar chapita
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">No hay chapitas disponibles en el pool de la agrupación.</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: dar en adopción (flujo existente del sistema) */}
      <AnimatePresence>
        {adoptionPet && (
          <PublishAdoptionModal
            pet={adoptionPet}
            onClose={() => setAdoptionPet(null)}
            onPublished={() => { setAdoptionPet(null); loadData(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
