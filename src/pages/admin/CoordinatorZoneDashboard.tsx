import { useState, useEffect } from 'react';
import { Loader2, Instagram, Facebook, ExternalLink, History, Radio } from 'lucide-react';
import { getMyZoneFeed, type ZoneFeedPost } from '@/src/lib/volunteerService';

function FeedCard({ platform, post }: { platform: 'instagram' | 'facebook'; post: ZoneFeedPost | null }) {
  const Icon = platform === 'instagram' ? Instagram : Facebook;
  const label = platform === 'instagram' ? 'Instagram' : 'Facebook';
  return (
    <div className="bg-white rounded-[2.5rem] border border-brand-accent p-5 sm:p-8">
      <h3 className="text-base sm:text-lg font-serif font-bold text-brand-primary mb-4 flex items-center gap-2">
        <Icon className={`w-5 h-5 ${platform === 'instagram' ? 'text-pink-500' : 'text-blue-600'}`} />
        Ultimo posteo en {label}
      </h3>
      {!post ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          Todavia no hay posteos para mascotas de tu zona.
        </p>
      ) : (
        <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="group block">
          <div className="rounded-2xl overflow-hidden border border-brand-accent aspect-[4/3] bg-brand-bg relative z-0">
            <img
              src={post.image_url}
              alt={post.pet_name}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold text-sm text-brand-primary truncate">{post.pet_name}</p>
              {post.caption && <p className="text-xs sm:text-sm text-gray-500 line-clamp-2 mt-0.5">{post.caption}</p>}
              {post.published_at && (
                <p className="text-[10px] sm:text-xs text-gray-400 mt-1">
                  {new Date(post.published_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
            <span className="shrink-0 p-2 rounded-xl bg-brand-bg text-brand-primary group-hover:bg-brand-accent transition-colors">
              <ExternalLink className="w-4 h-4" />
            </span>
          </div>
        </a>
      )}
    </div>
  );
}

export default function CoordinatorZoneDashboard() {
  const [feed, setFeed] = useState<{ instagram: ZoneFeedPost | null; facebook: ZoneFeedPost | null; history: ZoneFeedPost[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getMyZoneFeed();
        setFeed(data);
      } catch {
        setError(true);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (error || !feed) {
    return <p className="text-center text-gray-400 py-10">Error al cargar el tablero de la agrupacion.</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-serif font-bold text-brand-primary mb-4 flex items-center gap-2">
          <Radio className="w-5 h-5" /> Publicaciones de la zona
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FeedCard platform="instagram" post={feed.instagram} />
          <FeedCard platform="facebook" post={feed.facebook} />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-5 sm:p-8">
        <h2 className="text-lg font-serif font-bold text-brand-primary mb-4 flex items-center gap-2">
          <History className="w-5 h-5" /> Historial de publicaciones
        </h2>
        {feed.history.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Sin publicaciones registradas para tu zona todavia.</p>
        ) : (
          <div className="space-y-3">
            {feed.history.map((h, i) => (
              <a
                key={`${h.platform}-${h.pet_id}-${i}`}
                href={h.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-brand-bg/50 rounded-2xl border border-brand-accent hover:bg-brand-accent/40 transition-colors"
              >
                <img
                  src={h.image_url}
                  alt={h.pet_name}
                  className="w-12 h-12 rounded-xl object-cover shrink-0 bg-white"
                  onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-brand-primary truncate">{h.pet_name}</p>
                    {h.platform === 'instagram'
                      ? <Instagram className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                      : <Facebook className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </div>
                  {h.caption && <p className="text-xs text-gray-500 line-clamp-1">{h.caption}</p>}
                  {h.published_at && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(h.published_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <ExternalLink className="w-4 h-4 text-gray-300 shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
