import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, apiUrl } from '@/src/lib/api';
import { Plus, Trash2, Loader2, Printer, AlertCircle, Layers } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface LogoOption { path: string; name: string; url: string; isDefault: boolean; }

interface Row {
  id: number;
  logo_path: string;
  arc_text: string;
  bottom_text: string;
  count: string;
}

const EMPTY_COUNT = '';

// Diseño de una fila nueva: arranca con el diseño global actual
function rowFromSettings(settings: any, id: number, defaultLogo: string): Row {
  return {
    id,
    logo_path: settings?.logo_path || defaultLogo,
    arc_text: settings?.arc_text ?? '',
    bottom_text: settings?.bottom_text ?? '',
    count: EMPTY_COUNT,
  };
}

function parseCount(value: string): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function ChapitaPrintPlanner({ className }: { className?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [logoOptions, setLogoOptions] = useState<LogoOption[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [availableCodes, setAvailableCodes] = useState<string[]>([]);
  const [perPage, setPerPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [logoData, design, layout, unassigned] = await Promise.all([
        api.qr.logoOptions(),
        api.qr.designSettings(),
        api.qr.layout('', ''),
        api.qr.unassigned(),
      ]);
      const options: LogoOption[] = Array.isArray(logoData?.options) ? logoData.options : [];
      setLogoOptions(options);
      setSettings(design);
      setPerPage(typeof layout?.PER_PAGE === 'number' ? layout.PER_PAGE : null);
      const codes: string[] = (unassigned?.identifiers || []).map((q: any) => q.code).sort();
      setAvailableCodes(codes);
      const defaultLogo = options.find(o => o.isDefault)?.path ?? '';
      setRows(prev => (prev.length > 0 ? prev : [rowFromSettings(design, Date.now(), defaultLogo)]));
    } catch {
      // si falla la carga, el panel sigue viéndose con las filas vacías
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => rows.reduce((acc, r) => acc + parseCount(r.count), 0), [rows]);
  const pages = perPage && total > 0 ? Math.ceil(total / perPage) : 0;
  const shortfall = Math.max(0, total - availableCodes.length);

  // Mapeo de códigos por fila (el server los toma en este mismo orden)
  const ranges = useMemo(() => {
    let offset = 0;
    return rows.map(r => {
      const count = parseCount(r.count);
      const from = availableCodes[offset];
      const to = availableCodes[Math.min(offset + Math.max(count, 1) - 1, availableCodes.length - 1)];
      offset += count;
      return { count, from, to };
    });
  }, [rows, availableCodes]);

  const addRow = () => {
    const defaultLogo = logoOptions.find(o => o.isDefault)?.path ?? '';
    setRows(prev => [...prev, rowFromSettings(settings, Date.now(), defaultLogo)]);
  };

  const removeRow = (id: number) => setRows(prev => prev.filter(r => r.id !== id));

  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const handleGenerate = async () => {
    if (total === 0) { alert('Indicá la cantidad en al menos una fila'); return; }
    if (shortfall > 0) {
      alert(`Pediste ${total} chapitas y hay ${availableCodes.length} sin asignar`);
      return;
    }
    setGenerating(true);
    try {
      await api.qr.printPlan({
        segments: rows.map(r => ({
          logo_path: r.logo_path || null,
          arc_text: r.arc_text,
          bottom_text: r.bottom_text,
          count: parseCount(r.count),
        })),
      });
      await load();
    } catch (e: any) { alert(e.message || 'Error al generar el plan'); }
    setGenerating(false);
  };

  if (loading) {
    return (
      <div className={cn('bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8', className)}>
        <div className="flex items-center gap-2 text-gray-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando planificador...
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8', className)}>
      <h3 className="text-lg font-bold text-brand-primary mb-1 flex items-center gap-2">
        <Layers className="w-5 h-5" /> Impresión combinada
      </h3>
      <p className="text-xs text-gray-400 mb-6">
        Armá una sola plancha con distintas combinaciones de logo y leyendas. Se toman los próximos códigos
        sin asignar, en orden, y el diseño queda grabado en cada chapita.
      </p>

      <div className="space-y-4">
        {rows.map((row, index) => {
          const range = ranges[index];
          const selected = logoOptions.find(o => o.path === row.logo_path);
          return (
            <div key={row.id} className="p-4 bg-brand-bg rounded-2xl space-y-3">
              <div className="flex items-start gap-3">
                {/* Logo */}
                <div className="flex-1 min-w-0 space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Logo</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={row.logo_path}
                      onChange={e => updateRow(row.id, { logo_path: e.target.value })}
                      className="flex-1 min-w-0 px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs font-medium outline-none"
                    >
                      {!logoOptions.some(o => o.path === row.logo_path) && (
                        <option value={row.logo_path}>{row.logo_path || 'Predeterminado'}</option>
                      )}
                      {logoOptions.map(opt => (
                        <option key={opt.path} value={opt.path}>
                          {opt.isDefault ? 'Predeterminado' : opt.name}
                        </option>
                      ))}
                    </select>
                    {selected?.url && (
                      <img src={apiUrl(selected.url)} alt={selected.name}
                        className="w-9 h-9 object-contain rounded-lg bg-white border border-brand-accent shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                    )}
                  </div>

                  {/* Leyendas */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Texto arco</label>
                      <input type="text" value={row.arc_text} placeholder="(vacío = sin texto)"
                        onChange={e => updateRow(row.id, { arc_text: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Texto inferior</label>
                      <input type="text" value={row.bottom_text} placeholder="(vacío = sin texto)"
                        onChange={e => updateRow(row.id, { bottom_text: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs outline-none" />
                    </div>
                  </div>
                </div>

                {/* Cantidad */}
                <div className="w-24 shrink-0 space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Cantidad</label>
                  <input type="number" min={1} value={row.count} placeholder="0"
                    onChange={e => updateRow(row.id, { count: e.target.value })}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs font-mono font-bold text-brand-primary outline-none" />
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(row.id)} title="Quitar fila"
                      className="w-full p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {range.count > 0 && range.from && (
                <p className="text-[10px] text-gray-400 font-mono">
                  {range.from === range.to ? range.from : `${range.from} → ${range.to}`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={addRow}
        className="mt-4 px-4 py-2 bg-brand-primary/10 text-brand-primary rounded-xl font-bold text-xs hover:bg-brand-primary/20 transition-colors flex items-center gap-1">
        <Plus className="w-3 h-3" /> Agregar otra combinación
      </button>

      {/* Resumen */}
      <div className="mt-6 p-4 bg-brand-bg rounded-2xl space-y-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-gray-500">Total: <strong className="text-brand-primary font-mono">{total}</strong> chapitas</span>
          {pages > 0 && <span className="text-gray-500">{pages} {pages === 1 ? 'página' : 'páginas'}</span>}
          <span className="text-gray-500">Disponibles: <strong className="font-mono">{availableCodes.length}</strong></span>
        </div>
        {shortfall > 0 && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            Faltan {shortfall} chapitas sin asignar para cubrir el plan.
          </p>
        )}
        <p className="text-[10px] text-gray-400">
          El logo y las leyendas quedan grabados en cada código: si reimprimís ese rango con el PDF de siempre,
          se respetan.
        </p>
      </div>

      <button type="button" onClick={handleGenerate} disabled={generating || total === 0 || shortfall > 0}
        className="mt-4 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50">
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        Generar PDF
      </button>
    </div>
  );
}