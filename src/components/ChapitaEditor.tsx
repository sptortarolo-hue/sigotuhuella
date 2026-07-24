import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/src/lib/api';
import { Save, RotateCcw, Loader2, FileText } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const TAG_PX = 437;
const HALF = TAG_PX / 2;

const DEFAULTS = {
  qr_size_mm: 23, qr_color: '#000000', qr_bg: '#ffffff',
  code_font_size: 35, code_color: '#000000',
  arc_font_size: 37, arc_color: '#000000', arc_radius: 0.38, arc_start_deg: 200, arc_end_deg: 340,
  bottom_font_size: 35, bottom_color: '#000000',
  logo_scale: 0.55, logo_fade: 8,
};

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

  useEffect(() => {
    (async () => {
      try {
        const data = await api.qr.designSettings();
        setS(prev => ({ ...prev, ...data }));
      } catch {}
      setLoading(false);
    })();
  }, []);

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

  const handleReset = () => { setS({ ...DEFAULTS }); setSaved(false); };

  const handlePreviewPdf = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/qr/preview-pdf', {
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
  const arcChars = useMemo(() => arcText('SI ME VES PERDIDO', HALF, HALF, arcR, s.arc_start_deg, s.arc_end_deg, s.arc_font_size, s.arc_color), [arcR, s.arc_start_deg, s.arc_end_deg, s.arc_font_size, s.arc_color]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>;

  const Input = ({ label, k, unit, min, max, step, color }: { label: string; k: keyof Settings; unit?: string; min?: number; max?: number; step?: number; color?: boolean }) => (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-gray-500 w-36 shrink-0">{label}</label>
      {color ? (
        <div className="flex items-center gap-2">
          <input type="color" value={String(s[k])} onChange={e => update(k, e.target.value)}
            className="w-8 h-8 rounded border border-brand-accent cursor-pointer" />
          <input type="text" value={String(s[k])} onChange={e => update(k, e.target.value)}
            className="w-20 px-2 py-1 rounded-lg border border-brand-accent text-xs font-mono" />
        </div>
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
            <div className="space-y-2">
              <Input label="Texto arco" k="arc_font_size" unit="px" min={10} max={60} />
              <Input label="Color arco" k="arc_color" color />
              <Input label="Radio arco" k="arc_radius" min={0.1} max={0.6} step={0.01} />
              <Input label="Arco inicio" k="arc_start_deg" unit="°" min={0} max={360} />
              <Input label="Arco fin" k="arc_end_deg" unit="°" min={0} max={360} />
              <Input label="Tamaño bottom" k="bottom_font_size" unit="px" min={10} max={60} />
              <Input label="Color bottom" k="bottom_color" color />
              <Input label="Escala logo" k="logo_scale" min={0.2} max={0.9} step={0.01} />
              <Input label="Fade logo" k="logo_fade" min={1} max={20} />
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
                  {logoUrl && <image href={logoUrl} x={logoX} y={logoY} width={logoSz} height={logoSz} />}
                  <text x={HALF} y={bottomY} textAnchor="middle" fontFamily="sans-serif" fontSize={s.bottom_font_size} fontWeight="bold" fill={s.bottom_color}>ESCANEÁ EL QR</text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
