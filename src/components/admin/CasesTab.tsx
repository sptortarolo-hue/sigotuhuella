import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, RefreshCw, FolderOpen, ExternalLink, PawPrint, Lock, CheckCircle2 } from 'lucide-react';
import { api } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: 'active', label: 'Activos' },
  { id: 'closed', label: 'Cerrados' },
  { id: 'all', label: 'Todos' },
];

const STATUS_LABELS: Record<string, string> = {
  active: 'En búsqueda',
  closed: 'Cerrado',
  pause: 'Pausado',
};

const TYPE_LABELS: Record<string, string> = {
  lost: 'Perdida',
  found: 'Encontrada',
};

const SOURCE_LABELS: Record<string, string> = {
  app_auth: 'App (user)',
  app_anon: 'App (anónimo)',
  whatsapp_bot: 'WhatsApp Bot',
};

export default function CasesTab() {
  const [filter, setFilter] = useState<string>('active');
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.cases.listAll(filter === 'all' ? undefined : filter);
      setCases(data.cases || []);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error al obtener casos');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  async function run(action: () => Promise<any>, id: string) {
    try {
      setWorking(id);
      await action();
      await fetchCases();
    } catch (err: any) {
      alert(err.message || 'Error al actualizar caso');
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-brand-primary">Casos</h2>
          <p className="text-sm text-gray-500">Trazabilidad de reportes de mascotas perdidas y encontradas</p>
        </div>
        <button
          onClick={fetchCases}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-bold transition-colors',
              filter === tab.id ? 'bg-brand-primary text-white' : 'bg-white border border-brand-accent text-gray-500 hover:border-brand-primary/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>
      ) : cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white rounded-[2.5rem] border border-brand-accent">
          <FolderOpen className="w-10 h-10 mb-2" />
          <p className="text-sm">No hay casos {filter !== 'all' ? `en estado "${STATUS_LABELS[filter]}"` : 'registrados'}.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-accent bg-white">
          <table className="w-full text-left text-xs min-w-max">
            <thead>
              <tr className="bg-brand-bg border-b border-brand-accent">
                <th className="p-3 font-bold">Estado</th>
                <th className="p-3 font-bold">Mascota</th>
                <th className="p-3 font-bold">Tipo</th>
                <th className="p-3 font-bold">Origen</th>
                <th className="p-3 font-bold">Reporter</th>
                <th className="p-3 font-bold">Eventos</th>
                <th className="p-3 font-bold">Fecha</th>
                <th className="p-3 font-bold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id} className="border-b border-brand-accent/50">
                  <td className="p-3">
                    <span className={cn('text-[10px] px-2 py-1 rounded-full font-bold',
                      c.status === 'active' ? 'bg-brand-primary/10 text-brand-primary'
                        : c.status === 'closed' ? 'bg-gray-100 text-gray-500'
                        : 'bg-amber-100 text-amber-700')}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-brand-bg flex items-center justify-center shrink-0">
                        <PawPrint className="w-4 h-4 text-brand-primary/60" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 whitespace-nowrap">{c.pet_name || 'Sin identificar'}</p>
                        <p className="text-[10px] text-gray-400">{c.pet_species} · {c.pet_status}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-gray-600 whitespace-nowrap">{TYPE_LABELS[c.type] || c.type}</td>
                  <td className="p-3 text-gray-500 whitespace-nowrap">{SOURCE_LABELS[c.reporter_source] || c.reporter_source}</td>
                  <td className="p-3 text-gray-500 whitespace-nowrap">{c.reporter_name || '—'}</td>
                  <td className="p-3 text-gray-500">{c.event_count}</td>
                  <td className="p-3 text-gray-500 whitespace-nowrap">{new Date(c.created_at).toLocaleDateString('es-AR')}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/pet/${c.pet_id}`} target="_blank"
                        className="inline-flex items-center gap-1 text-brand-primary font-bold hover:underline">
                        <ExternalLink className="w-3.5 h-3.5" /> Ver
                      </Link>
                      {c.status !== 'closed' && (
                        <button
                          onClick={() => run(async () => { await api.cases.updateStatus(c.id, 'closed'); }, c.id)}
                          disabled={working === c.id}
                          className="inline-flex items-center gap-1 text-emerald-600 font-bold hover:underline disabled:opacity-50"
                        >
                          <Lock className="w-3.5 h-3.5" /> Cerrar
                        </button>
                      )}
                      {c.status === 'closed' && (
                        <button
                          onClick={() => run(async () => { await api.cases.updateStatus(c.id, 'active'); }, c.id)}
                          disabled={working === c.id}
                          className="inline-flex items-center gap-1 text-gray-500 font-bold hover:underline disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Reabrir
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