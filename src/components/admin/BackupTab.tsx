import { useEffect, useState, useCallback } from 'react';
import { Loader2, Download, RefreshCw, Database, Folder, CheckCircle2, XCircle, AlertTriangle, HardDrive } from 'lucide-react';
import { api } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';
import { formatDateTime } from '@/src/lib/formatDate';

interface BackupEntry {
  file: string;
  type: 'db' | 'fs';
  size: number;
  ok: boolean | null;
  created_at: string;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

export default function BackupTab() {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [dir, setDir] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [disk, setDisk] = useState<{ total: string; used: string; available: string; percent: number } | null>(null);

  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.backup.list();
      setBackups(data.backups || []);
      setDir(data.dir || '');
      setDisk(data.disk || null);
    } catch (err: any) {
      setError(err.message || 'Error al listar backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  async function handleRun() {
    try {
      setRunning(true);
      setOutput('');
      setError('');
      const data = await api.backup.run();
      if (!data.ok) setError('El backup terminó con errores (ver salida)');
      setOutput(data.output || '');
      await fetchBackups();
    } catch (err: any) {
      setError(err.message || 'Error al generar backup');
    } finally {
      setRunning(false);
    }
  }

  async function handleDownload(file: string) {
    try {
      setDownloading(file);
      setError('');
      await api.backup.download(file);
    } catch (err: any) {
      setError(err.message || 'Error al descargar');
    } finally {
      setDownloading(null);
    }
  }

  const dbCount = backups.filter(b => b.type === 'db').length;
  const fsCount = backups.filter(b => b.type === 'fs').length;
  const lastOk = backups.find(b => b.ok === true);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-brand-primary">Backups</h2>
          <p className="text-sm text-gray-500">Copia de seguridad de la base de datos y archivos</p>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Generar ahora
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-brand-bg/50 rounded-2xl p-4">
          <Database className="w-5 h-5 text-brand-primary mb-1" />
          <p className="text-2xl font-bold">{dbCount}</p>
          <p className="text-xs text-gray-500 font-bold">Backups de DB</p>
        </div>
        <div className="bg-brand-bg/50 rounded-2xl p-4">
          <Folder className="w-5 h-5 text-brand-primary mb-1" />
          <p className="text-2xl font-bold">{fsCount}</p>
          <p className="text-xs text-gray-500 font-bold">Backups de archivos</p>
        </div>
        <div className="bg-brand-bg/50 rounded-2xl p-4">
          <CheckCircle2 className="w-5 h-5 text-green-600 mb-1" />
          <p className="text-2xl font-bold">{lastOk ? 'OK' : '—'}</p>
          <p className="text-xs text-gray-500 font-bold">Último verificado</p>
        </div>
        <div className="bg-brand-bg/50 rounded-2xl p-4">
          <HardDrive className="w-5 h-5 text-brand-primary mb-1" />
          {disk ? (
            <>
              <p className="text-sm font-bold">{disk.used} / {disk.total}</p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-1.5 mb-1">
                <div
                  className={cn('h-2 rounded-full transition-all', disk.percent >= 90 ? 'bg-red-500' : disk.percent >= 70 ? 'bg-amber-500' : 'bg-green-500')}
                  style={{ width: `${Math.min(disk.percent, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500 font-bold">{disk.percent}% usado · {disk.available} libre</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold">—</p>
              <p className="text-xs text-gray-500 font-bold">Disco del VPS</p>
            </>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>
      ) : backups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <AlertTriangle className="w-10 h-10 mb-2" />
          <p className="text-sm">No hay backups todavía. Generá uno con el botón.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-accent">
          <table className="w-full text-left text-xs min-w-max">
            <thead>
              <tr className="bg-brand-bg border-b border-brand-accent">
                <th className="p-3 font-bold">Archivo</th>
                <th className="p-3 font-bold">Tipo</th>
                <th className="p-3 font-bold">Tamaño</th>
                <th className="p-3 font-bold">Fecha</th>
                <th className="p-3 font-bold">Integridad</th>
                <th className="p-3 font-bold">Acción</th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.file} className="border-b border-brand-accent/50">
                  <td className="p-3 font-bold whitespace-nowrap">{b.file}</td>
                  <td className="p-3">
                    <span className={cn('text-[10px] px-2 py-1 rounded-full font-bold', b.type === 'db' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                      {b.type === 'db' ? 'Base de datos' : 'Archivos'}
                    </span>
                  </td>
                  <td className="p-3 text-gray-500 whitespace-nowrap">{formatBytes(b.size)}</td>
                  <td className="p-3 text-gray-500 whitespace-nowrap">{formatDateTime(b.created_at)}</td>
                  <td className="p-3">
                    {b.ok === true ? (
                      <span className="flex items-center gap-1 text-green-600 font-bold"><CheckCircle2 className="w-4 h-4" /> OK</span>
                    ) : b.ok === false ? (
                      <span className="flex items-center gap-1 text-red-600 font-bold"><XCircle className="w-4 h-4" /> Error</span>
                    ) : (
                      <span className="text-gray-400">Sin verificar</span>
                    )}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => handleDownload(b.file)}
                      disabled={downloading === b.file}
                      className="flex items-center gap-1 text-brand-primary font-bold hover:underline disabled:opacity-50"
                    >
                      {downloading === b.file ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      Descargar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {output && (
        <div>
          <h4 className="text-xs font-bold uppercase text-gray-500 mb-1">Salida del último backup</h4>
          <pre className="bg-gray-900 text-green-400 rounded-xl p-4 text-[10px] overflow-x-auto whitespace-pre-wrap max-h-60">{output}</pre>
        </div>
      )}
    </div>
  );
}
