import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, MessageSquare, Users, Wifi, WifiOff, Power, Globe, Image, ScanQrCode, Search, CheckSquare, Square, Plus, Trash2, Bell, Check, Save, Heart } from 'lucide-react';
import { api } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';

interface RelayStatus {
  enabled: boolean;
  connected: boolean;
  lastPollAt: string | null;
  pendingCount: number;
  qrAvailable: boolean;
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

interface GroupInfo {
  id: string;
  name: string;
  group_id: string;
  is_active: boolean;
  auto_broadcast: boolean;
  broadcast_adoptions: boolean;
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

export default function RelayWhatsAppTab() {
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [testTo, setTestTo] = useState('');
  const [testText, setTestText] = useState('');
  const [testImageUrl, setTestImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');

  const [groupText, setGroupText] = useState('');
  const [groupImageUrl, setGroupImageUrl] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResults, setBroadcastResults] = useState<any[] | null>(null);

  const [toggling, setToggling] = useState(false);
  const [waAdoptionEnabled, setWaAdoptionEnabled] = useState(false);
  const [waAdoptionToggling, setWaAdoptionToggling] = useState(false);

  // Broadcast UI state
  const [petCategory, setPetCategory] = useState<'reportados' | 'adopcion'>('reportados');
  const [petSearch, setPetSearch] = useState('');
  const [pets, setPets] = useState<PetBrief[]>([]);
  const [petsLoading, setPetsLoading] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [selectedPetPreview, setSelectedPetPreview] = useState('');
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [broadcastPetLoading, setBroadcastPetLoading] = useState(false);
  const [broadcastPetResults, setBroadcastPetResults] = useState<any[] | null>(null);
  const [broadcastPetPreview, setBroadcastPetPreview] = useState('');

  // Groups management state
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');

  // Admin notification config
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPhoneSaved, setAdminPhoneSaved] = useState(false);

  // Failed messages
  const [failedMessages, setFailedMessages] = useState<any[]>([]);
  const [failedLoading, setFailedLoading] = useState(false);

  const addGroup = async () => {
    if (!newGroupName.trim() || !newGroupId.trim()) return;
    try {
      await api.whatsapp.addGroup({ name: newGroupName.trim(), group_id: newGroupId.trim() });
      setNewGroupName('');
      setNewGroupId('');
      await fetchGroups();
    } catch (e: any) {
      alert(e?.message || 'Error al agregar grupo');
    }
  };

  const toggleGroup = async (id: string, is_active: boolean) => {
    try {
      await api.whatsapp.updateGroup(id, { is_active: !is_active });
      await fetchGroups();
    } catch (e) { console.error(e); }
  };

  const toggleAutoBroadcast = async (id: string, auto_broadcast: boolean) => {
    try {
      await api.whatsapp.updateGroup(id, { auto_broadcast: !auto_broadcast });
      await fetchGroups();
    } catch (e) { console.error(e); }
  };

  const toggleAdoptions = async (id: string, broadcast_adoptions: boolean) => {
    try {
      await api.whatsapp.updateGroup(id, { broadcast_adoptions: !broadcast_adoptions });
      await fetchGroups();
    } catch (e) { console.error(e); }
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('¿Eliminar este grupo?')) return;
    try {
      await api.whatsapp.deleteGroup(id);
      await fetchGroups();
    } catch (e) { console.error(e); }
  };

  const fetchAdminPhone = async () => {
    try {
      const data = await api.settings.get('relay_admin_phone');
      setAdminPhone(data || '');
    } catch (e) { /* ignore */ }
  };

  const saveAdminPhone = async () => {
    try {
      await api.settings.update('relay_admin_phone', adminPhone);
      setAdminPhoneSaved(true);
      setTimeout(() => setAdminPhoneSaved(false), 3000);
    } catch (e) { /* ignore */ }
  };

  const fetchFailedMessages = async () => {
    setFailedLoading(true);
    try {
      const data = await api.whatsappRelay.failedMessages();
      setFailedMessages(data);
    } catch (e) { /* ignore */ }
    setFailedLoading(false);
  };

  const fetchStatus = async () => {
    try {
      const data = await api.whatsappRelay.status();
      setStatus(data);
      setError('');
      if (data.qrAvailable) {
        setQrDataUrl(`/api/relay/qr?t=${Date.now()}`);
      } else {
        setQrDataUrl(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    fetchAdminPhone();
  }, []);

  useEffect(() => {
    api.settings.get('wa_adoption_broadcast_enabled').then(v => {
      if (v === 'true') setWaAdoptionEnabled(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchFailedMessages();
    const interval = setInterval(fetchFailedMessages, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchPets();
  }, [petCategory]);

  const fetchGroups = async () => {
    setGroupsLoading(true);
    try {
      const data = await api.whatsapp.groups();
      setGroups(data);
    } catch (e) { /* ignore */ }
    setGroupsLoading(false);
  };

  const fetchPets = async () => {
    setPetsLoading(true);
    setSelectedPetId(null);
    setSelectedPetPreview('');
    setSelectedGroupIds(new Set());
    setBroadcastPetResults(null);
    try {
      const data = await api.whatsappRelay.pets(petCategory, petSearch);
      setPets(data.pets || []);
    } catch (e) { /* ignore */ }
    setPetsLoading(false);
  };

  const handleSearch = () => {
    fetchPets();
  };

  const selectPet = async (petId: string) => {
    if (selectedPetId === petId) {
      setSelectedPetId(null);
      setSelectedPetPreview('');
      setSelectedGroupIds(new Set());
      setBroadcastPetResults(null);
      return;
    }
    setSelectedPetId(petId);
    setSelectedPetPreview('');
    setSelectedGroupIds(new Set());
    setBroadcastPetResults(null);
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleBroadcastPet = async () => {
    if (!selectedPetId || selectedGroupIds.size === 0) return;
    setBroadcastPetLoading(true);
    setBroadcastPetResults(null);
    try {
      const res = await api.whatsappRelay.broadcastPet(selectedPetId, Array.from(selectedGroupIds));
      setBroadcastPetResults(res.results);
      setBroadcastPetPreview(res.caption);
    } catch (err: any) {
      setBroadcastPetResults([{ groupId: 'Error', status: 'error', error: err.message }]);
    } finally {
      setBroadcastPetLoading(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await api.whatsappRelay.toggle();
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setToggling(false);
    }
  };

  const handleWaAdoptionToggle = async () => {
    setWaAdoptionToggling(true);
    try {
      const newValue = waAdoptionEnabled ? 'false' : 'true';
      await api.settings.update('wa_adoption_broadcast_enabled', newValue);
      setWaAdoptionEnabled(!waAdoptionEnabled);
    } catch (e) {
      console.error('Error toggling WA adoption broadcast:', e);
    } finally {
      setWaAdoptionToggling(false);
    }
  };

  const handleSendTest = async () => {
    if (!testTo || (!testText && !testImageUrl)) return;
    setSending(true);
    setSendResult('');
    try {
      const res = await api.whatsappRelay.send(testTo, testText, testImageUrl || undefined);
      setSendResult(`✅ Encolado (id: ${res.id}). El relay lo enviará en segundos.`);
      setTestText('');
      setTestImageUrl('');
    } catch (err: any) {
      setSendResult(`❌ Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleBroadcast = async () => {
    if (!groupText.trim() && !groupImageUrl.trim()) return;
    setBroadcasting(true);
    setBroadcastResults(null);
    try {
      const res = await api.whatsappRelay.groupsBroadcast(groupText, groupImageUrl || undefined);
      setBroadcastResults(res.results);
      setGroupText('');
      setGroupImageUrl('');
    } catch (err: any) {
      setBroadcastResults([{ group: 'Error', status: 'error', error: err.message }]);
    } finally {
      setBroadcasting(false);
    }
  };

  const speciesIcon = (species: string) => species === 'cat' ? '🐱' : '🐶';

  return (
    <div className="space-y-6">

      {/* Estado */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
          <MessageSquare className="w-6 h-6" /> Estado del Relay WhatsApp
        </h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
          </div>
        ) : error && !status ? (
          <p className="text-red-500 text-sm">{error}</p>
        ) : status ? (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-brand-accent p-4 space-y-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Conexión</p>
              <div className="flex items-center gap-2">
                {status.connected ? (
                  <><Wifi className="w-5 h-5 text-green-500" /><span className="text-green-700 font-bold">Conectado</span></>
                ) : (
                  <><WifiOff className="w-5 h-5 text-red-400" /><span className="text-red-500 font-bold">Desconectado</span></>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-brand-accent p-4 space-y-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Relay</p>
              <div className="flex items-center gap-2">
                {status.enabled ? (
                  <span className="text-green-700 font-bold">Activado</span>
                ) : (
                  <span className="text-gray-400 font-bold">Desactivado</span>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-brand-accent p-4 space-y-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Pendientes</p>
              <p className="text-2xl font-bold">{status.pendingCount}</p>
            </div>
            <div className="rounded-2xl border border-brand-accent p-4 space-y-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Último poll</p>
              <p className="text-sm font-medium truncate">{status.lastPollAt ? new Date(status.lastPollAt).toLocaleTimeString() : '—'}</p>
            </div>
          </div>

          {qrDataUrl && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex items-center gap-2 text-brand-primary font-bold">
                <ScanQrCode className="w-5 h-5" />
                Escaneá este QR desde WhatsApp del teléfono relay
              </div>
              <img src={qrDataUrl} alt="WhatsApp QR" className="w-64 h-64 border-4 border-brand-primary/20 rounded-2xl" />
              <p className="text-sm text-gray-500 text-center max-w-md">
                Abrí WhatsApp en el teléfono → Menú (⋮) → Dispositivos vinculados → Vincular dispositivo → Escaneá este QR
              </p>
            </div>
          )}
          </>
        ) : null}

        <button
          onClick={handleToggle}
          disabled={toggling}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all",
            status?.enabled
              ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
              : "bg-green-50 text-green-600 hover:bg-green-100 border border-green-200"
          )}
        >
          {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
          {status?.enabled ? 'Desactivar Relay' : 'Activar Relay'}
        </button>
      </div>

      {/* Notificaciones de fallos */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
          <Bell className="w-6 h-6" /> Notificaciones de fallos
        </h2>
        <p className="text-sm text-gray-500">Si un mensaje no puede enviarse por relay, se notificará a este número de WhatsApp para que lo reenvíes manualmente.</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={adminPhone}
            onChange={e => setAdminPhone(e.target.value)}
            placeholder="5492212025190"
            className="flex-1 px-4 py-3 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-sm"
          />
          <button
            onClick={saveAdminPhone}
            className="px-6 py-3 bg-brand-primary text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center gap-2 text-sm shrink-0"
          >
            {adminPhoneSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {adminPhoneSaved ? 'Guardado' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Adopción Broadcast Toggle */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heart className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="text-lg font-bold">Difusión automática de adopciones</h3>
              <p className="text-sm text-gray-500">
                Publicar nuevas mascotas en adopción en los grupos con columna "Adopciones" activada
              </p>
            </div>
          </div>
          <button
            onClick={handleWaAdoptionToggle}
            disabled={waAdoptionToggling}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${waAdoptionEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            {waAdoptionToggling && <Loader2 className="absolute left-1 w-5 h-5 animate-spin text-white" />}
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${waAdoptionEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Grupos de WhatsApp */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
          <Users className="w-6 h-6" /> Grupos de WhatsApp
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Nombre del grupo"
            className="px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
          />
          <input
            value={newGroupId}
            onChange={(e) => setNewGroupId(e.target.value)}
            placeholder="Group ID (ej: 123456789@..."
            className="px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary transition-colors text-sm"
          />
          <button
            onClick={addGroup}
            disabled={!newGroupName.trim() || !newGroupId.trim()}
            className="px-4 py-3 bg-brand-primary text-white font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2 justify-center text-sm"
          >
            <Plus className="w-4 h-4" /> Agregar Grupo
          </button>
        </div>

        {groupsLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-brand-primary" /></div>
        ) : groups.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-400 font-medium">Sin grupos registrados</p>
            <p className="text-xs text-gray-300 mt-1">Agregá un grupo para empezar a enviar broadcasts</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-brand-accent">
            <table className="w-full text-left min-w-max">
              <thead>
                  <tr className="bg-brand-bg text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Group ID</th>
                    <th className="px-4 py-3">Activo</th>
                    <th className="px-4 py-3">Auto</th>
                    <th className="px-4 py-3">Adopciones</th>
                    <th className="px-4 py-3">Acciones</th>
                  </tr>
              </thead>
              <tbody className="divide-y divide-brand-accent">
                {groups.map((g) => (
                  <tr key={g.id} className="hover:bg-brand-bg/50 transition-colors text-sm">
                    <td className="px-4 py-3 font-medium text-brand-primary">{g.name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{g.group_id}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleGroup(g.id, g.is_active)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold transition-all",
                          g.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        )}
                      >
                        {g.is_active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleAutoBroadcast(g.id, g.auto_broadcast)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold transition-all",
                          g.auto_broadcast ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"
                        )}
                      >
                        {g.auto_broadcast ? 'Auto' : 'Manual'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleAdoptions(g.id, g.broadcast_adoptions)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-bold transition-all",
                          g.broadcast_adoptions ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-400"
                        )}
                      >
                        {g.broadcast_adoptions ? 'Sí' : 'No'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteGroup(g.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mensaje de prueba */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
          <Send className="w-6 h-6" /> Enviar mensaje de prueba
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Teléfono</label>
            <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="549221XXXXXX" className="w-full px-4 py-3 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Mensaje</label>
            <textarea value={testText} onChange={e => setTestText(e.target.value)} placeholder="Escribí el mensaje..." rows={2} className="w-full px-4 py-3 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20 resize-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              <Image className="w-3 h-3 inline mb-0.5 mr-1" />URL de imagen (opcional)
            </label>
            <input value={testImageUrl} onChange={e => setTestImageUrl(e.target.value)} placeholder="https://ejemplo.com/imagen.jpg" className="w-full px-4 py-3 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleSendTest} disabled={sending || !testTo || (!testText && !testImageUrl)} className="px-8 py-3.5 bg-brand-primary text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2">
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
          {sendResult && <p className="text-sm font-medium">{sendResult}</p>}
        </div>
      </div>

      {/* Publicar mascota en grupos */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
          <Globe className="w-6 h-6" /> Publicar mascota en grupos
        </h2>

        {/* Category + Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex rounded-xl border border-brand-accent overflow-hidden">
            <button onClick={() => setPetCategory('reportados')} className={cn("px-4 py-2.5 text-sm font-bold transition-all", petCategory === 'reportados' ? 'bg-brand-primary text-white' : 'bg-white text-gray-500 hover:bg-brand-bg')}>Reportados</button>
            <button onClick={() => setPetCategory('adopcion')} className={cn("px-4 py-2.5 text-sm font-bold transition-all", petCategory === 'adopcion' ? 'bg-brand-primary text-white' : 'bg-white text-gray-500 hover:bg-brand-bg')}>En adopción</button>
          </div>
          <div className="flex-1 flex gap-2">
            <input value={petSearch} onChange={e => setPetSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Buscar por nombre o raza..." className="flex-1 px-4 py-2.5 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-sm" />
            <button onClick={handleSearch} className="px-4 py-2.5 bg-brand-primary text-white font-bold rounded-xl hover:shadow-lg transition-all"><Search className="w-4 h-4" /></button>
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
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Seleccionar grupos</p>
            {groupsLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-primary" /></div>
            ) : groups.length === 0 ? (
              <p className="text-sm text-gray-400">No hay grupos activos. Agregalos en la sección "Grupos de WhatsApp" arriba.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {groups.map(g => {
                  const checked = selectedGroupIds.has(g.group_id);
                  return (
                    <button key={g.id} onClick={() => toggleGroupSelection(g.group_id)} className="flex items-center gap-3 p-3 rounded-xl border border-brand-accent hover:bg-brand-bg/50 transition-all text-left">
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
        {(selectedPetPreview || broadcastPetPreview) && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Preview del mensaje:</p>
            <pre className="whitespace-pre-wrap text-sm bg-brand-bg rounded-xl p-4 border border-brand-accent font-sans">{broadcastPetPreview || selectedPetPreview}</pre>
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
                  const group = groups.find(g => g.group_id === r.groupId);
                  return (
                    <tr key={i} className="text-sm">
                      <td className="px-4 py-3 font-medium">{group?.name || r.groupId}</td>
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

      {/* Publicar texto en grupos */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
          <MessageSquare className="w-6 h-6" /> Publicar texto en grupos
        </h2>
        <p className="text-sm text-gray-500">Envía un mensaje de texto a todos los grupos activos a través del relay.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Mensaje</label>
            <textarea value={groupText} onChange={e => setGroupText(e.target.value)} placeholder="Escribí el mensaje..." rows={3} className="w-full px-4 py-3 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20 resize-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              <Image className="w-3 h-3 inline mb-0.5 mr-1" />URL de imagen (opcional)
            </label>
            <input value={groupImageUrl} onChange={e => setGroupImageUrl(e.target.value)} placeholder="https://ejemplo.com/imagen.jpg" className="w-full px-4 py-3 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleBroadcast} disabled={broadcasting || (!groupText.trim() && !groupImageUrl.trim())} className="px-8 py-3.5 bg-brand-primary text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2">
            {broadcasting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Users className="w-5 h-5" />}
            {broadcasting ? 'Publicando...' : 'Publicar en grupos'}
          </button>
        </div>
        {broadcastResults && (
          <div className="overflow-x-auto rounded-2xl border border-brand-accent">
            <table className="w-full text-left min-w-max">
              <thead>
                <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                  <th className="px-4 py-3">Grupo</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-accent">
                {broadcastResults.map((r, i) => (
                  <tr key={i} className="text-sm">
                    <td className="px-4 py-3 font-medium">{r.group}</td>
                    <td className="px-4 py-3">
                      {r.status === 'queued' ? <span className="text-green-600 font-bold">Encolado</span> : <span className="text-red-500 font-bold" title={r.error}>Error</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Últimos mensajes fallidos */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
          <MessageSquare className="w-6 h-6" /> Últimos mensajes fallidos
        </h2>
        {failedLoading && failedMessages.length === 0 ? (
          <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-brand-primary" /></div>
        ) : failedMessages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No hay mensajes fallidos</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-brand-accent">
            <table className="w-full text-left min-w-max">
              <thead>
                <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Texto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-accent">
                {failedMessages.map((m) => (
                  <tr key={m.id} className="text-sm">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {new Date(m.created_at).toLocaleString('es-AR')}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{m.wa_to}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{(m.text || '').substring(0, 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
