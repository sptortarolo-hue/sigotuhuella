import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/src/lib/api';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import FacebookPostCard from '@/src/components/admin/FacebookPostCard';
import FacebookMatchReview from '@/src/components/admin/FacebookMatchReview';
import ImageLightbox from '@/src/components/admin/ImageLightbox';
import {
  Save, Loader2, Plus, X, Trash2, Edit2, ExternalLink,
  Search, RefreshCw, Check, XCircle, MessageSquare, Map,
  Globe, Users, Sliders, FlaskConical, Upload, Clock,
  LayoutGrid, List, ImageIcon,
} from 'lucide-react';

type SubTab = 'groups' | 'posts' | 'matches' | 'publisher' | 'settings';

interface FacebookGroup {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  scrape_enabled: boolean;
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
    { id: 'publisher', label: 'Publicar en FB', icon: Upload },
    { id: 'settings', label: 'Configuración', icon: Sliders },
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
      {activeSubTab === 'publisher' && <PublisherSection />}
      {activeSubTab === 'settings' && <SettingsSection />}
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

  const toggleScrape = async (group: FacebookGroup) => {
    try {
      await api.facebook.groups.update(group.id, { scrape_enabled: !group.scrape_enabled });
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
              <th className="px-4 py-3">Scrapear</th>
              <th className="px-4 py-3">Última actualización</th>
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
                <td className="px-4 py-3">
                  <button onClick={() => toggleScrape(g)} className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold",
                    g.scrape_enabled ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"
                  )}>{g.scrape_enabled ? 'Sí' : 'No'}</button>
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
  const [filters, setFilters] = useState({ classification: 'all', species: 'all', search: '', has_images: '' as '' | 'true' | 'false' });
  const [selectedPost, setSelectedPost] = useState<FacebookPost | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [matching, setMatching] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.facebook.posts.list(filters as any);
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

  const handleUpdateClassification = async (id: string, classification: string) => {
    try {
      await api.facebook.posts.update(id, { classification });
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

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar esta publicación?')) return;
    try {
      await api.facebook.posts.delete(id);
      setSelectedIds(p => { const s = new Set(p); s.delete(id); return s; });
      await fetchPosts();
    } catch (e: any) { alert(e.message); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`¿Eliminar ${selectedIds.size} publicaciones?`)) return;
    try {
      await api.facebook.posts.bulkDelete([...selectedIds]);
      setSelectedIds(new Set());
      await fetchPosts();
    } catch (e: any) { alert(e.message); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(p => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const classificationBadge = (cls: string) => {
    const styles: Record<string, string> = {
      lost: 'bg-red-100 text-red-700', found: 'bg-green-100 text-green-700',
      adoption: 'bg-purple-100 text-purple-700', reunion: 'bg-blue-100 text-blue-700',
      other: 'bg-gray-100 text-gray-500', unclassified: 'bg-yellow-100 text-yellow-700',
    };
    const labels: Record<string, string> = {
      lost: 'Perdido', found: 'Encontrado', reunion: 'Reunión', adoption: 'Adopción',
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
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          <select value={filters.classification} onChange={e => setFilters(p => ({ ...p, classification: e.target.value }))}
            className="px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs font-bold outline-none">
            <option value="all">Todas</option>
            <option value="lost">Perdido</option>
            <option value="found">Encontrado</option>
            <option value="reunion">Reunión</option>
            <option value="adoption">Adopción</option>
            <option value="other">Otro</option>
            <option value="unclassified">Sin clasificar</option>
          </select>
          <select value={filters.species} onChange={e => setFilters(p => ({ ...p, species: e.target.value }))}
            className="px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs font-bold outline-none">
            <option value="all">Todas</option>
            <option value="dog">Perro</option>
            <option value="cat">Gato</option>
          </select>
          <select value={filters.has_images} onChange={e => setFilters(p => ({ ...p, has_images: e.target.value as any }))}
            className="px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs font-bold outline-none">
            <option value="">Con/Sin foto</option>
            <option value="true">Con foto</option>
            <option value="false">Sin foto</option>
          </select>
          <button onClick={() => setFilters(p => ({ ...p, classification: 'other', has_images: 'false' as any, search: '' }))}
            className="px-3 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-xl hover:bg-red-100 transition-colors">
            Basura 🗑️
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
              placeholder="Buscar..."
              className="w-40 sm:w-48 pl-9 pr-4 py-2 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" />
          </div>
          <button onClick={() => setViewMode(p => p === 'cards' ? 'table' : 'cards')}
            className="p-2 text-gray-400 hover:text-brand-primary transition-colors rounded-xl hover:bg-brand-bg" title={viewMode === 'cards' ? 'Vista tabla' : 'Vista cards'}>
            {viewMode === 'cards' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-brand-bg rounded-2xl">
          <span className="text-sm font-bold text-brand-primary">{selectedIds.size} seleccionados</span>
          <button onClick={() => setSelectedIds(new Set())}
            className="text-xs text-gray-500 hover:text-gray-700">Deseleccionar</button>
          <button onClick={handleBulkDelete}
            className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-red-500 text-white text-xs font-bold rounded-xl hover:bg-red-600 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Eliminar seleccionados
          </button>
        </div>
      )}

      {/* Stats */}
      <p className="text-xs text-gray-400">{posts.length} publicaciones</p>

      {/* Cards grid */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {posts.map(p => (
            <FacebookPostCard
              key={p.id}
              post={p}
              selected={selectedIds.has(p.id)}
              onToggleSelect={toggleSelect}
              onClassify={handleClassify}
              onDelete={handleDelete}
              onMatch={handleRunMatching}
              onViewDetail={setSelectedPost}
              onUpdateClassification={handleUpdateClassification}
              onImageClick={(images, idx) => setLightbox({ images, index: idx })}
            />
          ))}
        </div>
      ) : (
        /* Table view */
        <div className="overflow-x-auto rounded-2xl border border-brand-accent">
          <table className="w-full text-left text-sm min-w-max">
            <thead>
              <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={selectedIds.size === posts.length && posts.length > 0}
                    onChange={() => selectedIds.size === posts.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(posts.map(p => p.id)))}
                    className="w-4 h-4 rounded accent-brand-primary" />
                </th>
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
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                      className="w-4 h-4 rounded accent-brand-primary" />
                  </td>
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
                      {p.fb_post_url && (
                        <a href={p.fb_post_url} target="_blank" rel="noopener noreferrer" title="Abrir en Facebook"
                          className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"><ExternalLink className="w-3.5 h-3.5" /></a>
                      )}
                      <button onClick={() => handleRunMatching(p.id)} disabled={matching} title="Buscar matches"
                        className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40"><FlaskConical className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setSelectedPost(p)} title="Ver detalle"
                        className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"><Search className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(p.id)} title="Eliminar"
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedPost && (
        <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} onUpdate={handleManualUpdate} onDelete={handleDelete} />
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onChange={(idx) => setLightbox(p => p ? { ...p, index: idx } : null)}
        />
      )}
    </div>
  );
}

function PostDetailModal({ post, onClose, onUpdate, onDelete }: { post: FacebookPost; onClose: () => void; onUpdate: (id: string, data: any) => void; onDelete?: (id: string) => void }) {
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
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
${post.fb_post_url ? `🔗 Publicación original: ${post.fb_post_url}` : ''}

🔗 Ver más en Sigo Tu Huella: https://sigotuhuella.online`;
    navigator.clipboard.writeText(text);
    alert('Texto copiado al portapapeles');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 sm:p-8 border-b border-brand-accent">
          <h3 className="text-lg font-serif font-bold text-brand-primary">Detalle del Post</h3>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button onClick={() => { if (window.confirm('¿Eliminar esta publicación?')) { onDelete(post.id); onClose(); } }}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="p-6 sm:p-8 overflow-y-auto space-y-4">
          <div className="bg-brand-bg rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-xs text-gray-400">Contenido original</p>
              {post.fb_post_url && (
                <a href={post.fb_post_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 shrink-0">
                  <ExternalLink className="w-3 h-3" /> Ver en Facebook
                </a>
              )}
            </div>
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
                    <img key={i} src={url} alt={`Imagen ${i + 1}`} referrerPolicy="no-referrer"
                      className="rounded-xl aspect-square object-cover bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      onClick={() => setLightbox({ images: post.image_urls, index: i })} />
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
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onChange={(idx) => setLightbox(p => p ? { ...p, index: idx } : null)}
        />
      )}
    </div>
  );
}

function MatchesSection() {
  const [matches, setMatches] = useState<FacebookMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [stats, setStats] = useState<FacebookStats | null>(null);
  const [matchView, setMatchView] = useState<'review' | 'list'>('review');
  const refreshKey = React.useRef(0);

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

      {/* View toggle */}
      <div className="flex gap-2 border-b border-brand-accent pb-px">
        <button onClick={() => setMatchView('review')}
          className={cn("px-4 py-2 text-xs font-bold transition-all relative",
            matchView === 'review' ? 'text-brand-primary' : 'text-gray-400 hover:text-gray-600')}>
          Revisar
          {matchView === 'review' && <motion.div layoutId="match-view" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />}
        </button>
        <button onClick={() => setMatchView('list')}
          className={cn("px-4 py-2 text-xs font-bold transition-all relative",
            matchView === 'list' ? 'text-brand-primary' : 'text-gray-400 hover:text-gray-600')}>
          Lista
          {matchView === 'list' && <motion.div layoutId="match-view" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />}
        </button>
      </div>

      {matchView === 'review' ? (
        <FacebookMatchReview
          key={refreshKey.current}
          matches={matches}
          onConfirm={handleConfirm}
          onReject={handleReject}
          onRefresh={() => { refreshKey.current++; fetchData(); }}
        />
      ) : (
        <>
          <div className="flex gap-2">
            {['pending', 'confirmed', 'rejected', 'all'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn("px-3 py-1.5 text-xs font-bold rounded-xl transition-colors",
                  statusFilter === s ? "bg-brand-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
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
                      <span className={cn("font-black text-sm",
                        m.score >= 80 ? "text-green-600" : m.score >= 60 ? "text-yellow-600" : "text-gray-500")}>{m.score}%</span>
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
        </>
      )}
    </div>
  );
}

function SettingsSection() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedScraper, setSavedScraper] = useState(false);
  const [savedMatching, setSavedMatching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scrapingNow, setScrapingNow] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.settings.list();
        const map: Record<string, string> = {};
        data.forEach((s: any) => { map[s.key] = s.value; });
        setSettings(map);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const handleTriggerScrape = async () => {
    setScrapingNow(true);
    setScrapeResult(null);
    try {
      const res = await api.facebook.triggerScrape() as any;
      setScrapeResult(res.success ? `✅ Scrape completado (${res.lastScrape ? new Date(res.lastScrape).toLocaleString('es-AR') : 'ok'})` : '❌ Error');
      setSettings(p => ({ ...p, apify_last_scrape_at: res.lastScrape || p.apify_last_scrape_at }));
    } catch (e: any) {
      setScrapeResult('❌ ' + (e.message || 'Error'));
    }
    setScrapingNow(false);
  };

  const handleSaveScraper = async () => {
    setSaving(true);
    try {
      await api.settings.update('fb_scraping_enabled', settings.fb_scraping_enabled || 'false');
      await api.settings.update('fb_scraper_token', settings.fb_scraper_token || '');
      await api.settings.update('fb_scraper_hour_1', settings.fb_scraper_hour_1 || '8');
      await api.settings.update('fb_scraper_hour_2', settings.fb_scraper_hour_2 || '20');
      setSavedScraper(true);
      setTimeout(() => setSavedScraper(false), 2000);
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const handleSaveMatching = async () => {
    setSaving(true);
    try {
      const keys = ['fb_matching_enabled', 'fb_image_matching_enabled', 'fb_matching_min_score', 'fb_image_matching_weight'];
      for (const key of keys) {
        await api.settings.update(key, settings[key] || '');
      }
      setSavedMatching(true);
      setTimeout(() => setSavedMatching(false), 2000);
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Scraper settings */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <Globe className="w-6 h-6" /> Scraper de Facebook
        </h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-brand-bg rounded-2xl">
            <input type="checkbox" id="fb_scraping_enabled"
              checked={settings.fb_scraping_enabled === 'true'}
              onChange={(e) => setSettings(p => ({ ...p, fb_scraping_enabled: e.target.checked ? 'true' : 'false' }))}
              className="w-5 h-5 rounded accent-brand-primary" />
            <label htmlFor="fb_scraping_enabled" className="font-bold text-brand-primary">Activar scraping automático</label>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Token del scraper</label>
            <input type="text" value={settings.fb_scraper_token || ''}
              onChange={(e) => setSettings(p => ({ ...p, fb_scraper_token: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm font-mono" />
            <p className="text-xs text-gray-400 mt-1">Debe coincidir con el token en el script del VPS.</p>
          </div>

          {/* Horarios de scraping */}
          <div className="bg-brand-bg rounded-2xl p-4 space-y-3">
            <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Horarios de scraping
            </h4>
            <p className="text-xs text-gray-500">El scraper corre 2 veces al día en estas horas (Argentina)</p>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 block mb-1">Hora 1</label>
                <select value={settings.fb_scraper_hour_1 || '8'}
                  onChange={e => setSettings(p => ({ ...p, fb_scraper_hour_1: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary">
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-gray-500 block mb-1">Hora 2</label>
                <select value={settings.fb_scraper_hour_2 || '20'}
                  onChange={e => setSettings(p => ({ ...p, fb_scraper_hour_2: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none focus:border-brand-primary">
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
            </div>
            {settings.apify_last_scrape_at && (
              <p className="text-xs text-gray-400">
                Último scrape: {new Date(settings.apify_last_scrape_at).toLocaleString('es-AR')}
              </p>
            )}
            <button onClick={handleTriggerScrape} disabled={scrapingNow}
              className="w-full sm:w-auto px-4 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {scrapingNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {scrapingNow ? 'Scrapeando...' : 'Scrapear ahora'}
            </button>
            {scrapeResult && (
              <p className="text-xs font-bold" style={{ color: scrapeResult.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{scrapeResult}</p>
            )}
          </div>

          <button onClick={handleSaveScraper} disabled={saving}
            className="px-8 py-3.5 bg-brand-primary text-white text-base font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Guardando...' : savedScraper ? '✅ Guardado' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Matching settings */}
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

          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Score mínimo (%)</label>
            <input type="number" value={settings.fb_matching_min_score || '50'}
              onChange={(e) => setSettings(p => ({ ...p, fb_matching_min_score: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm"
              min="0" max="100" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Peso de imagen (%)</label>
            <input type="number" value={settings.fb_image_matching_weight || '20'}
              onChange={(e) => setSettings(p => ({ ...p, fb_image_matching_weight: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm"
              min="0" max="100" />
          </div>
        </div>

        <button onClick={handleSaveMatching} disabled={saving}
          className="mt-6 px-8 py-3.5 bg-brand-primary text-white text-base font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {saving ? 'Guardando...' : savedMatching ? '✅ Guardado' : 'Guardar Configuración de Matching'}
        </button>
      </div>
    </div>
  );
}

function PublisherSection() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [replicating, setReplicating] = useState(false);
  const [pagePosts, setPagePosts] = useState<any[]>([]);
  const [publishStatus, setPublishStatus] = useState<any>(null);
  const [showStatus, setShowStatus] = useState(false);
  const [groupSaving, setGroupSaving] = useState<Record<string, boolean>>({});
  const [retrying, setRetrying] = useState(false);
  const [publishingPet, setPublishingPet] = useState<string | null>(null);

  const publishIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const fetchData = useCallback(async () => {
    try {
      // Auto-extraer fb_group_id de URLs
      await api.facebook.extractGroupIds();

      const [settingsData, groupsData] = await Promise.all([
        api.settings.list(),
        api.facebook.groups.list(),
      ]);
      const map: Record<string, string> = {};
      settingsData.forEach((s: any) => { map[s.key] = s.value; });
      setSettings(map);
      setGroups(groupsData);
      const postsResp = await fetch('/api/facebook/page-posts?limit=10', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (postsResp.ok) {
        const postsData = await postsResp.json();
        setPagePosts(postsData.posts || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    return () => {
      Object.values(publishIntervalsRef.current).forEach(clearInterval);
      publishIntervalsRef.current = {};
    };
  }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const keys = ['facebook_page_id', 'facebook_page_publisher_enabled', 'facebook_publisher_interval'];
      await Promise.all(keys.map(key => api.settings.update(key, settings[key] || '')));
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleGroupSave = async (id: string, data: any) => {
    setGroupSaving(p => ({ ...p, [id]: true }));
    try {
      const resp = await fetch(`/api/facebook/groups/${id}/page-member`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(data),
      });
      if (!resp.ok) { const err = await resp.json(); alert(err.error || 'Error'); }
    } catch (e) { console.error(e); }
    setGroupSaving(p => ({ ...p, [id]: false }));
  };

  const handleReplicate = async () => {
    setReplicating(true);
    try {
      const resp = await fetch('/api/facebook/replicate-latest?limit=5', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await resp.json();
      const total = data.results?.length || 0;
      const ok = data.results?.filter((r: any) => r.result?.page?.success).length || 0;
      alert(`✅ Replicación completada: ${ok}/${total} post(s) publicados`);
      await fetchData();
    } catch (e: any) { alert('Error: ' + e.message); }
    setReplicating(false);
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const resp = await fetch('/api/facebook/retry-failed?limit=10', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await resp.json();
      const total = data.results?.length || 0;
      const ok = data.results?.filter((r: any) => r.result?.page?.success).length || 0;
      alert(`✅ Reintento completado: ${ok}/${total} post(s) publicados`);
      await fetchData();
    } catch (e: any) { alert('Error: ' + e.message); }
    setRetrying(false);
  };

  const handlePublishToGroups = async (petId: string) => {
    if (publishIntervalsRef.current[petId]) return;
    setPublishingPet(petId);
    try {
      const resp = await fetch(`/api/facebook/publish-pet-to-groups/${petId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (resp.status === 409 && data.alreadyPublished) { alert('Esta mascota ya fue publicada anteriormente'); setPublishingPet(null); return; }
        alert(data.error || 'Error'); setPublishingPet(null); return;
      }
      if (!data.publishId) { alert('Error: no se pudo iniciar la publicacion'); setPublishingPet(null); return; }

      const interval = setInterval(async () => {
        try {
          const statusResp = await fetch(`/api/facebook/publish-status/${data.publishId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          });
          if (!statusResp.ok) { clearInterval(interval); delete publishIntervalsRef.current[petId]; setPublishingPet(null); alert('Error al consultar estado'); return; }
          const job = await statusResp.json();
          if (job.status === 'completed') {
            clearInterval(interval);
            delete publishIntervalsRef.current[petId];
            setPublishingPet(null);
            const r = job.result;
            const groupOk = r?.groups?.filter((g: any) => g.success).length || 0;
            const groupTotal = r?.groups?.length || 0;
            alert(`Publicado en Page${groupTotal > 0 ? ` + ${groupOk}/${groupTotal} grupo(s)` : ''}`);
            await fetchData();
          } else if (job.status === 'failed') {
            clearInterval(interval);
            delete publishIntervalsRef.current[petId];
            setPublishingPet(null);
            alert('Error: ' + (job.error || 'Error desconocido'));
            await fetchData();
          }
        } catch (e: any) { clearInterval(interval); delete publishIntervalsRef.current[petId]; setPublishingPet(null); alert('Error: ' + e.message); }
      }, 3000);
      publishIntervalsRef.current[petId] = interval;
    } catch (e: any) { alert('Error: ' + e.message); setPublishingPet(null); }
  };

  const handleStatus = async () => {
    try {
      const resp = await fetch('/api/facebook/publish-status', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      if (resp.ok) {
        setPublishStatus(await resp.json());
        setShowStatus(true);
      }
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>;

  return (
    <div className="space-y-8">
      {/* Configuracion del Publisher */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <Upload className="w-6 h-6" /> Configuración del Publisher
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Replicá automáticamente las publicaciones de Instagram a tu Page de Facebook y a los grupos donde la Page sea miembro.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-full">
            <label className="block text-sm font-bold text-gray-600 mb-1">ID de la Page de Facebook</label>
            <input type="text" value={settings.facebook_page_id || ''}
              onChange={e => setSettings(p => ({ ...p, facebook_page_id: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm font-mono"
              placeholder="ej: 123456789012345" />
            <p className="text-xs text-gray-400 mt-1">El ID numérico de la Page de Facebook vinculada a Instagram.</p>
          </div>

          <div className="flex items-center gap-3 p-4 bg-brand-bg rounded-2xl col-span-full">
            <input type="checkbox" id="fb_page_publisher_enabled"
              checked={settings.facebook_page_publisher_enabled === 'true'}
              onChange={e => setSettings(p => ({ ...p, facebook_page_publisher_enabled: e.target.checked ? 'true' : 'false' }))}
              className="w-5 h-5 rounded accent-brand-primary" />
            <label htmlFor="fb_page_publisher_enabled" className="font-bold text-brand-primary">
              Activar replicación automática Instagram → Facebook
            </label>
          </div>

          <div className="col-span-full sm:col-span-1">
            <label className="block text-sm font-bold text-gray-600 mb-1">Intervalo (minutos)</label>
            <input type="number" value={settings.facebook_publisher_interval || '30'}
              onChange={e => setSettings(p => ({ ...p, facebook_publisher_interval: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm"
              min="5" max="1440" />
            <p className="text-xs text-gray-400 mt-1">Cada cuántos minutos revisa si hay posts nuevos de Instagram para replicar.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-6">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-3 bg-brand-primary text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={handleReplicate} disabled={replicating}
            className="px-6 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
            {replicating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            {replicating ? 'Replicando...' : 'Replicar ahora'}
          </button>
          <button onClick={handleRetry} disabled={retrying}
            className="px-6 py-3 bg-orange-500 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
            {retrying ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            {retrying ? 'Reintentando...' : 'Reintentar fallidos'}
          </button>
          <button onClick={handleStatus}
            className="px-6 py-3 bg-gray-100 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all flex items-center gap-2">
            <Sliders className="w-5 h-5" /> Estado del Publisher
          </button>
        </div>
      </div>



      {/* Configuracion por grupo */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <Users className="w-6 h-6" /> Grupos destino
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Configurá el ID numérico de cada grupo de Facebook y si la Page es miembro.
          La Page debe ser miembro del grupo para publicar automáticamente.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-brand-accent">
          <table className="w-full text-left text-sm min-w-max">
            <thead>
              <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                <th className="px-4 py-3">Grupo</th>
                <th className="px-4 py-3">FB Group ID</th>
                <th className="px-4 py-3 text-center">Page miembro</th>
                <th className="px-4 py-3 text-center">Publicar</th>

                <th className="px-4 py-3">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-accent">
              {groups.filter((g: any) => g.is_active).map((g: any) => (
                <GroupConfigRow key={g.id} group={g}
                  onSave={handleGroupSave}
                  saving={groupSaving[g.id] || false} />
              ))}
              {groups.filter((g: any) => g.is_active).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">No hay grupos activos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log de publicaciones */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <LayoutGrid className="w-6 h-6" /> Últimas publicaciones
        </h2>

        <div className="overflow-x-auto rounded-2xl border border-brand-accent">
          <table className="w-full text-left text-sm min-w-max">
            <thead>
              <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                <th className="px-4 py-3">Mascota</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Error / ID</th>
                <th className="px-4 py-3">Publicado</th>
                <th className="px-4 py-3">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-accent">
              {pagePosts.map((p: any) => (
                <tr key={p.id} className="hover:bg-brand-bg/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.pet_image
                        ? <img src={`data:image/jpeg;base64,${p.pet_image}`} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        : <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0" />}
                      <span className="font-medium">{p.pet_name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold",
                      p.status === 'published' ? "bg-green-100 text-green-700" :
                      p.status === 'failed' ? "bg-red-100 text-red-600" :
                      "bg-yellow-100 text-yellow-700"
                    )}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[200px] truncate" title={p.error_message || p.page_post_id || ''}>
                    {p.error_message
                      ? <span className="text-red-500">{p.error_message.substring(0, 120)}</span>
                      : <span className="text-gray-500 font-mono">{p.page_post_id || '—'}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {p.published_at ? new Date(p.published_at).toLocaleString('es-AR') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handlePublishToGroups(p.pet_id)} disabled={publishingPet === p.pet_id || !p.pet_id || (p.group_post_ids?.length > 0)}
                      className="px-3 py-1.5 bg-brand-primary text-white text-[10px] font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-40 flex items-center gap-1">
                      {publishingPet === p.pet_id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : p.group_post_ids?.length > 0 ? <Check className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
                      {publishingPet === p.pet_id ? 'Publicando...' : p.group_post_ids?.length > 0 ? 'Ya publicado' : 'Publicar a grupos'}
                    </button>
                  </td>
                </tr>
              ))}
              {pagePosts.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">Aún no hay publicaciones.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status modal */}
      {showStatus && publishStatus && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => setShowStatus(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-2xl">
            <button onClick={() => setShowStatus(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-serif font-bold text-brand-primary mb-6">Estado del Publisher</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-brand-bg rounded-2xl">
                <div className={`w-3 h-3 rounded-full ${publishStatus.enabled ? 'bg-green-500' : 'bg-red-400'}`} />
                <span className="font-bold">{publishStatus.enabled ? 'Activado' : 'Desactivado'}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 bg-brand-bg rounded-2xl text-center">
                  <div className="text-2xl font-bold text-brand-primary">{publishStatus.stats?.published || 0}</div>
                  <div className="text-xs text-gray-500">Publicados</div>
                </div>
                <div className="p-4 bg-brand-bg rounded-2xl text-center">
                  <div className="text-2xl font-bold text-red-500">{publishStatus.stats?.failed || 0}</div>
                  <div className="text-xs text-gray-500">Fallidos</div>
                </div>
              </div>
              {publishStatus.pageId && (
                <div className="text-sm">
                  <span className="text-gray-500">Page ID:</span>{' '}
                  <span className="font-mono font-bold">{publishStatus.pageId}</span>
                </div>
              )}
              <div>
                <p className="text-sm font-bold text-gray-600 mb-2">Grupos configurados:</p>
                {publishStatus.groups?.map((g: any) => (
                  <div key={g.id} className="flex items-center gap-2 text-sm py-1">
                    <div className={`w-2 h-2 rounded-full ${g.page_is_member ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className={g.fb_group_id ? 'text-brand-primary' : 'text-gray-400'}>
                      {g.name}
                    </span>
                    {g.fb_group_id && <span className="text-xs text-gray-400 font-mono">({g.fb_group_id})</span>}
                    {!g.page_is_member && <span className="text-[10px] text-red-400">no es miembro</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupConfigRow({ group, onSave, saving }: { group: any; onSave: (id: string, data: any) => Promise<void>; saving: boolean }) {
  const [fbGroupId, setFbGroupId] = useState(group.fb_group_id || '');
  const [pageIsMember, setPageIsMember] = useState(group.page_is_member || false);
  const [publishOnCreate, setPublishOnCreate] = useState(group.publish_on_create || false);
  const handleSave = () => onSave(group.id, {
    fb_group_id: fbGroupId || null,
    page_is_member: pageIsMember,
    publish_on_create: publishOnCreate,
  });

  return (
    <tr className="hover:bg-brand-bg/50 transition-colors">
      <td className="px-4 py-3 font-bold text-brand-primary">{group.name}</td>
      <td className="px-4 py-3">
        <input type="text" value={fbGroupId}
          onChange={e => setFbGroupId(e.target.value)}
          className="w-32 px-2 py-1.5 bg-white rounded-lg border border-brand-accent outline-none focus:border-brand-primary text-xs font-mono"
          placeholder="ID numérico" />
      </td>
      <td className="px-4 py-3 text-center">
        <input type="checkbox" checked={pageIsMember}
          onChange={e => setPageIsMember(e.target.checked)}
          className="w-5 h-5 rounded accent-brand-primary" />
      </td>
      <td className="px-4 py-3 text-center">
        <input type="checkbox" checked={publishOnCreate}
          onChange={e => setPublishOnCreate(e.target.checked)}
          className="w-5 h-5 rounded accent-brand-primary" />
      </td>
      <td className="px-4 py-3">
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 bg-brand-primary text-white text-[10px] font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-1">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Guardar
        </button>
      </td>
    </tr>
  );
}
