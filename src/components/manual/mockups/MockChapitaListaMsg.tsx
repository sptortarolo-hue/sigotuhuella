import { PawPrint, MapPin } from 'lucide-react';

export default function MockChapitaListaMsg() {
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
              🐾 ¡Tu chapita QR está lista!
            </p>
            <p className="mt-2">
              Hola <strong>Juan</strong>, la chapita QR de <strong>Rocky</strong> ya fue asignada.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] text-gray-500">Número de chapita:</span>
              <span className="font-mono font-bold text-brand-primary">AAA-0007</span>
            </div>
            <div className="mt-3 rounded-xl bg-white border border-gray-200 p-2.5 flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 text-brand-secondary mt-0.5 shrink-0" />
              <p className="text-[10px] text-gray-600">
                <strong>Retirala en Forrajería Lina</strong> — 659 entre 18 y 18bis · Mar a Vie 10 a 18:30 · Sáb 10 a 13:30
              </p>
            </div>
            <div className="mt-2 rounded-xl bg-emerald-500 px-3 py-2 text-center text-white font-bold text-[11px]">
              Ver perfil de Rocky
            </div>
            <p className="text-[9px] text-gray-500 mt-1.5 text-right">sigotuhuella.com.ar/mascota/abc123</p>
          </div>
          <p className="text-[9px] text-gray-500 text-center">WhatsApp</p>
        </div>
      </div>
    </div>
  );
}
