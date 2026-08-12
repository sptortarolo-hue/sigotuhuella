import { useEffect, useState } from 'react';
import { api } from '@/src/lib/api';
import { Instagram, Facebook, MessageCircle, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/src/lib/utils';

type Share = {
  id?: string;
  platform: 'instagram' | 'facebook' | 'whatsapp';
  url?: string;
  group_name?: string;
  group_count?: number;
  date?: string | null;
};

export default function CaseShares({ caseId }: { caseId: string }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await api.cases.shares(caseId);
        if (alive) setShares(res.shares || []);
      } catch (e: any) {
        if (alive) setError(e.message || 'Error al cargar los shares');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [caseId]);

  if (loading) {
    return <div className="py-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-primary" /></div>;
  }

  if (error) return null;

  const waShares = shares.filter(s => s.platform === 'whatsapp');
  const linkShares = shares.filter(s => s.platform !== 'whatsapp');

  const formatDate = (d?: string | null) => d
    ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
    : '';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-accent p-5">
      <h3 className="text-sm font-bold text-gray-700 mb-3">📢 Difusión del caso</h3>

      {shares.length === 0 ? (
        <p className="text-sm text-gray-400">Todavía no se difundió este caso en redes ni grupos.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {linkShares.map((s, i) => (
            <a
              key={`${s.platform}-${i}`}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-xl border border-brand-accent hover:border-brand-primary transition-colors"
            >
              {s.platform === 'instagram' ? (
                <Instagram className="w-5 h-5 text-pink-500 shrink-0" />
              ) : (
                <Facebook className="w-5 h-5 text-blue-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-700">
                  {s.platform === 'instagram' ? 'Instagram' : 'Facebook'}
                  {s.platform === 'facebook' && s.group_count ? ` · ${s.group_count} grupo${s.group_count === 1 ? '' : 's'}` : ''}
                </p>
                <p className="text-[11px] text-gray-400">{formatDate(s.date)}</p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
            </a>
          ))}

          {waShares.map((s, i) => (
            <div
              key={`${s.platform}-${i}`}
              title="Se envió el aviso a este grupo"
              className={cn('flex items-center gap-3 p-3 rounded-xl border border-brand-accent bg-gray-50')}
            >
              <MessageCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-700 truncate">{s.group_name}</p>
                <p className="text-[11px] text-gray-400">{formatDate(s.date)}</p>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">Enviado</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}