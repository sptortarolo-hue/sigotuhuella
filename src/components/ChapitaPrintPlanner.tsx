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

// Siguiente código después de `code` (misma lógica que el server)
function nextCode(code: string): string {
  const m = /^([A-Z]{3})-(\d{4})$/.exec(code.toUpperCase());
  if (!m) return code;
  let prefix = m[1];
  let num = parseInt(m[2], 10) + 1;
  if (num > 9999) {
    num = 1;
    const chars = prefix.split('');
    let i = chars.length - 1;
    while (i >= 0) {
      if (chars[i] < 'Z') { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); break; }
      chars[i] = 'A';
      i--;
    }
    prefix = chars.join('');
  }
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

// Avanza `offset` códigos desde `start` (para calcular el "hasta")
function advanceTo(start: string, offset: number): string {
  let code = start;
  for (let i = 0; i < offset; i++) code = nextCode(code);
  return code;
}

export default function ChapitaPrintPlanner({ className }: { className?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [logoOptions, setLogoOptions] = useState<LogoOption[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [desde, setDesde] = useState('');
  const [perPage, setPerPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [logoData, design, layout, last] = await Promise.all([
        api.qr.logoOptions(),
        api.qr.designSettings(),
        api.qr.layout('', ''),
        api.qr.lastCode(),
      ]);
      const options: LogoOption[] = Array.isArray(logoData?.options) ? logoData.options : [];
      setLogoOptions(options);
      setSettings(design);
      setPerPage(typeof layout?.PER_PAGE === 'number' ? layout.PER_PAGE : null);
      setLastCode(last?.code || null);
      const defaultLogo = options.find(o => o.isDefault)?.path ?? '';
      setDesde(prev => (prev || (last?.code ? nextCode(last.code) : 'AAA-0001')));
      setRows(prev => (prev.length > 0 ? prev : [rowFromSettings(design, Date.now(), defaultLogo)]));
    } catch {
      // si falla la carga, el panel sigue viéndose con las filas vacías
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => rows.reduce((acc, r) => acc + parseCount(r.count), 0), [rows]);
  const pages = perPage && total > 0 ? Math.ceil(total / perPage) : 0;
  const desdeValido = /^[A-Za-z]{3}-\d{4}$/.test(desde.trim());
  const hasta = desdeValido && total > 0 ? advanceTo(desde.trim().toUpperCase(), total - 1) : '—';

  // Mapeo de códigos por fila, en orden
  const ranges = useMemo(() => {
    let offset = 0;
    return rows.map(r => {
      const count = parseCount(r.count);
      const from = desdeValido ? advanceTo(desde.trim().toUpperCase(), offset) : null;
      offset += count;
      const to = count > 0 && desdeValido ? advanceTo(desde.trim().toUpperCase(), offset - 1) : null;
      return { count, from, to };
    });
  }, [rows, desde, desdeValido]);

  const addRow = () => {
    const defaultLogo = logoOptions.find(o => o.isDefault)?.path ?? '';
    setRows(prev => [...prev, rowFromSettings(settings, Date.now(), defaultLogo)]);
  };

  const removeRow = (id: number) => setRows(prev => prev.filter(r => r.id !== id));

  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const handleGenerate = async () => {
    if (total === 0) { alert('Indicá la cantidad en al menos una fila'); return; }
    if (!desdeValido) { alert('El código "desde" tiene formato inválido (esperado AAA-0001)'); return; }
    setGenerating(true);
    try {
      await api.qr.printPlan({
        desde: desde.trim().toUpperCase(),
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
        Armá una sola plancha con distintas combinaciones de logo y leyendas. Los números se crean al imprimir:
        arrancan en el <strong>Desde</strong> y el <strong>Hasta</strong> sale de la cantidad total. Cada chapita
        queda grabada con el diseño de su fila.
      </p>

      {/* ───── Rango a imprimir ───── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Desde</label>
          <input type="text" value={desde} onChange={e => setDesde(e.target.value.toUpperCase())}
            placeholder="AAA-0001"
            className={cn(
              'w-full mt-1 px-3 py-2.5 bg-brand-bg rounded-xl border text-xs font-mono font-bold text-brand-primary outline-none',
              desdeValido ? 'border-brand-accent' : 'border-red-300'
            )} />
          {lastCode && (
            <button type="button" onClick={() => setDesde(nextCode(lastCode))}
              className="mt-1 text-[10px] text-brand-primary hover:underline">
                Usar último + 1 ({nextCode(lastCode)})
            </button>
          )}
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Hasta</label>
          <p className="mt-1 px-3 py-2.5 bg-gray-50 rounded-xl border border-brand-accent text-xs font-mono font-bold text-gray-500">
            {hasta}
          </p>
        </div>
      </div>

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
          <span className="text-gray-500">
            Códigos: <strong className="font-mono">{desdeValido ? desde.trim().toUpperCase() : '—'} → {hasta}</strong>
          </span>
        </div>
        {!desdeValido && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            El "desde" debe tener formato AAA-0001.
          </p>
        )}
        <p className="text-[10px] text-gray-400">
          El logo y las leyendas quedan grabados en cada código: si reimprimís ese rango con el PDF de siempre,
          se respetan.
        </p>
      </div>

      <button type="button" onClick={handleGenerate} disabled={generating || total === 0 || !desdeValido}
        className="mt-4 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50">
        {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        Generar PDF
      </button>
    </div>
  );
}