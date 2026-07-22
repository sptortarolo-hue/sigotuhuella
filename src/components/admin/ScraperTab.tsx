import { useEffect, useState } from 'react';
import { api } from '@/src/lib/api';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import {
  Save, Loader2, Search, RefreshCw, Check, XCircle, MessageSquare,
  Globe, Users, Sliders, FlaskConical, Clock, ImageIcon,
  ExternalLink, X, LayoutGrid, List, Trash2,
} from 'lucide-react';
import ImageLightbox from '@/src/components/admin/ImageLightbox';
import FacebookMatchReview from '@/src/components/admin/FacebookMatchReview';

type SubTab = 'posts' | 'matches' | 'settings';

interface ScrapedItem {
  id: string;
  source: 'fb' | 'wa';
  group_name: string;
  author_name: string | null;
  content: string | null;
  classification: string;
  species: string | null;
  color: string | null;
  location_hint: string | null;
  phone: string | null;
  is_matched: boolean;
  created_at: string;
  image_urls: string[] | null;
  fb_post_url: string | null;
  has_image: boolean;
  image_count: number;
  wa_message_id: string | null;
  image_data: string | null;
  image_mime: string | null;
  author_jid: string | null;
  author_phone: string | null;
  animal_detected: boolean | null;
  animal_species: string | null;
  animal_confidence: number | null;
}

interface MatchItem {
  id: string; source_type: string; source_id: string; source_label: string;
  target_type: string; target_id: string; target_label: string;
  score: number; reasons: string[]; method: string; status: string;
  created_at: string;
}

const CLASSIFICATION_BADGES: Record<string, string> = {
  lost: 'bg-red-100 text-red-700', found: 'bg-orange-100 text-orange-700',
  sighting: 'bg-yellow-100 text-yellow-700', reunion: 'bg-green-100 text-green-700',
  adoption: 'bg-blue-100 text-blue-700', other: 'bg-gray-100 text-gray-500',
  unclassified: 'bg-gray-100 text-gray-400',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  lost: 'Perdido', found: 'Encontrado', sighting: 'Avistaje',
  reunion: 'Reunión', adoption: 'Adopción', other: 'Otro', unclassified: 'Sin clasif.',
};

const RELAY_TOKEN = localStorage.getItem('relay_token') || '';

export default function ScraperTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('posts');

  const subTabs: { id: SubTab; label: string; icon: any }[] = [
    { id: 'posts', label: 'Publicaciones', icon: Globe },
    { id: 'matches', label: 'Matches', icon: FlaskConical },
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
              <motion.div layoutId="scraper-subtab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {activeSubTab === 'posts' && <PostsSection />}
      {activeSubTab === 'matches' && <MatchesSection />}
      {activeSubTab === 'settings' && <SettingsSection />}
    </div>
  );
}

function PostsSection() {
  const [items, setItems] = useState<ScrapedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classification, setClassification] = useState('all');
  const [species, setSpecies] = useState('all');
  const [lightbox, setLightbox] = useState<{ images: string[]; idx: number } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('gallery');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [imgIndices, setImgIndices] = useState<Record<string, number>>({});
  const [animalDetected, setAnimalDetected] = useState('all');

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (classification !== 'all') params.set('classification', classification);
      if (species !== 'all') params.set('species', species);
      if (animalDetected !== 'all') params.set('animal_detected', animalDetected);
      if (search) params.set('search', search);
      params.set('limit', '100');
      const resp = await fetch(`/api/relay/scraped-messages?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setItems(data.messages || []);
      } else {
        const errData = await resp.json().catch(() => ({}));
        console.error('[ScraperTab] fetch error:', resp.status, errData);
      }
    } catch (e) { console.error('[ScraperTab] fetch exception:', e); }
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, []);

  const filtered = items.filter(i => {
    if (classification !== 'all' && i.classification !== classification) return false;
    if (species !== 'all' && i.species !== species) return false;
    if (animalDetected !== 'all') {
      if (animalDetected === 'null') {
        if (i.animal_detected !== null) return false;
      } else {
        const wantDetected = animalDetected === 'true';
        if (i.animal_detected !== wantDetected) return false;
      }
    }
    if (search && !(i.content || '').toLowerCase().includes(search.toLowerCase()) && !(i.author_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleSelect = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(i => i.id + i.source)));
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`¿Eliminar ${selected.size} publicación(es)? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      const itemsToDelete = filtered
        .filter(i => selected.has(i.id + i.source))
        .map(i => ({ id: i.id, source: i.source }));
      const resp = await fetch('/api/relay/scraped-messages/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ items: itemsToDelete }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSelected(new Set());
        await fetchItems();
      }
    } catch (e) { console.error('Bulk delete error:', e); }
    setDeleting(false);
  };

  const getImageUrls = (item: ScrapedItem): string[] => {
    if (item.source === 'fb' && item.has_image) return [`/api/facebook/posts/${item.id}/image`];
    if (item.source === 'wa' && item.has_image) {
      const count = item.image_count || 1;
      const urls: string[] = [];
      for (let i = 0; i < count; i++) {
        urls.push(`/api/relay/scraped-messages/${item.id}/image?position=${i}`);
      }
      return urls;
    }
    return [];
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar en contenido o autor..."
            className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" />
        </div>
        <select value={classification} onChange={e => setClassification(e.target.value)}
          className="px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm">
          <option value="all">Todas las clasificaciones</option>
          {Object.entries(CLASSIFICATION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={species} onChange={e => setSpecies(e.target.value)}
          className="px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm">
          <option value="all">Todas las especies</option>
          <option value="dog">Perro</option>
          <option value="cat">Gato</option>
          <option value="other">Otro</option>
        </select>
        <select value={animalDetected} onChange={e => setAnimalDetected(e.target.value)}
          className="px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm">
          <option value="all">Todos los animales</option>
          <option value="true">Mascota detectada</option>
          <option value="false">Sin mascota</option>
          <option value="null">Sin imagen</option>
        </select>
        <button onClick={fetchItems}
          className="px-4 py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
        <div className="flex bg-white rounded-xl border border-brand-accent overflow-hidden">
          <button onClick={() => setViewMode('gallery')}
            className={cn("px-3 py-3 transition-colors", viewMode === 'gallery' ? 'bg-brand-primary text-white' : 'text-gray-400 hover:text-gray-600')}>
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('list')}
            className={cn("px-3 py-3 transition-colors", viewMode === 'list' ? 'bg-brand-primary text-white' : 'text-gray-400 hover:text-gray-600')}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{filtered.length} resultado(s)</p>
        {filtered.length > 0 && (
          <>
            <button onClick={selectAll}
              className="text-xs text-brand-primary font-bold hover:underline">
              {selected.size === filtered.length ? 'Desseleccionar todo' : 'Seleccionar todo'}
            </button>
            <button onClick={() => {
              const nonPet = new Set(filtered.filter(i => i.animal_detected !== true).map(i => i.id + i.source));
              setSelected(nonPet);
            }}
              className="text-xs text-red-500 font-bold hover:underline">
              Seleccionar no-mascotas
            </button>
          </>
        )}
      </div>

      {/* Bulk delete bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-sm font-bold text-red-700">{selected.size} seleccionado(s)</span>
          <button onClick={handleBulkDelete} disabled={deleting}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? 'Eliminando...' : 'Eliminar seleccionados'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>
      ) : viewMode === 'gallery' ? (
        /* GALLERY VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(item => {
            const key = item.id + item.source;
            const imgUrls = getImageUrls(item);
            const curIdx = imgIndices[key] || 0;
            const currentImg = imgUrls[curIdx] || null;
            return (
              <div key={key}
                className={cn(
                  "bg-white rounded-2xl border overflow-hidden transition-all hover:shadow-md",
                  selected.has(key) ? 'border-brand-primary ring-2 ring-brand-primary/20' : 'border-brand-accent'
                )}>
                <div className="relative aspect-square bg-gray-100">
                  {currentImg ? (
                    <img src={currentImg} className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setLightbox({ images: imgUrls, idx: curIdx })} />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="w-10 h-10 text-gray-300" />
                    </div>
                  )}
                  {imgUrls.length > 1 && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/50 rounded-full px-2 py-0.5">
                      {imgUrls.map((_: string, i: number) => (
                        <button key={i} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setImgIndices(prev => ({ ...prev, [key]: i })); }}
                          className={cn("w-1.5 h-1.5 rounded-full transition-all",
                            i === curIdx ? 'bg-white' : 'bg-white/40')} />
                      ))}
                    </div>
                  )}
                  <button onClick={() => toggleSelect(key)}
                    className={cn(
                      "absolute top-2 left-2 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                      selected.has(key) ? 'bg-brand-primary border-brand-primary text-white' : 'bg-white/80 border-gray-300 text-transparent hover:border-brand-primary'
                    )}>
                    {selected.has(key) && <Check className="w-3.5 h-3.5" />}
                  </button>
                  <div className="absolute top-2 right-2 flex flex-col gap-1">
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-bold",
                      item.source === 'fb' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                    )}>
                      {item.source === 'fb' ? 'FB' : 'WA'}
                    </span>
                    {item.animal_detected === true ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700">
                        ✓ Mascota
                      </span>
                    ) : item.animal_detected === false ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700">
                        ✗ No mascota
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-400">
                        — Sin imagen
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0",
                      CLASSIFICATION_BADGES[item.classification] || 'bg-gray-100 text-gray-400')}>
                      {CLASSIFICATION_LABELS[item.classification] || item.classification}
                    </span>
                    {item.species && (
                      <span className="text-[10px] text-gray-400">{item.species === 'dog' ? '🐕' : item.species === 'cat' ? '🐈' : item.species}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{item.content || '(sin texto)'}</p>
                  {item.author_name && (
                    <p className="text-[10px] text-gray-400 truncate">
                      {item.author_name}{item.author_phone ? ` · ${item.author_phone}` : ''}
                    </p>
                  )}
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{item.group_name}</span>
                    <div className="flex items-center gap-1">
                      {item.source === 'fb' && item.fb_post_url && (
                        <a href={item.fb_post_url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="p-1 text-blue-400 hover:text-blue-600">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <span className="text-[10px] text-gray-400">{new Date(item.created_at).toLocaleDateString('es-AR')}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-10 text-center text-sm text-gray-400">Sin resultados</div>
          )}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="overflow-x-auto rounded-2xl border border-brand-accent">
          <table className="w-full text-left text-sm min-w-max">
            <thead>
              <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                <th className="px-4 py-3 w-10">
                  <button onClick={selectAll}
                    className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                      selected.size === filtered.length && filtered.length > 0 ? 'bg-brand-primary border-brand-primary text-white' : 'border-gray-300 text-transparent')}>
                    {selected.size === filtered.length && filtered.length > 0 && <Check className="w-3 h-3" />}
                  </button>
                </th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">Grupo</th>
                <th className="px-4 py-3">Autor</th>
                <th className="px-4 py-3">Contenido</th>
                <th className="px-4 py-3">Clasificación</th>
                <th className="px-4 py-3">Especie</th>
                <th className="px-4 py-3">Animal</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-accent">
              {filtered.map(item => {
                const key = item.id + item.source;
                return (
                  <tr key={key}
                    className={cn("hover:bg-brand-bg/50 transition-colors cursor-pointer",
                      selected.has(key) && 'bg-brand-primary/5')}
                    onClick={() => toggleSelect(key)}>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleSelect(key)}
                        className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                          selected.has(key) ? 'bg-brand-primary border-brand-primary text-white' : 'border-gray-300 text-transparent hover:border-brand-primary')}>
                        {selected.has(key) && <Check className="w-3 h-3" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-[10px] px-2 py-1 rounded-full font-bold",
                        item.source === 'fb' ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                      )}>
                        {item.source === 'fb' ? '🐦 FB' : '💬 WA'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{item.group_name}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[100px] truncate">{item.author_name || '—'}{item.author_phone ? ` (${item.author_phone})` : ''}</td>
                    <td className="px-4 py-3 max-w-[250px]">
                      <div className="flex items-center gap-2">
                        {item.source === 'wa' && item.has_image && (
                          <img src={`/api/relay/scraped-messages/${item.id}/image`}
                            className="w-8 h-8 rounded-lg object-cover shrink-0" />
                        )}
                        {item.source === 'wa' && (item.image_count || 0) > 1 && (
                          <span className="text-[10px] text-gray-400 shrink-0">+{(item.image_count || 1) - 1}</span>
                        )}
                        <span className="text-xs text-gray-600 line-clamp-2">{(item.content || '(sin texto)').substring(0, 200)}</span>
                        {item.source === 'fb' && item.fb_post_url && (
                          <a href={item.fb_post_url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="shrink-0 p-1 text-blue-400 hover:text-blue-600">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] px-2 py-1 rounded-full font-bold whitespace-nowrap",
                        CLASSIFICATION_BADGES[item.classification] || 'bg-gray-100 text-gray-400')}>
                        {CLASSIFICATION_LABELS[item.classification] || item.classification}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{item.species || '—'}</td>
                    <td className="px-4 py-3">
                      {item.animal_detected === true ? (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-green-100 text-green-700 whitespace-nowrap">
                          ✓ {item.animal_species || 'mascota'}
                        </span>
                      ) : item.animal_detected === false ? (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-red-100 text-red-700 whitespace-nowrap">
                          ✗ No mascota
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-gray-100 text-gray-400 whitespace-nowrap">
                          — Sin img.
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">{item.location_hint || '—'}</td>
                    <td className="px-4 py-3">
                      {item.is_matched ? (
                        <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-green-100 text-green-700">Sí</span>
                      ) : <span className="text-xs text-gray-400">No</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString('es-AR')}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-400">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function MatchesSection() {
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [reviewMode, setReviewMode] = useState(false);
  const [stats, setStats] = useState<{ totalPosts: number; totalMatches: number; pendingMatches: number; confirmedMatches: number } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [matchesData, statsResp] = await Promise.all([
        api.facebook.matches.list({ status: statusFilter }),
        fetch('/api/facebook/stats').then(r => r.ok ? r.json() : null),
      ]);
      setMatches(matchesData.matches);
      setStats(statsResp);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const handleConfirm = async (id: string) => {
    try { await api.facebook.matches.confirm(id); await fetchData(); } catch (e: any) { alert(e.message); }
  };

  const handleReject = async (id: string) => {
    try { await api.facebook.matches.reject(id); await fetchData(); } catch (e: any) { alert(e.message); }
  };

  const handleCopyMatch = (m: MatchItem) => {
    const text = `🐾 En Sigo Tu Huella encontramos una posible coincidencia (${m.score}%).\n\n${m.source_label ? `🔍 Fuente: ${m.source_label.substring(0, 100)}` : ''}\n${m.target_label ? `🎯 Coincide con: ${m.target_label.substring(0, 100)}` : ''}\n${m.reasons?.length ? `📋 Razones: ${m.reasons.join(', ')}` : ''}`;
    navigator.clipboard.writeText(text);
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

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {['pending', 'confirmed', 'rejected', 'all'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn("px-3 py-1.5 text-xs font-bold rounded-xl transition-colors",
                statusFilter === s ? "bg-brand-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
              {s === 'pending' ? 'Pendientes' : s === 'confirmed' ? 'Confirmados' : s === 'rejected' ? 'Rechazados' : 'Todos'}
            </button>
          ))}
        </div>
        <button onClick={() => setReviewMode(!reviewMode)}
          className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-colors",
            reviewMode ? "bg-brand-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
          {reviewMode ? <List className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
          {reviewMode ? 'Tabla' : 'Revisión'}
        </button>
      </div>

      {reviewMode && statusFilter === 'pending' ? (
        <FacebookMatchReview
          matches={matches}
          onConfirm={handleConfirm}
          onReject={handleReject}
          onRefresh={fetchData}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-accent">
          <table className="w-full text-left text-sm min-w-max">
            <thead>
              <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                <th className="px-4 py-3">Origen</th>
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
              {matches.map(m => {
                const sourceType = m.source_type === 'fb_post' ? 'FB' : m.source_type === 'wa_group' ? 'WA' : 'App';
                return (
                  <tr key={m.id} className="hover:bg-brand-bg/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] px-2 py-1 rounded-full font-bold",
                        sourceType === 'FB' ? "bg-blue-100 text-blue-700" :
                        sourceType === 'WA' ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700")}>
                        {sourceType}
                      </span>
                    </td>
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
                    <td className="px-4 py-3">
                      <span className={cn("text-[10px] px-2 py-1 rounded-full font-bold uppercase",
                        m.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        m.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-700')}>
                        {m.status === 'pending' ? 'Pendiente' : m.status === 'confirmed' ? 'Confirmado' : 'Rechazado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(m.created_at).toLocaleDateString('es-AR')}
                    </td>
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
                        <button onClick={() => handleCopyMatch(m)} title="Copiar"
                          className="p-1.5 text-gray-400 hover:text-brand-primary"><MessageSquare className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {matches.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">Sin matches</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SettingsSection() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedScraper, setSavedScraper] = useState(false);
  const [savedMatching, setSavedMatching] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [settingsData, groupsData] = await Promise.all([
          api.settings.list(),
          api.whatsapp.groups(),
        ]);
        const map: Record<string, string> = {};
        settingsData.forEach((s: any) => { map[s.key] = s.value; });
        setSettings(map);
        setGroups(groupsData);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const handleSaveScraper = async () => {
    setSaving(true);
    try {
      await api.settings.update('fb_scraping_enabled', settings.fb_scraping_enabled || 'false');
      await api.settings.update('fb_scraper_token', settings.fb_scraper_token || '');
      await api.settings.update('fb_login_cookies', settings.fb_login_cookies || '');
      await api.settings.update('fb_scraper_from', settings.fb_scraper_from || '8');
      await api.settings.update('fb_scraper_to', settings.fb_scraper_to || '20');
      await api.settings.update('fb_scraper_interval', settings.fb_scraper_interval || '4');
      setSavedScraper(true);
      setTimeout(() => setSavedScraper(false), 2000);
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const handleSaveMatching = async () => {
    setSaving(true);
    try {
      const keys = ['matching_min_score', 'matching_radius_km', 'matching_weight_visual', 'matching_weight_distance', 'matching_weight_base', 'matching_max_candidates'];
      for (const key of keys) await api.settings.update(key, settings[key] || '');
      setSavedMatching(true);
      setTimeout(() => setSavedMatching(false), 2000);
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  };

  const toggleScrape = async (id: string, val: boolean) => {
    try {
      await api.whatsapp.updateGroup(id, { scrape_enabled: !val });
      const data = await api.whatsapp.groups();
      setGroups(data);
    } catch (e) { console.error(e); }
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* FB Scraper */}
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
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Cookies de Facebook (login)</label>
            <textarea value={settings.fb_login_cookies || ''}
              onChange={(e) => setSettings(p => ({ ...p, fb_login_cookies: e.target.value }))}
              placeholder='Pegá el JSON de Cookie-Editor o: c_user=XXX; xs=XXX; fr=XXX; ...'
              rows={3}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-xs font-mono resize-none" />
            <p className="text-[10px] text-gray-400 mt-1">Pegá el JSON exportado de Cookie-Editor directamente. También acepta el formato string de cookies.</p>
          </div>
            <div className="bg-brand-bg rounded-2xl p-4 space-y-3">
              <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Configuración del scraper
              </h4>
              <p className="text-xs text-gray-500">El scraper corre en Termux (celular) y envía posts al servidor automáticamente.</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">Horario desde</label>
                  <select value={settings.fb_scraper_from || '8'}
                    onChange={e => setSettings(p => ({ ...p, fb_scraper_from: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none">
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">Horario hasta</label>
                  <select value={settings.fb_scraper_to || '20'}
                    onChange={e => setSettings(p => ({ ...p, fb_scraper_to: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none">
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">Cada</label>
                  <select value={settings.fb_scraper_interval || '4'}
                    onChange={e => setSettings(p => ({ ...p, fb_scraper_interval: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-brand-accent text-sm bg-white outline-none">
                    {[1, 2, 3, 4, 6, 8, 12].map(v => (
                      <option key={v} value={v}>{v} horas</option>
                    ))}
                  </select>
                </div>
              </div>
          </div>
          <button onClick={handleSaveScraper} disabled={saving}
            className="px-8 py-3.5 bg-brand-primary text-white text-base font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Guardando...' : savedScraper ? '✅ Guardado' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Matching config */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <FlaskConical className="w-6 h-6" /> Configuración de Matching (CLIP + pgvector)
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Score mínimo (%)</label>
            <input type="number" value={settings.matching_min_score || '70'}
              onChange={(e) => setSettings(p => ({ ...p, matching_min_score: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" min="0" max="100" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Radio (km)</label>
            <input type="number" value={settings.matching_radius_km || '20'}
              onChange={(e) => setSettings(p => ({ ...p, matching_radius_km: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" min="1" max="500" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Peso visual (%)</label>
            <input type="number" value={settings.matching_weight_visual || '60'}
              onChange={(e) => setSettings(p => ({ ...p, matching_weight_visual: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" min="0" max="100" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Peso distancia (%)</label>
            <input type="number" value={settings.matching_weight_distance || '25'}
              onChange={(e) => setSettings(p => ({ ...p, matching_weight_distance: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" min="0" max="100" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Peso base (%)</label>
            <input type="number" value={settings.matching_weight_base || '15'}
              onChange={(e) => setSettings(p => ({ ...p, matching_weight_base: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" min="0" max="100" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-1">Máx. candidatos</label>
            <input type="number" value={settings.matching_max_candidates || '10'}
              onChange={(e) => setSettings(p => ({ ...p, matching_max_candidates: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm" min="1" max="50" />
          </div>
        </div>
        <button onClick={handleSaveMatching} disabled={saving}
          className="mt-6 px-8 py-3.5 bg-brand-primary text-white text-base font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {saving ? 'Guardando...' : savedMatching ? '✅ Guardado' : 'Guardar'}
        </button>
      </div>

      {/* WA Groups avec scrape_enabled */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <Users className="w-6 h-6" /> Grupos WhatsApp — Scrapeo
        </h2>
        <p className="text-sm text-gray-500 mb-4">Activá el scrapeo en los grupos de WhatsApp para capturar mensajes de mascotas perdidas/encontradas.</p>
        <div className="overflow-x-auto rounded-2xl border border-brand-accent">
          <table className="w-full text-left text-sm min-w-max">
            <thead>
              <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Group ID</th>
                <th className="px-4 py-3">Activo</th>
                <th className="px-4 py-3">Scrapear</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-accent">
              {groups.filter((g: any) => g.type !== 'channel').map((g: any) => (
                <tr key={g.id} className="hover:bg-brand-bg/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-brand-primary">{g.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{g.group_id}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[10px] px-2 py-1 rounded-full font-bold",
                      g.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>{g.is_active ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleScrape(g.id, g.scrape_enabled)}
                      className={cn("px-3 py-1 rounded-full text-xs font-bold transition-all",
                        g.scrape_enabled ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-400")}>
                      {g.scrape_enabled ? 'Sí' : 'No'}
                    </button>
                  </td>
                </tr>
              ))}
              {groups.filter((g: any) => g.type !== 'channel').length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">Sin grupos de WhatsApp</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
