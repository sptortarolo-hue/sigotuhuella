import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { PawPrint, Share2, Download, CheckCircle2 } from 'lucide-react';

export default function ShareQR() {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const reportUrl = 'https://sigotuhuella.online/reportar-rapido';

  useEffect(() => {
    QRCode.toDataURL(reportUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#5A5A40', light: '#ffffff' },
    }).then(setQrDataUrl).catch(console.error);
  }, []);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Sigo Tu Huella - Reporte rápido',
          text: '🐾 Guardá este código. Si ves un animal perdido, escanealo y reportalo en 30 segundos.',
          url: reportUrl,
        });
      } catch {}
    } else {
      await navigator.clipboard.writeText(reportUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.download = 'sigo-tu-huella-qr.png';
    link.href = qrDataUrl;
    link.click();
  };

  return (
    <div className="min-h-[80vh] py-8 sm:py-12 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <PawPrint className="w-8 h-8 text-brand-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">Compartí Sigo Tu Huella</h1>
          <p className="text-gray-500 mt-2 text-sm">Reenviá este código a tus grupos de vecinos. Cuantos más tengamos, más rápido encontramos mascotas.</p>
        </div>

        {/* QR Card */}
        <div ref={canvasRef} className="bg-white rounded-[2.5rem] border border-brand-accent p-8 text-center shadow-lg">
          <div className="flex items-center justify-center gap-2 mb-6">
            <PawPrint className="w-5 h-5 text-brand-primary" />
            <span className="font-serif font-bold text-lg text-brand-primary">Sigo tu huella</span>
          </div>

          {qrDataUrl && (
            <img src={qrDataUrl} alt="QR" className="w-56 h-56 mx-auto" />
          )}

          <p className="text-sm font-bold text-gray-700 mt-4 mb-1">Reporte rápido - Sin registro</p>
          <p className="text-xs text-gray-400">Escaneá y reportá en 30 segundos</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 mt-6">
          <button onClick={handleShare} className="w-full py-4 bg-brand-primary text-white rounded-xl font-bold flex items-center justify-center gap-3 hover:shadow-lg transition-all">
            {copied ? <><CheckCircle2 className="w-5 h-5" /> Link copiado</> : <><Share2 className="w-5 h-5" /> Compartir QR</>}
          </button>
          <button onClick={handleDownload} className="w-full py-4 border border-brand-accent text-gray-700 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-brand-bg transition-all">
            <Download className="w-5 h-5" /> Descargar imagen QR
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-6 leading-relaxed">
          Villa Garibaldi · Parque Sicardi · Ignacio Correas<br />
          sigotuhuella.online
        </p>
      </div>
    </div>
  );
}
