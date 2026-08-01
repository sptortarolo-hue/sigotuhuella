import { PawPrint, MapPin, Phone } from 'lucide-react';

export default function MockScanPerfilPublico() {
  return (
    <div className="p-4">
      <div className="bg-white rounded-[1.5rem] border border-brand-accent shadow-xl overflow-hidden">
        <div className="relative aspect-square bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-white/40 flex items-center justify-center text-xl">🐾</div>
          <span className="absolute top-4 left-4 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-brand-primary/90 text-white border border-brand-primary">
            Chip QR · AAA-0007
          </span>
        </div>

        <div className="p-4">
          <h3 className="text-base font-serif font-bold text-brand-primary">Rocky</h3>
          <p className="text-[10px] text-gray-500 italic">Perro · Macho · Labrador</p>

          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
              <MapPin className="w-3 h-3 text-brand-secondary" /> La Plata · Parque Sicardi
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
              <Phone className="w-3 h-3 text-brand-secondary" /> +54 9 221 555-1234
            </div>
            <p className="text-[10px] text-gray-600 leading-snug pt-1">
              Muy juguetón y amigable. Si lo estás viendo, avisale a Juan que Rocky anda por ahí. 🐾
            </p>
          </div>

          <div className="mt-3 w-full py-2.5 rounded-xl bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5">
            <Phone className="w-3.5 h-3.5" /> ¡Encontré a Rocky!
          </div>
          <p className="mt-2 text-[9px] text-gray-400 text-center">
            Al escanear el QR, quien lo encuentre ve el perfil y puede contactar al dueño.
          </p>
        </div>
      </div>
    </div>
  );
}
