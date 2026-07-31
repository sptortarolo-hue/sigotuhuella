import { Heart } from 'lucide-react';

export default function MockAdoptionModal() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-[1.5rem] border border-brand-accent shadow-xl p-5 space-y-3">
        <div className="text-center">
          <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <Heart className="w-6 h-6 text-rose-500" />
          </div>
          <h3 className="text-base font-bold text-gray-800">Dar en adopción</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Ingresá los datos de la persona que se lleva a Rocky</p>
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Nombre del adoptante *</label>
          <div className="w-full p-2.5 rounded-xl border border-brand-accent text-[11px] text-gray-700">María González</div>
        </div>
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Email *</label>
          <div className="w-full p-2.5 rounded-xl border border-brand-accent text-[11px] text-gray-700">maria@gmail.com</div>
        </div>
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">WhatsApp *</label>
          <div className="w-full p-2.5 rounded-xl border border-brand-accent text-[11px] text-gray-700">+54 9 221 555-1234</div>
        </div>

        <div className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-rose-500 text-white text-xs font-bold">
          <Heart className="w-3.5 h-3.5" /> Confirmar entrega
        </div>
      </div>
    </div>
  );
}
