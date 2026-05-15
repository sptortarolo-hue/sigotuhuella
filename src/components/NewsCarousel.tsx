import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { News, getNewsImageUrl, formatNewsDate } from '@/src/lib/newsService';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NewsCarouselProps {
  news: News[];
}

export default function NewsCarousel({ news }: NewsCarouselProps) {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);

  const goTo = useCallback((idx: number) => {
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  }, [current]);

  const next = useCallback(() => {
    setDirection(1);
    setCurrent(prev => (prev + 1) % news.length);
  }, [news.length]);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent(prev => (prev - 1 + news.length) % news.length);
  }, [news.length]);

  useEffect(() => {
    if (news.length <= 1) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [news.length, next]);

  if (news.length === 0) return null;

  const item = news[current];
  const imageUrl = getNewsImageUrl(item);

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <section className="py-16 sm:py-24 bg-gradient-to-b from-brand-bg to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
              <Sparkles className="w-3 h-3" /> Novedades
            </div>
            <h2 className="text-3xl sm:text-4xl font-serif font-bold text-brand-primary">Últimas novedades</h2>
          </div>
          <button
            onClick={() => navigate('/novedades')}
            className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-white border border-brand-accent rounded-xl text-sm font-bold text-brand-primary hover:border-brand-primary transition-all"
          >
            Ver todas
          </button>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-[2.5rem] shadow-xl">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={current}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: 'easeInOut' }}
                onClick={() => navigate(`/novedad/${item.id}`)}
                className="relative aspect-[2/1] sm:aspect-[3/1] cursor-pointer group"
              >
                {imageUrl ? (
                  <div className="absolute inset-0">
                    <img src={imageUrl} alt={item.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  </div>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-secondary" />
                )}
                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10">
                  <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-md text-white text-[10px] font-bold uppercase tracking-widest rounded-full mb-3">
                    {item.type === 'reunited' ? '🐾 Reencuentro' : item.type === 'adopted' ? '🏡 Adopción' : '📰 Novedad'}
                  </span>
                  <h3 className="text-xl sm:text-3xl font-bold text-white mb-2 line-clamp-2">{item.title}</h3>
                  <p className="text-sm text-white/80 line-clamp-1 max-w-2xl">{item.content.replace(/[#*]/g, '').trim()}</p>
                  <p className="text-xs text-white/60 mt-2">{formatNewsDate(item.created_at)}</p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {news.length > 1 && (
            <>
              <button onClick={prev} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:bg-white transition-all text-brand-primary">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={next} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center hover:bg-white transition-all text-brand-primary">
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="flex justify-center gap-2 mt-6">
                {news.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goTo(idx)}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${idx === current ? 'bg-brand-primary w-6' : 'bg-brand-accent hover:bg-brand-primary/50'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => navigate('/novedades')}
          className="sm:hidden mt-6 w-full py-3 bg-white border border-brand-accent rounded-xl text-sm font-bold text-brand-primary"
        >
          Ver todas las novedades
        </button>
      </div>
    </section>
  );
}
