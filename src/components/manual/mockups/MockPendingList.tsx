import { Clock, PawPrint, User, AlertTriangle, Check } from 'lucide-react';

export default function MockPendingList() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Clock className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-bold text-brand-primary">Adopciones pendientes</span>
      </div>

      <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <PawPrint className="w-4 h-4 text-brand-primary shrink-0" />
              <h3 className="text-xs font-bold text-gray-800 truncate">Rocky</h3>
              <span className="text-[9px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">Perro</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> María González</span>
            </div>
            <p className="text-[9px] text-gray-400 mt-1">Creada: 30/07/2026</p>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0 sm:flex-row sm:items-center">
            <button className="shrink-0 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-medium flex items-center justify-center gap-1">
              <Check className="w-3 h-3" /> Confirmar
            </button>
            <button className="shrink-0 px-2.5 py-1.5 bg-red-50 text-red-600 rounded-xl text-[10px] font-medium flex items-center justify-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Cancelar
            </button>
          </div>
        </div>
        <div className="mt-3 p-2 bg-amber-50 rounded-xl border border-amber-100 text-[10px] text-amber-700">
          El adoptante puede confirmar al abrir el link, o podés confirmar vos para cerrar la adopción. Si no se concreta, podés cancelar.
        </div>
      </div>
    </div>
  );
}
