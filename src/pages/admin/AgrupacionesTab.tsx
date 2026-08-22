import { useState, useEffect } from 'react';
import {
  getAllAgrupaciones, createAgrupacion, updateAgrupacion, deleteAgrupacion,
  getPendingFbSearchGroups, approveFbSearchGroup, deleteFbSearchGroup,
  getFbSearchGroups,
} from '@/src/lib/volunteerService';
import { NEIGHBORHOODS } from '@/src/lib/neighborhoods';
import {
  Loader2, Plus, X, Trash2, Edit2, Save, Check, Globe, Users, Phone, Mail,
  ChevronDown, ChevronUp, ExternalLink, Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface Agrupacion {
  id: string;
  name: string;
  description?: string;
  neighborhoods?: string[];
  contact_whatsapp?: string;
  contact_email?: string;
  logo_url?: string;
  created_at: string;
}

interface FbSearchGroup {
  id: string;
  group_name: string;
  group_url: string;
  zone?: string;
  agrupacion_id?: string;
  approved: boolean;
  requested_by?: string;
  created_at: string;
}

export default function AgrupacionesTab() {
  const [agrupaciones, setAgrupaciones] = useState<Agrupacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Agrupacion | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', neighborhoods: [] as string[],
    contact_whatsapp: '', contact_email: '',
  });
  const [saving, setSaving] = useState(false);

  const [pendingGroups, setPendingGroups] = useState<FbSearchGroup[]>([]);
  const [approvedGroups, setApprovedGroups] = useState<FbSearchGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [showPending, setShowPending] = useState(true);
  const [showApproved, setShowApproved] = useState(true);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchAgrupaciones(), fetchGroups()]);
      setLoading(false);
    })();
  }, []);

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

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', description: '', neighborhoods: [], contact_whatsapp: '', contact_email: '' });
    setShowForm(true);
  };

  const openEdit = (a: Agrupacion) => {
    setEditing(a);
    setForm({
      name: a.name, description: a.description || '',
      neighborhoods: a.neighborhoods || [],
      contact_whatsapp: a.contact_whatsapp || '', contact_email: a.contact_email || '',
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

  const toggleNeighborhood = (id: string) => {
    setForm(prev => ({
      ...prev,
      neighborhoods: prev.neighborhoods.includes(id)
        ? prev.neighborhoods.filter(x => x !== id)
        : [...prev.neighborhoods, id],
    }));
  };

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
          <button onClick={openNew}
            className="px-4 py-2 bg-brand-primary text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all flex items-center gap-2">
            <Plus className="w-4 h-4" /> Crear agrupacion
          </button>
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
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button onClick={() => openEdit(a)}
                    className="p-2 rounded-xl bg-brand-bg text-brand-primary hover:bg-brand-accent transition-colors" title="Editar">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(a.id)}
                    className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </button>
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
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 block">Barrios</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {NEIGHBORHOODS.map(n => {
                      const active = form.neighborhoods.includes(n.id);
                      return (
                        <button key={n.id} type="button" onClick={() => toggleNeighborhood(n.id)}
                          className={cn(
                            "px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                            active ? "bg-brand-primary/15 text-brand-primary border-brand-primary" : "bg-white border-brand-accent text-gray-500 hover:border-brand-primary"
                          )}>
                          {n.name}
                        </button>
                      );
                    })}
                  </div>
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
                      <div key={g.id} className="flex items-center justify-between p-4 bg-amber-50/50 rounded-2xl border border-amber-200">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
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
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <button onClick={() => setShowApproved(v => !v)}
          className="w-full flex items-center justify-between">
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
                          <button onClick={() => handleDeleteGroup(g.id)}
                            className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors" title="Eliminar">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
