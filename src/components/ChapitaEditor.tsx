import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, apiUrl } from '@/src/lib/api';
import { Save, RotateCcw, Loader2, FileText, Upload, Check } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const TAG_PX = 437;
const HALF = TAG_PX / 2;

const DEFAULTS = {
  qr_size_mm: 23, qr_color: '#000000', qr_bg: '#ffffff',
  code_font_size: 35, code_color: '#000000',
  arc_font_size: 37, arc_color: '#000000', arc_radius: 0.38, arc_start_deg: 200, arc_end_deg: 340,
  bottom_font_size: 35, bottom_color: '#000000',
  logo_scale: 0.55, logo_fade: 8,
  // '' = logo clásico. Si tiene valor, ruta relativa dentro de public/
  logo_path: '',
  // Leyendas: si se vacían, no se dibujan (queda solo el logo)
  arc_text: 'SI ME VES PERDIDO',
  bottom_text: 'ESCANEÁ EL QR',
};

interface LogoOption { path: string; name: string; url: string; isDefault: boolean; }

type Settings = typeof DEFAULTS;

interface Props { className?: string; }

function arcText(text: string, cx: number, cy: number, r: number, startDeg: number, endDeg: number, fontSize: number, color: string) {
  const sr = (startDeg * Math.PI) / 180;
  const er = (endDeg * Math.PI) / 180;
  let span = er - sr;
  if (span < 0) span += 2 * Math.PI;
  const arcLen = r * span * 0.85;
  let fs = fontSize;
  if (text.length * fs * 0.6 > arcLen) fs = Math.round(fontSize * arcLen / (text.length * fs * 0.6));
  const arcUsed = span * 0.85;
  const arcStart = sr + (span - arcUsed) / 2;
  return text.split('').map((ch, i) => {
    const ratio = (i + 0.5) / text.length;
    const a = arcStart + ratio * arcUsed;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const rot = Math.atan2(r * Math.cos(a), -r * Math.sin(a)) * 180 / Math.PI;
    return { ch, x: +x.toFixed(1), y: +y.toFixed(1), rot: +rot.toFixed(1) };
  });
}

function qrModules(svgStr: string) {
  const match = svgStr.match(/d="([^"]+)"/);
  if (!match) return null;
  return match[1];
}

export default function ChapitaEditor({ className }: Props) {
  const [s, setS] = useState<Settings>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [qrSvgInner, setQrSvgInner] = useState('');
  const [logoOptions, setLogoOptions] = useState<LogoOption[]>([]);
  const [logoOptionsLoading, setLogoOptionsLoading] = useState(true);
  const [logoUploading, setLogoUploading] = useState(false);
  // Preview del logo elegido (hasta que se guarde, se ve el del servidor)
  const [logoOverride, setLogoOverride] = useState<string | null>(null);

  const loadLogoOptions = useCallback(async () => {
    setLogoOptionsLoading(true);
    try {
      const data = await api.qr.logoOptions();
      setLogoOptions(Array.isArray(data?.options) ? data.options : []);
    } catch { /* silencioso: el editor sigue funcionando */ }
    setLogoOptionsLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.qr.designSettings();
        setS(prev => ({ ...prev, ...data }));
      } catch {}
      setLoading(false);
      loadLogoOptions();
    })();
  }, [loadLogoOptions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(api.qr.previewLogoUrl(), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        if (!cancelled) setLogoUrl(URL.createObjectURL(blob));
      } catch { if (!cancelled) setLogoUrl(''); }
    })();
    return () => { cancelled = true; };
  }, [s]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const svg = await fetch('https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=AA-0001&format=svg&color=000000&bgcolor=ffffff').then(r => r.text());
        if (!cancelled) {
          const inner = svg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '');
          setQrSvgInner(inner);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const update = useCallback((key: keyof Settings, val: string) => {
    setS(prev => ({ ...prev, [key]: typeof DEFAULTS[key] === 'number' ? (Number(val) || DEFAULTS[key]) : val }));
    setSaved(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await api.qr.saveDesignSettings(s as any);
      setS(data);
      setSaved(true);
      setLogoOverride(null);
      loadLogoOptions();
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(api.qr.previewLogoUrl() + '&t=' + Date.now(), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) { const b = await res.blob(); setLogoUrl(URL.createObjectURL(b)); }
      } catch {}
    } catch (e: any) { alert(e.message || 'Error al guardar'); }
    setSaving(false);
  };

  const handleReset = () => { setS({ ...DEFAULTS }); setLogoOverride(null); setSaved(false); };

  const handleSelectLogo = (opt: LogoOption) => {
    update('logo_path', opt.path);
    setLogoOverride(apiUrl(opt.url));
  };

  const handleUploadLogo = async (file: File) => {
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch(api.qr.uploadLogoUrl(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Error al subir el logo'); return; }
      await loadLogoOptions();
      // La URL devuelta arranca con /uploads/...; guardamos la ruta sin la barra
      handleSelectLogo({ path: data.url.replace(/^\//, ''), name: file.name, url: data.url, isDefault: false });
    } catch { alert('Error al subir el logo'); }
    setLogoUploading(false);
  };

  const handlePreviewPdf = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(apiUrl('/api/qr/preview-pdf'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) { const err = await res.json(); alert(err.error || 'Error al descargar PDF'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chapita-preview.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert('Error al descargar PDF'); }
  };

  const qrSizePx = useMemo(() => Math.round(s.qr_size_mm * 300 / 25.4), [s.qr_size_mm]);
  const qrX = useMemo(() => Math.round((TAG_PX - qrSizePx) / 2), [qrSizePx]);
  const codeY = useMemo(() => Math.round(TAG_PX * 0.95), []);
  const arcR = useMemo(() => Math.round(TAG_PX * s.arc_radius), [s.arc_radius]);
  const logoSz = useMemo(() => Math.round(TAG_PX * s.logo_scale), [s.logo_scale]);
  const logoX = useMemo(() => Math.round((TAG_PX - logoSz) / 2), [logoSz]);
  const logoY = useMemo(() => Math.round(HALF - logoSz / 2 + TAG_PX * 0.03), [logoSz]);
  const bottomY = Math.round(TAG_PX * 0.93);
  const arcChars = useMemo(
    () => ((s.arc_text || '').trim()
      ? arcText(s.arc_text, HALF, HALF, arcR, s.arc_start_deg, s.arc_end_deg, s.arc_font_size, s.arc_color)
      : []),
    [arcR, s.arc_text, s.arc_start_deg, s.arc_end_deg, s.arc_font_size, s.arc_color],
  );
  const bottomText = (s.bottom_text || '').trim();
  const previewLogo = logoOverride || logoUrl;

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>;

  const Input = ({ label, k, unit, min, max, step, color, text }: { label: string; k: keyof Settings; unit?: string; min?: number; max?: number; step?: number; color?: boolean; text?: boolean }) => (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-gray-500 w-36 shrink-0">{label}</label>
      {color ? (
        <div className="flex items-center gap-2">
          <input type="color" value={String(s[k])} onChange={e => update(k, e.target.value)}
            className="w-8 h-8 rounded border border-brand-accent cursor-pointer" />
          <input type="text" value={String(s[k])} onChange={e => update(k, e.target.value)}
            className="w-20 px-2 py-1 rounded-lg border border-brand-accent text-xs font-mono" />
        </div>
      ) : text ? (
        <input type="text" value={String(s[k])} onChange={e => update(k, e.target.value)}
          placeholder="(vacío = sin texto)"
          className="flex-1 min-w-0 px-3 py-1 rounded-lg border border-brand-accent text-xs" />
      ) : (
        <input type="number" value={String(s[k])} min={min} max={max} step={step || 1}
          onChange={e => update(k, e.target.value)}
          className="w-20 px-2 py-1 rounded-lg border border-brand-accent text-xs font-mono" />
      )}
      {unit && <span className="text-[10px] text-gray-400">{unit}</span>}
    </div>
  );

  return (
    <div className={cn('bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8', className)}>
      <h3 className="text-lg font-bold text-brand-primary mb-6">Diseño de Chapitas QR</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form */}
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Cara QR</h4>
            <div className="space-y-2">
              <Input label="Tamaño QR" k="qr_size_mm" unit="mm" min={10} max={37} />
              <Input label="Color módulos" k="qr_color" color />
              <Input label="Color fondo" k="qr_bg" color />
              <Input label="Tamaño texto código" k="code_font_size" unit="px" min={10} max={60} />
              <Input label="Color texto código" k="code_color" color />
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Cara Logo</h4>
            <div className="space-y-4">
              {/* ───── Selector de logo ───── */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-brand-primary">Logo impreso</span>
                  <label className={cn(
                    'shrink-0 px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-lg font-bold text-[10px] flex items-center gap-1 transition-colors',
                    logoUploading ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:bg-brand-primary/20',
                  )}>
                    {logoUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    {logoUploading ? 'Subiendo...' : 'Subir logo'}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                      disabled={logoUploading}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) handleUploadLogo(file);
                      }} />
                  </label>
                </div>

                {logoOptionsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-4">
                    <Loader2 className="w-3 h-3 animate-spin" /> Cargando logos...
                  </div>
                ) : logoOptions.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3">No se encontraron logos. Subí uno para empezar.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {logoOptions.map(opt => {
                      const active = (s.logo_path || '') === opt.path;
                      return (
                        <button key={opt.path} type="button" onClick={() => handleSelectLogo(opt)} title={opt.name}
                          className={cn(
                            'relative border-2 rounded-xl p-1.5 bg-white transition-all text-left',
                            active ? 'border-brand-primary ring-2 ring-brand-primary/20' : 'border-brand-accent hover:border-brand-primary/50',
                          )}>
                          <img src={apiUrl(opt.url)} alt={opt.name}
                            className="w-full aspect-square object-contain rounded-lg"
                            onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15'; }} />
                          <span className="block mt-1 text-[9px] text-gray-500 truncate">
                            {opt.isDefault ? 'Predeterminado' : opt.name}
                          </span>
                          {active && (
                            <span className="absolute top-1 right-1 w-4 h-4 bg-brand-primary text-white rounded-full flex items-center justify-center">
                              <Check className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-2">
                  Elegí el logo de la cara posterior. Podés subir logos de sponsors nuevos sin perder los anteriores.
                </p>
              </div>

              <div className="space-y-2">
                <Input label="Texto arco" k="arc_text" text />
                <Input label="Texto inferior" k="bottom_text" text />
                <p className="text-[10px] text-gray-400 pl-38">Dejar vacío = no se imprime (queda solo el logo).</p>
                <Input label="Color arco" k="arc_color" color />
                <Input label="Radio arco" k="arc_radius" min={0.1} max={0.6} step={0.01} />
                <Input label="Arco inicio" k="arc_start_deg" unit="°" min={0} max={360} />
                <Input label="Arco fin" k="arc_end_deg" unit="°" min={0} max={360} />
                <Input label="Tamaño bottom" k="bottom_font_size" unit="px" min={10} max={60} />
                <Input label="Color bottom" k="bottom_color" color />
                <Input label="Escala logo" k="logo_scale" min={0.2} max={0.9} step={0.01} />
              </div>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saved ? 'Guardado ✓' : 'Guardar'}
            </button>
            <button onClick={handlePreviewPdf}
              className="px-5 py-2.5 bg-brand-primary/10 text-brand-primary rounded-xl font-bold text-sm hover:bg-brand-primary/20 transition-all flex items-center gap-2">
              <FileText className="w-4 h-4" /> PDF preview A4
            </button>
            <button onClick={handleReset}
              className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Restablecer
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Preview en vivo</p>
          <div className="flex gap-4 flex-wrap justify-center">
            {/* QR Side */}
            <div className="text-center">
              <p className="text-[10px] text-gray-400 mb-1">Cara QR</p>
              <div className="border border-brand-accent rounded-xl overflow-hidden" style={{ width: 218, height: 218 }}>
                <svg viewBox={`0 0 ${TAG_PX} ${TAG_PX}`} width="218" height="218" xmlns="http://www.w3.org/2000/svg">
                  <rect width={TAG_PX} height={TAG_PX} fill={s.qr_bg} />
                  {qrSvgInner && (
                    <g transform={`translate(${qrX}, ${qrX}) scale(${qrSizePx / 200}, ${qrSizePx / 200})`}>
                      <g dangerouslySetInnerHTML={{ __html: qrSvgInner }} />
                    </g>
                  )}
                  <text x={HALF} y={codeY} textAnchor="middle" fontFamily="monospace" fontSize={s.code_font_size} fontWeight="bold" fill={s.code_color}>AAA-0001</text>
                </svg>
              </div>
            </div>
            {/* Logo Side */}
            <div className="text-center">
              <p className="text-[10px] text-gray-400 mb-1">Cara Logo</p>
              <div className="border border-brand-accent rounded-xl overflow-hidden" style={{ width: 218, height: 218 }}>
                <svg viewBox={`0 0 ${TAG_PX} ${TAG_PX}`} width="218" height="218" xmlns="http://www.w3.org/2000/svg">
                  <rect width={TAG_PX} height={TAG_PX} fill="transparent" />
                  {arcChars.map((c, i) => (
                    <text key={i} x={c.x} y={c.y} transform={`rotate(${c.rot},${c.x},${c.y})`}
                      textAnchor="middle" dominantBaseline="central"
                      fontFamily="sans-serif" fontSize={s.arc_font_size} fontWeight="bold" fill={s.arc_color}>
                      {c.ch}
                    </text>
                  ))}
                  {previewLogo && <image href={previewLogo} x={logoX} y={logoY} width={logoSz} height={logoSz} />}
                  {bottomText && (
                    <text x={HALF} y={bottomY} textAnchor="middle" fontFamily="sans-serif" fontSize={s.bottom_font_size} fontWeight="bold" fill={s.bottom_color}>{bottomText}</text>
                  )}
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
