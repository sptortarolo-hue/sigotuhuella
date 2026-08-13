import React, { useEffect, useMemo, useState } from 'react';
import { api } from '@/src/lib/api';
import { Instagram, Facebook, Heart, MessageCircle, Repeat2, Eye, ExternalLink, Send, Loader2 } from 'lucide-react';

type PlatformComment = {
  id: string;
  username?: string;
  author_name?: string;
  text?: string;
  replied?: boolean;
  like_count?: number;
  created_at?: string;
  posted_at?: string;
  platform: 'instagram' | 'facebook';
};

type Impact = {
  instagram?: {
    permalink?: string | null;
    embed_html?: string | null;
    like_count?: number;
    comment_count?: number;
    share_count?: number;
    reach?: number;
    caption?: string;
  } | null;
  facebook?: {
    page_post_id?: string | null;
    like_count?: number;
    comment_count?: number;
    share_count?: number;
    reach?: number;
    message?: string;
  } | null;
  comments?: {
    instagram?: any[];
    facebook?: any[];
  };
};

const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString('es-AR') : '0');

function MetricChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value?: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-brand-accent">
      <span className={color}>{icon}</span>
      <span className="text-xs font-bold text-gray-700">{fmt(value)}</span>
      <span className="text-[10px] text-gray-400">{label}</span>
    </div>
  );
}

function IGEmbed({ html, permalink }: { html?: string | null; permalink?: string | null }) {
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!html) return;
    if (!(window as any).instgrm) {
      const script = document.createElement('script');
      script.src = 'https://www.instagram.com/embed.js';
      script.async = true;
      script.onload = () => {
        (window as any).instgrm?.Embeds?.process?.(ref.current);
      };
      document.body.appendChild(script);
    } else {
      (window as any).instgrm.Embeds.process(ref.current);
    }
  }, [html]);

  return (
    <div
      ref={ref}
      className="flex justify-center"
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  );
}

function CommentRow({ comment, canReply, caseId }: { comment: PlatformComment; canReply: boolean; caseId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async () => {
    if (!text.trim()) return;
    setSending(true);
    setMsg('');
    try {
      await api.cases.replyComment(caseId, comment.id, text.trim());
      setMsg('✅ Respuesta publicada');
      setText('');
      setOpen(false);
    } catch (e: any) {
      setMsg(e.message || 'Error al responder');
    } finally {
      setSending(false);
    }
  };

  const author = comment.username ? `@${comment.username}` : comment.author_name || 'Anónimo';
  const date = comment.created_at || comment.posted_at;

  return (
    <div className="border border-brand-accent rounded-xl p-3 bg-gray-50/50">
      <div className="flex items-start gap-2">
        {comment.platform === 'instagram' ? (
          <Instagram className="w-4 h-4 text-pink-500 mt-0.5 shrink-0" />
        ) : (
          <Facebook className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-gray-700 truncate">{author}</p>
            {date ? (
              <span className="text-[10px] text-gray-400 whitespace-nowrap">
                {new Date(date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-gray-700 break-words mt-0.5">{comment.text}</p>
          {comment.platform === 'facebook' && typeof comment.like_count === 'number' && comment.like_count > 0 && (
            <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><Heart className="w-3 h-3" /> {comment.like_count}</p>
          )}
        </div>
      </div>

      {canReply && (
        <div className="mt-2 pl-6">
          {!open ? (
            <button
              onClick={() => setOpen(true)}
              className="text-xs font-bold text-brand-primary hover:underline"
            >
              Responder públicamente
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={`Respondé a ${author}...`}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit(); }}
              />
              <div className="flex gap-2">
                <button
                  onClick={submit}
                  disabled={sending || !text.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-brand-primary rounded-lg disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Publicar
                </button>
                <button onClick={() => setOpen(false)} className="px-3 py-2 text-xs font-bold text-gray-500 rounded-lg border border-brand-accent">
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {msg && <p className="text-xs text-gray-500 mt-1">{msg}</p>}
        </div>
      )}
    </div>
  );
}

export default function CaseImpact({ caseId, impact, canReply }: { caseId: string; impact?: Impact | null; canReply: boolean }) {
  const comments = useMemo<PlatformComment[]>(() => {
    const ig: PlatformComment[] = (impact?.comments?.instagram || []).map((c: any) => ({ ...c, platform: 'instagram' as const }));
    const fb: PlatformComment[] = (impact?.comments?.facebook || []).map((c: any) => ({ ...c, platform: 'facebook' as const }));
    return [...ig, ...fb];
  }, [impact]);

  const hasImpact = !!(impact?.instagram || impact?.facebook);

  if (!hasImpact) return null;

  const ig = impact?.instagram;
  const fb = impact?.facebook;
  const totalReach = (ig?.reach || 0) + (fb?.reach || 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-accent p-5 mb-8">
      <h3 className="text-lg font-serif font-bold text-brand-primary mb-4">🚀 Impacto de la publicación</h3>

      {/* Barra de métricas */}
      <div className="flex flex-wrap gap-2 mb-5">
        {ig && (
          <>
            <MetricChip icon={<Heart className="w-3.5 h-3.5" />} label="IG likes" value={ig.like_count} color="text-pink-500" />
            <MetricChip icon={<MessageCircle className="w-3.5 h-3.5" />} label="IG comentarios" value={ig.comment_count} color="text-pink-500" />
            <MetricChip icon={<Repeat2 className="w-3.5 h-3.5" />} label="IG reenvíos" value={ig.share_count} color="text-pink-500" />
          </>
        )}
        {fb && (
          <>
            <MetricChip icon={<Heart className="w-3.5 h-3.5" />} label="FB likes" value={fb.like_count} color="text-blue-600" />
            <MetricChip icon={<MessageCircle className="w-3.5 h-3.5" />} label="FB comentarios" value={fb.comment_count} color="text-blue-600" />
            <MetricChip icon={<Repeat2 className="w-3.5 h-3.5" />} label="FB compartidos" value={fb.share_count} color="text-blue-600" />
          </>
        )}
        {totalReach > 0 && <MetricChip icon={<Eye className="w-3.5 h-3.5" />} label="Alcance" value={totalReach} color="text-amber-500" />}
      </div>

      {/* Embed de Instagram */}
      {ig?.embed_html && (
        <div className="mb-6">
          <IGEmbed html={ig.embed_html} permalink={ig.permalink} />
        </div>
      )}

      {/* Botones de acción */}
      {(ig?.permalink || fb?.page_post_id) && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {ig?.permalink && (
            <a
              href={ig.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-pink-500 to-purple-600 rounded-xl"
            >
              <Instagram className="w-4 h-4" /> Ver en Instagram <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {fb?.page_post_id && (
            <a
              href={`https://www.facebook.com/${fb.page_post_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl"
            >
              <Facebook className="w-4 h-4" /> Ver en Facebook <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Panel de comentarios */}
      {comments.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-brand-primary" /> Comentarios ({comments.length})
          </h4>
          <div className="space-y-2">
            {comments.map((c: PlatformComment) => (
              <React.Fragment key={`${c.platform}-${c.id}`}>
                <CommentRow comment={c} canReply={canReply} caseId={caseId} />
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
