import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { News, getNews, getNewsImageUrl, formatNewsDate } from '@/src/lib/newsService';
import { Sparkles, ArrowLeft, Calendar, Loader2, Info, Play, Share2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

function getVideoEmbedUrl(url: string): string | null {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return null;
}

function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
}

export default function NovedadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<News | null>(null);
  const [related, setRelated] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        setError(null);
        const all = await getNews();
        console.log('Fetched news count:', all.length);
        const found = all.find(n => n.id === id) || null;
        console.log('Found item:', found ? { id: found.id, title: found.title } : null);
        setItem(found);
        setRelated(all.filter(n => n.id !== id).slice(0, 3));
        window.scrollTo(0, 0);
      } catch (e) {
        console.error('Error fetching news:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
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

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center text-center px-4">
        <div>
          <Info className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h1 className="text-3xl font-serif font-bold text-brand-primary mb-4">Error al cargar la novedad</h1>
          <p className="text-gray-500">{error}</p>
          <button onClick={() => navigate('/novedades')} className="px-8 py-3 bg-brand-primary text-white rounded-2xl font-bold mt-4">
            Ver novedades
          </button>
        </div>
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

  const handleShareNews = async () => {
    if (!item) return;

    const newsUrl = `${import.meta.env.VITE_FRONTEND_URL}/novedad/${item.id}`;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 630;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#F5F5F0';
      ctx.fillRect(0, 0, 1200, 630);

      if (imageUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => {
            const aspect = img.width / img.height;
            let drawW = 1200;
            let drawH = 1200 / aspect;
            if (drawH > 400) {
              drawH = 400;
              drawW = 400 * aspect;
            }
            ctx.drawImage(img, (1200 - drawW) / 2, 30, drawW, drawH);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = imageUrl;
        });
      }

      ctx.fillStyle = '#5A5A40';
      ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
      const titleLines = wrapText(ctx, item.title, 1100);
      titleLines.forEach((line, i) => {
        ctx.fillText(line, 50, 460 + i * 44);
      });

      ctx.fillStyle = '#D48C70';
      ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
      ctx.fillText('Sigo tu Huella', 50, 590);

      ctx.fillStyle = '#999';
      ctx.font = '16px system-ui, -apple-system, sans-serif';
      ctx.fillText(newsUrl, 50, 615);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas export failed'));
        }, 'image/jpeg', 0.9);
      });

      const file = new File([blob], 'novedad.jpg', { type: 'image/jpeg' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: item.title,
          text: item.content.substring(0, 100) + '...',
          url: newsUrl,
          files: [file],
        });
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'novedad-sigotuhuella.jpg';
        link.click();
        URL.revokeObjectURL(link.href);
        alert('Imagen descargada. Adjuntala al compartir por WhatsApp.');
      }
    } catch (err) {
      console.error('Error generando imagen:', err);
      if (navigator.share) {
        try {
          await navigator.share({ title: item.title, url: newsUrl });
        } catch {
          fallbackToClipboard(newsUrl);
        }
      } else {
        fallbackToClipboard(newsUrl);
      }
    }
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.slice(0, 3);
  };

  const fallbackToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Enlace copiado al portapapeles');
    } catch (err) {
      alert('Copie el enlace manualmente: ' + text);
    }
  };

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
          <button onClick={handleShareNews}
            className="text-sm font-bold text-brand-primary hover:bg-brand-primary/5 px-3 py-1.5 rounded-full transition-colors">
            <Share2 className="w-4 h-4" /> Compartir
          </button>
        </div>

        <h1 className="text-3xl sm:text-5xl font-serif font-bold text-brand-primary mb-8 leading-tight">
          {item.title}
        </h1>

        {imageUrl && (
          <div className="relative aspect-video rounded-[2.5rem] overflow-hidden mb-10 shadow-xl">
            <img src={imageUrl} alt={item.title} className="w-full h-full object-cover" />
            <button 
              onClick={handleShareNews}
              className="absolute bottom-2 right-2 p-2 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white/90 transition-colors z-10"
            >
              <Share2 className="w-5 h-5 text-brand-primary" />
            </button>
          </div>
        )}

        {item.video_url && (
          <div className="relative aspect-video rounded-[2.5rem] overflow-hidden mb-10 shadow-xl bg-black">
            {isDirectVideo(item.video_url) ? (
              <video controls className="w-full h-full" src={item.video_url} />
            ) : (() => {
              const embedUrl = getVideoEmbedUrl(item.video_url);
              return embedUrl ? (
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Video"
                />
              ) : (
                <a
                  href={item.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full h-full flex items-center justify-center gap-3 text-white bg-gray-900 hover:bg-gray-800 transition-colors"
                >
                  <Play className="w-10 h-10" />
                  <span className="text-lg font-bold">Ver video</span>
                </a>
              );
            })()}
          </div>
        )}

        <div className="prose prose-gray max-w-none text-gray-600 leading-relaxed whitespace-pre-wrap text-base sm:text-lg text-justify">
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