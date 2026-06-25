import { useState, useEffect, useRef } from 'react';
import { Smartphone, Loader2, RefreshCw, Upload, X, CheckCircle, XCircle, Clock, AlertCircle, Bug, Heart } from 'lucide-react';
import { api } from '@/src/lib/api';

interface FbRelayStatus {
  enabled: boolean;
  hasSession: boolean;
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

export default function FacebookRelayTab() {
  const [status, setStatus] = useState<FbRelayStatus | null>(null);
  const [failedTasks, setFailedTasks] = useState<FailedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [fbAdoptionToggling, setFbAdoptionToggling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    try {
      const [statusData, failedData] = await Promise.all([
        api.facebookRelay.status(),
        api.facebookRelay.failedTasks(),
      ]);
      setStatus(statusData);
      setFailedTasks(failedData.tasks || []);
    } catch (err) {
      console.error('Error loading FB relay data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

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
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
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
      </div>

      {/* Session Management */}
      <div className="bg-white rounded-2xl border border-brand-accent p-6">
        <h3 className="text-lg font-bold mb-4">Sesión de Facebook</h3>
        <p className="text-sm text-gray-500 mb-4">
          Subí el archivo <code>storage_state.json</code> exportado desde Playwright (login manual en desktop).
        </p>
        <div className="flex flex-wrap gap-3">
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
                        <XCircle className="w-5 h-5 text-red-500" />
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
                <div><strong>Lexical:</strong> {data.lexicalInfo?.hasLexical ? '✓ sí' : '✗ no'} (count: {data.lexicalInfo?.count})</div>
              </div>
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
