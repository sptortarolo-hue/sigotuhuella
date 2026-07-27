import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Send, CheckCircle2 } from 'lucide-react';
import { api } from '@/src/lib/api';

interface Props {
  raffleId: string;
  onClose: () => void;
}

interface GroupResult {
  group: string;
  status: string;
  id?: string;
  error?: string;
}

export default function RafflePublishModal({ raffleId, onClose }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<GroupResult[] | null>(null);
  const [title, setTitle] = useState('');

  useEffect(() => {
    setLoading(true);
    api.raffles.get(raffleId).then(data => {
      const r = data.raffle;
      setTitle(r.title);
      setText(`🎟️ ¡${r.title}!\n\nComprá tu número en sigotuhuella.com.ar/rifas/${raffleId}`);
    }).catch(() => {
      setTitle('Error al cargar');
    }).finally(() => setLoading(false));
  }, [raffleId]);

  async function handlePublish() {
    setSending(true);
    try {
      const data = await api.post(`/raffles/${raffleId}/broadcast-wa`, { text });
      setResult(data.results);
    } catch (err: any) {
      alert(err.message || 'Error al publicar');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-lg bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 sm:p-8 border-b border-brand-accent shrink-0">
          <h3 className="text-lg font-serif font-bold text-brand-primary">Compartir en WhatsApp</h3>
          <button onClick={onClose} className="p-2 hover:bg-brand-accent/20 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 sm:p-8 overflow-y-auto space-y-5">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-brand-primary" /></div>
          ) : result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-base">
                <CheckCircle2 className="w-5 h-5" /> Enviado correctamente
              </div>
              <div className="space-y-1.5 text-sm text-gray-600 max-h-40 overflow-y-auto">
                {result.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={r.status === 'queued' ? 'text-emerald-500' : 'text-red-500'}>
                      {r.status === 'queued' ? '✓' : '✗'}
                    </span>
                    <span className="truncate">{r.group}</span>
                    {r.error && <span className="text-red-400 text-xs ml-auto">{r.error}</span>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">Se envió a {result.filter(r => r.status === 'queued').length} grupo(s)</p>
            </div>
          ) : (
            <>
              <div className="bg-brand-bg rounded-2xl overflow-hidden">
                <img
                  src={`/api/raffles/${raffleId}/flyer`}
                  alt="Vista previa del flyer"
                  className="w-full object-contain max-h-80"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-gray-500 mb-1.5 block">Mensaje</label>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary text-sm resize-none"
                />
              </div>

              <button
                onClick={handlePublish}
                disabled={sending || !text.trim()}
                className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Enviando...' : 'Publicar en WhatsApp'}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
