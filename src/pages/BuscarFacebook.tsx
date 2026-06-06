import React, { useState, useCallback } from 'react';
import { api } from '@/src/lib/api';
import { Search, MapPin, Phone, ExternalLink, Calendar, Filter, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface FacebookPost {
  id: string;
  fb_post_url: string;
  author_name: string;
  content: string;
  image_urls: string[];
  classification: string;
  species: string;
  color: string;
  location_hint: string;
  phone: string;
  posted_at: string;
  group_name: string;
}

export default function BuscarFacebook() {
  const [posts, setPosts] = useState<FacebookPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filters, setFilters] = useState({
    species: 'all',
    color: '',
    location: '',
    classification: 'all',
  });

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params: any = {};
      if (filters.species !== 'all') params.species = filters.species;
      if (filters.classification !== 'all') params.classification = filters.classification;
      if (filters.color.trim()) params.color = filters.color.trim();
      if (filters.location.trim()) params.location = filters.location.trim();
      const data = await api.facebook.search(params);
      setPosts(data.posts);
    } catch (e) {
      console.error(e);
      setPosts([]);
    }
    setLoading(false);
  }, [filters]);

  const classificationBadge = (cls: string) => {
    const styles: Record<string, string> = {
      lost: 'bg-red-100 text-red-700',
      found: 'bg-green-100 text-green-700',
    };
    const labels: Record<string, string> = {
      lost: 'Perdido',
      found: 'Encontrado',
    };
    return (
      <span className={cn('text-[10px] px-2 py-1 rounded-full font-bold uppercase', styles[cls] || 'bg-gray-100 text-gray-500')}>
        {labels[cls] || cls}
      </span>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <div className="text-center mb-8 sm:mb-12">
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-brand-primary mb-3">
          Buscar en Facebook
        </h1>
        <p className="text-sm sm:text-base text-gray-500 max-w-xl mx-auto">
          Buscá publicaciones de mascotas perdidas y encontradas en grupos de Facebook de Zona Sur.
        </p>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-5 sm:p-8 mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Especie</label>
            <select value={filters.species}
              onChange={(e) => setFilters(p => ({ ...p, species: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm">
              <option value="all">Todas</option>
              <option value="dog">Perro</option>
              <option value="cat">Gato</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Tipo</label>
            <select value={filters.classification}
              onChange={(e) => setFilters(p => ({ ...p, classification: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm">
              <option value="all">Todos</option>
              <option value="lost">Perdido</option>
              <option value="found">Encontrado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Color</label>
            <input value={filters.color}
              onChange={(e) => setFilters(p => ({ ...p, color: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm"
              placeholder="Ej: negro, blanco..." />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">Ubicación</label>
            <input value={filters.location}
              onChange={(e) => setFilters(p => ({ ...p, location: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm"
              placeholder="Barrio, zona..." />
          </div>
        </div>
        <button onClick={handleSearch} disabled={loading}
          className="w-full sm:w-auto px-8 py-3 bg-brand-primary text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search className="w-5 h-5" />}
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-10 h-10 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
        </div>
      )}

      {!loading && searched && posts.length === 0 && (
        <div className="text-center py-12 bg-white rounded-[2.5rem] border border-dashed border-brand-accent">
          <Search className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="font-bold text-gray-400">No se encontraron publicaciones</p>
          <p className="text-sm text-gray-300 mt-1">Probá con otros filtros.</p>
        </div>
      )}

      {!loading && posts.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 font-medium">{posts.length} resultado(s)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {posts.map(post => (
              <div key={post.id} className="bg-white rounded-[2.5rem] border border-brand-accent p-5 sm:p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Calendar className="w-3.5 h-3.5" />
                    {post.posted_at ? new Date(post.posted_at).toLocaleDateString('es-AR') : '—'}
                    {post.group_name && <span>· {post.group_name}</span>}
                  </div>
                  {classificationBadge(post.classification)}
                </div>

                <p className="text-sm text-gray-700 line-clamp-3 mb-3">{post.content}</p>

                <div className="flex flex-wrap gap-2 mb-3">
                  {post.species && (
                    <span className="text-[10px] px-2 py-1 bg-brand-bg rounded-full font-bold text-brand-primary">
                      {post.species === 'dog' ? 'Perro' : 'Gato'}
                    </span>
                  )}
                  {post.color && (
                    <span className="text-[10px] px-2 py-1 bg-brand-bg rounded-full font-bold text-gray-600">
                      {post.color}
                    </span>
                  )}
                </div>

                {post.location_hint && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" /> {post.location_hint}
                  </div>
                )}

                {post.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-blue-600 mb-3">
                    <Phone className="w-3.5 h-3.5 shrink-0" /> {post.phone}
                  </div>
                )}

                {post.author_name && (
                  <p className="text-[10px] text-gray-400 mb-3">Publicado por: {post.author_name}</p>
                )}

                {post.fb_post_url && (
                  <a href={post.fb_post_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
                    <ExternalLink className="w-3.5 h-3.5" /> Ver en Facebook
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
