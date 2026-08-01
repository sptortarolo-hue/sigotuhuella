import { QrCode, Copy, Check } from 'lucide-react';

export default function MockQrAsignado() {
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

        <div className="p-3 bg-brand-bg rounded-2xl flex items-center gap-4">
          <div className="w-20 h-20 bg-white rounded-xl border border-brand-accent flex items-center justify-center shrink-0">
            <QrCode className="w-12 h-12 text-brand-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-brand-primary font-mono">AAA-0007</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Escaneá para ver el perfil público</p>
            <div className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-lg text-[10px] font-medium">
              <Copy className="w-3 h-3" /> Copiar link
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-[10px] text-emerald-700">
          <Check className="w-3.5 h-3.5 shrink-0" /> Chapita asignada. Retirala y colocala en el collar de Rocky.
        </div>
      </div>
    </div>
  );
}
