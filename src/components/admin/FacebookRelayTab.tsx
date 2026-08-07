import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Smartphone, Loader2, RefreshCw, Upload, X, CheckCircle, XCircle, Clock,
  AlertCircle, Bug, Heart, Globe, Megaphone,
  Save, Trash2, MessageSquare, Users, Sliders, Upload as UploadIcon, LayoutGrid,
  Check, ExternalLink, ImageIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { api } from '@/src/lib/api';
import { formatDateTime } from '@/src/lib/formatDate';

interface FbRelayStatus {
  enabled: boolean;
  hasSession: boolean;
  hasProfile: boolean;
  hasSessionData: boolean;
  adoptionBroadcastEnabled: boolean;
  stats: {
    pending: number;
    completed: number;
    failed: number;
    recent: any[];
  };
}

interface FailedTask {
  id: string;
  pet_id: string;
  fb_group_id: string;
  message: string;
  error_message: string;
  created_at: string;
  completed_at: string;
  pet_name?: string;
  group_name?: string;
}

type SubTab = 'relay' | 'publisher';

export default function FacebookRelayTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('relay');

  const subTabs: { id: SubTab; label: string; icon: any }[] = [
    { id: 'relay', label: 'Relay FB', icon: Smartphone },
    { id: 'publisher', label: 'Publicar en FB', icon: UploadIcon },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-brand-accent pb-px">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 font-bold text-sm transition-all relative",
              activeSubTab === tab.id ? "text-brand-primary" : "text-gray-400 hover:text-gray-600"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {activeSubTab === tab.id && (
              <motion.div layoutId="fb-relay-subtab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {activeSubTab === 'relay' && <RelayContent />}
      {activeSubTab === 'publisher' && <PublisherSection />}
    </div>
  );
}

function RelayContent() {
  const [status, setStatus] = useState<FbRelayStatus | null>(null);
  const [failedTasks, setFailedTasks] = useState<FailedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [toggling, setToggling] = useState(false);
  const [fbAdoptionToggling, setFbAdoptionToggling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [forceAdoptionsLoading, setForceAdoptionsLoading] = useState(false);
  const [forceAdoptionsResult, setForceAdoptionsResult] = useState('');
  const [fbAdoptionHours, setFbAdoptionHours] = useState('');
  const [fbAdoptionHoursSaving, setFbAdoptionHoursSaving] = useState(false);
  const [clearingQueue, setClearingQueue] = useState(false);

  async function loadData() {
    let errMsg: string | null = null;

    try {
      const statusData = await api.facebookRelay.status();
      setStatus(statusData);
    } catch (err: any) {
      errMsg = 'Error al cargar estado del relay';
      console.error('Error loading FB relay status:', err);
    }

    try {
      const failedData = await api.facebookRelay.failedTasks();
      setFailedTasks(failedData.tasks || []);
    } catch (err: any) {
      errMsg = errMsg || 'Error al cargar tareas fallidas';
      console.error('Error loading FB relay failed tasks:', err);
    }

    try {
      const hoursVal = await api.settings.get('fb_adoption_broadcast_hours');
      setFbAdoptionHours(hoursVal || '8,12,16,20');
    } catch (err: any) {
      console.error('Error loading FB adoption hours:', err);
    }

    setError(errMsg);
    setLastUpdated(new Date().toLocaleTimeString());
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  // Auto-refresh cada 15s
  useEffect(() => {
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleToggle() {
    setToggling(true);
    try {
      const data = await api.facebookRelay.toggle();
      setStatus(prev => prev ? { ...prev, enabled: data.enabled } : null);
    } catch (err) {
      console.error('Toggle error:', err);
    } finally {
      setToggling(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const result = await api.facebookRelay.uploadSession(file);
      await loadData();
      if (result?.cookieCount) {
        alert(`✅ ${result.cookieCount} cookies detectadas en el archivo. El relay las tomará en su próximo ciclo.`);
      } else {
        alert('⚠️ No se detectaron cookies en el archivo. Asegurate de subir un storage_state.json válido.');
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Error al subir la sesión: ' + (err as any)?.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleClearSession() {
    try {
      await api.facebookRelay.clearSession();
      await loadData();
    } catch (err) {
      console.error('Clear session error:', err);
    }
  }

  async function handleFbAdoptionToggle() {
    setFbAdoptionToggling(true);
    try {
      const newValue = status?.adoptionBroadcastEnabled ? 'false' : 'true';
      await api.settings.update('fb_adoption_broadcast_enabled', newValue);
      setStatus(prev => prev ? { ...prev, adoptionBroadcastEnabled: !prev.adoptionBroadcastEnabled } : null);
    } catch (err) {
      console.error('Error toggling FB adoption broadcast:', err);
    } finally {
      setFbAdoptionToggling(false);
    }
  }

  const handleForceAdoptions = async () => {
    setForceAdoptionsLoading(true);
    setForceAdoptionsResult('');
    try {
      const res = await api.facebookRelay.broadcastAdoptions();
      setForceAdoptionsResult(res.message || '✅ Broadcast ejecutado');
      loadData();
    } catch (err: any) {
      setForceAdoptionsResult(`❌ Error: ${err.message}`);
    } finally {
      setForceAdoptionsLoading(false);
    }
  }

  const handleSaveFbHours = async () => {
    setFbAdoptionHoursSaving(true);
    try {
      await api.settings.update('fb_adoption_broadcast_hours', fbAdoptionHours);
    } catch (e) {
      console.error('Error saving FB adoption hours:', e);
    } finally {
      setFbAdoptionHoursSaving(false);
    }
  }

  const handleClearQueue = async () => {
    if (!confirm('¿Estás seguro? Se eliminarán todas las tareas pendientes de la cola de FB relay.')) return;
    setClearingQueue(true);
    try {
      const res = await api.facebookRelay.clearQueue();
      alert(`✅ Cola limpiada: ${res.deleted} tareas eliminadas`);
      loadData();
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setClearingQueue(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-brand-primary">Facebook Phone Relay</h2>
          <p className="text-sm text-gray-500">Publicación a grupos de Facebook vía teléfono (Playwright)</p>
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-bold rounded-lg">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {lastUpdated ? `Última act.: ${lastUpdated}` : ''}
          </span>
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-2xl border border-brand-accent p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">Estado</h3>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${status?.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            {toggling && <Loader2 className="absolute left-1 w-5 h-5 animate-spin text-white" />}
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${status?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-brand-primary">{status?.stats.pending || 0}</div>
            <div className="text-xs text-gray-500">Pendientes</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{status?.stats.completed || 0}</div>
            <div className="text-xs text-gray-500">Completados</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{status?.stats.failed || 0}</div>
            <div className="text-xs text-gray-500">Fallidos</div>
          </div>
          <div className={`bg-gray-50 rounded-xl p-4 text-center ${status?.hasSession ? 'text-green-600' : 'text-red-500'}`}>
            <div className="text-2xl font-bold">{status?.hasSession ? '✓' : '✗'}</div>
            <div className="text-xs text-gray-500">Sesión FB</div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleClearQueue}
            disabled={clearingQueue}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {clearingQueue ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Limpiar cola
          </button>
        </div>
      </div>

      {/* Session Management */}
      <div className="bg-white rounded-2xl border border-brand-accent p-6 space-y-4">
        <h3 className="text-lg font-bold">Sesión de Facebook</h3>
        <p className="text-sm text-gray-500">
          Para iniciar sesión, ejecutá en Termux con X11:
        </p>
        <pre className="p-3 bg-gray-100 rounded-xl text-xs font-mono overflow-x-auto">FB_SCRAPER_HEADED=true node fb-relay.js --login</pre>
        <p className="text-sm text-gray-500">
          También podés subir un archivo <code>storage_state.json</code> exportado desde Playwright.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Subiendo...' : 'Subir sesión'}
          </button>
          {status?.hasSession && (
            <button
              onClick={handleClearSession}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
            >
              <X className="w-4 h-4" /> Limpiar sesión
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => {
              if (e.target.files?.[0]) handleUpload(e.target.files[0]);
              e.target.value = '';
            }}
          />
          {status?.hasSession && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" /> Sesión activa
            </span>
          )}
        </div>

        {/* Perfil completo */}
        <div className="border-t border-brand-accent pt-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="text-sm font-bold">Perfil persistente del navegador</h4>
              <p className="text-xs text-gray-400">Incluye cookies + localStorage + IndexedDB. El relay lo usa automáticamente para mantener la sesión activa.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("flex items-center gap-1 text-xs font-medium", status?.hasProfile ? 'text-green-600' : 'text-gray-400')}>
                {status?.hasProfile ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                Perfil
              </span>
              <span className={cn("flex items-center gap-1 text-xs font-medium", status?.hasSessionData ? 'text-green-600' : 'text-gray-400')}>
                {status?.hasSessionData ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                SessionData
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Iniciá sesión manualmente en Facebook con <code>--headed</code>, esperá a que cargue el feed, y luego subí el perfil completo como backup.
          </p>
          <ProfileUpload />
        </div>
      </div>

      {/* Adoption Broadcast Toggle */}
      <div className="bg-white rounded-2xl border border-brand-accent p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heart className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="text-lg font-bold">Difusión de adopciones</h3>
              <p className="text-sm text-gray-500">
                Publicar automáticamente mascotas en adopción en grupos de Facebook
              </p>
            </div>
          </div>
          <button
            onClick={handleFbAdoptionToggle}
            disabled={fbAdoptionToggling}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${status?.adoptionBroadcastEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            {fbAdoptionToggling && <Loader2 className="absolute left-1 w-5 h-5 animate-spin text-white" />}
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${status?.adoptionBroadcastEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleForceAdoptions}
            disabled={forceAdoptionsLoading}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {forceAdoptionsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
            {forceAdoptionsLoading ? 'Publicando...' : 'Forzar adopciones ahora'}
          </button>
          {forceAdoptionsResult && (
            <span className="text-sm font-medium">{forceAdoptionsResult}</span>
          )}
        </div>
        <div className="border-t border-brand-accent pt-4 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Horarios (ej: 8,12,16,20):</span>
          <input
            value={fbAdoptionHours}
            onChange={e => setFbAdoptionHours(e.target.value)}
            placeholder="8,12,16,20"
            className="flex-1 max-w-xs px-4 py-2.5 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-sm"
          />
          <button
            onClick={handleSaveFbHours}
            disabled={fbAdoptionHoursSaving}
            className="px-4 py-2.5 bg-brand-primary text-white font-bold rounded-xl hover:shadow-lg transition-all flex items-center gap-2 text-sm shrink-0"
          >
            {fbAdoptionHoursSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </div>

      {/* Recent Stats */}
      {status?.stats.recent && status.stats.recent.length > 0 && (
        <div className="bg-white rounded-2xl border border-brand-accent p-6">
          <h3 className="text-lg font-bold mb-4">Últimas publicaciones</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 pr-4 font-semibold text-gray-600">Estado</th>
                  <th className="py-2 pr-4 font-semibold text-gray-600">Mascota</th>
                  <th className="py-2 pr-4 font-semibold text-gray-600">Grupo</th>
                  <th className="py-2 pr-4 font-semibold text-gray-600">Creado</th>
                </tr>
              </thead>
              <tbody>
                {status.stats.recent.map((r: any) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      {r.status === 'completed' ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : r.status === 'failed' ? (
                        <span className="relative group">
                          <XCircle className="w-5 h-5 text-red-500 cursor-help" />
                          {r.error_message && (
                            <span className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-red-700 text-white text-[10px] rounded-lg px-2 py-1 whitespace-nowrap max-w-[250px] truncate z-10 shadow-lg">
                              {r.error_message}
                            </span>
                          )}
                        </span>
                      ) : (
                        <Clock className="w-5 h-5 text-yellow-500" />
                      )}
                    </td>
                    <td className="py-3 pr-4">{r.pet_name || r.pet_id?.substring(0, 8) || '-'}</td>
                    <td className="py-3 pr-4">{r.group_name || r.fb_group_id || '-'}</td>
                    <td className="py-3 pr-4 text-gray-500">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Failed Tasks */}
      {failedTasks.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-bold text-red-700">Tareas fallidas</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-red-200">
                  <th className="py-2 pr-4 font-semibold text-gray-600">Grupo</th>
                  <th className="py-2 pr-4 font-semibold text-gray-600">Error</th>
                  <th className="py-2 pr-4 font-semibold text-gray-600">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {failedTasks.map((t: FailedTask) => (
                  <tr key={t.id} className="border-b border-red-100 hover:bg-red-50">
                    <td className="py-3 pr-4">{t.group_name || t.fb_group_id || '-'}</td>
                    <td className="py-3 pr-4 text-red-600 max-w-xs truncate">{t.error_message}</td>
                    <td className="py-3 pr-4 text-gray-500">{new Date(t.completed_at || t.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Debug dump */}
      <DebugSection />
    </div>
  );
}

function DebugSection() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await api.facebookRelay.debugView();
      setData(d);
    } catch { setData(null) }
    setLoading(false);
  }

  useEffect(() => { if (open) load(); }, [open]);

  return (
    <div className="bg-white rounded-2xl border border-gray-300 p-6">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900">
        <Bug className="w-4 h-4" /> Debug dump {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="mt-4 space-y-4 text-sm">
          {loading && <Loader2 className="w-5 h-5 animate-spin" />}
          {!loading && !data && <p className="text-gray-500">No hay debug dump disponible. Corré fb-relay hasta que falle y volvé a cargar.</p>}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div><strong>URL:</strong> <span className="break-all">{data.url}</span></div>
                <div><strong>Timestamp:</strong> {data.timestamp}</div>
                <div><strong>Label:</strong> {data.label ?? '—'}</div>
                <div><strong>Lexical:</strong> {data.lexicalInfo?.hasLexical ? '✓ sí' : '✗ no'} (count: {data.lexicalInfo?.count})</div>
              </div>
              {data.diag4 && (
                <div>
                  <strong>Diálogo share/group (diag4):</strong>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                    <div>Dialogs: {data.diag4.totalDialogs}</div>
                    <div>Tag: {data.diag4.dialogTag} role={data.diag4.dialogRole}</div>
                  </div>
                  {data.diag4.items?.length > 0 && (
                    <table className="mt-1 w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="p-1 text-left">tag</th>
                          <th className="p-1 text-left">role</th>
                          <th className="p-1 text-left">aria</th>
                          <th className="p-1 text-left">texto</th>
                          <th className="p-1 text-left">rect (w×h@l,t)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.diag4.items.map((it, i) => (
                          <tr key={i} className="border-t border-gray-100 align-top">
                            <td className="p-1 font-mono">{it.tag}</td>
                            <td className="p-1">{it.role ?? ''}</td>
                            <td className="p-1">{it.ariaLabel ?? ''}</td>
                            <td className="p-1 break-all">{it.text}</td>
                            <td className="p-1 font-mono">{it.rect ? `${it.rect.w}×${it.rect.h}@${it.rect.l},${it.rect.t}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
              {data.ariaLabels && (
                <div>
                  <strong>ARIA labels (primeros 50):</strong>
                  <pre className="mt-1 p-2 bg-gray-100 rounded-lg text-xs max-h-60 overflow-y-auto whitespace-pre-wrap break-all">{data.ariaLabels.join('\n')}</pre>
                </div>
              )}
              {data.html && (
                <details>
                  <summary className="cursor-pointer text-brand-primary font-medium">Ver HTML (20k chars)</summary>
                  <pre className="mt-1 p-2 bg-gray-100 rounded-lg text-xs max-h-80 overflow-y-auto whitespace-pre-wrap break-all">{data.html}</pre>
                </details>
              )}
              {data.screenshot && (
                <div>
                  <strong>Screenshot:</strong>
                  <img src={`data:image/png;base64,${data.screenshot}`} alt="Debug screenshot" className="mt-1 max-w-full border rounded-lg" />
                </div>
              )}
              <button onClick={load} className="px-3 py-1 text-xs bg-gray-100 rounded-lg hover:bg-gray-200">
                Recargar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PublisherSection() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [replicating, setReplicating] = useState(false);
  const [pagePosts, setPagePosts] = useState<any[]>([]);
  const [groupSaving, setGroupSaving] = useState<Record<string, boolean>>({});
  const [retrying, setRetrying] = useState(false);

  const publishIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const fetchData = useCallback(async () => {
    try {
      await api.facebook.extractGroupIds();
      const [settingsData, groupsData] = await Promise.all([
        api.settings.list(),
        api.facebook.groups.list(),
      ]);
      const map: Record<string, string> = {};
      settingsData.forEach((s: any) => { map[s.key] = s.value; });
      setSettings(map);
      setGroups(groupsData);
      const postsResp = await fetch('/api/facebook/page-posts?limit=10', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (postsResp.ok) setPagePosts((await postsResp.json()).posts || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    return () => { Object.values(publishIntervalsRef.current).forEach(clearInterval); };
  }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const keys = ['facebook_page_id', 'facebook_page_publisher_enabled', 'facebook_publisher_interval'];
      await Promise.all(keys.map(key => api.settings.update(key, settings[key] || '')));
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleGroupSave = async (id: string, data: any) => {
    setGroupSaving(p => ({ ...p, [id]: true }));
    try {
      const resp = await fetch(`/api/facebook/groups/${id}/page-member`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(data),
      });
      if (!resp.ok) { const err = await resp.json(); alert(err.error || 'Error'); }
    } catch (e) { console.error(e); }
    setGroupSaving(p => ({ ...p, [id]: false }));
  };

  const handleReplicate = async () => {
    setReplicating(true);
    try {
      const resp = await fetch('/api/facebook/replicate-latest?limit=5', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await resp.json();
      const total = data.results?.length || 0;
      const ok = data.results?.filter((r: any) => r.result?.page?.success).length || 0;
      alert(`✅ Replicación completada: ${ok}/${total} post(s) publicados`);
      await fetchData();
    } catch (e: any) { alert('Error: ' + e.message); }
    setReplicating(false);
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const resp = await fetch('/api/facebook/retry-failed?limit=10', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await resp.json();
      const total = data.results?.length || 0;
      const ok = data.results?.filter((r: any) => r.result?.page?.success).length || 0;
      alert(`✅ Reintento completado: ${ok}/${total} post(s) publicados`);
      await fetchData();
    } catch (e: any) { alert('Error: ' + e.message); }
    setRetrying(false);
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>;

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <UploadIcon className="w-6 h-6" /> Configuración del Publisher
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Replicá automáticamente las publicaciones de Instagram a tu Page de Facebook y a los grupos donde la Page sea miembro.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-full">
            <label className="block text-sm font-bold text-gray-600 mb-1">ID de la Page de Facebook</label>
            <input type="text" value={settings.facebook_page_id || ''}
              onChange={e => setSettings(p => ({ ...p, facebook_page_id: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm font-mono"
              placeholder="ej: 123456789012345" />
          </div>
          <div className="flex items-center gap-3 p-4 bg-brand-bg rounded-2xl col-span-full">
            <input type="checkbox" id="fb_page_publisher_enabled"
              checked={settings.facebook_page_publisher_enabled === 'true'}
              onChange={e => setSettings(p => ({ ...p, facebook_page_publisher_enabled: e.target.checked ? 'true' : 'false' }))}
              className="w-5 h-5 rounded accent-brand-primary" />
            <label htmlFor="fb_page_publisher_enabled" className="font-bold text-brand-primary">
              Activar replicación automática Instagram → Facebook
            </label>
          </div>
          <div className="col-span-full sm:col-span-1">
            <label className="block text-sm font-bold text-gray-600 mb-1">Intervalo (minutos)</label>
            <input type="number" value={settings.facebook_publisher_interval || '30'}
              onChange={e => setSettings(p => ({ ...p, facebook_publisher_interval: e.target.value }))}
              className="w-full px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm"
              min="5" max="1440" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-6">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-3 bg-brand-primary text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={handleReplicate} disabled={replicating}
            className="px-6 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
            {replicating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            {replicating ? 'Replicando...' : 'Replicar ahora'}
          </button>
          <button onClick={handleRetry} disabled={retrying}
            className="px-6 py-3 bg-orange-500 text-white text-sm font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2">
            {retrying ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            {retrying ? 'Reintentando...' : 'Reintentar fallidos'}
          </button>
        </div>
      </div>

      {/* Group config */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <Users className="w-6 h-6" /> Grupos destino
        </h2>
        <p className="text-sm text-gray-500 mb-4">Configurá el ID numérico de cada grupo de Facebook y si la Page es miembro.</p>
        <div className="overflow-x-auto rounded-2xl border border-brand-accent">
          <table className="w-full text-left text-sm min-w-max">
            <thead>
              <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                <th className="px-4 py-3">Grupo</th>
                <th className="px-4 py-3">FB Group ID</th>
                <th className="px-4 py-3 text-center">Page miembro</th>
                <th className="px-4 py-3 text-center">Publicar</th>
                <th className="px-4 py-3">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-accent">
              {groups.filter((g: any) => g.is_active).map((g: any) => (
                <GroupConfigRow key={g.id} group={g}
                  onSave={handleGroupSave}
                  saving={groupSaving[g.id] || false} />
              ))}
              {groups.filter((g: any) => g.is_active).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">No hay grupos activos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Publication log */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
        <h2 className="text-xl font-serif font-bold text-brand-primary mb-6 flex items-center gap-3">
          <LayoutGrid className="w-6 h-6" /> Últimas publicaciones
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-brand-accent">
          <table className="w-full text-left text-sm min-w-max">
            <thead>
              <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                <th className="px-4 py-3">Mascota</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Error / ID</th>
                <th className="px-4 py-3">Publicado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-accent">
              {pagePosts.map((p: any) => (
                <tr key={p.id} className="hover:bg-brand-bg/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.pet_image
                        ? <img src={`data:image/jpeg;base64,${p.pet_image}`} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        : <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0" />}
                      <span className="font-medium">{p.pet_name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-3 py-1 rounded-full text-[10px] font-bold",
                      p.status === 'published' ? "bg-green-100 text-green-700" :
                      p.status === 'failed' ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-700")}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[200px] truncate" title={p.error_message || p.page_post_id || ''}>
                    {p.error_message
                      ? <span className="text-red-500">{p.error_message.substring(0, 120)}</span>
                      : <span className="text-gray-500 font-mono">{p.page_post_id || '—'}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {p.published_at ? formatDateTime(p.published_at) : '—'}
                  </td>
                </tr>
              ))}
              {pagePosts.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">Aún no hay publicaciones.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GroupConfigRow({ group, onSave, saving }: { group: any; onSave: (id: string, data: any) => Promise<void>; saving: boolean }) {
  const [fbGroupId, setFbGroupId] = useState(group.fb_group_id || '');
  const [pageIsMember, setPageIsMember] = useState(group.page_is_member || false);
  const [publishOnCreate, setPublishOnCreate] = useState(group.publish_on_create || false);
  const handleSave = () => onSave(group.id, {
    fb_group_id: fbGroupId || null,
    page_is_member: pageIsMember,
    publish_on_create: publishOnCreate,
  });

  return (
    <tr className="hover:bg-brand-bg/50 transition-colors">
      <td className="px-4 py-3 font-bold text-brand-primary">{group.name}</td>
      <td className="px-4 py-3">
        <input type="text" value={fbGroupId}
          onChange={e => setFbGroupId(e.target.value)}
          className="w-32 px-2 py-1.5 bg-white rounded-lg border border-brand-accent outline-none focus:border-brand-primary text-xs font-mono"
          placeholder="ID numérico" />
      </td>
      <td className="px-4 py-3 text-center">
        <input type="checkbox" checked={pageIsMember}
          onChange={e => setPageIsMember(e.target.checked)}
          className="w-5 h-5 rounded accent-brand-primary" />
      </td>
      <td className="px-4 py-3 text-center">
        <input type="checkbox" checked={publishOnCreate}
          onChange={e => setPublishOnCreate(e.target.checked)}
          className="w-5 h-5 rounded accent-brand-primary" />
      </td>
      <td className="px-4 py-3">
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 bg-brand-primary text-white text-[10px] font-bold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-1">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Guardar
        </button>
      </td>
    </tr>
  );
}

function ProfileUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    const formData = new FormData();
    formData.append('profile', file);
    try {
      const res = await fetch('/api/relay/fb/upload-profile', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).error);
      alert(`✅ Perfil subido (${(file.size / 1024 / 1024).toFixed(1)} MB) — el relay lo usará en su próximo ciclo`);
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-brand-primary bg-brand-primary/10 rounded-lg hover:bg-brand-primary/20 transition-colors"
      >
        <Upload className="w-3.5 h-3.5" /> Subir perfil completo
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".tar.gz,.tgz"
        className="hidden"
        onChange={e => {
          if (e.target.files?.[0]) handleUpload(e.target.files[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
