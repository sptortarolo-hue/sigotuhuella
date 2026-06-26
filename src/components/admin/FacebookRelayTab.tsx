import { useState, useEffect, useRef } from 'react';
import { Smartphone, Loader2, RefreshCw, Upload, X, CheckCircle, XCircle, Clock, AlertCircle, Bug, Heart, Globe, Search, CheckSquare, Square, Send, Megaphone, Save } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { api } from '@/src/lib/api';

interface FbRelayStatus {
  enabled: boolean;
  hasSession: boolean;
  adoptionBroadcastEnabled: boolean;
  stats: {
    pending: number;
    completed: number;
    failed: number;
    recent: any[];
  };
}

interface FailedTask {
  id: string;
  pet_id: string;
  fb_group_id: string;
  message: string;
  error_message: string;
  created_at: string;
  completed_at: string;
  pet_name?: string;
  group_name?: string;
}

interface PetBrief {
  id: string;
  name: string;
  species: string;
  breed: string;
  status: string;
  location: string;
  created_at: string;
  has_image: boolean;
}

interface FbGroupInfo {
  id: string;
  name: string;
  fb_group_id: string;
}

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  lost: { label: 'Perdido', color: 'bg-red-100 text-red-700' },
  for_adoption: { label: 'Adopción', color: 'bg-green-100 text-green-700' },
  sighted: { label: 'Avistado', color: 'bg-yellow-100 text-yellow-700' },
  retained: { label: 'Retenido', color: 'bg-orange-100 text-orange-700' },
  accidented: { label: 'Accidentado', color: 'bg-purple-100 text-purple-700' },
  needs_attention: { label: 'Atención', color: 'bg-pink-100 text-pink-700' },
  adopted: { label: 'Adoptado', color: 'bg-blue-100 text-blue-700' },
  reunited: { label: 'Reencuentro', color: 'bg-teal-100 text-teal-700' },
};

export default function FacebookRelayTab() {
  const [status, setStatus] = useState<FbRelayStatus | null>(null);
  const [failedTasks, setFailedTasks] = useState<FailedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [fbAdoptionToggling, setFbAdoptionToggling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Broadcast pet state
  const [petCategory, setPetCategory] = useState<'reportados' | 'adopcion'>('reportados');
  const [petSearch, setPetSearch] = useState('');
  const [pets, setPets] = useState<PetBrief[]>([]);
  const [petsLoading, setPetsLoading] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [fbGroups, setFbGroups] = useState<FbGroupInfo[]>([]);
  const [fbGroupsLoading, setFbGroupsLoading] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [broadcastPetLoading, setBroadcastPetLoading] = useState(false);
  const [broadcastPetResults, setBroadcastPetResults] = useState<any[] | null>(null);
  const [broadcastPetPreview, setBroadcastPetPreview] = useState('');
  const [forceAdoptionsLoading, setForceAdoptionsLoading] = useState(false);
  const [forceAdoptionsResult, setForceAdoptionsResult] = useState('');
  const [fbAdoptionHours, setFbAdoptionHours] = useState('');
  const [fbAdoptionHoursSaving, setFbAdoptionHoursSaving] = useState(false);

  async function loadData() {
    try {
      const [statusData, failedData, hoursVal] = await Promise.all([
        api.facebookRelay.status(),
        api.facebookRelay.failedTasks(),
        api.settings.get('fb_adoption_broadcast_hours'),
      ]);
      setStatus(statusData);
      setFailedTasks(failedData.tasks || []);
      setFbAdoptionHours(hoursVal || '8,12,16,20');
    } catch (err) {
      console.error('Error loading FB relay data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleToggle() {
    setToggling(true);
    try {
      const data = await api.facebookRelay.toggle();
      setStatus(prev => prev ? { ...prev, enabled: data.enabled } : null);
    } catch (err) {
      console.error('Toggle error:', err);
    } finally {
      setToggling(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const result = await api.facebookRelay.uploadSession(file);
      await loadData();
      if (result?.cookieCount) {
        alert(`✅ ${result.cookieCount} cookies detectadas en el archivo. El relay las tomará en su próximo ciclo.`);
      } else {
        alert('⚠️ No se detectaron cookies en el archivo. Asegurate de subir un storage_state.json válido.');
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Error al subir la sesión: ' + (err as any)?.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleClearSession() {
    try {
      await api.facebookRelay.clearSession();
      await loadData();
    } catch (err) {
      console.error('Clear session error:', err);
    }
  }

  async function handleFbAdoptionToggle() {
    setFbAdoptionToggling(true);
    try {
      const newValue = status?.adoptionBroadcastEnabled ? 'false' : 'true';
      await api.settings.update('fb_adoption_broadcast_enabled', newValue);
      setStatus(prev => prev ? { ...prev, adoptionBroadcastEnabled: !prev.adoptionBroadcastEnabled } : null);
    } catch (err) {
      console.error('Error toggling FB adoption broadcast:', err);
    } finally {
      setFbAdoptionToggling(false);
    }
  }

  const handleForceAdoptions = async () => {
    setForceAdoptionsLoading(true);
    setForceAdoptionsResult('');
    try {
      const res = await api.facebookRelay.broadcastAdoptions();
      setForceAdoptionsResult(res.message || '✅ Broadcast ejecutado');
    } catch (err: any) {
      setForceAdoptionsResult(`❌ Error: ${err.message}`);
    } finally {
      setForceAdoptionsLoading(false);
    }
  }

  const handleSaveFbHours = async () => {
    setFbAdoptionHoursSaving(true);
    try {
      await api.settings.update('fb_adoption_broadcast_hours', fbAdoptionHours);
    } catch (e) {
      console.error('Error saving FB adoption hours:', e);
    } finally {
      setFbAdoptionHoursSaving(false);
    }
  }

  const speciesIcon = (species: string) => species === 'cat' ? '🐱' : '🐶';

  async function fetchPets() {
    setPetsLoading(true);
    setSelectedPetId(null);
    setSelectedGroupIds(new Set());
    setBroadcastPetResults(null);
    setBroadcastPetPreview('');
    try {
      const data = await api.facebookRelay.pets(petCategory, petSearch);
      setPets(data.pets || []);
    } catch (e) { /* ignore */ }
    setPetsLoading(false);
  }

  async function fetchFbGroups() {
    setFbGroupsLoading(true);
    try {
      const data = await api.facebookRelay.groups();
      setFbGroups(data.groups || []);
    } catch (e) { /* ignore */ }
    setFbGroupsLoading(false);
  }

  function selectPet(petId: string) {
    if (selectedPetId === petId) {
      setSelectedPetId(null);
      setSelectedGroupIds(new Set());
      setBroadcastPetResults(null);
      setBroadcastPetPreview('');
      return;
    }
    setSelectedPetId(petId);
    setSelectedGroupIds(new Set());
    setBroadcastPetResults(null);
    setBroadcastPetPreview('');
  }

  function toggleGroupSelection(groupId: string) {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  async function handleBroadcastPet() {
    if (!selectedPetId || selectedGroupIds.size === 0) return;
    setBroadcastPetLoading(true);
    setBroadcastPetResults(null);
    try {
      const selected = fbGroups.filter(g => selectedGroupIds.has(g.fb_group_id));
      const res = await api.facebookRelay.broadcastPet(selectedPetId, selected);
      setBroadcastPetResults(res.results);
      setBroadcastPetPreview(res.caption);
    } catch (err: any) {
      setBroadcastPetResults([{ groupId: 'Error', status: 'error', error: err.message }]);
    } finally {
      setBroadcastPetLoading(false);
    }
  }

  useEffect(() => { fetchPets(); }, [petCategory]);
  useEffect(() => { fetchFbGroups(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-brand-primary">Facebook Phone Relay</h2>
          <p className="text-sm text-gray-500">Publicación a grupos de Facebook vía teléfono (Playwright)</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-2xl border border-brand-accent p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">Estado</h3>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${status?.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            {toggling && <Loader2 className="absolute left-1 w-5 h-5 animate-spin text-white" />}
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${status?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-brand-primary">{status?.stats.pending || 0}</div>
            <div className="text-xs text-gray-500">Pendientes</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{status?.stats.completed || 0}</div>
            <div className="text-xs text-gray-500">Completados</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{status?.stats.failed || 0}</div>
            <div className="text-xs text-gray-500">Fallidos</div>
          </div>
          <div className={`bg-gray-50 rounded-xl p-4 text-center ${status?.hasSession ? 'text-green-600' : 'text-red-500'}`}>
            <div className="text-2xl font-bold">{status?.hasSession ? '✓' : '✗'}</div>
            <div className="text-xs text-gray-500">Sesión FB</div>
          </div>
        </div>
      </div>

      {/* Session Management */}
      <div className="bg-white rounded-2xl border border-brand-accent p-6">
        <h3 className="text-lg font-bold mb-4">Sesión de Facebook</h3>
        <p className="text-sm text-gray-500 mb-4">
          Subí el archivo <code>storage_state.json</code> exportado desde Playwright (login manual en desktop).
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Subiendo...' : 'Subir sesión'}
          </button>
          {status?.hasSession && (
            <button
              onClick={handleClearSession}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
            >
              <X className="w-4 h-4" /> Limpiar sesión
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => {
              if (e.target.files?.[0]) handleUpload(e.target.files[0]);
              e.target.value = '';
            }}
          />
          {status?.hasSession && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" /> Sesión activa
            </span>
          )}
        </div>
      </div>

      {/* Adoption Broadcast Toggle */}
      <div className="bg-white rounded-2xl border border-brand-accent p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heart className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="text-lg font-bold">Difusión de adopciones</h3>
              <p className="text-sm text-gray-500">
                Publicar automáticamente mascotas en adopción en grupos de Facebook
              </p>
            </div>
          </div>
          <button
            onClick={handleFbAdoptionToggle}
            disabled={fbAdoptionToggling}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${status?.adoptionBroadcastEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            {fbAdoptionToggling && <Loader2 className="absolute left-1 w-5 h-5 animate-spin text-white" />}
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${status?.adoptionBroadcastEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleForceAdoptions}
            disabled={forceAdoptionsLoading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {forceAdoptionsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
            {forceAdoptionsLoading ? 'Publicando...' : 'Forzar adopciones ahora'}
          </button>
          {forceAdoptionsResult && (
            <span className="text-sm font-medium">{forceAdoptionsResult}</span>
          )}
        </div>
        <div className="border-t border-brand-accent pt-4 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Horarios (ej: 8,12,16,20):</span>
          <input
            value={fbAdoptionHours}
            onChange={e => setFbAdoptionHours(e.target.value)}
            placeholder="8,12,16,20"
            className="flex-1 max-w-xs px-4 py-2.5 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-sm"
          />
          <button
            onClick={handleSaveFbHours}
            disabled={fbAdoptionHoursSaving}
            className="px-4 py-2.5 bg-brand-primary text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center gap-2 text-sm shrink-0"
          >
            {fbAdoptionHoursSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </div>

      {/* Publicar mascota en grupos de Facebook */}
      <div className="bg-white rounded-2xl border border-brand-accent p-6 space-y-6">
        <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
          <Globe className="w-6 h-6" /> Publicar mascota en grupos de Facebook
        </h2>

        {/* Category + Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex rounded-xl border border-brand-accent overflow-hidden">
            <button onClick={() => setPetCategory('reportados')} className={cn("px-4 py-2.5 text-sm font-bold transition-all", petCategory === 'reportados' ? 'bg-brand-primary text-white' : 'bg-white text-gray-500 hover:bg-brand-bg')}>Reportados</button>
            <button onClick={() => setPetCategory('adopcion')} className={cn("px-4 py-2.5 text-sm font-bold transition-all", petCategory === 'adopcion' ? 'bg-brand-primary text-white' : 'bg-white text-gray-500 hover:bg-brand-bg')}>En adopción</button>
          </div>
          <div className="flex-1 flex gap-2">
            <input value={petSearch} onChange={e => setPetSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchPets()} placeholder="Buscar por nombre o raza..." className="flex-1 px-4 py-2.5 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-sm" />
            <button onClick={fetchPets} className="px-4 py-2.5 bg-brand-primary text-white font-bold rounded-xl hover:shadow-lg transition-all"><Search className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Pet list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
          {petsLoading ? (
            <div className="col-span-full flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-brand-primary" /></div>
          ) : pets.length === 0 ? (
            <p className="col-span-full text-center text-gray-400 py-8 text-sm">No hay mascotas en esta categoría</p>
          ) : pets.map(pet => {
            const badge = STATUS_BADGES[pet.status] || { label: pet.status, color: 'bg-gray-100 text-gray-600' };
            const selected = selectedPetId === pet.id;
            return (
              <button key={pet.id} onClick={() => selectPet(pet.id)} className={cn("text-left p-3 rounded-xl border-2 transition-all", selected ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-accent hover:border-brand-primary/50')}>
                <div className="flex items-center gap-3">
                  {pet.has_image ? (
                    <img src={`/api/images/pet/${pet.id}/cover`} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <span className="text-xl shrink-0">{speciesIcon(pet.species)}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate">{pet.name || 'Sin nombre'}</p>
                    <p className="text-xs text-gray-500 truncate">{pet.breed || speciesIcon(pet.species)}</p>
                    <p className="text-xs text-gray-400 truncate">📍 {pet.location?.substring(0, 40) || 'Sin ubicación'}</p>
                  </div>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0", badge.color)}>{badge.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Groups list */}
        {selectedPetId && (
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Seleccionar grupos de Facebook</p>
            {fbGroupsLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-primary" /></div>
            ) : fbGroups.length === 0 ? (
              <p className="text-sm text-gray-400">No hay grupos de Facebook activos. Activá grupos en la sección Grupos de Facebook.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fbGroups.map(g => {
                  const checked = selectedGroupIds.has(g.fb_group_id);
                  return (
                    <button key={g.id} onClick={() => toggleGroupSelection(g.fb_group_id)} className="flex items-center gap-3 p-3 rounded-xl border border-brand-accent hover:bg-brand-bg/50 transition-all text-left">
                      {checked ? <CheckSquare className="w-5 h-5 text-brand-primary shrink-0" /> : <Square className="w-5 h-5 text-gray-300 shrink-0" />}
                      <span className="text-sm font-medium truncate">{g.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Broadcast button */}
            <div className="flex items-center gap-4 pt-2">
              <button onClick={handleBroadcastPet} disabled={broadcastPetLoading || selectedGroupIds.size === 0} className="px-8 py-3.5 bg-brand-primary text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2">
                {broadcastPetLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {broadcastPetLoading ? 'Publicando...' : `Publicar en ${selectedGroupIds.size} grupo${selectedGroupIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* Preview */}
        {broadcastPetPreview && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Preview del mensaje:</p>
            <pre className="whitespace-pre-wrap text-sm bg-brand-bg rounded-xl p-4 border border-brand-accent font-sans">{broadcastPetPreview}</pre>
          </div>
        )}

        {/* Results */}
        {broadcastPetResults && (
          <div className="overflow-x-auto rounded-2xl border border-brand-accent">
            <table className="w-full text-left min-w-max">
              <thead>
                <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                  <th className="px-4 py-3">Grupo</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-accent">
                {broadcastPetResults.map((r, i) => {
                  const group = fbGroups.find(g => g.fb_group_id === r.groupId);
                  return (
                    <tr key={i} className="text-sm">
                      <td className="px-4 py-3 font-medium">{group?.name || r.groupName || r.groupId}</td>
                      <td className="px-4 py-3">
                        {r.status === 'queued' ? <span className="text-green-600 font-bold">Encolado</span> : <span className="text-red-500 font-bold" title={r.error}>Error</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Stats */}
      {status?.stats.recent && status.stats.recent.length > 0 && (
        <div className="bg-white rounded-2xl border border-brand-accent p-6">
          <h3 className="text-lg font-bold mb-4">Últimas publicaciones</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold text-gray-600">Estado</th>
                  <th className="py-2 pr-4 font-semibold text-gray-600">Mascota</th>
                  <th className="py-2 pr-4 font-semibold text-gray-600">Grupo</th>
                  <th className="py-2 pr-4 font-semibold text-gray-600">Creado</th>
                </tr>
              </thead>
              <tbody>
                {status.stats.recent.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      {r.status === 'completed' ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : r.status === 'failed' ? (
                        <XCircle className="w-5 h-5 text-red-500" />
                      ) : (
                        <Clock className="w-5 h-5 text-yellow-500" />
                      )}
                    </td>
                    <td className="py-3 pr-4">{r.pet_name || r.pet_id?.substring(0, 8) || '-'}</td>
                    <td className="py-3 pr-4">{r.group_name || r.fb_group_id || '-'}</td>
                    <td className="py-3 pr-4 text-gray-500">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Failed Tasks */}
      {failedTasks.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-bold text-red-700">Tareas fallidas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-red-200">
                  <th className="py-2 pr-4 font-semibold text-gray-600">Grupo</th>
                  <th className="py-2 pr-4 font-semibold text-gray-600">Error</th>
                  <th className="py-2 pr-4 font-semibold text-gray-600">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {failedTasks.map((t: FailedTask) => (
                  <tr key={t.id} className="border-b border-red-100 hover:bg-red-50">
                    <td className="py-3 pr-4">{t.group_name || t.fb_group_id || '-'}</td>
                    <td className="py-3 pr-4 text-red-600 max-w-xs truncate">{t.error_message}</td>
                    <td className="py-3 pr-4 text-gray-500">{new Date(t.completed_at || t.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Debug dump */}
      <DebugSection />
    </div>
  );
}

function DebugSection() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await api.facebookRelay.debugView();
      setData(d);
    } catch { setData(null) }
    setLoading(false);
  }

  useEffect(() => { if (open) load(); }, [open]);

  return (
    <div className="bg-white rounded-2xl border border-gray-300 p-6">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900">
        <Bug className="w-4 h-4" /> Debug dump {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-4 space-y-4 text-sm">
          {loading && <Loader2 className="w-5 h-5 animate-spin" />}
          {!loading && !data && <p className="text-gray-500">No hay debug dump disponible. Corré fb-relay hasta que falle y volvé a cargar.</p>}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div><strong>URL:</strong> <span className="break-all">{data.url}</span></div>
                <div><strong>Timestamp:</strong> {data.timestamp}</div>
                <div><strong>Lexical:</strong> {data.lexicalInfo?.hasLexical ? '✓ sí' : '✗ no'} (count: {data.lexicalInfo?.count})</div>
              </div>
              {data.ariaLabels && (
                <div>
                  <strong>ARIA labels (primeros 50):</strong>
                  <pre className="mt-1 p-2 bg-gray-100 rounded-lg text-xs max-h-60 overflow-y-auto whitespace-pre-wrap break-all">{data.ariaLabels.join('\n')}</pre>
                </div>
              )}
              {data.html && (
                <details>
                  <summary className="cursor-pointer text-brand-primary font-medium">Ver HTML (20k chars)</summary>
                  <pre className="mt-1 p-2 bg-gray-100 rounded-lg text-xs max-h-80 overflow-y-auto whitespace-pre-wrap break-all">{data.html}</pre>
                </details>
              )}
              {data.screenshot && (
                <div>
                  <strong>Screenshot:</strong>
                  <img src={`data:image/png;base64,${data.screenshot}`} alt="Debug screenshot" className="mt-1 max-w-full border rounded-lg" />
                </div>
              )}
              <button onClick={load} className="px-3 py-1 text-xs bg-gray-100 rounded-lg hover:bg-gray-200">
                Recargar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
