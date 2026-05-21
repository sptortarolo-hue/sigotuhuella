import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { PawPrint, Printer } from 'lucide-react';

const LOCATIONS = [
  { value: '', label: 'General' },
  { value: 'Villa Garibaldi', label: 'Villa Garibaldi' },
  { value: 'Parque Sicardi', label: 'Parque Sicardi' },
  { value: 'Ignacio Correas', label: 'Ignacio Correas' },
];

const BARRIO_COLORS: Record<string, { bg: string; text: string }> = {
  'Villa Garibaldi': { bg: '#5A5A40', text: '#F5F5F0' },
  'Parque Sicardi': { bg: '#D48C70', text: '#F5F5F0' },
  'Ignacio Correas': { bg: '#3B6B4A', text: '#F5F5F0' },
};

export default function PosterPage() {
  const [searchParams] = useSearchParams();
  const locationParam = searchParams.get('location') || '';
  const [qrDataUrl, setQrDataUrl] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barrio = LOCATIONS.find(l => l.value === locationParam);
  const colors = BARRIO_COLORS[locationParam] || { bg: '#5A5A40', text: '#F5F5F0' };

  const reportUrl = locationParam
    ? `https://sigotuhuella.online/reportar-rapido?location=${encodeURIComponent(locationParam)}`
    : 'https://sigotuhuella.online/reportar-rapido';

  useEffect(() => {
    QRCode.toDataURL(reportUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#1e293b', light: '#ffffff' },
    }).then(setQrDataUrl).catch(console.error);
  }, [reportUrl]);

  const handlePrint = () => window.print();

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Toolbar */}
      <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <PawPrint className="w-6 h-6 text-brand-primary" />
          <h1 className="text-lg font-bold text-brand-primary">Cartel para imprimir</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={locationParam}
            onChange={(e) => {
              const val = e.target.value;
              window.location.href = val ? `/descargar-cartel?location=${encodeURIComponent(val)}` : '/descargar-cartel';
            }}
            className="px-3 py-2 border border-brand-accent rounded-xl text-sm"
          >
            {LOCATIONS.map(loc => (
              <option key={loc.value} value={loc.value}>{loc.label}</option>
            ))}
          </select>
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* Poster */}
      <div className="max-w-lg mx-auto px-4 pb-12">
        <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden print:shadow-none print:rounded-none" style={{ pageBreakInside: 'avoid' }}>
          {/* Header bar */}
          <div className="py-4 px-6 flex items-center justify-center gap-3" style={{ backgroundColor: colors.bg }}>
            <PawPrint className="w-6 h-6" style={{ color: colors.text }} />
            <span className="font-serif font-bold text-xl" style={{ color: colors.text }}>Sigo tu huella</span>
          </div>

          {/* Hero */}
          <div className="px-8 pt-8 pb-4 text-center">
            <p className="text-4xl mb-2">🐾</p>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {locationParam ? `¿Viste un animal en ${locationParam}?` : '¿Viste un animal perdido?'}
            </h2>
            <p className="text-gray-500">Reportalo al instante sin necesidad de registro</p>
          </div>

          {/* QR */}
          <div className="flex justify-center py-4">
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR" className="w-56 h-56" />
            )}
          </div>

          {/* URL */}
          <div className="px-8 pb-2 text-center">
            <p className="text-xs text-gray-400 font-mono break-all">{reportUrl}</p>
          </div>

          {/* Instructions */}
          <div className="px-8 pb-8 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <span className="w-6 h-6 bg-brand-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-brand-primary">1</span>
              Escaneá el código con tu celular
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <span className="w-6 h-6 bg-brand-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-brand-primary">2</span>
              Completá especie, descripción y ubicación
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <span className="w-6 h-6 bg-brand-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-brand-primary">3</span>
              Listo, ya se difunde en la red
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 py-4 px-8 text-center">
            <p className="text-xs text-gray-400">
              {locationParam ? `${locationParam} · ` : ''}Villa Garibaldi · Parque Sicardi · Ignacio Correas
            </p>
            <p className="text-xs text-gray-400 mt-1">sigotuhuella.online</p>
          </div>
        </div>
      </div>
    </div>
  );
}
