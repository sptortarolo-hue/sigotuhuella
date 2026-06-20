import { useEffect, useState } from 'react';
import { Loader2, Send, MessageSquare, Users, Wifi, WifiOff, Power, Globe, Image } from 'lucide-react';
import { api } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';

interface RelayStatus {
  enabled: boolean;
  connected: boolean;
  lastPollAt: string | null;
  pendingCount: number;
}

export default function RelayWhatsAppTab() {
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [testTo, setTestTo] = useState('');
  const [testText, setTestText] = useState('');
  const [testImageUrl, setTestImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');

  const [groupText, setGroupText] = useState('');
  const [groupImageUrl, setGroupImageUrl] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResults, setBroadcastResults] = useState<any[] | null>(null);

  const [toggling, setToggling] = useState(false);

  const fetchStatus = async () => {
    try {
      const data = await api.whatsappRelay.status();
      setStatus(data);
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async () => {
    setToggling(true);
    try {
      await api.whatsappRelay.toggle();
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setToggling(false);
    }
  };

  const handleSendTest = async () => {
    if (!testTo || (!testText && !testImageUrl)) return;
    setSending(true);
    setSendResult('');
    try {
      const res = await api.whatsappRelay.send(testTo, testText, testImageUrl || undefined);
      setSendResult(`✅ Encolado (id: ${res.id}). El relay lo enviará en segundos.`);
      setTestText('');
      setTestImageUrl('');
    } catch (err: any) {
      setSendResult(`❌ Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleBroadcast = async () => {
    if (!groupText.trim() && !groupImageUrl.trim()) return;
    setBroadcasting(true);
    setBroadcastResults(null);
    try {
      const res = await api.whatsappRelay.groupsBroadcast(groupText, groupImageUrl || undefined);
      setBroadcastResults(res.results);
      setGroupText('');
      setGroupImageUrl('');
    } catch (err: any) {
      setBroadcastResults([{ group: 'Error', status: 'error', error: err.message }]);
    } finally {
      setBroadcasting(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Estado */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
          <MessageSquare className="w-6 h-6" /> Estado del Relay WhatsApp
        </h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
          </div>
        ) : error && !status ? (
          <p className="text-red-500 text-sm">{error}</p>
        ) : status ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-brand-accent p-4 space-y-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Conexión</p>
              <div className="flex items-center gap-2">
                {status.connected ? (
                  <><Wifi className="w-5 h-5 text-green-500" /><span className="text-green-700 font-bold">Conectado</span></>
                ) : (
                  <><WifiOff className="w-5 h-5 text-red-400" /><span className="text-red-500 font-bold">Desconectado</span></>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-brand-accent p-4 space-y-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Relay</p>
              <div className="flex items-center gap-2">
                {status.enabled ? (
                  <span className="text-green-700 font-bold">Activado</span>
                ) : (
                  <span className="text-gray-400 font-bold">Desactivado</span>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-brand-accent p-4 space-y-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Pendientes</p>
              <p className="text-2xl font-bold">{status.pendingCount}</p>
            </div>
            <div className="rounded-2xl border border-brand-accent p-4 space-y-1">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Último poll</p>
              <p className="text-sm font-medium truncate">{status.lastPollAt ? new Date(status.lastPollAt).toLocaleTimeString() : '—'}</p>
            </div>
          </div>
        ) : null}

        <button
          onClick={handleToggle}
          disabled={toggling}
          className={cn(
            "flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all",
            status?.enabled
              ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
              : "bg-green-50 text-green-600 hover:bg-green-100 border border-green-200"
          )}
        >
          {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
          {status?.enabled ? 'Desactivar Relay' : 'Activar Relay'}
        </button>
      </div>

      {/* Mensaje de prueba */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
          <Send className="w-6 h-6" /> Enviar mensaje de prueba
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Teléfono</label>
            <input
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              placeholder="549221XXXXXX"
              className="w-full px-4 py-3 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Mensaje</label>
            <textarea
              value={testText}
              onChange={e => setTestText(e.target.value)}
              placeholder="Escribí el mensaje..."
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20 resize-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              <Image className="w-3 h-3 inline mb-0.5 mr-1" />URL de imagen (opcional)
            </label>
            <input
              value={testImageUrl}
              onChange={e => setTestImageUrl(e.target.value)}
              placeholder="https://ejemplo.com/imagen.jpg"
              className="w-full px-4 py-3 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleSendTest}
            disabled={sending || !testTo || (!testText && !testImageUrl)}
            className="px-8 py-3.5 bg-brand-primary text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
          {sendResult && <p className="text-sm font-medium">{sendResult}</p>}
        </div>
      </div>

      {/* Publicar en grupos */}
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 space-y-6">
        <h2 className="text-xl font-serif font-bold text-brand-primary flex items-center gap-3">
          <Globe className="w-6 h-6" /> Publicar en grupos WhatsApp
        </h2>
        <p className="text-sm text-gray-500">El mensaje se envía a todos los grupos activos a través del relay.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Mensaje</label>
            <textarea
              value={groupText}
              onChange={e => setGroupText(e.target.value)}
              placeholder="Escribí el mensaje para enviar a todos los grupos..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20 resize-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              <Image className="w-3 h-3 inline mb-0.5 mr-1" />URL de imagen (opcional)
            </label>
            <input
              value={groupImageUrl}
              onChange={e => setGroupImageUrl(e.target.value)}
              placeholder="https://ejemplo.com/imagen.jpg"
              className="w-full px-4 py-3 rounded-xl border border-brand-accent font-medium focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleBroadcast}
            disabled={broadcasting || (!groupText.trim() && !groupImageUrl.trim())}
            className="px-8 py-3.5 bg-brand-primary text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-brand-primary/20 transition-all duration-300 disabled:opacity-50 flex items-center gap-2"
          >
            {broadcasting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Users className="w-5 h-5" />}
            {broadcasting ? 'Publicando...' : 'Publicar en grupos'}
          </button>
        </div>
        {broadcastResults && (
          <div className="overflow-x-auto rounded-2xl border border-brand-accent">
            <table className="w-full text-left min-w-max">
              <thead>
                <tr className="bg-brand-bg text-[10px] uppercase tracking-widest font-bold text-gray-500">
                  <th className="px-4 py-3">Grupo</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-accent">
                {broadcastResults.map((r, i) => (
                  <tr key={i} className="text-sm">
                    <td className="px-4 py-3 font-medium">{r.group}</td>
                    <td className="px-4 py-3">
                      {r.status === 'queued' ? (
                        <span className="text-green-600 font-bold">Encolado</span>
                      ) : (
                        <span className="text-red-500 font-bold" title={r.error}>Error</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
