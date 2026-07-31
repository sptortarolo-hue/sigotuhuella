import { PawPrint } from 'lucide-react';

export default function MockWhatsAppMsg() {
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
          <div className="ml-auto max-w-[85%] bg-[#DCF8C6] rounded-2xl rounded-tr-sm p-3 text-[11px] leading-snug text-gray-800 shadow-sm">
            <p>
              <strong>Juan</strong> te eligió para darle un hogar a <strong>Rocky</strong> a través de Sigo Tu Huella.
            </p>
            <p className="mt-2">
              Rocky va a ser oficialmente tuyo y su chapita QR quedará asociada a tu nombre.
            </p>
            <div className="mt-3 rounded-xl bg-emerald-500 px-3 py-2 text-center text-white font-bold text-[11px]">
              Ver y confirmar adopción
            </div>
            <p className="text-[9px] text-gray-500 mt-1.5 text-right">sigotuhuella.com.ar/adopcion/reclamar/abc123</p>
          </div>
          <p className="text-[9px] text-gray-500 text-center">WhatsApp</p>
        </div>
      </div>
    </div>
  );
}
