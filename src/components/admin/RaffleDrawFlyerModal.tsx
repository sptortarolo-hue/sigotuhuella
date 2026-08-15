import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Share2, Download } from 'lucide-react';
import { shareRaffleResultsOnWhatsApp } from '@/src/lib/whatsappShare';

interface Props {
  raffleId: string;
  title: string;
  onClose: () => void;
}

export default function RaffleDrawFlyerModal({ raffleId, title, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState(false);
  const flyerUrl = `/api/raffles/${raffleId}/draw-flyer`;

  async function handleShare() {
    setSharing(true);
    try {
      await shareRaffleResultsOnWhatsApp(raffleId, title);
    } catch (err: any) {
      alert(err.message || 'Error al compartir');
    } finally {
      setSharing(false);
    }
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = flyerUrl;
    a.download = `resultados-${raffleId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-lg bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 sm:p-8 border-b border-brand-accent shrink-0">
          <h3 className="text-lg font-serif font-bold text-brand-primary">Flyer de resultados</h3>
          <button onClick={onClose} className="p-2 hover:bg-brand-accent/20 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 sm:p-8 overflow-y-auto space-y-5">
          <div className="bg-brand-bg rounded-2xl overflow-hidden">
            {loading && (
              <div className="flex items-center justify-center h-72">
                <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
              </div>
            )}
            {error ? (
              <div className="flex items-center justify-center h-40 text-red-500 text-sm px-4 text-center">
                Error al generar el flyer. Verificá que la rifa tenga resultados guardados y que el servidor tenga las dependencias necesarias.
              </div>
            ) : (
              <img
                src={flyerUrl}
                alt="Vista previa del flyer de resultados"
                className="w-full object-contain max-h-[52vh]"
                onLoad={() => setLoading(false)}
                onError={() => { setLoading(false); setError(true); }}
              />
            )}
          </div>

          <p className="text-xs text-gray-400 text-center">
            Flyer de resultados en formato 9:16, listo para compartir en WhatsApp, Instagram y Facebook.
          </p>

          <button
            onClick={handleShare}
            disabled={sharing || error}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            {sharing ? 'Compartiendo...' : 'Compartir imagen + link'}
          </button>

          <button
            onClick={handleDownload}
            disabled={error}
            className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Descargar PNG
          </button>
        </div>
      </motion.div>
    </div>
  );
}
