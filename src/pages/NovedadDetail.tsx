import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { News, getNews, getNewsImageUrl, formatNewsDate } from '@/src/lib/newsService';
import { Sparkles, ArrowLeft, Calendar, Loader2, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

export default function NovedadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<News | null>(null);
  const [related, setRelated] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const all = await getNews();
        const found = all.find(n => n.id === id) || null;
        setItem(found);
        setRelated(all.filter(n => n.id !== id).slice(0, 3));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetch();
  }, [id]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-brand-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="h-screen flex items-center justify-center text-center px-4">
        <div>
          <Info className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-3xl font-serif font-bold text-brand-primary mb-4">Novedad no encontrada</h1>
          <button onClick={() => navigate('/novedades')} className="px-8 py-3 bg-brand-primary text-white rounded-2xl font-bold">
            Ver novedades
          </button>
        </div>
      </div>
    );
  }

  const imageUrl = getNewsImageUrl(item);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary font-bold mb-8">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <article>
        <div className="flex items-center gap-3 mb-6">
          <span className={cn(
            "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
            item.type === 'reunited' ? "bg-emerald-100 text-emerald-700" :
            item.type === 'adopted' ? "bg-brand-secondary/10 text-brand-secondary" : "bg-amber-100 text-amber-700"
          )}>
            {item.type === 'reunited' ? '🐾 Reencuentro' : item.type === 'adopted' ? '🏡 Adopción' : '📰 Novedad'}
          </span>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {formatNewsDate(item.created_at)}
          </span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-serif font-bold text-brand-primary mb-8 leading-tight">
          {item.title}
        </h1>

        {imageUrl && (
          <div className="relative aspect-video rounded-[2.5rem] overflow-hidden mb-10 shadow-xl">
            <img src={imageUrl} alt={item.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="prose prose-gray max-w-none text-gray-600 leading-relaxed whitespace-pre-wrap text-base sm:text-lg">
          {item.content}
        </div>

        {item.related_pet_id && (
          <div className="mt-10 p-6 bg-brand-bg rounded-[2rem] border border-brand-accent">
            <p className="text-sm text-gray-500">
              Esta novedad está vinculada a una publicación. 
              <button onClick={() => navigate(`/pet/${item.related_pet_id}`)} className="ml-2 text-brand-primary font-bold hover:underline">
                Ver publicación original
              </button>
            </p>
          </div>
        )}
      </article>

      {related.length > 0 && (
        <section className="mt-16 pt-12 border-t border-brand-accent">
          <h2 className="text-2xl font-serif font-bold text-brand-primary mb-8">Más novedades</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {related.map(r => {
              const rImg = getNewsImageUrl(r);
              return (
                <motion.div
                  key={r.id}
                  whileHover={{ y: -4 }}
                  onClick={() => navigate(`/novedad/${r.id}`)}
                  className="bg-white rounded-2xl overflow-hidden border border-brand-accent cursor-pointer hover:shadow-lg transition-all"
                >
                  <div className="relative aspect-video bg-gray-100">
                    {rImg ? (
                      <img src={rImg} alt={r.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-primary/5 to-brand-secondary/5">
                        <Sparkles className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-1">{formatNewsDate(r.created_at)}</p>
                    <h3 className="text-sm font-bold text-brand-primary line-clamp-2">{r.title}</h3>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="text-center mt-8">
            <button onClick={() => navigate('/novedades')} className="px-8 py-3 bg-brand-primary text-white rounded-2xl font-bold hover:shadow-lg transition-all">
              Ver todas las novedades
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
