import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/src/lib/api';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import PolygonEditor from '@/src/components/admin/PolygonEditor';
import {
  Save, Loader2, Plus, X, Trash2, Edit2, ExternalLink,
  Search, RefreshCw, Check, XCircle, MessageSquare, Map,
  Globe, Users, Sliders, FlaskConical,
} from 'lucide-react';

type SubTab = 'groups' | 'posts' | 'matches' | 'config';

interface FacebookGroup {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  last_scraped_at: string | null;
  created_at: string;
}

interface FacebookPost {
  id: string;
  group_id: string;
  group_name: string;
  fb_post_id: string;
  fb_post_url: string;
  author_name: string;
  content: string;
  image_urls: string[];
  classification: string;
  species: string;
  color: string;
  location_hint: string;
  phone: string;
  is_matched: boolean;
  posted_at: string;
  created_at: string;
}

interface FacebookMatch {
  id: string;
  source_type: string;
  source_id: string;
  source_label: string;
  target_type: string;
  target_id: string;
  target_label: string;
  score: number;
  reasons: string[];
  method: string;
  status: string;
  confirmed_by: string;
  confirmed_at: string;
  created_at: string;
}

interface FacebookStats {
  totalPosts: number;
  byClassification: Record<string, number>;
  totalMatches: number;
  pendingMatches: number;
  confirmedMatches: number;
  totalGroups: number;
  activeGroups: number;
}

export default function FacebookTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('groups');

  const subTabs: { id: SubTab; label: string; icon: any }[] = [
    { id: 'groups', label: 'Grupos', icon: Globe },
    { id: 'posts', label: 'Publicaciones', icon: MessageSquare },
    { id: 'matches', label: 'Matches', icon: FlaskConical },
    { id: 'config', label: 'Configuración', icon: Sliders },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-brand-accent pb-px">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 font-bold text-sm transition-all relative",
              activeSubTab === tab.id ? "text-brand-primary" : "text-gray-400 hover:text-gray-600"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {activeSubTab === tab.id && (
              <motion.div layoutId="fb-subtab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {activeSubTab === 'groups' && <GroupsSection />}
      {activeSubTab === 'posts' && <PostsSection />}
      {activeSubTab === 'matches' && <MatchesSection />}
      {activeSubTab === 'config' && <ConfigSection />}
    </div>
  );
}

function GroupsSection() {
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FacebookGroup | null>(null);
  const [form, setForm] = useState({ name: '', url: '' });
  const [saving, setSaving] = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.facebook.groups.list();
      setGroups(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.facebook.groups.update(editing.id, form);
      } else {
        await api.facebook.groups.create(form);
      }
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', url: '' });
      await fetchGroups();
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este grupo? Los posts asociados se eliminarán.')) return;
    try {
      await api.facebook.groups.delete(id);
      await fetchGroups();
    } catch (e: any) { alert(e.message); }
  };

  const toggleActive = async (group: FacebookGroup) => {
    try {
      await api.facebook.groups.update(group.id, { is_active: !group.is_active });
      await fetchGroups();
    } catch (e: any) { alert(e.message); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{groups.length} grupo(s) · {groups.filter(g => g.is_active).length} activos</p>
        <button onClick={() => { setEditing(null); setForm({ name: '', url: '' }); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all">
          <Plus className="w-4 h-4" /> Agregar Grupo
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-brand-accent">
        <table className="w-full text-left text-sm min-w-max">
          <thead>
            <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">Activo</th>
              <th className="px-4 py-3">Último scrape</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-accent">
            {groups.map(g => (
              <tr key={g.id} className="hover:bg-brand-bg/50 transition-colors">
                <td className="px-4 py-3 font-bold text-brand-primary">{g.name}</td>
                <td className="px-4 py-3">
                  <a href={g.url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline flex items-center gap-1 text-xs">
                    {g.url.substring(0, 40)}… <ExternalLink className="w-3 h-3" />
                  </a>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(g)} className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold",
                    g.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
                  )}>{g.is_active ? 'Activo' : 'Inactivo'}</button>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {g.last_scraped_at ? new Date(g.last_scraped_at).toLocaleString('es-AR') : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => { setEditing(g); setForm({ name: g.name, url: g.url }); setShowForm(true); }}
                      className="p-2 text-gray-400 hover:text-brand-primary transition-colors"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(g.id)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-2xl">
            <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-serif font-bold text-brand-primary mb-6">
              {editing ? 'Editar Grupo' : 'Nuevo Grupo'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-1">Nombre</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-1">URL del Grupo</label>
                <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
                  className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm"
                  placeholder="https://www.facebook.com/groups/..." />
              </div>
              <button onClick={handleSave} disabled={saving || !form.name || !form.url}
                className="w-full py-3 bg-brand-primary text-white font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PostsSection() {
  const [posts, setPosts] = useState<FacebookPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ classification: 'all', species: 'all', search: '' });
  const [selectedPost, setSelectedPost] = useState<FacebookPost | null>(null);
  const [matching, setMatching] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.facebook.posts.list(filters);
      setPosts(data.posts);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleClassify = async (id: string) => {
    try {
      await api.facebook.posts.classify(id);
      await fetchPosts();
    } catch (e: any) { alert(e.message); }
  };

  const handleRunMatching = async (id: string) => {
    setMatching(true);
    try {
      await api.facebook.runMatching(id);
      await fetchPosts();
    } catch (e: any) { alert(e.message); }
    setMatching(false);
  };

  const handleManualUpdate = async (id: string, data: any) => {
    try {
      await api.facebook.posts.update(id, data);
      await fetchPosts();
    } catch (e: any) { alert(e.message); }
  };

  const classificationBadge = (cls: string) => {
    const styles: Record<string, string> = {
      lost: 'bg-red-100 text-red-700',
      found: 'bg-green-100 text-green-700',
      adoption: 'bg-purple-100 text-purple-700',
      other: 'bg-gray-100 text-gray-500',
      unclassified: 'bg-yellow-100 text-yellow-700',
    };
    const labels: Record<string, string> = {
      lost: 'Perdido', found: 'Encontrado', adoption: 'Adopción',
      other: 'Otro', unclassified: 'Sin clasificar',
    };
    return (
      <span className={cn("text-[10px] px-2 py-1 rounded-full font-bold uppercase", styles[cls] || 'bg-gray-100 text-gray-500')}>
        {labels[cls] || cls}
      </span>
    );
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <select value={filters.classification} onChange={e => setFilters(p => ({ ...p, classification: e.target.value }))}
            className="px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs font-bold outline-none">
            <option value="all">Todas las clasificaciones</option>
            <option value="lost">Perdido</option>
            <option value="found">Encontrado</option>
            <option value="adoption">Adopción</option>
            <option value="unclassified">Sin clasificar</option>
          </select>
          <select value={filters.species} onChange={e => setFilters(p => ({ ...p, species: e.target.value }))}
            className="px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs font-bold outline-none">
            <option value="all">Todas las especies</option>
            <option value="dog">Perro</option>
            <option value="cat">Gato</option>
          </select>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
            placeholder="Buscar en posts..."
            className="w-48 sm:w-64 pl-9 pr-4 py-2 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-brand-accent">
        <table className="w-full text-left text-sm min-w-max">
          <thead>
            <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
              <th className="px-4 py-3">Grupo</th>
              <th className="px-4 py-3">Autor</th>
              <th className="px-4 py-3">Contenido</th>
              <th className="px-4 py-3">Clasificación</th>
              <th className="px-4 py-3">Especie</th>
              <th className="px-4 py-3">Ubicación</th>
              <th className="px-4 py-3">Match</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-accent">
            {posts.map(p => (
              <tr key={p.id} className="hover:bg-brand-bg/50 transition-colors">
                <td className="px-4 py-3 font-bold text-brand-primary text-xs">{p.group_name || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{p.author_name || '—'}</td>
                <td className="px-4 py-3 max-w-[200px]">
                  <button onClick={() => setSelectedPost(p)} className="text-left text-xs text-gray-600 hover:text-brand-primary line-clamp-2">
                    {p.content ? p.content.substring(0, 150) : 'Sin contenido'}
                  </button>
                </td>
                <td className="px-4 py-3">{classificationBadge(p.classification)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{p.species || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{p.location_hint || '—'}</td>
                <td className="px-4 py-3">{p.is_matched ? <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-blue-100 text-blue-700">Sí</span> : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => handleClassify(p.id)} title="Clasificar"
                      className="p-1.5 text-gray-400 hover:text-brand-primary transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleRunMatching(p.id)} disabled={matching} title="Buscar matches"
                      className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40"><FlaskConical className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setSelectedPost(p)} title="Ver detalle"
                      className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"><Search className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedPost && (
        <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} onUpdate={handleManualUpdate} />
      )}
    </div>
  );
}

function PostDetailModal({ post, onClose, onUpdate }: { post: FacebookPost; onClose: () => void; onUpdate: (id: string, data: any) => void }) {
  const [editData, setEditData] = useState({
    classification: post.classification,
    species: post.species || '',
    color: post.color || '',
    location_hint: post.location_hint || '',
    phone: post.phone || '',
    notes: '',
  });

  const handleCopyText = () => {
    const text = `🐾 En Sigo Tu Huella encontramos una posible coincidencia con este aviso.

📝 Contenido del post:
${post.content}

${post.phone ? `📞 Contacto: ${post.phone}` : ''}
${post.location_hint ? `📍 Zona: ${post.location_hint}` : ''}

🔗 Ver más en Sigo Tu Huella: https://sigotuhuella.online/buscar-facebook`;
    navigator.clipboard.writeText(text);
    alert('Texto copiado al portapapeles');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 sm:p-8 border-b border-brand-accent">
          <h3 className="text-lg font-serif font-bold text-brand-primary">Detalle del Post</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 sm:p-8 overflow-y-auto space-y-4">
          <div className="bg-brand-bg rounded-2xl p-4">
            <p className="text-xs text-gray-400 mb-1">Contenido original</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500">Clasificación</label>
              <select value={editData.classification} onChange={e => setEditData(p => ({ ...p, classification: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-white rounded-xl border border-brand-accent text-sm outline-none">
                <option value="lost">Perdido</option>
                <option value="found">Encontrado</option>
                <option value="adoption">Adopción</option>
                <option value="other">Otro</option>
                <option value="unclassified">Sin clasificar</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500">Especie</label>
              <select value={editData.species} onChange={e => setEditData(p => ({ ...p, species: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-white rounded-xl border border-brand-accent text-sm outline-none">
                <option value="">—</option>
                <option value="dog">Perro</option>
                <option value="cat">Gato</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500">Color</label>
              <input value={editData.color} onChange={e => setEditData(p => ({ ...p, color: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-white rounded-xl border border-brand-accent text-sm outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500">Teléfono</label>
              <input value={editData.phone} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-white rounded-xl border border-brand-accent text-sm outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-gray-500">Ubicación</label>
              <input value={editData.location_hint} onChange={e => setEditData(p => ({ ...p, location_hint: e.target.value }))}
                className="w-full mt-1 px-3 py-2 bg-white rounded-xl border border-brand-accent text-sm outline-none" />
            </div>
          </div>

          {post.image_urls && post.image_urls.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">Imágenes ({post.image_urls.length})</p>
              <div className="grid grid-cols-3 gap-2">
                {post.image_urls.map((url, i) => (
                  <img key={i} src={url} alt={`Imagen ${i + 1}`} className="rounded-xl aspect-square object-cover bg-gray-100" />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 p-6 sm:p-8 border-t border-brand-accent">
          <button onClick={handleCopyText}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl hover:bg-gray-200 transition-colors">
            <MessageSquare className="w-4 h-4" /> Copiar texto para Facebook
          </button>
          <button onClick={() => { onUpdate(post.id, editData); onClose(); }}
            className="flex items-center gap-2 px-6 py-2.5 bg-brand-primary text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all">
            <Save className="w-4 h-4" /> Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}

function MatchesSection() {
  const [matches, setMatches] = useState<FacebookMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [stats, setStats] = useState<FacebookStats | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [matchesData, statsData] = await Promise.all([
        api.facebook.matches.list({ status: statusFilter }),
        api.facebook.stats(),
      ]);
      setMatches(matchesData.matches);
      setStats(statsData);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleConfirm = async (id: string) => {
    try {
      await api.facebook.matches.confirm(id);
      await fetchData();
    } catch (e: any) { alert(e.message); }
  };

  const handleReject = async (id: string) => {
    try {
      await api.facebook.matches.reject(id);
      await fetchData();
    } catch (e: any) { alert(e.message); }
  };

  const handleCopyMatch = (m: FacebookMatch) => {
    const text = `🐾 En Sigo Tu Huella encontramos una posible coincidencia (${m.score}%).

${m.source_label ? `🔍 Fuente: ${m.source_label.substring(0, 100)}` : ''}
${m.target_label ? `🎯 Coincide con: ${m.target_label.substring(0, 100)}` : ''}
${m.reasons?.length ? `📋 Razones: ${m.reasons.join(', ')}` : ''}

🔗 https://sigotuhuella.online/`;
    navigator.clipboard.writeText(text);
    alert('Texto copiado');
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      confirmed: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    const labels: Record<string, string> = {
      pending: 'Pendiente', confirmed: 'Confirmado', rejected: 'Rechazado',
    };
    return (
      <span className={cn("text-[10px] px-2 py-1 rounded-full font-bold uppercase", styles[status] || 'bg-gray-100 text-gray-500')}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>;

  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Posts', value: stats.totalPosts },
            { label: 'Matches', value: stats.totalMatches },
            { label: 'Pendientes', value: stats.pendingMatches, color: 'text-yellow-600' },
            { label: 'Confirmados', value: stats.confirmedMatches, color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-brand-accent p-4 text-center">
              <p className={cn("text-2xl font-black", s.color || 'text-brand-primary')}>{s.value}</p>
              <p className="text-xs text-gray-500 font-bold mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {['pending', 'confirmed', 'rejected', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn(
              "px-3 py-1.5 text-xs font-bold rounded-xl transition-colors",
              statusFilter === s ? "bg-brand-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            )}>
            {s === 'pending' ? 'Pendientes' : s === 'confirmed' ? 'Confirmados' : s === 'rejected' ? 'Rechazados' : 'Todos'}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-brand-accent">
        <table className="w-full text-left text-sm min-w-max">
          <thead>
            <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Fuente</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Razones</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-accent">
            {matches.map(m => (
              <tr key={m.id} className="hover:bg-brand-bg/50 transition-colors">
                <td className="px-4 py-3">
                  <span className={cn(
                    "font-black text-sm",
                    m.score >= 80 ? "text-green-600" : m.score >= 60 ? "text-yellow-600" : "text-gray-500"
                  )}>{m.score}%</span>
                </td>
                <td className="px-4 py-3 max-w-[120px] truncate text-xs text-gray-500">{m.source_label || m.source_type}</td>
                <td className="px-4 py-3 max-w-[120px] truncate text-xs text-gray-500">{m.target_label || m.target_type}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{m.method}</td>
                <td className="px-4 py-3 max-w-[150px]">
                  <div className="flex flex-wrap gap-1">
                    {(m.reasons || []).map((r, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 bg-gray-100 rounded-full text-gray-500">{r}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">{statusBadge(m.status)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(m.created_at).toLocaleDateString('es-AR')}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {m.status === 'pending' && (
                      <>
                        <button onClick={() => handleConfirm(m.id)} title="Confirmar"
                          className="p-1.5 text-green-500 hover:text-green-700"><Check className="w-4 h-4" /></button>
                        <button onClick={() => handleReject(m.id)} title="Rechazar"
                          className="p-1.5 text-red-400 hover:text-red-600"><XCircle className="w-4 h-4" /></button>
                      </>
                    )}
                    <button onClick={() => handleCopyMatch(m)} title="Copiar texto"
                      className="p-1.5 text-gray-400 hover:text-brand-primary"><MessageSquare className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfigSection() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.settings.list();
        const map: Record<string, string> = {};
        data.forEach((s: any) => { map[s.key] = s.value; });
        setSettings(map);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const handlePolygonChange = async (vertices: { lat: number; lng: number }[], amplitude: number) => {
    setSettings(p => ({
      ...p,
      fb_polygon_vertices: JSON.stringify(vertices),
      fb_polygon_amplitude: String(amplitude),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const fbKeys = Object.keys(settings).filter(k => k.startsWith('fb_'));
      await Promise.all(fbKeys.map(key => api.settings.update(key, settings[key])));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
      alert('Error al guardar configuración');
    }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>;

  let vertices: { lat: number; lng: number }[] = [];
  try {
    if (settings.fb_polygon_vertices) vertices = JSON.parse(settings.fb_polygon_vertices);
  } catch {}
  const amplitude = parseInt(settings.fb_polygon_amplitude || '100', 10);

  return (
    <div className="space-y-8">
      {/* Polygon Editor */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <Map className="w-6 h-6" /> Área Geográfica
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Definí el polígono de cobertura. Los posts fuera de esta área se marcarán como "fuera de zona".
          Doble click en el mapa para agregar vértices. Arrastrá los marcadores para ajustar.
        </p>
        <PolygonEditor
          vertices={vertices}
          amplitude={amplitude}
          onChange={handlePolygonChange}
        />
      </div>

      {/* Matching Settings */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <FlaskConical className="w-6 h-6" /> Configuración de Matching
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 bg-brand-bg rounded-2xl col-span-full">
            <input type="checkbox" id="fb_matching_enabled"
              checked={settings.fb_matching_enabled === 'true'}
              onChange={(e) => setSettings(p => ({ ...p, fb_matching_enabled: e.target.checked ? 'true' : 'false' }))}
              className="w-5 h-5 rounded accent-brand-primary" />
            <label htmlFor="fb_matching_enabled" className="font-bold text-brand-primary">Activar matching automático</label>
          </div>

          <div className="flex items-center gap-3 p-4 bg-brand-bg rounded-2xl col-span-full">
            <input type="checkbox" id="fb_image_matching_enabled"
              checked={settings.fb_image_matching_enabled === 'true'}
              onChange={(e) => setSettings(p => ({ ...p, fb_image_matching_enabled: e.target.checked ? 'true' : 'false' }))}
              className="w-5 h-5 rounded accent-brand-primary" />
            <label htmlFor="fb_image_matching_enabled" className="font-bold text-brand-primary">Activar matching por imágenes</label>
          </div>

          <div className="flex items-center gap-3 p-4 bg-brand-bg rounded-2xl col-span-full">
            <input type="checkbox" id="fb_scraping_enabled"
              checked={settings.fb_scraping_enabled === 'true'}
              onChange={(e) => setSettings(p => ({ ...p, fb_scraping_enabled: e.target.checked ? 'true' : 'false' }))}
              className="w-5 h-5 rounded accent-brand-primary" />
            <label htmlFor="fb_scraping_enabled" className="font-bold text-brand-primary">Activar scraping automático</label>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Score mínimo (%)</label>
            <input type="number" value={settings.fb_matching_min_score || '50'}
              onChange={(e) => setSettings(p => ({ ...p, fb_matching_min_score: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm"
              min="0" max="100" />
            <p className="text-xs text-gray-400 mt-1">Puntaje mínimo para crear un match.</p>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Peso de imagen (%)</label>
            <input type="number" value={settings.fb_image_matching_weight || '20'}
              onChange={(e) => setSettings(p => ({ ...p, fb_image_matching_weight: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm"
              min="0" max="100" />
            <p className="text-xs text-gray-400 mt-1">Porcentaje del score total basado en imágenes.</p>
          </div>
        </div>
      </div>

      {/* Barrios */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <Users className="w-6 h-6" /> Barrios y Zonas
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Lista de barrios con coordenadas para ayudar a la clasificación geográfica. Formato JSON:
          <code className="block mt-2 p-3 bg-gray-50 rounded-xl text-xs">
            [{"{"}"name": "Barrio", "lat": -34.85, "lng": -57.98{"}"}]
          </code>
        </p>
        <textarea value={settings.fb_neighborhoods || '[]'}
          onChange={(e) => setSettings(p => ({ ...p, fb_neighborhoods: e.target.value }))}
          className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm h-32 font-mono"
          placeholder='[{"name": "Parque Sicardi", "lat": -34.856, "lng": -57.984}]' />
      </div>

      {/* Save button */}
      <button onClick={handleSave} disabled={saving}
        className="px-8 py-3.5 bg-brand-primary text-white text-base font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2">
        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
        {saving ? 'Guardando...' : saved ? '✅ Guardado' : 'Guardar Configuración'}
      </button>
    </div>
  );
}
