import { Camera, PawPrint, MapPin } from 'lucide-react';

export default function MockAdoptionPublish() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-[1.5rem] border border-brand-accent shadow-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center">
            <PawPrint className="w-4 h-4 text-purple-500" />
          </div>
          <h3 className="text-sm font-bold text-gray-800">Publicar en adopción</h3>
          <span className="ml-auto text-[9px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-bold">Adopción</span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="aspect-square rounded-xl bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center">
            <PawPrint className="w-6 h-6 text-white/80" />
          </div>
          <div className="aspect-square rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <PawPrint className="w-5 h-5 text-gray-300" />
          </div>
          <label className="aspect-square rounded-xl border-2 border-dashed border-brand-accent flex flex-col items-center justify-center gap-1 cursor-pointer">
            <Camera className="w-5 h-5 text-gray-400" />
            <span className="text-[7px] uppercase font-bold text-gray-400">Subir Foto</span>
          </label>
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Nombre (si lo tiene)</label>
          <div className="w-full px-3 py-2.5 bg-brand-bg rounded-xl border border-brand-accent text-[11px] text-gray-700">Rocky</div>
        </div>

        <div className="flex gap-1.5">
          <span className="px-3 py-1.5 rounded-lg bg-brand-primary text-white text-[10px] font-bold">Perro</span>
          <span className="px-3 py-1.5 rounded-lg border border-brand-accent text-gray-500 text-[10px] font-bold">Gato</span>
          <span className="px-3 py-1.5 rounded-lg border border-brand-accent text-gray-500 text-[10px] font-bold">Otro</span>
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Ubicación</label>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-brand-bg rounded-xl border border-brand-accent text-[11px] text-gray-700">
            <MapPin className="w-3 h-3 text-brand-secondary" /> La Plata
          </div>
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">WhatsApp de contacto</label>
          <div className="w-full px-3 py-2.5 bg-brand-bg rounded-xl border border-brand-accent text-[11px] text-gray-700">+54 9 221 555-1234</div>
        </div>

        <div className="w-full py-2.5 bg-purple-500 text-white rounded-xl text-[11px] font-bold text-center">
          Publicar aviso
        </div>
      </div>
    </div>
  );
}
