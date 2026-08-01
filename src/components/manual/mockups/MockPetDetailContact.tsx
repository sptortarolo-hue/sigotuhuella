import { MessageCircle, MapPin } from 'lucide-react';

export default function MockPetDetailContact() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-[1.5rem] border border-brand-accent shadow-xl overflow-hidden">
        <div className="aspect-square bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-white/40 flex items-center justify-center text-xl">🐾</div>
          <span className="absolute top-4 left-4 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-pink-100 text-pink-800 border border-pink-200">
            En Adopción
          </span>
          <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-brand-primary/90 text-white border border-brand-primary">
            Perfil en la app
          </span>
        </div>

        <div className="p-4">
          <h3 className="text-base font-serif font-bold text-brand-primary">Rocky</h3>
          <p className="text-[10px] text-gray-500 italic">Perro · Macho</p>

          <div className="flex items-center gap-1.5 text-[10px] text-gray-600 mt-2">
            <MapPin className="w-3 h-3 text-brand-secondary" /> La Plata
          </div>

          <div className="mt-3 w-full py-2.5 rounded-xl bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" /> Contactar por WhatsApp
          </div>

          <p className="mt-2 text-[9px] text-gray-400 text-center">
            El contacto te lleva a hablar con el responsable de la mascota.
          </p>
        </div>
      </div>
    </div>
  );
}
