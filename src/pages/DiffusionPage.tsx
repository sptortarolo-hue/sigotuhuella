import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import html2pdf from 'html2pdf.js';
import { PawPrint, Share2, Download, CheckCircle2, Printer, Smartphone, MessageCircle, FileDown } from 'lucide-react';

const APP_URL = 'https://sigotuhuella.online';
const WA_URL = 'https://wa.me/5492212025190?text=Hola%21+Quiero+reportar+una+mascota';

const QR_CONFIG = {
  app: { width: 300, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } },
  wa: { width: 300, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } },
};

function Poster({ appQrUrl, waQrUrl }: { appQrUrl: string; waQrUrl: string }) {
  return (
    <div
      className="bg-white overflow-hidden"
      style={{ width: '210mm', height: '297mm', fontFamily: 'Inter, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-center justify-center gap-3 pt-10 pb-2">
        <img
          src="/sigotuhuella.jpg"
          alt="Sigo Tu Huella"
          className="w-12 h-12 rounded-full object-cover"
        />
        <h1 className="text-2xl font-bold tracking-wide uppercase" style={{ color: '#1a1a1a' }}>
          Sigo tu huella
        </h1>
      </div>

      {/* Divider */}
      <div className="mx-auto w-16 h-px bg-black my-4" />

      {/* Headline */}
      <div className="px-10 pb-8 text-center">
        <h2
          className="text-4xl font-bold leading-tight tracking-tight"
          style={{ fontFamily: '"Cormorant Garamond", serif', color: '#1a1a1a' }}
        >
          Encontrá y reportá
          <br />
          mascotas perdidas
        </h2>
        <p className="mt-3 text-sm tracking-wide" style={{ color: '#666' }}>
          La app gratuita que conecta vecinos, voluntarios y veterinarias
        </p>
      </div>

      {/* QR Codes — central element */}
      <div className="flex justify-center gap-10 px-10 pb-8">
        <div className="flex flex-col items-center">
          <div
            className="p-4 rounded-2xl border-2"
            style={{ borderColor: '#1a1a1a' }}
          >
            {appQrUrl && (
              <img src={appQrUrl} alt="QR App" className="w-40 h-40" />
            )}
          </div>
          <p className="mt-3 text-sm font-bold uppercase tracking-widest" style={{ color: '#1a1a1a' }}>
            Descargá la app
          </p>
        </div>
        <div className="flex flex-col items-center">
          <div
            className="p-4 rounded-2xl border-2"
            style={{ borderColor: '#1a1a1a' }}
          >
            {waQrUrl && (
              <img src={waQrUrl} alt="QR WhatsApp" className="w-40 h-40" />
            )}
          </div>
          <p className="mt-3 text-sm font-bold uppercase tracking-widest" style={{ color: '#1a1a1a' }}>
            Reportá por WhatsApp
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="px-12 pb-8">
        <div className="space-y-3">
          {[
            'Reportá una mascota en menos de 2 minutos',
            'Red de voluntarios que buscan con vos',
            'Difusión automática en redes y WhatsApp',
            '100% gratuito, sin registro necesario',
          ].map((text, i) => (
            <div key={i} className="flex items-center gap-3">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}
              >
                {i + 1}
              </span>
              <span className="text-sm font-medium" style={{ color: '#1a1a1a' }}>
                {text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        className="mt-auto py-5 text-center"
        style={{ borderTop: '2px solid #1a1a1a' }}
      >
        <p className="text-sm font-bold tracking-widest uppercase" style={{ color: '#1a1a1a' }}>
          sigotuhuella.online
        </p>
      </div>
    </div>
  );
}

export default function DiffusionPage() {
  const [appQrUrl, setAppQrUrl] = useState('');
  const [waQrUrl, setWaQrUrl] = useState('');
  const [copied, setCopied] = useState<'app' | 'wa' | null>(null);
  const [generating, setGenerating] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    QRCode.toDataURL(APP_URL, QR_CONFIG.app).then(setAppQrUrl).catch(console.error);
    QRCode.toDataURL(WA_URL, QR_CONFIG.wa).then(setWaQrUrl).catch(console.error);
  }, []);

  const handleShare = async (type: 'app' | 'wa') => {
    const url = type === 'app' ? APP_URL : WA_URL;
    const title = type === 'app' ? 'Sigo Tu Huella' : 'Sigo Tu Huella - Reportar por WhatsApp';
    const text = type === 'app'
      ? '🐾 Ayudanos a encontrar mascotas perdidas. Ingresá a la app y reportá.'
      : '🐾 Reportá una mascota perdida directamente por WhatsApp.';

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleDownloadQr = (type: 'app' | 'wa') => {
    const link = document.createElement('a');
    link.download = type === 'app' ? 'sigo-tu-huella-app.png' : 'sigo-tu-huella-whatsapp.png';
    link.href = type === 'app' ? appQrUrl : waQrUrl;
    link.click();
  };

  const handleDownloadPdf = async () => {
    const element = posterRef.current;
    if (!element) return;
    setGenerating(true);
    try {
      await html2pdf()
        .set({
          margin: 0,
          filename: 'sigo-tu-huella-flyer.pdf',
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 3, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(element)
        .save();
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => window.print();

  return (
    <>
      <style>{`
        @media screen {
          .print-flyer { display: none !important; }
        }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          #root { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          .print-flyer {
            display: flex !important;
            position: fixed !important;
            inset: 0 !important;
            align-items: center !important;
            justify-content: center !important;
          }
        }
      `}</style>

      {/* Screen UI */}
      <div className="min-h-screen py-8 sm:py-12 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Share2 className="w-8 h-8 text-brand-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">Difundí Sigo Tu Huella</h1>
            <p className="text-gray-500 mt-2 text-sm sm:text-base">Descargá e imprimí el flyer para pegar en veterinarias, plazas y comercios.</p>
          </div>

          {/* QR Digital */}
          <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 mb-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                <Share2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">QR Digital</h2>
                <p className="text-sm text-gray-500">Compartilos en WhatsApp, redes o descargalos</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-brand-bg rounded-2xl p-6 border border-brand-accent text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Smartphone className="w-5 h-5 text-brand-primary" />
                  <h3 className="font-bold text-gray-800">Ingresá a la app</h3>
                </div>
                <div className="flex justify-center mb-4">
                  {appQrUrl && <img src={appQrUrl} alt="QR App" className="w-40 h-40" />}
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => handleShare('app')} className="w-full py-2.5 bg-brand-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all">
                    {copied === 'app' ? <><CheckCircle2 className="w-4 h-4" /> Link copiado</> : <><Share2 className="w-4 h-4" /> Compartir</>}
                  </button>
                  <button onClick={() => handleDownloadQr('app')} className="w-full py-2.5 border border-brand-accent text-gray-700 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-white transition-all">
                    <Download className="w-4 h-4" /> Descargar
                  </button>
                </div>
              </div>

              <div className="bg-green-50 rounded-2xl p-6 border border-green-200 text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <MessageCircle className="w-5 h-5 text-green-600" />
                  <h3 className="font-bold text-gray-800">Reportá por WhatsApp</h3>
                </div>
                <div className="flex justify-center mb-4">
                  {waQrUrl && <img src={waQrUrl} alt="QR WhatsApp" className="w-40 h-40" />}
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => handleShare('wa')} className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all">
                    {copied === 'wa' ? <><CheckCircle2 className="w-4 h-4" /> Link copiado</> : <><Share2 className="w-4 h-4" /> Compartir</>}
                  </button>
                  <button onClick={() => handleDownloadQr('wa')} className="w-full py-2.5 border border-green-300 text-gray-700 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-white transition-all">
                    <Download className="w-4 h-4" /> Descargar
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Flyer section */}
          <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 mb-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                <Printer className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">Flyer para imprimir</h2>
                <p className="text-sm text-gray-500">Descargalo en PDF o imprimí directo desde el navegador</p>
              </div>
            </div>

            {/* Preview — scaled down A4 */}
            <div className="flex justify-center mb-6 overflow-hidden rounded-xl border border-brand-accent bg-gray-50 p-4">
              <div
                className="origin-top shadow-lg"
                style={{
                  width: '210mm',
                  height: '297mm',
                  transform: 'scale(0.38)',
                  transformOrigin: 'top center',
                  marginBottom: '-145mm',
                }}
              >
                <Poster appQrUrl={appQrUrl} waQrUrl={waQrUrl} />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleDownloadPdf}
                disabled={generating || !appQrUrl}
                className="flex items-center justify-center gap-2 px-8 py-3.5 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-wait"
              >
                {generating ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generando PDF...
                  </>
                ) : (
                  <>
                    <FileDown className="w-5 h-5" /> Descargar PDF
                  </>
                )}
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center justify-center gap-2 px-8 py-3.5 border-2 border-brand-primary text-brand-primary rounded-xl font-bold hover:bg-brand-primary/5 transition-all"
              >
                <Printer className="w-5 h-5" /> Imprimir
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center leading-relaxed">
            sigotuhuella.online
          </p>
        </div>
      </div>

      {/* Print-only flyer — hidden on screen, visible on print */}
      <div ref={posterRef} className="print-flyer">
        <Poster appQrUrl={appQrUrl} waQrUrl={waQrUrl} />
      </div>
    </>
  );
}
