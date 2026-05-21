import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { PawPrint, Share2, Download, CheckCircle2, Printer, ChevronDown, ChevronUp } from 'lucide-react';

const LOCATIONS = [
  { value: '', label: 'General' },
  { value: 'Villa Garibaldi', label: 'Villa Garibaldi' },
  { value: 'Parque Sicardi', label: 'Parque Sicardi' },
  { value: 'Ignacio Correas', label: 'Ignacio Correas' },
];

const BARRIO_COLORS: Record<string, string> = {
  'Villa Garibaldi': '#5A5A40',
  'Parque Sicardi': '#D48C70',
  'Ignacio Correas': '#3B6B4A',
};

export default function DiffusionPage() {
  const [searchParams] = useSearchParams();
  const locationParam = searchParams.get('location') || '';
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [posterQrUrl, setPosterQrUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPoster, setShowPoster] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  const reportUrl = 'https://sigotuhuella.online/reportar-rapido';

  const posterUrl = locationParam
    ? `https://sigotuhuella.online/reportar-rapido?location=${encodeURIComponent(locationParam)}`
    : reportUrl;

  useEffect(() => {
    QRCode.toDataURL(reportUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#5A5A40', light: '#ffffff' },
    }).then(setQrDataUrl).catch(console.error);
  }, []);

  useEffect(() => {
    QRCode.toDataURL(posterUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#1e293b', light: '#ffffff' },
    }).then(setPosterQrUrl).catch(console.error);
  }, [posterUrl]);

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

  const handleDownloadQr = () => {
    const link = document.createElement('a');
    link.download = 'sigo-tu-huella-qr.png';
    link.href = qrDataUrl;
    link.click();
  };

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Share2 className="w-8 h-8 text-brand-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">Difundí Sigo Tu Huella</h1>
          <p className="text-gray-500 mt-2 text-sm sm:text-base">Ayudanos a llegar a más vecinos. Compartí el código QR o imprimí un cartel para tu barrio.</p>
        </div>

        {/* ===== QR DIGITAL ===== */}
        <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 mb-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <Share2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">QR Digital</h2>
              <p className="text-sm text-gray-500">Compartilo en WhatsApp, redes o descargalo</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="bg-brand-bg rounded-2xl p-6 border border-brand-accent">
              {qrDataUrl && (
                <img src={qrDataUrl} alt="QR" className="w-48 h-48" />
              )}
            </div>
            <div className="flex flex-col gap-3 w-full sm:w-auto">
              <button onClick={handleShare} className="w-full sm:w-56 py-3.5 bg-brand-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all">
                {copied ? <><CheckCircle2 className="w-5 h-5" /> Link copiado</> : <><Share2 className="w-5 h-5" /> Compartir QR</>}
              </button>
              <button onClick={handleDownloadQr} className="w-full sm:w-56 py-3.5 border border-brand-accent text-gray-700 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand-bg transition-all">
                <Download className="w-5 h-5" /> Descargar imagen
              </button>
              <p className="text-xs text-gray-400 text-center sm:text-left mt-1">PNG · 400×400 · fondo transparente</p>
            </div>
          </div>
        </div>

        {/* ===== CARTEL IMPRIMIBLE ===== */}
        <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 mb-6 shadow-sm">
          <button onClick={() => setShowPoster(!showPoster)} className="w-full flex items-center gap-3 text-left">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-800">Cartel para imprimir</h2>
              <p className="text-sm text-gray-500">Pegalo en veterinarias, plazas y comercios del barrio</p>
            </div>
            {showPoster ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>

          {showPoster && (
            <div ref={posterRef} className="mt-6 space-y-6">
              {/* Location selector */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <label className="text-sm font-bold text-gray-700 whitespace-nowrap">Barrio:</label>
                <div className="flex flex-wrap gap-2">
                  {LOCATIONS.map(loc => (
                    <button
                      key={loc.value}
                      onClick={() => {
                        const params = new URLSearchParams(searchParams);
                        if (loc.value) params.set('location', loc.value);
                        else params.delete('location');
                        window.location.href = `/difusion${params.toString() ? '?' + params.toString() : ''}`;
                      }}
                      className={`px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${
                        locationParam === loc.value
                          ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                          : 'border-brand-accent text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {loc.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Poster preview */}
              <div className="border border-brand-accent rounded-[2rem] overflow-hidden max-w-sm mx-auto shadow-sm">
                <div className="py-3 px-5 flex items-center justify-center gap-2" style={{ backgroundColor: BARRIO_COLORS[locationParam] || '#5A5A40' }}>
                  <PawPrint className="w-5 h-5 text-white" />
                  <span className="font-serif font-bold text-lg text-white">Sigo tu huella</span>
                </div>
                <div className="p-6 text-center">
                  <p className="text-3xl mb-2">🐾</p>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">
                    {locationParam ? `¿Viste un animal en ${locationParam}?` : '¿Viste un animal perdido?'}
                  </h3>
                  <p className="text-sm text-gray-500">Reportalo al instante sin necesidad de registro</p>
                </div>
                <div className="flex justify-center pb-4">
                  {posterQrUrl && <img src={posterQrUrl} alt="QR" className="w-44 h-44" />}
                </div>
                <div className="px-6 pb-4 text-center">
                  <p className="text-[10px] text-gray-400 font-mono break-all">{posterUrl}</p>
                </div>
                <div className="px-6 pb-6 text-center space-y-1.5">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center justify-center gap-2 text-xs text-gray-600">
                      <span className="w-5 h-5 bg-brand-primary/10 rounded-full flex items-center justify-center text-[10px] font-bold text-brand-primary">{i}</span>
                      {i === 1 ? 'Escaneá el código con tu celular' : i === 2 ? 'Completá especie, descripción y ubicación' : 'Listo, ya se difunde en la red'}
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-100 py-3 px-6 text-center">
                  <p className="text-[10px] text-gray-400">
                    {locationParam ? `${locationParam} · ` : ''}Villa Garibaldi · Parque Sicardi · Ignacio Correas
                  </p>
                  <p className="text-[10px] text-gray-400">sigotuhuella.online</p>
                </div>
              </div>

              {/* Print button */}
              <div className="flex justify-center">
                <button onClick={handlePrint} className="flex items-center gap-2 px-8 py-3.5 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all">
                  <Printer className="w-5 h-5" /> Imprimir cartel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <p className="text-xs text-gray-400 text-center leading-relaxed">
          Villa Garibaldi · Parque Sicardi · Ignacio Correas<br />
          sigotuhuella.online
        </p>
      </div>
    </div>
  );
}
