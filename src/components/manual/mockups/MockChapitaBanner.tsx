import { QrCode, Share2 } from 'lucide-react';

export default function MockChapitaBanner() {
  return (
    <div className="p-4">
      <div className="bg-gradient-to-r from-brand-primary/[0.03] to-brand-secondary/[0.03] rounded-[1.75rem] border border-brand-accent p-4 flex flex-col items-center gap-3">
        <div className="flex items-center gap-3 w-full">
          <img src="/chapita.png" alt="Chapita QR" className="w-16 h-16 object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-brand-primary">
              Chappita identificadora <span className="text-brand-secondary">gratis</span>
            </h3>
            <p className="text-[10px] text-gray-600 mt-0.5 leading-snug">
              Protegé a tu mascota con una chappita QR. Quien la encuentre escanea y ve tus datos de contacto.
            </p>
          </div>
        </div>
        <div className="flex gap-2 w-full">
          <div className="flex-1 py-2.5 bg-brand-primary text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
            <QrCode className="w-3.5 h-3.5" /> Solicitar
          </div>
          <div className="flex-1 py-2.5 bg-white border border-brand-accent text-brand-primary rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
            <Share2 className="w-3.5 h-3.5" /> Compartir
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[10px] font-bold text-brand-primary">
        Desde el inicio podés pedir la chapita para cualquiera de tus mascotas.
      </p>
    </div>
  );
}
