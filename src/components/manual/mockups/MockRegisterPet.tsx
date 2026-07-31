import { PawPrint, Save } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const PET_TYPES = [
  { value: 'own', label: 'Propia', desc: 'Mascota de la familia' },
  { value: 'foster', label: 'Tránsito', desc: 'Está de paso en casa' },
  { value: 'adoption', label: 'Adopción', desc: 'Busca un hogar' },
  { value: 'community', label: 'Comunitaria', desc: 'De la cuadra/barrio' },
];

export default function MockRegisterPet() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-[1.5rem] border border-brand-accent shadow-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-brand-primary/10 rounded-xl flex items-center justify-center">
            <PawPrint className="w-4 h-4 text-brand-primary" />
          </div>
          <h3 className="text-sm font-bold text-gray-800">Registrar mascota</h3>
        </div>

        <div className="mb-3">
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Nombre</label>
          <div className="w-full p-2 rounded-xl border border-brand-accent text-[11px] text-gray-700">Rocky</div>
        </div>

        <div className="mb-3">
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Especie</label>
          <div className="flex gap-1.5">
            <span className="px-3 py-1.5 rounded-lg bg-brand-primary text-white text-[10px] font-bold">Perro</span>
            <span className="px-3 py-1.5 rounded-lg border border-brand-accent text-gray-500 text-[10px] font-bold">Gato</span>
            <span className="px-3 py-1.5 rounded-lg border border-brand-accent text-gray-500 text-[10px] font-bold">Otro</span>
          </div>
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1 block">Tipo</label>
          <div className="grid grid-cols-2 gap-1.5">
            {PET_TYPES.map(opt => (
              <button
                key={opt.value}
                className={cn(
                  'p-2 rounded-lg border text-left transition-all',
                  opt.value === 'adoption'
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                    : 'border-brand-accent text-gray-600',
                )}
              >
                <div className="text-[10px] font-semibold">{opt.label}</div>
                <div className="text-[8px] opacity-70">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-brand-primary text-white text-[11px] font-bold">
          <Save className="w-3.5 h-3.5" /> Registrar mascota
        </div>
      </div>
    </div>
  );
}
