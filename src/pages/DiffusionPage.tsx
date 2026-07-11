import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { PawPrint, Share2, Download, CheckCircle2, Printer, Smartphone, MessageCircle } from 'lucide-react';

const APP_URL = 'https://sigotuhuella.online';
const WA_URL = 'https://wa.me/5492212025190?text=Hola%21+Quiero+reportar+una+mascota';

const QR_CONFIG = {
  app: { width: 400, margin: 2, color: { dark: '#5A5A40', light: '#ffffff' } },
  wa: { width: 400, margin: 2, color: { dark: '#25D366', light: '#ffffff' } },
};

function Poster({ appQrUrl, waQrUrl }: { appQrUrl: string; waQrUrl: string }) {
  return (
    <div className="border border-brand-accent rounded-[2rem] overflow-hidden max-w-sm mx-auto">
      <div className="py-3 px-5 flex items-center justify-center gap-2" style={{ backgroundColor: '#5A5A40' }}>
        <PawPrint className="w-5 h-5 text-white" />
        <span className="font-serif font-bold text-lg text-white">Sigo tu huella</span>
      </div>
      <div className="p-6 text-center">
        <p className="text-3xl mb-2">🐾</p>
        <h3 className="text-xl font-bold text-gray-800 mb-2">¿Viste un animal perdido?</h3>
        <p className="text-sm text-gray-500">Reportalo al instante sin necesidad de registro</p>
      </div>

      <div className="grid grid-cols-2 gap-4 px-6 pb-4">
        <div className="text-center">
          <p className="text-[10px] font-bold text-gray-600 mb-2 flex items-center justify-center gap-1">
            <Smartphone className="w-3 h-3" /> App
          </p>
          {appQrUrl && <img src={appQrUrl} alt="QR App" className="w-32 h-32 mx-auto" />}
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold text-gray-600 mb-2 flex items-center justify-center gap-1">
            <MessageCircle className="w-3 h-3" /> WhatsApp
          </p>
          {waQrUrl && <img src={waQrUrl} alt="QR WhatsApp" className="w-32 h-32 mx-auto" />}
        </div>
      </div>

      <div className="px-6 pb-4 text-center space-y-1.5">
        {[
          'Elegí el QR: ingresá a la app o reportá por WhatsApp',
          'Seguí las instrucciones',
          'Listo, ya se difunde en la red',
        ].map((text, i) => (
          <div key={i} className="flex items-center justify-center gap-2 text-xs text-gray-600">
            <span className="w-5 h-5 bg-brand-primary/10 rounded-full flex items-center justify-center text-[10px] font-bold text-brand-primary">{i + 1}</span>
            {text}
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 py-3 px-6 text-center">
        <p className="text-[10px] text-gray-400">sigotuhuella.online</p>
      </div>
    </div>
  );
}

export default function DiffusionPage() {
  const [appQrUrl, setAppQrUrl] = useState('');
  const [waQrUrl, setWaQrUrl] = useState('');
  const [copied, setCopied] = useState<'app' | 'wa' | null>(null);

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

  const handlePrint = () => window.print();

  const poster = (
    <div id="poster-content">
      <Poster appQrUrl={appQrUrl} waQrUrl={waQrUrl} />
    </div>
  );

  return (
    <>
      <style>{`
        @media screen {
          #poster-content { display: none !important; }
        }
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          #root { display: none !important; }
          body { background: white !important; margin: 0; padding: 0; }
          #poster-content {
            display: flex !important;
            position: fixed !important;
            inset: 0 !important;
            align-items: center !important;
            justify-content: center !important;
          }
        }
      `}</style>

      <div className="min-h-screen py-8 sm:py-12 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Share2 className="w-8 h-8 text-brand-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">Difundí Sigo Tu Huella</h1>
            <p className="text-gray-500 mt-2 text-sm sm:text-base">Ayudanos a llegar a más vecinos. Compartí los códigos o imprimí un cartel.</p>
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

          {/* Cartel — preview on screen */}
          <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 mb-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                <Printer className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">Cartel para imprimir</h2>
                <p className="text-sm text-gray-500">Pegalo en veterinarias, plazas y comercios</p>
              </div>
            </div>

            <Poster appQrUrl={appQrUrl} waQrUrl={waQrUrl} />

            <div className="flex justify-center mt-6">
              <button onClick={handlePrint} className="flex items-center gap-2 px-8 py-3.5 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all">
                <Printer className="w-5 h-5" /> Imprimir / Descargar PDF
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center leading-relaxed">
            sigotuhuella.online
          </p>
        </div>
      </div>

      {createPortal(poster, document.body)}
    </>
  );
}
