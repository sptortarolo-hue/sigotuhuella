import { QrCode } from 'lucide-react';

export default function MockQrPendiente() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-[1.5rem] border border-brand-accent shadow-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-brand-primary/10 rounded-xl flex items-center justify-center">
            <QrCode className="w-4 h-4 text-brand-primary" />
          </div>
          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400">
            Identificación QR
          </h4>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-700">
          Solicitud de QR enviada. El admin te lo asignará pronto.
        </div>

        <div className="mt-3 p-3 bg-brand-bg rounded-2xl border border-brand-accent flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center shrink-0">
            <QrCode className="w-5 h-5 text-white/80" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-800">Rocky</p>
            <p className="text-[10px] text-gray-400">Perro · Labrador</p>
          </div>
        </div>
      </div>
    </div>
  );
}
