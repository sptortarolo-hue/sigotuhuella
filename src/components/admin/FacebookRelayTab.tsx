import { useState, useEffect, useRef } from 'react';
import { Smartphone, Loader2, RefreshCw, Upload, X, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { api } from '@/src/lib/api';

interface FbRelayStatus {
  enabled: boolean;
  hasSession: boolean;
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
      await api.facebookRelay.uploadSession(file);
      await loadData();
    } catch (err) {
      console.error('Upload error:', err);
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
    </div>
  );
}
