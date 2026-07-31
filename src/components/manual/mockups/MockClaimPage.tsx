import { Heart, Check, User, XCircle } from 'lucide-react';

export default function MockClaimPage() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-[1.5rem] border border-brand-accent shadow-xl p-5">
        <div className="text-center mb-4">
          <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <Heart className="w-6 h-6 text-rose-500" />
          </div>
          <h1 className="text-base font-bold text-brand-primary">Te eligieron para adoptar</h1>
          <p className="text-[10px] text-gray-500 mt-1">Juan te confía a <strong>Rocky</strong> para que sea parte de tu familia</p>
        </div>

        <div className="bg-brand-bg rounded-2xl p-3 mb-4 space-y-2">
          <div className="flex items-center gap-2 text-[11px]">
            <User className="w-3.5 h-3.5 text-brand-primary" />
            <span className="text-gray-700"><strong>Rocky</strong></span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-600">Perro · Labrador</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <User className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-600">Color: dorado</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 mb-4">
          <p className="text-[10px] text-amber-800 leading-relaxed">
            Al confirmar, la mascota pasa a ser <strong>oficialmente tuya</strong>, la chapita QR se asocia a tu cuenta y podés gestionar su perfil completo.
          </p>
          <ul className="space-y-1.5 mt-2">
            <li className="flex items-start gap-1.5 text-[10px] text-amber-700">
              <Check className="w-3 h-3 text-green-600 mt-0.5 shrink-0" /> La mascota aparece en "Mis mascotas"
            </li>
            <li className="flex items-start gap-1.5 text-[10px] text-amber-700">
              <Check className="w-3 h-3 text-green-600 mt-0.5 shrink-0" /> El QR queda a tu nombre
            </li>
            <li className="flex items-start gap-1.5 text-[10px] text-amber-700">
              <XCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" /> El dueño anterior ya no la modifica
            </li>
          </ul>
        </div>

        <div className="w-full py-2.5 bg-brand-primary text-white rounded-xl text-xs font-bold text-center">
          Confirmar adopción
        </div>
      </div>
    </div>
  );
}
