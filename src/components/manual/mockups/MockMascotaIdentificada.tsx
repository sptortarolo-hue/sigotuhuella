import { PawPrint, QrCode } from 'lucide-react';

export default function MockMascotaIdentificada() {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between px-1 mb-3">
        <span className="text-sm font-bold text-brand-primary">Mis mascotas</span>
        <span className="text-[10px] text-gray-400">1 mascota</span>
      </div>

      <div className="bg-white rounded-2xl border border-brand-accent overflow-hidden shadow-sm">
        <div className="relative h-24 bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center">
          <PawPrint className="w-9 h-9 text-white/80" />
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-full text-[9px] text-gray-700 font-bold">
            <QrCode className="w-3 h-3 text-brand-primary" /> Identificado
          </div>
        </div>
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800">Rocky</p>
              <p className="text-[10px] text-gray-400">Perro · Labrador</p>
            </div>
            <span className="text-[9px] px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded-full font-bold">AAA-0007</span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] font-bold text-brand-primary">
        Las mascotas con chapita muestran el sello "Identificado".
      </p>
    </div>
  );
}
