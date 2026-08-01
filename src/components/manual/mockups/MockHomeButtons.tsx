import { PawPrint, Search, Heart, HeartHandshake } from 'lucide-react';

export default function MockHomeButtons() {
  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-brand-primary/10 border border-brand-primary/30 rounded-2xl p-3 text-center">
          <div className="w-8 h-8 bg-brand-primary rounded-xl flex items-center justify-center mx-auto mb-1.5">
            <PawPrint className="w-4 h-4 text-white" />
          </div>
          <p className="font-bold text-brand-primary text-[9px] mb-0.5">Perdí mi mascota</p>
          <span className="text-brand-primary text-[8px]">→</span>
        </div>

        <div className="bg-brand-secondary/10 border border-brand-secondary/30 rounded-2xl p-3 text-center">
          <div className="w-8 h-8 bg-brand-secondary rounded-xl flex items-center justify-center mx-auto mb-1.5">
            <Search className="w-4 h-4 text-white" />
          </div>
          <p className="font-bold text-brand-primary text-[9px] mb-0.5">Encontré una mascota</p>
          <span className="text-brand-primary text-[8px]">→</span>
        </div>

        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-3 text-center">
          <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-1.5">
            <Heart className="w-4 h-4 text-red-500" />
          </div>
          <p className="font-bold text-brand-primary text-[9px] mb-0.5">Quiero adoptar</p>
          <span className="text-red-400 text-[8px]">→</span>
        </div>

        <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-3 text-center">
          <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-1.5">
            <HeartHandshake className="w-4 h-4 text-purple-500" />
          </div>
          <p className="font-bold text-brand-primary text-[9px] mb-0.5">Dar en adopción</p>
          <span className="text-purple-400 text-[8px]">→</span>
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] font-bold text-brand-primary">
        Desde el inicio podés dar en adopción o buscar una mascota para adoptar.
      </p>
    </div>
  );
}
