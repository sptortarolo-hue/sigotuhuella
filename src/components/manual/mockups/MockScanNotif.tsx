import { PawPrint, MapPin, Check } from 'lucide-react';

export default function MockScanNotif() {
  return (
    <div className="p-4">
      <div className="rounded-2xl overflow-hidden shadow-xl border border-gray-200">
        <div className="bg-emerald-600 px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <PawPrint className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Sigo Tu Huella</p>
            <p className="text-[10px] text-emerald-100">en línea</p>
          </div>
        </div>
        <div className="bg-[#E5DDD5] p-4 space-y-2">
          <div className="ml-auto max-w-[90%] bg-[#DCF8C6] rounded-2xl rounded-tr-sm p-3 text-[11px] leading-snug text-gray-800 shadow-sm">
            <p>
              📍 <strong>Escanearon el QR de Rocky</strong>
            </p>
            <p className="mt-2">
              Alguien vio el perfil digital de <strong>Rocky</strong>.
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-600">
              <MapPin className="w-3 h-3 text-brand-secondary" /> cerca de La Plata
            </div>
            <div className="mt-3 rounded-xl bg-emerald-500 px-3 py-2 text-center text-white font-bold text-[11px] flex items-center justify-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Rocky está siendo visto
            </div>
            <p className="text-[9px] text-gray-500 mt-1.5 text-right">hace 2 min</p>
          </div>
          <p className="text-[9px] text-gray-500 text-center">WhatsApp</p>
        </div>
      </div>
    </div>
  );
}
