import { CheckCircle2, QrCode } from 'lucide-react';

export default function MockSuccessScreen() {
  return (
    <div className="p-4 flex flex-col items-center text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 mt-2">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h1 className="text-lg font-bold text-brand-primary">¡Adopción confirmada!</h1>
      <p className="text-[11px] text-gray-600 mt-1 max-w-[220px]">
        Rocky ahora es parte de tu familia. La chapita QR ya está asociada a tu cuenta.
      </p>

      <div className="mt-4 bg-white border border-brand-accent rounded-2xl p-3 flex items-center gap-3 shadow-sm">
        <div className="w-12 h-12 bg-brand-bg rounded-xl flex items-center justify-center">
          <QrCode className="w-7 h-7 text-brand-primary" />
        </div>
        <div className="text-left">
          <p className="text-[11px] font-bold text-gray-800">QR asociado</p>
          <p className="text-[9px] text-gray-400">Al escanearlo ven tus datos de contacto</p>
        </div>
      </div>

      <div className="mt-4 w-full py-2.5 bg-brand-primary text-white rounded-xl text-xs font-bold">
        Ir a mis mascotas
      </div>
    </div>
  );
}
