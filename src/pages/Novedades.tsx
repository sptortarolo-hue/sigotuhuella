import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { News, getNews, getNewsImageUrl, formatNewsDate } from '@/src/lib/newsService';
import { Sparkles, Loader2, ArrowLeft, Calendar, HeartHandshake, Home, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

export default function Novedades() {
  const navigate = useNavigate();
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getNews();
        setNews(data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); window.scrollTo(0, 0); }
    };
    fetch();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary font-bold mb-8">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <header className="mb-12 text-center max-w-2xl mx-auto">
        <div className="inline-flex p-3 bg-amber-100 text-amber-700 rounded-2xl mb-4">
          <Sparkles className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-serif font-bold text-brand-primary mb-2">Novedades</h1>
        <p className="text-gray-500">
          Reencuentros, adopciones y noticias de la comunidad {news.length > 0 && `(${news.length})`}
        </p>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-brand-primary" /></div>
      ) : news.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {news.map((item, idx) => {
            const imageUrl = getNewsImageUrl(item);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => navigate(`/novedad/${item.id}`)}
                className="group bg-white rounded-[2rem] overflow-hidden border border-brand-accent hover:border-brand-primary hover:shadow-xl transition-all cursor-pointer"
              >
                <div className="relative aspect-video overflow-hidden bg-gray-100">
                  {imageUrl ? (
                    <>
                      <img src={imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                      {item.video_url && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                            <Play className="w-6 h-6 text-brand-primary ml-0.5" />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10">
                      {item.type === 'reunited' ? (
                        <HeartHandshake className="w-12 h-12 text-emerald-400" />
                      ) : item.type === 'adopted' ? (
                        <Home className="w-12 h-12 text-brand-secondary" />
                      ) : (
                        <Sparkles className="w-12 h-12 text-amber-400" />
                      )}
                    </div>
                  )}
                  <div className={cn(
                    "absolute top-4 left-4 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md",
                    item.type === 'reunited' ? "bg-emerald-500/80 text-white" :
                    item.type === 'adopted' ? "bg-brand-secondary/80 text-white" : "bg-amber-500/80 text-white"
                  )}>
                    {item.type === 'reunited' ? '🐾 Reencuentro' : item.type === 'adopted' ? '🏡 Adopción' : '📰 Novedad'}
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                    <Calendar className="w-3 h-3" />
                    {formatNewsDate(item.created_at)}
                  </div>
                  <h3 className="text-lg font-bold text-brand-primary mb-2 line-clamp-2">{item.title}</h3>
                  <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed">{item.content.replace(/[#*]/g, '').trim()}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 bg-brand-accent/30 rounded-3xl border-2 border-dashed border-brand-accent">
          <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">No hay novedades aún. Las novedades se generan automáticamente con cada reencuentro o adopción.</p>
        </div>
      )}
    </div>
  );
}
