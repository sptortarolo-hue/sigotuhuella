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

    const newsUrl = `${window.location.origin}/novedad/${item.id}`;

    try {
      const W = 1200, H = 630;
      const HEADER_H = 70, FOOTER_H = 50;
      const IMG_Y = HEADER_H + 20;
      const IMG_H = 340;
      const IMG_PAD = 40;
      const IMG_X = IMG_PAD;
      const IMG_W = W - IMG_PAD * 2;
      const TITLE_Y = IMG_Y + IMG_H + 30;

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#F5F5F0';
      ctx.fillRect(0, 0, W, H);

      // ── Header bar ──
      ctx.fillStyle = '#5A5A40';
      ctx.fillRect(0, 0, W, HEADER_H);

      let logoLoaded = false;
      try {
        const logo = new Image();
        logo.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          logo.onload = () => { logoLoaded = true; resolve(); };
          logo.onerror = () => resolve();
          logo.src = '/sigotuhuella.jpg';
        });
        if (logoLoaded) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(38, HEADER_H / 2, 22, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(logo, 16, HEADER_H / 2 - 22, 44, 44);
          ctx.restore();
        }
      } catch {}

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(logoLoaded ? 'Sigo tu Huella' : '🐾 Sigo tu Huella', logoLoaded ? 70 : 20, HEADER_H / 2);

      const typeLabels: Record<string, { text: string; bg: string; fg: string }> = {
        reunited: { text: 'Reencuentro', bg: '#d1fae5', fg: '#065f46' },
        adopted: { text: 'Adopción', bg: '#fdd7b0', fg: '#9a3412' },
        manual: { text: 'Novedad', bg: '#fef3c7', fg: '#92400e' },
      };
      const badge = typeLabels[item.type] || typeLabels.manual;
      ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
      const badgeText = badge.text;
      const badgeW = ctx.measureText(badgeText).width + 24;
      const badgeX = W - IMG_PAD - badgeW;
      const badgeY = (HEADER_H - 28) / 2;
      ctx.fillStyle = badge.bg;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, 28, 14);
      ctx.fill();
      ctx.fillStyle = badge.fg;
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, badgeX + 12, HEADER_H / 2);

      // ── Cover image (or gradient fallback) ──
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(IMG_X, IMG_Y, IMG_W, IMG_H, 16);
      ctx.closePath();
      ctx.clip();

      if (imageUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => {
            const srcAspect = img.width / img.height;
            const dstAspect = IMG_W / IMG_H;
            let sx = 0, sy = 0, sw = img.width, sh = img.height;
            if (srcAspect > dstAspect) {
              sw = img.height * dstAspect;
              sx = (img.width - sw) / 2;
            } else {
              sh = img.width / dstAspect;
              sy = (img.height - sh) / 2;
            }
            ctx.drawImage(img, sx, sy, sw, sh, IMG_X, IMG_Y, IMG_W, IMG_H);
            resolve();
          };
          img.onerror = () => {
            drawPlaceholderGradient(ctx, IMG_X, IMG_Y, IMG_W, IMG_H);
            resolve();
          };
          img.src = imageUrl;
        });
      } else {
        drawPlaceholderGradient(ctx, IMG_X, IMG_Y, IMG_W, IMG_H);
      }
      ctx.restore();

      // ── Title ──
      ctx.fillStyle = '#5A5A40';
      ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'top';
      const titleLines = wrapText(ctx, item.title, W - IMG_PAD * 2, 2);
      titleLines.forEach((line, i) => {
        ctx.fillText(line, IMG_PAD, TITLE_Y + i * 40);
      });

      // ── Date + subtitle ──
      const dateStr = formatNewsDate(item.created_at);
      ctx.fillStyle = '#999';
      ctx.font = '18px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${dateStr}  ·  Barrios Villa Garibaldi`, IMG_PAD, TITLE_Y + titleLines.length * 40 + 12);

      // ── Footer bar ──
      ctx.fillStyle = '#D48C70';
      ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '18px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('www.sigotuhuella.online', W / 2 - ctx.measureText('www.sigotuhuella.online').width / 2, H - FOOTER_H / 2);

      // ── Export & share ──
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

  const drawPlaceholderGradient = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#5A5A40');
    grad.addColorStop(1, '#D48C70');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '180px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐾', x + w / 2, y + h / 2);
    ctx.textAlign = 'start';
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number = 2): string[] => {
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
      if (lines.length >= maxLines) break;
    }
    if (currentLine && lines.length < maxLines) lines.push(currentLine);
    else if (currentLine) lines[lines.length - 1] += '...';
    return lines;
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
              className="absolute bottom-2 right-2 p-3 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white/90 transition-colors z-10"
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