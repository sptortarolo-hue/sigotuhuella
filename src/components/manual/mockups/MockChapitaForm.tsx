import { PawPrint, Camera, QrCode, User } from 'lucide-react';

const PET_TYPES = [
  { value: 'own', label: 'Propia', desc: 'Mascota de la familia' },
  { value: 'foster', label: 'Tránsito', desc: 'Está de paso en casa' },
  { value: 'adoption', label: 'Adopción', desc: 'Busca un hogar' },
  { value: 'community', label: 'Comunitaria', desc: 'De la cuadra/barrio' },
];

export default function MockChapitaForm() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-[1.5rem] border border-brand-accent shadow-xl p-4 space-y-3">
        <div className="text-center mb-1">
          <div className="w-11 h-11 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <QrCode className="w-5 h-5 text-brand-primary" />
          </div>
          <h3 className="text-sm font-bold text-brand-primary">Solicitar chappita identificadora</h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-brand-accent bg-brand-bg flex items-center justify-center shrink-0">
            <Camera className="w-6 h-6 text-brand-accent" />
          </div>
          <div className="flex-1">
            <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 block">Nombre *</label>
            <div className="mt-1 w-full p-2 rounded-xl border border-brand-accent text-[11px] text-gray-700">Rocky</div>
          </div>
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Especie *</label>
          <div className="flex gap-1.5">
            <span className="px-3 py-1.5 rounded-lg bg-brand-primary text-white text-[10px] font-bold">Perro</span>
            <span className="px-3 py-1.5 rounded-lg border border-brand-accent text-gray-500 text-[10px] font-bold">Gato</span>
            <span className="px-3 py-1.5 rounded-lg border border-brand-accent text-gray-500 text-[10px] font-bold">Otro</span>
          </div>
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Clasificación</label>
          <div className="grid grid-cols-2 gap-1.5">
            {PET_TYPES.map(opt => (
              <div
                key={opt.value}
                className={`p-2 rounded-lg border text-left ${
                  opt.value === 'own' ? 'border-brand-primary bg-brand-primary/10' : 'border-brand-accent'
                }`}
              >
                <div className="text-[10px] font-semibold text-gray-700">{opt.label}</div>
                <div className="text-[8px] text-gray-400">{opt.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Tus datos</label>
          <div className="space-y-1.5">
            <div className="w-full p-2 bg-brand-bg rounded-xl border border-brand-accent text-[11px] text-gray-700">Juan Pérez</div>
            <div className="w-full p-2 bg-brand-bg rounded-xl border border-brand-accent text-[11px] text-gray-400 flex items-center gap-1.5">
              <User className="w-3 h-3" /> juan@email.com
            </div>
          </div>
        </div>

        <div className="w-full py-2.5 bg-brand-primary text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5">
          <PawPrint className="w-3.5 h-3.5" /> Solicitar chappita QR
        </div>
      </div>
    </div>
  );
}
