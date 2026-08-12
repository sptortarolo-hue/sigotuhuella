import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Flag, CheckCircle2, XCircle, Trash2, EyeOff, ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';
import { formatDateTime } from '@/src/lib/formatDate';
import { REPORT_REASONS } from '@/src/components/ReportModal';

type ReportStatus = 'pending' | 'resolved' | 'dismissed';

interface Report {
  id: string;
  target_type: 'post' | 'comment' | 'pet';
  target_id: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  created_at: string;
  reporter_name: string | null;
  reporter_email: string | null;
  post_title: string | null;
  post_author_name: string | null;
  comment_content: string | null;
  comment_author_name: string | null;
  pet_name: string | null;
  pet_species: string | null;
  pet_location: string | null;
  pet_is_hidden: boolean | null;
}

const STATUS_TABS: { id: ReportStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'resolved', label: 'Resueltos' },
  { id: 'dismissed', label: 'Descartados' },
  { id: 'all', label: 'Todos' },
];

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map(r => [r.value, r.label]));

const TYPE_LABEL: Record<string, string> = {
  post: 'Publicación',
  comment: 'Comentario',
  pet: 'Aviso',
};

const SPECIES_EMOJI: Record<string, string> = { dog: '🐶', cat: '🐱', other: '🐾' };

function reportContent(report: Report): string {
  if (report.target_type === 'post') return report.post_title || '(post eliminado)';
  if (report.target_type === 'comment') return report.comment_content || '(comentario eliminado)';
  return `${report.pet_name || '(aviso eliminado)'}${report.pet_species ? ` · ${SPECIES_EMOJI[report.pet_species] || ''}` : ''}`;
}

function reportAuthor(report: Report): string {
  if (report.target_type === 'post') return report.post_author_name || '—';
  if (report.target_type === 'comment') return report.comment_author_name || '—';
  return '—';
}

function contentStillExists(report: Report): boolean {
  if (report.target_type === 'post') return !!report.post_title;
  if (report.target_type === 'comment') return !!report.comment_content;
  return !!report.pet_name;
}

export default function ModerationTab() {
  const [status, setStatus] = useState<ReportStatus | 'all'>('pending');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.moderation.list(status === 'all' ? undefined : status);
      setReports(data.reports || []);
    } catch (err: any) {
      setError(err.message || 'Error al obtener reportes');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  async function run(action: (id: string) => Promise<any>, report: Report) {
    try {
      setWorking(report.id);
      setError('');
      await action(report.id);
      await fetchReports();
    } catch (err: any) {
      setError(err.message || 'Error al actualizar reporte');
    } finally {
      setWorking(null);
    }
  }

  const pendingCount = reports.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-brand-primary">Moderación</h2>
          <p className="text-sm text-gray-500">Reportes de contenido generado por usuarios</p>
        </div>
        <button
          onClick={fetchReports}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setStatus(tab.id)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-bold transition-colors',
              status === tab.id ? 'bg-brand-primary text-white' : 'bg-white border border-brand-accent text-gray-500 hover:border-brand-primary/50'
            )}
          >
            {tab.label}
            {tab.id === 'pending' && pendingCount > 0 && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white rounded-[2.5rem] border border-brand-accent">
          <Flag className="w-10 h-10 mb-2" />
          <p className="text-sm">No hay reportes {status === 'pending' ? 'pendientes' : `en "${STATUS_TABS.find(t => t.id === status)?.label}"`}.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-accent bg-white">
          <table className="w-full text-left text-xs min-w-max">
            <thead>
              <tr className="bg-brand-bg border-b border-brand-accent">
                <th className="p-3 font-bold">Tipo</th>
                <th className="p-3 font-bold">Contenido</th>
                <th className="p-3 font-bold">Autor</th>
                <th className="p-3 font-bold">Motivo</th>
                <th className="p-3 font-bold">Denunciante</th>
                <th className="p-3 font-bold">Fecha</th>
                <th className="p-3 font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(report => (
                <tr key={report.id} className="border-b border-brand-accent/50 align-top">
                  <td className="p-3 whitespace-nowrap">
                    <span className={cn('text-[10px] px-2 py-1 rounded-full font-bold',
                      report.target_type === 'post' ? 'bg-blue-100 text-blue-700'
                        : report.target_type === 'comment' ? 'bg-purple-100 text-purple-700'
                        : 'bg-amber-100 text-amber-700')}>
                      {TYPE_LABEL[report.target_type]}
                    </span>
                  </td>
                  <td className="p-3 max-w-xs">
                    <p className="font-medium text-gray-800 break-words line-clamp-2">{reportContent(report)}</p>
                    {report.target_type === 'pet' && report.pet_location && (
                      <p className="text-gray-400 text-[10px] mt-0.5 truncate">{report.pet_location}</p>
                    )}
                    {report.description && (
                      <p className="text-gray-500 text-[10px] mt-1 italic">"{report.description}"</p>
                    )}
                    {report.target_type === 'pet' && report.pet_is_hidden && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold mt-1">
                        <EyeOff className="w-3 h-3" /> Oculto
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-gray-500 whitespace-nowrap">{reportAuthor(report)}</td>
                  <td className="p-3 text-gray-600">{REASON_LABEL[report.reason] || report.reason}</td>
                  <td className="p-3 text-gray-500 whitespace-nowrap">
                    {report.reporter_name || report.reporter_email || '—'}
                  </td>
                  <td className="p-3 text-gray-500 whitespace-nowrap">{formatDateTime(report.created_at)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {report.target_type === 'pet' && contentStillExists(report) && (
                        <Link to={`/pet/${report.target_id}`} target="_blank"
                          className="inline-flex items-center gap-1 text-brand-primary font-bold hover:underline">
                          <ExternalLink className="w-3.5 h-3.5" /> Ver
                        </Link>
                      )}
                      {report.status === 'pending' && (
                        <>
                          <button
                            onClick={() => run(id => api.moderation.hide(id), report)}
                            disabled={working === report.id}
                            title={report.target_type === 'pet' ? 'Ocultar el aviso' : 'Eliminar el contenido'}
                            className="inline-flex items-center gap-1 text-red-600 font-bold hover:underline disabled:opacity-50"
                          >
                            {report.target_type === 'pet' ? <EyeOff className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                            {report.target_type === 'pet' ? 'Ocultar' : 'Eliminar'}
                          </button>
                          <button
                            onClick={() => run(id => api.moderation.setStatus(id, 'resolved'), report)}
                            disabled={working === report.id}
                            className="inline-flex items-center gap-1 text-emerald-600 font-bold hover:underline disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Resolver
                          </button>
                          <button
                            onClick={() => run(id => api.moderation.setStatus(id, 'dismissed'), report)}
                            disabled={working === report.id}
                            className="inline-flex items-center gap-1 text-gray-500 font-bold hover:underline disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Descartar
                          </button>
                        </>
                      )}
                      {report.status !== 'pending' && (
                        <button
                          onClick={() => run(id => api.moderation.setStatus(id, 'pending'), report)}
                          disabled={working === report.id}
                          className="inline-flex items-center gap-1 text-gray-500 font-bold hover:underline disabled:opacity-50"
                        >
                          <Flag className="w-3.5 h-3.5" /> Reabrir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
