import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/src/lib/api';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { formatDateTime } from '@/src/lib/formatDate';
import {
  Loader2, Plus, X, Trash2, ExternalLink, RefreshCw,
  Globe, Search, AlertTriangle,
} from 'lucide-react';

type SubTab = 'groups';

interface FacebookGroup {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  scrape_enabled: boolean;
  last_scraped_at: string | null;
  created_at: string;
}

export default function FacebookTab() {
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [fbAuthError, setFbAuthError] = useState<{error: boolean; detail: string}>({ error: false, detail: '' });
  const [editing, setEditing] = useState<FacebookGroup | null>(null);
  const [form, setForm] = useState({ name: '', url: '' });

  const fetchGroups = useCallback(async () => {
    try {
      const data = await api.facebook.groups.list();
      setGroups(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);
  
  useEffect(() => {
    api.adminDashboard.get().then((d: any) => {
      const eng = d?.channels?.engagement;
      if (eng?.status === 'error') {
        setFbAuthError({ error: true, detail: eng.detail || '' });
      }
    }).catch(() => {});
  }, []);

  const openNew = () => { setEditing(null); setForm({ name: '', url: '' }); setShowForm(true); };
  const openEdit = (g: FacebookGroup) => { setEditing(g); setForm({ name: g.name, url: g.url }); setShowForm(true); };

  const handleSave = async () => {
    try {
      if (editing) {
        await api.facebook.groups.update(editing.id, form);
      } else {
        await api.facebook.groups.create(form);
      }
      setShowForm(false);
      await fetchGroups();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este grupo?')) return;
    try {
      await api.facebook.groups.delete(id);
      await fetchGroups();
    } catch (e: any) { alert(e.message); }
  };

  const toggleActive = async (id: string, val: boolean) => {
    try {
      await api.facebook.groups.update(id, { is_active: !val });
      await fetchGroups();
    } catch (e: any) { alert(e.message); }
  };

  const toggleScrape = async (id: string, val: boolean) => {
    try {
      await api.facebook.groups.update(id, { scrape_enabled: !val });
      await fetchGroups();
    } catch (e: any) { alert(e.message); }
  };

  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const handleRefreshMetrics = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await api.facebook.refreshMetrics();
      if (res.queued) {
        setRefreshMsg('Ya hay un sync en curso, esperá a que termine…');
        setRefreshing(false);
        return;
      }
      setRefreshMsg('Sync iniciado. Se actualizará en unos minutos…');
      const started = Date.now();
      while (Date.now() - started < 10 * 60 * 1000) {
        await new Promise(r => setTimeout(r, 5000));
        const status = await api.facebook.syncStatus();
        if (status && !status.running) {
          if (status.error) {
            setRefreshMsg(`Sync falló: ${status.error}`);
          } else {
            setRefreshMsg(`Sync OK: ${status.result?.posts ?? 0} post(s) · ${status.result?.comments ?? 0} comentario(s)`);
          }
          break;
        }
      }
    } catch (e: any) {
      setRefreshMsg(`Error: ${e.message || 'no se pudo sincronizar'}`);
    }
    setRefreshing(false);
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
            <Globe className="w-6 h-6" /> Grupos de Facebook
          </h2>
          <div className="flex gap-2">
            <button onClick={handleRefreshMetrics} disabled={refreshing} title="Refrescar métricas (likes/comentarios) de los posts publicados"
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-50 text-blue-600 font-bold rounded-xl hover:bg-blue-100 transition-all disabled:opacity-50">
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refrescar métricas
            </button>
            <button onClick={fetchGroups} className="p-2 text-gray-400 hover:text-brand-primary rounded-xl hover:bg-brand-bg transition-all">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={openNew}
              className="px-4 py-2 bg-brand-primary text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nuevo
            </button>
          </div>
        </div>

        {refreshMsg && (
          <p className={`text-sm font-bold mb-4 ${refreshMsg.startsWith('Sync OK') ? 'text-green-600' : 'text-red-600'}`}>
            {refreshMsg}
          </p>
        )}
        {fbAuthError.error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700">Token de Facebook sin permisos</p>
              <p className="text-xs text-red-600 mt-1">{fbAuthError.detail || 'Reconectar Facebook desde el admin para restaurar las métricas.'}</p>
            </div>
          </div>
        )}

        <p className="text-sm text-gray-500 mb-4">{groups.length} grupo(s) · {groups.filter(g => g.is_active).length} activos</p>

        <div className="overflow-x-auto rounded-2xl border border-brand-accent">
          <table className="w-full text-left text-sm min-w-max">
            <thead>
              <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Activo</th>
                <th className="px-4 py-3">Scrapear</th>
                <th className="px-4 py-3">Último scrape</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-accent">
              {groups.map(g => (
                <tr key={g.id} className="hover:bg-brand-bg/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-brand-primary">{g.name}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate">
                    <a href={g.url} target="_blank" rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-700 text-xs flex items-center gap-1">
                      {g.url} <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(g.id, g.is_active)}
                      className={cn("px-3 py-1 rounded-full text-[10px] font-bold transition-all",
                        g.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                      {g.is_active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleScrape(g.id, g.scrape_enabled)}
                      className={cn("px-3 py-1 rounded-full text-[10px] font-bold transition-all",
                        g.scrape_enabled ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400")}>
                      {g.scrape_enabled ? 'Sí' : 'No'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {g.last_scraped_at ? formatDateTime(g.last_scraped_at) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(g)}
                        className="p-1.5 text-gray-400 hover:text-brand-primary rounded-lg hover:bg-brand-bg transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(g.id)}
                        className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Sin grupos registrados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-md bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-2xl">
            <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-serif font-bold text-brand-primary mb-6">
              {editing ? 'Editar grupo' : 'Nuevo grupo'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-1">Nombre del grupo</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-1">URL del grupo</label>
                <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
                  placeholder="https://www.facebook.com/groups/..."
                  className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" />
              </div>
              <button onClick={handleSave}
                className="w-full px-6 py-3 bg-brand-primary text-white font-bold rounded-xl hover:shadow-lg transition-all">
                {editing ? 'Guardar cambios' : 'Crear grupo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
