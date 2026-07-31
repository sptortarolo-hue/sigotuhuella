import { PawPrint, Heart } from 'lucide-react';

export default function MockMyPetsCard() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-bold text-brand-primary">Mis mascotas</span>
        <span className="text-[10px] text-gray-400">2 mascotas</span>
      </div>

      <div className="bg-white rounded-2xl border border-brand-accent overflow-hidden shadow-sm">
        <div className="h-24 bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center">
          <PawPrint className="w-9 h-9 text-white/80" />
        </div>
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-gray-800">Rocky</p>
              <p className="text-[10px] text-gray-400">Perro · Labrador</p>
            </div>
            <span className="text-[9px] px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full font-bold">Propia</span>
          </div>
          <div className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-rose-500 text-white text-xs font-bold">
            <Heart className="w-3.5 h-3.5" /> Dar en adopción
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-brand-accent overflow-hidden opacity-70">
        <div className="p-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center shrink-0">
            <PawPrint className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800">Luna</p>
            <p className="text-[10px] text-gray-400">Gata · Mestiza</p>
          </div>
        </div>
      </div>
    </div>
  );
}
