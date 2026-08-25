import { useState, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import {
  getAllAgrupaciones, createAgrupacion, updateAgrupacion, deleteAgrupacion,
  getPendingFbSearchGroups, approveFbSearchGroup, deleteFbSearchGroup,
  getFbSearchGroups, getUsersForAgrupacion, requestFbSearchGroup, updateFbSearchGroup,
  getDiffusionStats, getAdminGroupMemberships, toggleAdminGroupMembership,
  type DiffusionStat, type AdminGroupMembership,
} from '@/src/lib/volunteerService';
import { NEIGHBORHOODS } from '@/src/lib/neighborhoods';
import { neighborhoodsInPolygon } from '@/src/lib/zoneUtils';
import { parseFbGroupUrl, prettifyFbGroupName } from '@/src/lib/fbGroupUrl';
import ZonePolygonPicker from '@/src/components/admin/ZonePolygonPicker';
import { Map as MapIcon } from 'lucide-react';
import {
  Loader2, Plus, X, Trash2, Edit2, Save, Check, Globe, Users, Phone, Mail,
  ChevronDown, ChevronUp, ExternalLink, Clock, ShieldCheck, BarChart3, UserCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface Agrupacion {
  id: string;
  name: string;
  description?: string;
  neighborhoods?: string[];
  zone_polygon?: [number, number][] | null;
  contact_whatsapp?: string;
  contact_email?: string;
  logo_url?: string;
  admin_user_id?: string;
  coordinator_user_id?: string;
  admin_name?: string;
  admin_email?: string;
  coordinator_name?: string;
  coordinator_email?: string;
  created_at: string;
}

interface UserOption {
  id: string;
  email: string;
  display_name?: string;
}

interface FbSearchGroup {
  id: string;
  group_name: string;
  group_url: string | null;
  zone?: string;
  agrupacion_id?: string;
  approved: boolean;
  requested_by?: string;
  created_at: string;
}

export default function AgrupacionesTab() {
  const { isAdmin } = useAuth();
  const [agrupaciones, setAgrupaciones] = useState<Agrupacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Agrupacion | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', neighborhoods: [] as string[],
    zone_polygon: null as [number, number][] | null,
    contact_whatsapp: '', contact_email: '',
    coordinator_user_id: '',
  });
  const [saving, setSaving] = useState(false);

  const [pendingGroups, setPendingGroups] = useState<FbSearchGroup[]>([]);
  const [approvedGroups, setApprovedGroups] = useState<FbSearchGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [showPending, setShowPending] = useState(true);
  const [showApproved, setShowApproved] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);

  const [diffusionStats, setDiffusionStats] = useState<DiffusionStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsAgrupacionFilter, setStatsAgrupacionFilter] = useState<string>('');
  const [showStats, setShowStats] = useState(false);

  const [groupMemberships, setGroupMemberships] = useState<AdminGroupMembership[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(true);
  const [showMemberships, setShowMemberships] = useState(false);
  const [membershipsAgrupacionFilter, setMembershipsAgrupacionFilter] = useState<string>('');

  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupUrl, setNewGroupUrl] = useState('');
  const [newGroupZone, setNewGroupZone] = useState('');
  const [newGroupAgrupacionId, setNewGroupAgrupacionId] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchAgrupaciones(), fetchGroups(), fetchUsers()]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (showStats) fetchStats();
  }, [statsAgrupacionFilter, showStats]);

  useEffect(() => {
    if (showMemberships) fetchMemberships();
  }, [membershipsAgrupacionFilter, showMemberships]);

  const fetchAgrupaciones = async () => {
    try {
      const data = await getAllAgrupaciones();
      setAgrupaciones(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchGroups = async () => {
    try {
      const [pending, approved] = await Promise.all([
        getPendingFbSearchGroups(),
        getFbSearchGroups(),
      ]);
      setPendingGroups(pending || []);
      setApprovedGroups((approved || []).filter((g: FbSearchGroup) => g.approved === true));
    } catch (e) { console.error(e); }
    setGroupsLoading(false);
  };

  const fetchUsers = async () => {
    try {
      const data = await getUsersForAgrupacion();
      setUsers(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const data = await getDiffusionStats(statsAgrupacionFilter || undefined);
      setDiffusionStats(data || []);
    } catch (e) { console.error(e); }
    setStatsLoading(false);
  };

  const fetchMemberships = async () => {
    setMembershipsLoading(true);
    try {
      const data = await getAdminGroupMemberships(
        membershipsAgrupacionFilter ? { agrupacion_id: membershipsAgrupacionFilter } : undefined
      );
      setGroupMemberships(data || []);
    } catch (e) { console.error(e); }
    setMembershipsLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', description: '', neighborhoods: [], zone_polygon: null, contact_whatsapp: '', contact_email: '', coordinator_user_id: '' });
    setShowForm(true);
  };

  const openEdit = (a: Agrupacion) => {
    setEditing(a);
    let poly: [number, number][] | null = null;
    if (Array.isArray(a.zone_polygon) && a.zone_polygon.length >= 3) {
      poly = a.zone_polygon.map(p => Array.isArray(p) ? [Number(p[0]), Number(p[1])] as [number, number] : null).filter(Boolean) as [number, number][];
      if (poly.length < 3) poly = null;
    }
    setForm({
      name: a.name, description: a.description || '',
      neighborhoods: a.neighborhoods || [],
      zone_polygon: poly,
      contact_whatsapp: a.contact_whatsapp || '', contact_email: a.contact_email || '',
      coordinator_user_id: a.coordinator_user_id || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateAgrupacion(editing.id, form);
      } else {
        await createAgrupacion(form);
      }
      setShowForm(false);
      await fetchAgrupaciones();
    } catch (e: any) { alert(e.message || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminar esta agrupacion?')) return;
    try {
      await deleteAgrupacion(id);
      await fetchAgrupaciones();
    } catch (e: any) { alert(e.message || 'Error al eliminar'); }
  };

  const handleApproveGroup = async (id: string) => {
    try {
      await approveFbSearchGroup(id);
      await fetchGroups();
    } catch (e: any) { alert(e.message || 'Error al aprobar'); }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Eliminar este grupo?')) return;
    try {
      await deleteFbSearchGroup(id);
      await fetchGroups();
    } catch (e: any) { alert(e.message || 'Error al eliminar'); }
  };

  const handleCreateGroupUrlChange = (value: string) => {
    setNewGroupUrl(value);
    const info = parseFbGroupUrl(value);
    if (info && !info.isNumeric && newGroupName.trim() === '') {
      setNewGroupName(prettifyFbGroupName(info.groupId));
    }
  };

  const handleCreateGroup = async () => {
    const info = parseFbGroupUrl(newGroupUrl);
    if (!info || !newGroupName.trim()) return;
    setSavingGroup(true);
    try {
      await requestFbSearchGroup({
        group_name: newGroupName.trim(),
        group_url: info.normalizedUrl,
        zone: newGroupZone.trim() || undefined,
        agrupacion_id: newGroupAgrupacionId || undefined,
      });
      setShowNewGroupForm(false);
      setNewGroupName('');
      setNewGroupUrl('');
      setNewGroupZone('');
      setNewGroupAgrupacionId('');
      await fetchGroups();
    } catch (e: any) { alert(e.message || 'Error al crear grupo'); }
    finally { setSavingGroup(false); }
  };

  const handleStartEdit = (g: FbSearchGroup) => {
    setEditingGroupId(g.id);
    setEditName(g.group_name);
    setEditUrl(g.group_url || '');
    setEditZone(g.zone || '');
  };

  const handleSaveEdit = async (g: FbSearchGroup) => {
    const info = parseFbGroupUrl(editUrl);
    if (!info || !editName.trim()) return;
    setEditSaving(true);
    try {
      await updateFbSearchGroup(g.id, {
        group_name: editName.trim(),
        group_url: info.normalizedUrl,
        zone: editZone.trim() || undefined,
        agrupacion_id: g.agrupacion_id || undefined,
      });
      setEditingGroupId(null);
      await fetchGroups();
    } catch (e: any) { alert(e.message || 'Error al guardar'); }
    finally { setEditSaving(false); }
  };

  const toggleNeighborhood = (id: string) => {
    setForm(prev => ({
      ...prev,
      neighborhoods: prev.neighborhoods.includes(id)
        ? prev.neighborhoods.filter(x => x !== id)
        : [...prev.neighborhoods, id],
    }));
  };

  // El polígono define la lista EXACTA de barrios: reemplaza la selección manual.
  // Sin polígono (o con <3 vértices), los barrios quedan como están.
  const handleZoneChange = (v: [number, number][] | null) => {
    const poly = v && v.length >= 3 ? v : null;
    setForm(prev => ({
      ...prev,
      zone_polygon: v,
      neighborhoods: poly ? neighborhoodsInPolygon(poly) : prev.neighborhoods,
    }));
  };

  const zoneLocked = !!form.zone_polygon && form.zone_polygon.length >= 3;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
            <Users className="w-6 h-6" /> Agrupaciones
          </h2>
          {isAdmin && (
            <button onClick={openNew}
              className="px-4 py-2 bg-brand-primary text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all flex items-center gap-2">
              <Plus className="w-4 h-4" /> Crear agrupacion
            </button>
          )}
        </div>

        {agrupaciones.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No hay agrupaciones creadas.</p>
        ) : (
          <div className="space-y-3">
            {agrupaciones.map(a => (
              <div key={a.id} className="flex items-center justify-between p-4 bg-brand-bg/50 rounded-2xl border border-brand-accent">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-brand-primary">{a.name}</span>
                    <span className="text-xs text-gray-400">
                      {(a.neighborhoods || []).length} barrio{(a.neighborhoods || []).length !== 1 ? 's' : ''}
                    </span>
                    {Array.isArray(a.zone_polygon) && a.zone_polygon.length >= 3 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded-full flex items-center gap-1">
                        <MapIcon className="w-3 h-3" /> Zona con pol&iacute;gono
                      </span>
                    )}
                  </div>
                  {a.description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{a.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {a.contact_whatsapp && (
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{a.contact_whatsapp}</span>
                    )}
                    {a.contact_email && (
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{a.contact_email}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {a.coordinator_name && (
                      <span className="flex items-center gap-1"><Users className="w-3 h-3 text-emerald-500" />Coord: {a.coordinator_name}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button onClick={() => openEdit(a)}
                    className="p-2 rounded-xl bg-brand-bg text-brand-primary hover:bg-brand-accent transition-colors" title="Editar">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {isAdmin && (
                    <button onClick={() => handleDelete(a.id)}
                      className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Eliminar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-serif font-bold text-brand-primary">
                  {editing ? 'Editar agrupacion' : 'Crear agrupacion'}
                </h3>
                <button onClick={() => setShowForm(false)}
                  className="p-2 text-gray-400 hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Nombre *</label>
                  <input type="text" required value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Descripcion</label>
                  <textarea value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={2}
                    className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary resize-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">WhatsApp</label>
                    <input type="tel" value={form.contact_whatsapp} onChange={e => setForm(prev => ({ ...prev, contact_whatsapp: e.target.value }))}
                      placeholder="Ej: 2215551234"
                      className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Email</label>
                    <input type="email" value={form.contact_email} onChange={e => setForm(prev => ({ ...prev, contact_email: e.target.value }))}
                      placeholder="contacto@ejemplo.com"
                      className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Coordinador de la agrupaci&oacute;n</label>
                  <select value={form.coordinator_user_id} onChange={e => setForm(prev => ({ ...prev, coordinator_user_id: e.target.value }))}
                    className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary">
                    <option value="">Sin asignar</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.display_name || u.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 block">Barrios</label>
                  {zoneLocked && (
                    <p className="text-[11px] text-violet-600 mb-2">
                      Definidos por el pol&iacute;gono &mdash; borralo para editar a mano.
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {NEIGHBORHOODS.map(n => {
                      const active = form.neighborhoods.includes(n.id);
                      return (
                        <button key={n.id} type="button" disabled={zoneLocked} onClick={() => toggleNeighborhood(n.id)}
                          className={cn(
                            "px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                            active ? "bg-brand-primary/15 text-brand-primary border-brand-primary" : "bg-white border-brand-accent text-gray-500 hover:border-brand-primary",
                            zoneLocked && "cursor-not-allowed opacity-70 hover:border-brand-accent"
                          )}>
                          {n.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 block flex items-center gap-1.5">
                    <MapIcon className="w-3.5 h-3.5" /> Zona en el mapa
                  </label>
                  <p className="text-xs text-gray-400 mb-2">
                    Dibuj&aacute; el pol&iacute;gono de cobertura: define los barrios de la agrupaci&oacute;n y captura las mascotas cuyo pin caiga adentro.
                  </p>
                  <ZonePolygonPicker
                    value={form.zone_polygon}
                    onChange={handleZoneChange}
                  />
                  {zoneLocked && (
                    <p className="text-xs font-bold text-violet-600 mt-2">
                      {form.neighborhoods.length} barrio{form.neighborhoods.length !== 1 ? 's' : ''} detectado{form.neighborhoods.length !== 1 ? 's' : ''} dentro del pol&iacute;gono.
                    </p>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={handleSave} disabled={saving || !form.name.trim()}
                    className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:shadow-lg transition-all disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {editing ? 'Guardar cambios' : 'Crear agrupacion'}
                  </button>
                  <button onClick={() => setShowForm(false)}
                    className="px-6 py-3 text-gray-500 rounded-xl font-bold text-sm hover:bg-brand-bg transition-all">
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <button onClick={() => setShowPending(v => !v)}
          className="w-full flex items-center justify-between">
          <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
            <Globe className="w-6 h-6" /> Grupos FB pendientes
            {pendingGroups.length > 0 && (
              <span className="ml-2 px-2.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">
                {pendingGroups.length}
              </span>
            )}
          </h2>
          {showPending ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        <AnimatePresence>
          {showPending && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="mt-4">
                {groupsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-brand-primary" /></div>
                ) : pendingGroups.length === 0 ? (
                  <p className="text-center text-gray-400 py-6 text-sm">No hay grupos pendientes de aprobacion.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingGroups.map(g => (
                      editingGroupId === g.id ? (
                        <div key={g.id} className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200 space-y-3">
                          <input type="url" value={editUrl} onChange={e => setEditUrl(e.target.value)}
                            placeholder="URL del grupo" className="w-full px-3 py-2 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary/40 text-sm break-words" />
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                            placeholder="Nombre" className="w-full px-3 py-2 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary/40 text-sm" />
                          <input type="text" value={editZone} onChange={e => setEditZone(e.target.value)}
                            placeholder="Zona (opcional)" className="w-full px-3 py-2 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary/40 text-sm" />
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveEdit(g)} disabled={editSaving || !editName.trim() || !parseFbGroupUrl(editUrl)}
                              className="flex-1 px-3 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:bg-brand-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                              {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar
                            </button>
                            <button onClick={() => setEditingGroupId(null)}
                              className="px-3 py-2 bg-white border border-brand-accent text-gray-500 rounded-xl text-xs font-bold hover:text-gray-700 transition-colors">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div key={g.id} className="flex items-center justify-between p-4 bg-amber-50/50 rounded-2xl border border-amber-200">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                              <span className="font-bold text-sm text-gray-800 truncate">{g.group_name}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                              <span className="truncate">{g.group_url || 'Sin URL todavia'}</span>
                              {g.zone && <span className="px-1.5 py-0.5 bg-brand-bg rounded text-[10px]">{g.zone}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {g.group_url && (
                              <a href={g.group_url} target="_blank" rel="noopener noreferrer"
                                className="p-2 rounded-xl bg-brand-bg text-brand-primary hover:bg-brand-accent transition-colors" title="Abrir en Facebook">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            <button onClick={() => handleStartEdit(g)}
                              className="p-2 rounded-xl bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors" title="Editar">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleApproveGroup(g.id)}
                              className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors" title="Aprobar">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteGroup(g.id)}
                              className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Rechazar">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <button onClick={() => setShowApproved(v => !v)}
            className="flex-1 flex items-center justify-between">
            <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
              <ShieldCheck className="w-6 h-6" /> Grupos FB aprobados
              {approvedGroups.length > 0 && (
                <span className="ml-2 px-2.5 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-700 rounded-full">
                  {approvedGroups.length}
                </span>
              )}
            </h2>
            {showApproved ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>
          {!showNewGroupForm && (
            <button
              onClick={() => setShowNewGroupForm(true)}
              className="ml-3 inline-flex items-center gap-1.5 px-3 py-2 bg-brand-primary/10 text-brand-primary rounded-xl text-xs sm:text-sm font-bold hover:bg-brand-primary/20 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" /> Nuevo grupo
            </button>
          )}
        </div>

        {showNewGroupForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-5 bg-brand-bg rounded-2xl border border-brand-accent"
          >
            <h3 className="font-bold text-sm text-brand-primary mb-3">Nuevo grupo de difusión</h3>
            <div className="space-y-3">
              <input
                type="url"
                value={newGroupUrl}
                onChange={e => handleCreateGroupUrlChange(e.target.value)}
                placeholder="https://www.facebook.com/groups/..."
                className="w-full px-4 py-3 bg-white rounded-2xl border border-brand-accent outline-none focus:border-brand-primary/40 text-sm break-words"
              />
              <input
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="Nombre del grupo"
                className="w-full px-4 py-3 bg-white rounded-2xl border border-brand-accent outline-none focus:border-brand-primary/40 text-sm"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={newGroupAgrupacionId}
                  onChange={e => setNewGroupAgrupacionId(e.target.value)}
                  className="w-full px-4 py-3 bg-white rounded-2xl border border-brand-accent outline-none focus:border-brand-primary/40 text-sm"
                >
                  <option value="">Sin agrupación</option>
                  {agrupaciones.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newGroupZone}
                  onChange={e => setNewGroupZone(e.target.value)}
                  placeholder="Zona (opcional)"
                  className="w-full px-4 py-3 bg-white rounded-2xl border border-brand-accent outline-none focus:border-brand-primary/40 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
              <button
                onClick={() => setShowNewGroupForm(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-white border border-brand-accent text-gray-500 rounded-xl text-sm font-bold hover:text-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || !parseFbGroupUrl(newGroupUrl) || savingGroup}
                className="w-full sm:flex-1 px-5 py-2.5 bg-brand-primary text-white rounded-xl text-sm font-bold hover:bg-brand-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Crear grupo
              </button>
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {showApproved && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="mt-4">
                {groupsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-brand-primary" /></div>
                ) : approvedGroups.length === 0 ? (
                  <p className="text-center text-gray-400 py-6 text-sm">No hay grupos aprobados aun.</p>
                ) : (
                  <div className="space-y-3">
                    {approvedGroups.map(g => (
                      editingGroupId === g.id ? (
                        <div key={g.id} className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-3">
                          <input type="url" value={editUrl} onChange={e => setEditUrl(e.target.value)}
                            placeholder="URL del grupo" className="w-full px-3 py-2 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary/40 text-sm break-words" />
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                            placeholder="Nombre" className="w-full px-3 py-2 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary/40 text-sm" />
                          <input type="text" value={editZone} onChange={e => setEditZone(e.target.value)}
                            placeholder="Zona (opcional)" className="w-full px-3 py-2 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary/40 text-sm" />
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveEdit(g)} disabled={editSaving || !editName.trim() || !parseFbGroupUrl(editUrl)}
                              className="flex-1 px-3 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:bg-brand-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                              {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar
                            </button>
                            <button onClick={() => setEditingGroupId(null)}
                              className="px-3 py-2 bg-white border border-brand-accent text-gray-500 rounded-xl text-xs font-bold hover:text-gray-700 transition-colors">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div key={g.id} className="flex items-center justify-between p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span className="font-bold text-sm text-gray-800 truncate">{g.group_name}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                              <span className="truncate">{g.group_url}</span>
                              {g.zone && <span className="px-1.5 py-0.5 bg-brand-bg rounded text-[10px]">{g.zone}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <a href={g.group_url} target="_blank" rel="noopener noreferrer"
                              className="p-2 rounded-xl bg-brand-bg text-brand-primary hover:bg-brand-accent transition-colors" title="Abrir en Facebook">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button onClick={() => handleStartEdit(g)}
                              className="p-2 rounded-xl bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors" title="Editar">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteGroup(g.id)}
                              className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Eliminar">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* STATS DE DIFUSIÓN */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <button onClick={() => setShowStats(v => !v)}
          className="w-full flex items-center justify-between">
          <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
            <BarChart3 className="w-6 h-6" /> Estadísticas de difusión
          </h2>
          {showStats ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        <AnimatePresence>
          {showStats && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Agrupación:</label>
                  <select value={statsAgrupacionFilter} onChange={e => setStatsAgrupacionFilter(e.target.value)}
                    className="px-3 py-1.5 bg-white rounded-xl border border-brand-accent text-xs focus:border-brand-primary outline-none">
                    <option value="">Todas</option>
                    {agrupaciones.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                {statsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-brand-primary" /></div>
                ) : diffusionStats.length === 0 ? (
                  <p className="text-center text-gray-400 py-6 text-sm">No hay datos de difusión.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-brand-accent">
                    <table className="w-full text-left text-xs min-w-max">
                      <thead>
                        <tr className="border-b border-brand-accent bg-brand-bg/50">
                          <th className="py-2 px-3 font-bold text-gray-500">Agrupación</th>
                          <th className="py-2 px-3 font-bold text-gray-500">Voluntario</th>
                          <th className="py-2 px-3 font-bold text-gray-500 text-right">Shares (30d)</th>
                          <th className="py-2 px-3 font-bold text-gray-500">Último share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diffusionStats.map((s, i) => (
                          <tr key={`${s.agrupacion_id}-${s.user_id}-${i}`} className="border-b border-brand-accent/50 hover:bg-brand-bg/30">
                            <td className="py-2 px-3 text-gray-800 font-medium">{s.agrupacion_name}</td>
                            <td className="py-2 px-3 text-gray-600">{s.display_name || '—'}</td>
                            <td className="py-2 px-3 text-right font-bold text-brand-primary">{s.total_shares}</td>
                            <td className="py-2 px-3 text-gray-400">{s.last_share_at ? new Date(s.last_share_at).toLocaleDateString('es-AR') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MEMBRESÍA DE GRUPOS (admin) */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <button onClick={() => setShowMemberships(v => !v)}
          className="w-full flex items-center justify-between">
          <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
            <UserCheck className="w-6 h-6" /> Membresía de grupos
            {groupMemberships.length > 0 && (
              <span className="ml-2 px-2.5 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded-full">
                {groupMemberships.length}
              </span>
            )}
          </h2>
          {showMemberships ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>
        <AnimatePresence>
          {showMemberships && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden">
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Agrupación:</label>
                  <select value={membershipsAgrupacionFilter} onChange={e => setMembershipsAgrupacionFilter(e.target.value)}
                    className="px-3 py-1.5 bg-white rounded-xl border border-brand-accent text-xs focus:border-brand-primary outline-none">
                    <option value="">Todas</option>
                    {agrupaciones.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                {membershipsLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-brand-primary" /></div>
                ) : groupMemberships.length === 0 ? (
                  <p className="text-center text-gray-400 py-6 text-sm">No hay grupos.</p>
                ) : (
                  <div className="space-y-2">
                    {groupMemberships.map(g => (
                      <div key={g.group_id} className="flex items-center justify-between p-3 bg-brand-bg/50 rounded-xl border border-brand-accent">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-800 truncate">{g.group_name}</span>
                            {g.agrupacion_id && (
                              <span className="px-1.5 py-0.5 bg-brand-primary/10 text-brand-primary text-[10px] font-bold rounded">
                                {agrupaciones.find(a => a.id === g.agrupacion_id)?.name || '—'}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {g.memberships.length > 0 ? `${g.memberships.filter(m => m.is_member).length} miembro(s) de ${g.memberships.length} voluntario(s)` : 'Sin miembros registrados'}
                          </p>
                        </div>
                        {g.group_url && (
                          <a href={g.group_url} target="_blank" rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-brand-bg text-brand-primary hover:bg-brand-accent transition-colors" title="Abrir en Facebook">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
