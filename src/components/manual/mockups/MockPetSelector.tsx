import { PawPrint, QrCode, Plus } from 'lucide-react';

export default function MockPetSelector() {
  return (
    <div className="p-4">
      <div className="text-center mb-3">
        <div className="w-11 h-11 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-2">
          <QrCode className="w-5 h-5 text-brand-primary" />
        </div>
        <h1 className="text-base font-bold text-brand-primary">Solicitar chappita QR</h1>
        <p className="text-[10px] text-gray-500 mt-1">Elegí una mascota para solicitar su chappita.</p>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-3 p-3 bg-brand-bg rounded-2xl border border-brand-accent">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center shrink-0">
            <PawPrint className="w-5 h-5 text-white/80" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-800 truncate">Rocky</p>
            <p className="text-[10px] text-gray-400">Perro · Labrador</p>
          </div>
          <div className="shrink-0 px-3 py-1.5 bg-brand-primary text-white rounded-xl text-[10px] font-bold flex items-center gap-1">
            <QrCode className="w-3 h-3" /> Solicitar
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-brand-bg rounded-2xl border border-brand-accent">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center shrink-0">
            <PawPrint className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-800 truncate">Luna</p>
            <p className="text-[10px] text-gray-400">Gata · Mestiza</p>
          </div>
          <div className="shrink-0 px-3 py-1.5 bg-brand-primary text-white rounded-xl text-[10px] font-bold flex items-center gap-1">
            <QrCode className="w-3 h-3" /> Solicitar
          </div>
        </div>
      </div>

      <div className="w-full py-2.5 border-2 border-dashed border-brand-accent rounded-2xl text-[11px] text-gray-500 flex items-center justify-center gap-1.5">
        <Plus className="w-3.5 h-3.5" /> Registrar nueva mascota
      </div>
    </div>
  );
}
