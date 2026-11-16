import { useState, useEffect } from 'react';
import { api } from '@/src/lib/api';
import { motion, AnimatePresence } from 'motion/react';
import { formatDate, formatDateTime } from '@/src/lib/formatDate';
import { cn } from '@/src/lib/utils';
import {
  Sparkles, Save, Loader2, FileText, QrCode, RefreshCw, Trash2, Bell, Send, X,
  Download, AlertCircle, Check, ExternalLink, Palette, Printer, ClipboardCheck, Megaphone, ShieldAlert,
} from 'lucide-react';
import ChapitaEditor from '@/src/components/ChapitaEditor';
import ChapitaPrintPlanner from '@/src/components/ChapitaPrintPlanner';

type Section = 'diseno' | 'stock' | 'gestion' | 'difusion';

interface Props {
  /** Abre la ficha de una mascota (vive en la solapa Mascotas) */
  onOpenMyPet?: (myPetId: string, switchTab?: boolean) => void;
  /** Avisa al menú lateral cuántas reposiciones hay pendientes */
  onReplacementsChange?: (count: number) => void;
}

// ─── Herramienta de chapitas QR: diseño · stock · gestión · difusión ───
export default function ChapitasTab({ onOpenMyPet, onReplacementsChange }: Props) {
  // ── Estado: stock y códigos ──
  const [qrUnassigned, setQrUnassigned] = useState<any[]>([]);
  const [qrRequests, setQrRequests] = useState<any[]>([]);
  const [qrAssigned, setQrAssigned] = useState<any[]>([]);
  const [qrAssignedPage, setQrAssignedPage] = useState(1);
  const [qrAssignedPages, setQrAssignedPages] = useState(1);
  const [qrAssignedTotal, setQrAssignedTotal] = useState(0);
  const [qrNotifyingId, setQrNotifyingId] = useState<string | null>(null);
  const [qrBatchCount, setQrBatchCount] = useState(12);
  const [qrBatchLoading, setQrBatchLoading] = useState(false);
  const [qrAssignLoading, setQrAssignLoading] = useState<string | null>(null);

  // ── Estado: reasignación ──
  const [reassignModal, setReassignModal] = useState<any | null>(null);
  const [reassignPets, setReassignPets] = useState<any[]>([]);
  const [reassignPetId, setReassignPetId] = useState('');
  const [reassignTyped, setReassignTyped] = useState('');
  const [reassignStep, setReassignStep] = useState<'select' | 'confirm'>('select');
  const [reassignLoading, setReassignLoading] = useState(false);

  // ── Estado: reposiciones ──
  const [qrReplacements, setQrReplacements] = useState<any[]>([]);
  const [replaceLoading, setReplaceLoading] = useState<string | null>(null);

  // ── Estado: reactivación ──
  const [reactivateToken, setReactivateToken] = useState('');
  const [reactivateCode, setReactivateCode] = useState('');
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [reactivateResult, setReactivateResult] = useState<any>(null);

  // ── Estado: solicitudes ──
  const [whatsappChapitaRequests, setWhatsappChapitaRequests] = useState<any[]>([]);
  const [chapitaSourceFilter, setChapitaSourceFilter] = useState<'all' | 'web' | 'whatsapp'>('all');
  const [chapitaStatusFilter, setChapitaStatusFilter] = useState<string>('all');
  const [chapitaStatusLoading, setChapitaStatusLoading] = useState<number | null>(null);
  const [notifyModal, setNotifyModal] = useState<{ id: number; waFrom: string; requesterName: string; petName: string } | null>(null);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifyLoading, setNotifyLoading] = useState(false);

  // ── Estado: plantilla PDF y lote ──
  const [pdfPageWidth, setPdfPageWidth] = useState('570');
  const [pdfPageHeight, setPdfPageHeight] = useState('300');
  const [pdfConfigSaving, setPdfConfigSaving] = useState(false);
  const [pdfLastCode, setPdfLastCode] = useState<string | null>(null);
  const [pdfRange, setPdfRange] = useState<Record<string, { from: string; to: string }>>({});
  const [settingsLoading, setSettingsLoading] = useState(false);

  // ── Estado: banner del inicio ──
  const [bannerChapitaVisible, setBannerChapitaVisible] = useState(true);
  const [bannerChapitaPrice, setBannerChapitaPrice] = useState('');
  const [bannerChapitaIsFree, setBannerChapitaIsFree] = useState(true);

  // ── Estado: zona de riesgo ──
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupTyped, setCleanupTyped] = useState('');

  const [section, setSection] = useState<Section>('diseno');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.settings.list();
        const map: Record<string, string> = {};
        data.forEach((s: any) => { map[s.key] = s.value; });
        if (map.banner_chapita_visible !== undefined) setBannerChapitaVisible(map.banner_chapita_visible !== 'false');
        if (map.banner_chapita_price !== undefined) setBannerChapitaPrice(map.banner_chapita_price);
        if (map.banner_chapita_is_free !== undefined) setBannerChapitaIsFree(map.banner_chapita_is_free === 'true');
        if (map.pdf_page_width !== undefined) setPdfPageWidth(map.pdf_page_width);
        if (map.pdf_page_height !== undefined) setPdfPageHeight(map.pdf_page_height);
      } catch (e) { console.error(e); }
      await Promise.all([fetchQrData(), fetchLastCode()]);
    })();
  }, []);

  useEffect(() => { onReplacementsChange?.(qrReplacements.length); }, [qrReplacements.length]);

  const fetchQrData = async (page?: number) => {
    try {
      const p = page || qrAssignedPage;
      const [unassigned, requests, replacements, assigned, waChapita] = await Promise.all([
        api.qr.unassigned(),
        api.qr.requests(),
        api.qr.replacementRequests().catch(() => ({ requests: [] })),
        api.qr.assigned(p, 50),
        api.whatsapp.chapitaRequests().catch(() => []),
      ]);
      setQrUnassigned(unassigned.identifiers || []);
      setQrRequests(requests.requests || []);
      setQrReplacements((replacements as any).requests || []);
      setQrAssigned(assigned.assigned || []);
      setQrAssignedTotal(assigned.total || 0);
      setQrAssignedPages(assigned.pages || 1);
      setQrAssignedPage(assigned.page || 1);
      setWhatsappChapitaRequests(waChapita || []);
    } catch (e) { console.error(e); }
  };

  const fetchLastCode = async () => {
    try { const data: any = await api.qr.lastCode(); setPdfLastCode(data.code); } catch (e) { console.error(e); }
  };

  const handleQrBatch = async () => {
    try {
      setQrBatchLoading(true);
      await api.qr.batch(qrBatchCount);
      await fetchQrData();
      await fetchLastCode();
    } catch (e: any) { alert(e.message || 'Error al generar QRs'); }
    finally { setQrBatchLoading(false); }
  };

  const handleQrAssign = async (qrId: string, myPetId: string) => {
    try {
      setQrAssignLoading(myPetId);
      await api.qr.assign(qrId, myPetId);
      await fetchQrData();
    } catch (e: any) { alert(e.message || 'Error al asignar QR'); }
    finally { setQrAssignLoading(null); }
  };

  const handleQrReplace = async (newQrId: string, myPetId: string) => {
    try {
      setReplaceLoading(myPetId);
      const result: any = await api.qr.replace(myPetId, newQrId);
      await fetchQrData();
      alert(`Chapita repuesta: ${result.old_code} -> ${result.new_code}. La anterior quedo dada de baja.`);
    } catch (e: any) { alert(e.message || 'Error al reponer chapita'); }
    finally { setReplaceLoading(null); }
  };

  const handleSinglePdf = async (qrId: string, code: string) => {
    try { await api.qr.singlePdf(qrId, code); }
    catch (e: any) { alert(e.message || 'Error al descargar PDF'); }
  };

  const handleQrPdf = async (batchId: string) => {
    try {
      const range = pdfRange[batchId];
      await api.qr.batchPdf(batchId, {
        from: range?.from || undefined,
        to: range?.to || undefined,
        page_w: pdfPageWidth,
        page_h: pdfPageHeight,
      });
    } catch (e: any) { alert(e.message || 'Error al descargar PDF'); }
  };

  const handleNotifyAssigned = async (qrId: string) => {
    try {
      setQrNotifyingId(qrId);
      await api.qr.notifyAssigned(qrId);
      await fetchQrData(qrAssignedPage);
    } catch (e: any) { alert(e.message || 'Error al notificar'); }
    finally { setQrNotifyingId(null); }
  };

  const handleOpenReassign = async (qr: any) => {
    try {
      const data: any = await api.qr.petsAvailable();
      setReassignPets(data.pets || []);
      setReassignModal(qr);
      setReassignPetId('');
      setReassignTyped('');
      setReassignStep('select');
    } catch (e: any) { alert(e.message || 'Error al cargar mascotas disponibles'); }
  };

  const handleReassign = async () => {
    if (!reassignModal || !reassignPetId) return;
    if (reassignTyped !== 'REASIGNAR') return;
    try {
      setReassignLoading(true);
      await api.qr.reassign(reassignModal.id, reassignPetId);
      setReassignModal(null);
      await fetchQrData(qrAssignedPage);
    } catch (e: any) { alert(e.message || 'Error al reasignar QR'); }
    finally { setReassignLoading(false); }
  };

  const closeReassign = () => {
    setReassignModal(null); setReassignPetId(''); setReassignTyped('');
    setReassignStep('select'); setReassignLoading(false);
  };

  const handleChapitaStatusChange = async (id: number, status: string) => {
    try {
      setChapitaStatusLoading(id);
      await api.whatsapp.chapitaUpdate(id, { status });
      await fetchQrData();
    } catch (e: any) { alert(e.message || 'Error al actualizar estado'); }
    finally { setChapitaStatusLoading(null); }
  };

  const handleChapitaNotify = async () => {
    if (!notifyModal || !notifyMessage.trim()) return;
    try {
      setNotifyLoading(true);
      await api.whatsapp.chapitaNotify(notifyModal.id, notifyMessage.trim());
      await fetchQrData();
      setNotifyModal(null); setNotifyMessage('');
    } catch (e: any) { alert(e.message || 'Error al enviar notificación'); }
    finally { setNotifyLoading(false); }
  };

  const handleQrCleanup = async () => {
    if (cleanupTyped.trim().toUpperCase() !== 'LIMPIAR') return;
    try {
      await api.qr.cleanup();
      setCleanupOpen(false); setCleanupTyped('');
      await fetchQrData();
      await fetchLastCode();
      alert('Chapitas sin asignar eliminadas.');
    } catch (e: any) { alert(e.message || 'Error al limpiar QRs'); }
  };

  function nextPrefix(prefix: string): string {
    const chars = prefix.split('');
    let i = chars.length - 1;
    while (i >= 0) {
      if (chars[i] < 'Z') { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); return chars.join(''); }
      chars[i] = 'A'; i--;
    }
    return chars.join('');
  }

  function getNextCode(code: string | null, offset: number): string | null {
    if (!code) return offset === 1 ? 'AAA-0001' : null;
    const parts = code.split('-');
    let prefix = parts[0];
    let num = parseInt(parts[1], 10) + offset;
    while (num > 9999) { num -= 10000; prefix = nextPrefix(prefix); }
    while (num < 1) { num += 10000; prefix = nextPrefix(prefix); }
    return `${prefix}-${String(Math.abs(num)).padStart(4, '0')}`;
  }


﻿  const SECTIONS = [
    { id: 'diseno' as Section, label: 'Diseño', icon: Palette, hint: 'Logo, leyendas y plantilla' },
    { id: 'stock' as Section, label: 'Stock', icon: Printer, hint: 'Crear e imprimir' },
    { id: 'gestion' as Section, label: 'Gestión', icon: ClipboardCheck, hint: 'Asignar y avisar' },
    { id: 'difusion' as Section, label: 'Difusión', icon: Megaphone, hint: 'Banner de inicio' },
  ];

  const solicitudesPendientes = qrRequests.length + whatsappChapitaRequests.length;
  const sinImprimir = qrUnassigned.filter((q: any) => !q.printed_at).length;
  const impresasLibres = qrUnassigned.length - sinImprimir;

  const CHIPS = [
    { label: 'Sin imprimir', value: sinImprimir, color: sinImprimir > 0 ? 'text-brand-primary' : 'text-gray-600', go: 'stock' as Section },
    { label: 'Impresas libres', value: impresasLibres, color: 'text-gray-600', go: 'stock' as Section },
    { label: 'Asignadas', value: qrAssignedTotal, color: 'text-gray-600', go: 'gestion' as Section },
    { label: 'Solicitudes', value: solicitudesPendientes, color: solicitudesPendientes > 0 ? 'text-amber-600' : 'text-gray-600', go: 'gestion' as Section },
    { label: 'Reposiciones', value: qrReplacements.length, color: qrReplacements.length > 0 ? 'text-amber-600' : 'text-gray-600', go: 'gestion' as Section },
  ];

  return (
    <div className="space-y-6">
      {/* ─── Resumen y navegación ─── */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4">
          {CHIPS.map(chip => (
            <button key={chip.label} type="button" onClick={() => setSection(chip.go)}
              className="flex items-baseline gap-2 hover:opacity-70 transition-opacity" title={`Ir a ${chip.label}`}>
              <span className={cn('text-2xl font-bold', chip.color)}>{chip.value}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{chip.label}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map(s => (
            <button key={s.id} type="button" onClick={() => setSection(s.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all',
                section === s.id ? 'bg-brand-primary text-white shadow-lg' : 'bg-brand-bg text-gray-500 hover:text-brand-primary'
              )}>
              <s.icon className="w-4 h-4 shrink-0" />
              {s.label}
              <span className={cn('hidden sm:inline text-[10px] font-medium', section === s.id ? 'opacity-70' : 'text-gray-400')}>{s.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════ ① DISEÑO ═══════════ */}
      {section === 'diseno' && (
        <div className="space-y-6">

    {/* ───── Chapita Design Editor ───── */}
    <ChapitaEditor />

    {/* ───── PDF Config ───── */}
    <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
      <h3 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
        <FileText className="w-5 h-5" /> Configuración de Plantilla PDF
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Ancho (mm)</label>
          <input type="number" min={50} max={2000} value={pdfPageWidth}
            onChange={e => setPdfPageWidth(e.target.value)}
            className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Alto (mm)</label>
          <input type="number" min={50} max={2000} value={pdfPageHeight}
            onChange={e => setPdfPageHeight(e.target.value)}
            className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => { setPdfPageWidth('210'); setPdfPageHeight('297'); }}
          className="px-3 py-1.5 bg-brand-bg text-brand-primary rounded-lg text-xs font-medium hover:bg-brand-accent/30 transition-colors">
          A4 (210×297mm)
        </button>
        <button onClick={() => { setPdfPageWidth('570'); setPdfPageHeight('300'); }}
          className="px-3 py-1.5 bg-brand-bg text-brand-primary rounded-lg text-xs font-medium hover:bg-brand-accent/30 transition-colors">
          570×300mm
        </button>
        <button onClick={() => { setPdfPageWidth('210'); setPdfPageHeight('297'); }}
          className="px-3 py-1.5 bg-brand-bg text-brand-primary rounded-lg text-xs font-medium hover:bg-brand-accent/30 transition-colors">
          Personalizado
        </button>
      </div>
      {(() => {
        const pw = parseInt(pdfPageWidth) || 0;
        const ph = parseInt(pdfPageHeight) || 0;
        const pp = Math.max(0, Math.floor((pw + 1) / 75));
        const rp = Math.max(0, Math.floor((ph + 1) / 38));
        const tp = pp * rp;
        return (
          <p className="text-sm text-brand-primary font-bold mb-4">
            {pp > 0 && rp > 0
              ? `📐 ${pp} pares × ${rp} filas = ${tp} chapitas/hoja`
              : '⚠️ Dimensiones muy chicas, no entra ninguna chapita'}
          </p>
        );
      })()}
      <button onClick={async () => {
        setPdfConfigSaving(true);
        try {
          await Promise.all([
            api.settings.update('pdf_page_width', pdfPageWidth),
            api.settings.update('pdf_page_height', pdfPageHeight),
          ]);
          alert('Configuración de PDF guardada');
        } catch (e) { alert('Error al guardar'); }
        setPdfConfigSaving(false);
      }} disabled={pdfConfigSaving}
        className="px-6 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
        {pdfConfigSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Guardar configuración
      </button>    </div>

        </div>
      )}
{/* 2 STOCK */}
{section === 'stock' && (
        <div className="space-y-6">

    <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
      <h3 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
        <QrCode className="w-5 h-5" /> Generar lote de QRs
      </h3>
      <div className="text-xs text-gray-400 mb-3">
        Último código: <span className="font-mono font-bold text-brand-primary">{pdfLastCode || '—'}</span>
        <button onClick={fetchLastCode} className="ml-2 inline-flex items-center gap-1 text-brand-primary hover:underline">
          <RefreshCw className="w-3 h-3" /> actualizar
        </button>
      </div>
      <div className="flex items-end gap-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Cantidad</label>
          <input
            type="number" min={1} max={500} value={qrBatchCount}
            onChange={e => setQrBatchCount(parseInt(e.target.value) || 12)}
            className="w-24 mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
          />
        </div>
        <button
          onClick={handleQrBatch}
          disabled={qrBatchLoading}
          className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {qrBatchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
           Generar
        </button>
      </div>
      {pdfLastCode && qrBatchCount > 0 && (() => {
        const from = getNextCode(pdfLastCode, 1);
        const to = getNextCode(pdfLastCode, qrBatchCount);
        return from && to ? (
          <p className="text-xs text-gray-500 mt-2">
            Se generarán: <span className="font-mono font-bold text-brand-primary">{from}</span>
            {' → '}
            <span className="font-mono font-bold text-brand-primary">{to}</span>
            {' '}({qrBatchCount} códigos)
          </p>
        ) : null;
      })()}
    </div>

    {qrUnassigned.length > 0 && (
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h3 className="text-lg font-bold text-brand-primary mb-2">Códigos libres ({qrUnassigned.length})</h3>
        {qrUnassigned.some((q: any) => q.agrupacion_id) && (
          <p className="text-xs text-violet-600 mb-4">
            {qrUnassigned.filter((q: any) => q.agrupacion_id).length} chapitas reservadas para agrupaciones (en violeta) — las gestiona su coordinador desde el tab Chapitas Agrup.
          </p>
        )}
        <div className="flex flex-col gap-4 mb-4">
          {[...new Set<string>(qrUnassigned.map((q: any) => q.batch_id))].map((batchId: string) => {
            const batchCodes = qrUnassigned.filter((q: any) => q.batch_id === batchId).map((q: any) => q.code).sort();
            const minCode = batchCodes[0] || '';
            const maxCode = batchCodes[batchCodes.length - 1] || '';
            const range = pdfRange[batchId] || { from: '', to: '' };
            return (
              <div key={batchId} className="p-4 bg-brand-bg rounded-2xl">
                <div className="text-xs text-gray-400 mb-2">
                  Batch <span className="font-mono font-bold text-brand-primary">{batchId?.replace('batch-', '')}</span>
                  {' — '}{batchCodes.length} QRs
                  {minCode && maxCode ? (
                    <span className="font-mono"> ({minCode} → {maxCode})</span>
                  ) : null}
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Desde</label>
                    <input type="text" value={range.from ?? minCode}
                      onChange={e => setPdfRange(prev => ({ ...prev, [batchId]: { ...prev[batchId], from: e.target.value } }))}
                      className="w-24 px-2 py-1.5 bg-white rounded-lg border border-brand-accent text-xs font-mono font-bold text-brand-primary outline-none"
                      placeholder={minCode}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Hasta</label>
                    <input type="text" value={range.to ?? maxCode}
                      onChange={e => setPdfRange(prev => ({ ...prev, [batchId]: { ...prev[batchId], to: e.target.value } }))}
                      className="w-24 px-2 py-1.5 bg-white rounded-lg border border-brand-accent text-xs font-mono font-bold text-brand-primary outline-none"
                      placeholder={maxCode}
                    />
                  </div>
                  <button onClick={() => handleQrPdf(batchId)}
                    className="px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-brand-primary/20 transition-colors">
                    <Download className="w-3 h-3" /> PDF
                  </button>
                  <button onClick={() => setPdfRange(prev => ({ ...prev, [batchId]: { from: minCode, to: maxCode } }))}
                    className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-xs font-medium hover:bg-gray-200 transition-colors">
                    Restablecer rango
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {qrUnassigned.slice(0, 48).map((qr: any) => (
            <div key={qr.id} title={qr.agrupacion_name ? `Reservada: ${qr.agrupacion_name}` : 'Pool general'}
              className={cn('p-2 rounded-xl text-center', qr.agrupacion_id ? 'bg-violet-50 border border-violet-300' : 'bg-brand-bg')}>
              <p className="text-xs font-mono font-bold text-brand-primary">{qr.code}</p>
              {qr.agrupacion_name && <p className="text-[9px] text-violet-600 truncate">{qr.agrupacion_name}</p>}
            </div>
          ))}
          {qrUnassigned.length > 48 && (
            <div className="p-2 bg-brand-bg rounded-xl text-center flex items-center justify-center">
              <p className="text-xs text-gray-400">+{qrUnassigned.length - 48}</p>
            </div>
          )}
        </div>
      </div>
    )}

    {/* ───── Impresión combinada: varios logos en una misma plancha ───── */}
    <ChapitaPrintPlanner />


    {qrRequests.length === 0 && qrUnassigned.length === 0 && qrAssigned.length === 0 && whatsappChapitaRequests.length === 0 && (
      <div className="bg-white rounded-[2.5rem] border border-dashed border-brand-accent p-6 sm:p-8 text-center">
        <QrCode className="w-12 h-12 text-brand-accent mx-auto mb-3" />
        <p className="text-gray-400">Todavia no generaste chapitas ni hay solicitudes.</p>
        <p className="text-xs text-gray-400 mt-1">Usa Generar lote para crear los primeros codigos.</p>
      </div>
    )}

    {/* Zona de riesgo */}
    <div className="bg-white rounded-[2.5rem] border-2 border-red-200 p-6 sm:p-8">
      <h3 className="text-sm font-bold uppercase tracking-widest text-red-500 mb-1 flex items-center gap-2">
        <ShieldAlert className="w-4 h-4" /> Zona de riesgo
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Borra <strong>todas</strong> las chapitas que todavia no tienen mascota asignada.
        Las que ya estan asignadas no se tocan y los codigos borrados no se pueden recuperar.
      </p>
      {qrUnassigned.length === 0 ? (
        <p className="text-xs text-gray-400">No hay chapitas sin asignar para borrar.</p>
      ) : cleanupOpen ? (
        <div className="space-y-3 max-w-sm">
          <label className="text-xs font-bold text-gray-500">
            Escribi <span className="text-red-600 font-mono">LIMPIAR</span> para confirmar
          </label>
          <input type="text" value={cleanupTyped} onChange={e => setCleanupTyped(e.target.value)}
            placeholder="LIMPIAR" className="w-full px-4 py-3 rounded-xl border border-red-200 outline-none text-sm font-mono" />
          <div className="flex gap-2">
            <button onClick={() => { setCleanupOpen(false); setCleanupTyped(''); }}
              className="flex-1 px-4 py-2.5 border border-brand-accent rounded-xl font-bold text-xs text-gray-600 hover:bg-brand-bg transition-all">Cancelar</button>
            <button onClick={handleQrCleanup} disabled={cleanupTyped.trim().toUpperCase() !== 'LIMPIAR'}
              className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl font-bold text-xs hover:shadow-lg transition-all disabled:opacity-50">
              Si, borrar {qrUnassigned.length} chapitas
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCleanupOpen(true)}
          className="px-6 py-3 bg-red-50 text-red-600 rounded-xl font-bold text-sm hover:bg-red-100 transition-all flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Limpiar no asignados ({qrUnassigned.length})
        </button>
      )}
    </div>

        </div>
      )}
{/* 3 GESTION */}
{section === 'gestion' && (
        <div className="space-y-6">


    {/* Unified Solicitudes section */}
    <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <h3 className="text-lg font-bold text-brand-primary">Solicitudes</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-brand-bg rounded-xl p-0.5">
            {(['all', 'web', 'whatsapp'] as const).map(src => (
              <button key={src}
                onClick={() => setChapitaSourceFilter(src)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  chapitaSourceFilter === src
                    ? 'bg-white text-brand-primary shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {src === 'all' ? 'Todos' : src === 'web' ? 'Web' : 'WhatsApp'}
              </button>
            ))}
          </div>
          <select
            value={chapitaStatusFilter}
            onChange={e => setChapitaStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-white rounded-xl border border-brand-accent text-xs outline-none"
          >
            <option value="all">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En progreso</option>
            <option value="ready">Listo</option>
            <option value="notified">Notificado</option>
            <option value="delivered">Entregado</option>
          </select>
        </div>
      </div>

      {(() => {
        // Map web requests
        const webItems = qrRequests.map((r: any) => ({
          id: r.id,
          type: 'web' as const,
          requester: r.display_name || '—',
          contact: r.email || '',
          petName: r.name,
          petSpecies: r.species,
          petBreed: r.breed,
          date: r.updated_at,
          status: 'pending',
          myPetId: r.id,
          registrationPending: r.registration_pending,
        }));

        // Map whatsapp requests
        const waItems = whatsappChapitaRequests.map((r: any) => ({
          id: r.id,
          type: 'whatsapp' as const,
          requester: r.requester_name || '—',
          contact: r.wa_from || '',
          petName: r.pet_name,
          petSpecies: r.species,
          petBreed: '',
          date: r.created_at,
          status: r.status || 'pending',
          waFrom: r.wa_from,
        }));

        let allItems = [...webItems, ...waItems];

        // Apply source filter
        if (chapitaSourceFilter === 'web') allItems = allItems.filter(i => i.type === 'web');
        else if (chapitaSourceFilter === 'whatsapp') allItems = allItems.filter(i => i.type === 'whatsapp');

        // Apply status filter
        if (chapitaStatusFilter !== 'all') allItems = allItems.filter(i => i.status === chapitaStatusFilter);

        // Sort by date desc
        allItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const speciesIcon = (s: string) => s === 'dog' ? '🐕' : s === 'cat' ? '🐈' : '🐾';

        if (allItems.length === 0) {
          return (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">No hay solicitudes pendientes.</p>
            </div>
          );
        }

        return (
          <div className="space-y-3">
            {allItems.map((item: any) => (
              <div key={`${item.type}-${item.id}`} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-brand-bg rounded-2xl">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800">
                    {item.petName} {speciesIcon(item.petSpecies)}
                    <span className="font-normal text-gray-400 text-xs ml-1">
                      ({item.petSpecies === 'dog' ? 'Perro' : item.petSpecies === 'cat' ? 'Gato' : item.petSpecies}{item.petBreed ? ` · ${item.petBreed}` : ''})
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">
                    {item.requester} {item.contact ? `· ${item.contact}` : ''}
                    <span className={`ml-2 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      item.type === 'web' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                    }`}>
                      {item.type === 'web' ? 'Web' : 'WA'}
                    </span>
                    <span className="ml-2 text-gray-300">{formatDate(item.date)}</span>
                  </p>
                </div>

                {item.type === 'web' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      onChange={async (e) => {
                        if (e.target.value) await handleQrAssign(e.target.value, item.myPetId);
                      }}
                      disabled={qrAssignLoading === item.myPetId || item.registrationPending}
                      className="px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      defaultValue=""
                      title={item.registrationPending ? 'El dueño no completó el registro' : 'Asignar código QR'}
                    >
                      <option value="" disabled>{item.registrationPending ? 'Registro pendiente' : 'Asignar QR...'}</option>
                      {qrUnassigned.filter((qr: any) => !qr.agrupacion_id).map((qr: any) => (
                        <option key={qr.id} value={qr.id}>{qr.code}</option>
                      ))}
                    </select>
                    {item.registrationPending && <span className="text-[10px] text-amber-600 max-w-[120px]">Pendiente de registro</span>}
                    {qrAssignLoading === item.myPetId && <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={item.status}
                      onChange={async (e) => {
                        await handleChapitaStatusChange(item.id, e.target.value);
                      }}
                      disabled={chapitaStatusLoading === item.id}
                      className="px-3 py-2 bg-white rounded-xl border border-brand-accent text-xs outline-none"
                    >
                      <option value="pending">Pendiente</option>
                      <option value="in_progress">En progreso</option>
                      <option value="ready">Listo</option>
                      <option value="notified">Notificado</option>
                      <option value="delivered">Entregado</option>
                    </select>
                    {chapitaStatusLoading === item.id && <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />}
                    <button
                      onClick={() => setNotifyModal({ id: item.id, waFrom: item.waFrom, requesterName: item.requester, petName: item.petName })}
                      className="px-3 py-2 bg-brand-primary/10 text-brand-primary rounded-xl text-xs font-medium flex items-center gap-1 hover:bg-brand-primary/20 transition-colors"
                    >
                      <Bell className="w-3.5 h-3.5" /> Notificar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}    </div>


    {/* Notify Modal */}
    <div className="bg-white rounded-[2.5rem] border border-amber-300 p-6 sm:p-8">
      <h3 className="text-lg font-bold text-brand-primary mb-1">Reposiciones solicitadas ({qrReplacements.length})</h3>
      <p className="text-xs text-gray-400 mb-4">
        Pérdida o deterioro. Al reponer, la chapita anterior queda dada de baja y deja de funcionar.
        Si te la piden por WhatsApp, teléfono o presencial (sin solicitud en la app), abrí la mascota en la solapa Mascotas y usá “Reponer chapita”.
      </p>
      {qrReplacements.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">Sin reposiciones pendientes.</p>
      ) : (
      <div className="space-y-3">
        {qrReplacements.map((r: any) => (
          <div key={r.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-amber-50/50 rounded-2xl border border-amber-100">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-800">
                <button onClick={() => onOpenMyPet?.(r.id, true)} className="hover:text-brand-primary hover:underline text-left" title="Abrir ficha de la mascota">
                  {r.name}
                </button>
                <span className="font-normal text-gray-400 text-xs ml-1">
                  ({r.species === 'dog' ? 'Perro' : r.species === 'cat' ? 'Gato' : r.species}{r.breed ? ` · ${r.breed}` : ''})
                </span>
                  <span className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${r.qr_replacement_reason === 'deteriorada' ? 'bg-orange-100 text-orange-700' : 'bg-red-50 text-red-600'}`}>
                    {r.qr_replacement_reason === 'deteriorada' ? 'Deterioro' : 'Pérdida'}
                  </span>
                </p>
                <p className="text-xs text-gray-400">
                  {r.display_name || '—'}{r.email ? ` · ${r.email}` : ''}
                  {r.current_code ? <span className="font-mono ml-2">actual: {r.current_code}</span> : null}
                  <span className="ml-2 text-gray-300">{r.qr_replacement_requested_at ? formatDate(r.qr_replacement_requested_at) : ''}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  onChange={async (e) => {
                    if (e.target.value && window.confirm(`Reponer chapita de ${r.name} (${r.current_code || 'sin código'}) con el código seleccionado? La anterior quedará dada de baja.`)) {
                      await handleQrReplace(e.target.value, r.id);
                    }
                    e.target.value = '';
                  }}
                  disabled={replaceLoading === r.id}
                  className="px-3 py-2 bg-white rounded-xl border border-amber-300 text-xs outline-none disabled:opacity-50"
                  defaultValue=""
                  title="Asignar chapita nueva del pool y dar de baja la anterior"
                >
                  <option value="" disabled>Reponer con…</option>
                  {qrUnassigned.filter((qr: any) => !qr.agrupacion_id).map((qr: any) => (
                    <option key={qr.id} value={qr.id}>{qr.code}</option>
                  ))}
                </select>
                {replaceLoading === r.id && <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />}
              </div>
            </div>
          ))}
        </div>
      )}    </div>


    {/* Notify Modal */}
    <AnimatePresence>
      {notifyModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setNotifyModal(null)}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-xl"
          >
            <button onClick={() => { setNotifyModal(null); setNotifyMessage(''); }}
              className="absolute top-4 right-4 p-1 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
            <h3 className="text-lg font-bold text-brand-primary mb-1">Notificar a {notifyModal.requesterName}</h3>
            <p className="text-sm text-gray-400 mb-4">Chapita de <strong>{notifyModal.petName}</strong> — WA: {notifyModal.waFrom}</p>
            <textarea
              value={notifyMessage}
              onChange={e => setNotifyMessage(e.target.value)}
              placeholder="Escribí el mensaje de notificación…"
              rows={4}
              className="w-full px-4 py-3 bg-brand-bg rounded-2xl border border-brand-accent text-sm outline-none resize-none mb-4"
            />
            <div className="flex items-center gap-3 justify-end">
              <button onClick={() => { setNotifyModal(null); setNotifyMessage(''); }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                Cancelar
              </button>
              <button onClick={handleChapitaNotify} disabled={notifyLoading || !notifyMessage.trim()}
                className="px-5 py-2 bg-brand-primary text-white rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-brand-primary/90 transition-colors disabled:opacity-50">
                {notifyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar
              </button>
            </div>
          </motion.div>
        </div>
      )}    </AnimatePresence>


    {qrAssigned.length > 0 && (
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h3 className="text-lg font-bold text-brand-primary mb-4">QRs asignados ({qrAssignedTotal})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-max">
            <thead>
              <tr className="border-b border-brand-accent">
                <th className="pb-2 font-bold text-gray-500 text-xs uppercase tracking-widest">Código</th>
                <th className="pb-2 font-bold text-gray-500 text-xs uppercase tracking-widest">Mascota</th>
                <th className="pb-2 font-bold text-gray-500 text-xs uppercase tracking-widest">Dueño</th>
                <th className="pb-2 font-bold text-gray-500 text-xs uppercase tracking-widest hidden sm:table-cell">Asignado</th>
                <th className="pb-2 font-bold text-gray-500 text-xs uppercase tracking-widest">Notificación</th>
              </tr>
            </thead>
            <tbody>
              {qrAssigned.map((item: any) => (
                <tr key={item.code} className="border-b border-brand-accent/50 hover:bg-brand-bg/50 transition-colors">
                  <td className="py-3 pr-4 font-mono text-brand-primary font-bold text-xs">
                    <a href={`/mascota/${item.share_token}?silent=1`} target="_blank" rel="noopener noreferrer"
                      className="hover:text-brand-secondary hover:underline transition-colors"
                      title="Ver perfil público (sin notificar al dueño)"
                    >
                      {item.code}
                    </a>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="font-medium text-gray-800">{item.pet_name}</span>
                    <span className="text-gray-400 text-xs ml-1">
                      ({item.species === 'dog' ? 'Perro' : item.species === 'cat' ? 'Gato' : 'Otro'}{item.breed ? ` · ${item.breed}` : ''})
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <p className="text-gray-800">{item.owner_name}</p>
                    <p className="text-xs text-gray-400">{item.owner_email}</p>
                  </td>
                  <td className="py-3 text-xs text-gray-400 hidden sm:table-cell">
                    {item.assigned_at ? formatDate(item.assigned_at) : '-'}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {item.notification_status === 'sent' ? (
                        <span className="text-xs text-green-600 font-medium whitespace-nowrap">
                          ✅ {item.notified_at ? formatDateTime(item.notified_at) : ''}
                          {item.notification_channel ? <span className="text-gray-500"> · {item.notification_channel === 'both' ? 'WhatsApp + Email' : item.notification_channel === 'whatsapp' ? 'WhatsApp' : 'Email'}</span> : null}
                        </span>
                      ) : item.notification_status === 'failed' ? (
                        <span className="text-xs text-red-500 font-medium">❌ Fallida</span>
                      ) : (
                        <span className="text-xs text-amber-500 font-medium">⏳ Pendiente</span>
                      )}
                      <button
                        onClick={() => handleNotifyAssigned(item.id)}
                        disabled={qrNotifyingId === item.id}
                        className="px-3 py-1 text-xs font-bold rounded-full border border-brand-accent hover:bg-brand-primary hover:text-white transition-all disabled:opacity-40"
                        title="Enviar notificación"
                      >
                        {qrNotifyingId === item.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Notificar'
                        )}
                      </button>
                      <button
                        onClick={() => handleSinglePdf(item.id, item.code)}
                        className="px-3 py-1 text-xs font-bold rounded-full border border-brand-accent hover:bg-brand-primary hover:text-white transition-all"
                        title="Descargar chapita en formato de impresión"
                      >
                        PDF
                      </button>
                      <button
                        onClick={() => handleOpenReassign(item)}
                        className="px-3 py-1 text-xs font-bold rounded-full border border-amber-300 text-amber-700 hover:bg-amber-500 hover:text-white transition-all"
                        title="Reasignar a otra mascota"
                      >
                        Reasignar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AnimatePresence>
          {reassignModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeReassign}
                className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-6 sm:p-8"
              >
                <button onClick={closeReassign} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>

                <h3 className="text-lg font-bold text-brand-primary mb-1">Reasignar QR {reassignModal.code}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Actualmente asignado a <strong>{reassignModal.pet_name}</strong> ({reassignModal.owner_name}). Vas a pasarlo a otra mascota.
                </p>

                {reassignStep === 'select' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2">Mascota destino (sin QR)</label>
                      <select
                        value={reassignPetId}
                        onChange={e => setReassignPetId(e.target.value)}
                        className="w-full px-4 py-3 border border-brand-accent rounded-xl text-sm outline-none focus:border-brand-primary transition-colors bg-white"
                      >
                        <option value="" disabled>Seleccionar mascota...</option>
                        {reassignPets.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name || 'Sin nombre'} ({p.species === 'dog' ? 'Perro' : p.species === 'cat' ? 'Gato' : 'Otro'}{p.breed ? ` · ${p.breed}` : ''}) — {p.owner_name}
                          </option>
                        ))}
                        {reassignPets.length === 0 && (
                          <option value="" disabled>No hay mascotas sin QR</option>
                        )}
                      </select>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={closeReassign}
                        className="flex-1 px-4 py-3 border border-brand-accent rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => setReassignStep('confirm')}
                        disabled={!reassignPetId}
                        className="flex-1 px-4 py-3 bg-amber-500 text-white rounded-xl text-sm font-bold transition-all hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Continuar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">
                      La chapita <strong>{reassignModal.code}</strong> pasará de <strong>{reassignModal.pet_name}</strong> a la mascota seleccionada. La notificación al nuevo dueño queda pendiente.
                    </p>
                    <p className="text-xs text-gray-400 font-medium">
                      Escribí <span className="font-bold text-amber-600">REASIGNAR</span> para confirmar:
                    </p>
                    <input
                      type="text"
                      value={reassignTyped}
                      onChange={e => setReassignTyped(e.target.value)}
                      placeholder="REASIGNAR"
                      autoFocus
                      className="w-full px-4 py-3 border border-brand-accent rounded-xl text-sm outline-none focus:border-amber-500 transition-colors text-center font-bold"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={closeReassign}
                        className="flex-1 px-4 py-3 border border-brand-accent rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        No
                      </button>
                      <button
                        onClick={handleReassign}
                        disabled={reassignTyped !== 'REASIGNAR' || reassignLoading}
                        className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl text-sm font-bold transition-all hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {reassignLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'REASIGNAR'}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        {qrAssignedPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => fetchQrData(qrAssignedPage - 1)}
              disabled={qrAssignedPage <= 1}
              className="px-4 py-2 text-sm font-bold rounded-lg border border-brand-accent hover:bg-brand-bg transition-all disabled:opacity-30"
            >
              ← Anterior
            </button>
            <span className="text-sm text-gray-500">
              Página {qrAssignedPage} de {qrAssignedPages}
            </span>
            <button
              onClick={() => fetchQrData(qrAssignedPage + 1)}
              disabled={qrAssignedPage >= qrAssignedPages}
              className="px-4 py-2 text-sm font-bold rounded-lg border border-brand-accent hover:bg-brand-bg transition-all disabled:opacity-30"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>    )}


    {/* Reactivar QR */}
    <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
        <QrCode className="w-4 h-4" /> Reactivar QR impreso
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Escaneá el QR impreso con tu celular, copiá el link y pegalo acá para reactivarlo.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 mb-2">
        <input value={reactivateToken} onChange={e => { setReactivateToken(e.target.value); setReactivateResult(null); }}
          className="flex-1 px-4 py-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm"
          placeholder="https://sigotuhuella.com.ar/mascota/... o solo el token"
        />
        <input value={reactivateCode} onChange={e => { setReactivateCode(e.target.value.toUpperCase()); setReactivateResult(null); }}
          className="sm:w-40 px-4 py-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm font-mono"
          placeholder="AAA-0001 (opcional)"
        />
        <button onClick={async () => {
          if (!reactivateToken) return;
          try {
            setReactivateLoading(true);
            setReactivateResult(null);
            const r = await api.qr.reactivate(reactivateToken, reactivateCode || undefined);
            setReactivateResult(r);
          } catch (e: any) {
            setReactivateResult({ error: e.message || 'Error al reactivar' });
          } finally {
            setReactivateLoading(false);
          }
        }}
          disabled={reactivateLoading || !reactivateToken}
          className="px-5 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
        >
          {reactivateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
          Reactivar QR
        </button>
      </div>
      {reactivateResult && (
        <div className={`p-4 rounded-2xl text-sm ${reactivateResult.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {reactivateResult.error ? (
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {reactivateResult.error}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>
                  {reactivateResult.already_active ? 'Ya estaba activo' : 'Reactivado'} —{' '}
                  <strong className="font-bold">{reactivateResult.code}</strong>
                  {reactivateResult.assigned && (
                    <span className="ml-2 text-xs opacity-75">(asignado a {reactivateResult.pet_name})</span>
                  )}
                </span>
              </div>
              <a href={reactivateResult.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 bg-white/50 rounded-lg text-xs font-bold hover:bg-white/80 transition-colors shrink-0">
                Abrir <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}  </div>

        </div>
      )}
{/* 4 DIFUSION */}
{section === 'difusion' && (
        <div className="space-y-6">

    {/* Banner settings */}
    <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 mb-6">
      <h3 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5" /> Chappita identificadora — Banner en inicio
      </h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Mostrar banner</span>
          <button
            onClick={() => setBannerChapitaVisible(!bannerChapitaVisible)}
            className={cn("w-12 h-7 rounded-full transition-colors relative", bannerChapitaVisible ? "bg-brand-primary" : "bg-gray-300")}
          >
            <div className={cn("w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm", bannerChapitaVisible ? "left-[26px]" : "left-1")} />
          </button>
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Precio</label>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">$</span>
            <input type="number" min={0} value={bannerChapitaPrice}
              onChange={e => setBannerChapitaPrice(e.target.value)}
              className="w-24 p-2.5 rounded-xl border border-brand-accent outline-none text-sm" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={bannerChapitaIsFree}
            onChange={e => setBannerChapitaIsFree(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300" />
          Mostrar como "Gratis"
        </label>
        <div className="p-3 bg-brand-bg rounded-xl text-xs text-gray-500">
          Vista previa: {bannerChapitaVisible ? 'Visible' : 'Oculto'} —
          {bannerChapitaIsFree && parseInt(bannerChapitaPrice) > 0
            ? <> <s>${bannerChapitaPrice}</s> <span className="text-brand-secondary font-bold">Gratis</span></>
            : bannerChapitaIsFree && parseInt(bannerChapitaPrice) === 0
            ? ' Gratis'
            : ` $${bannerChapitaPrice} — El dinero recaudado se destina a asistir a las mascotas del barrio.`}
        </div>
        <button
          onClick={async () => {
            setSettingsLoading(true);
            try {
              await Promise.all([
                api.settings.update('banner_chapita_visible', String(bannerChapitaVisible)),
                api.settings.update('banner_chapita_price', bannerChapitaPrice),
                api.settings.update('banner_chapita_is_free', String(bannerChapitaIsFree)),
              ]);
              alert('Configuración guardada');
            } catch (e) {
              alert('Error al guardar');
            }
            setSettingsLoading(false);
          }}
          disabled={settingsLoading}
          className="px-6 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {settingsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar
        </button>
      </div>  </div>

        </div>
      )}
    </div>
  );
}
