import { CheckCircle2 } from 'lucide-react';

export default function MockSolicitudExitosa() {
  return (
    <div className="p-4 flex flex-col items-center text-center">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 mt-2">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h1 className="text-lg font-bold text-brand-primary">¡Solicitud enviada!</h1>
      <p className="text-[11px] text-gray-600 mt-1 max-w-[220px]">
        Rocky ya está en lista para recibir su chappita identificadora QR.
      </p>
      <p className="text-[10px] text-gray-500 mt-2 max-w-[220px]">
        Te notificaremos cuando esté lista. Mientras tanto, podés completar el perfil de tu mascota.
      </p>

      <div className="mt-4 w-full py-2.5 bg-brand-primary text-white rounded-xl text-xs font-bold">
        Ir a mis mascotas
      </div>
    </div>
  );
}
