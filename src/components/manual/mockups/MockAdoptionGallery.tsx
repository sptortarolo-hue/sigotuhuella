import { MapPin } from 'lucide-react';

export default function MockAdoptionGallery() {
  const cards = [
    { name: 'Rocky', sub: 'Perro · Labrador', badge: 'En Adopción', chip: 'Perfil en la app', zone: 'La Plata' },
    { name: 'Luna', sub: 'Gata · Mestiza', badge: 'Aviso de adopción', chip: '', zone: 'Tolosa' },
  ];

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-bold text-brand-primary">En adopción</span>
        <span className="text-[10px] text-gray-400">{cards.length} mascotas</span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {cards.map((c) => (
          <div key={c.name} className="bg-white rounded-2xl border border-brand-accent overflow-hidden shadow-sm">
            <div className="relative aspect-square bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-white/40 flex items-center justify-center text-sm">🐾</div>
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider backdrop-blur-md bg-pink-100 text-pink-800 border border-pink-200">
                {c.badge}
              </span>
              {c.chip && (
                <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider backdrop-blur-md bg-brand-primary/90 text-white border border-brand-primary">
                  {c.chip}
                </span>
              )}
            </div>
            <div className="p-2.5">
              <p className="text-[12px] font-bold text-gray-800">{c.name}</p>
              <p className="text-[9px] text-gray-500 italic">{c.sub}</p>
              <p className="flex items-center gap-1 text-[9px] text-gray-600 mt-1">
                <MapPin className="w-2.5 h-2.5 text-brand-secondary" /> {c.zone}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] text-gray-500">
        Tocá una mascota para ver su ficha y contactar al responsable.
      </p>
    </div>
  );
}
