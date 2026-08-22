import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Pet, getPetImageUrl, getPetCoordinates, getPublicContact } from '@/src/lib/petService';
import { NEIGHBORHOODS } from '@/src/lib/neighborhoods';
import { Mail } from 'lucide-react';
import { LinkifiedText } from '@/src/lib/linkify';

interface PetMapProps {
  pets: Pet[];
  center: { lat: number; lng: number };
}

const statusColors: Record<string, string> = {
  lost: 'text-red-500',
  retained: 'text-blue-500',
  sighted: 'text-amber-500',
  accidented: 'text-purple-500',
  needs_attention: 'text-amber-600',
  for_adoption: 'text-pink-500',
  for_adoption_simple: 'text-orange-500',
  adopted: 'text-green-500',
  reunited: 'text-amber-500',
  found: 'text-amber-500',
  transitada: 'text-teal-500',
};

const speciesIcons = {
  dog: `<svg class="w-[11px] h-[11px] fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 21a1 1 0 0 1-1-1V16.51c0-.59.23-1.15.62-1.55l.64-.64c.39-.41.9-.63 1.45-.63a1.5 1.5 0 0 1 1.13.43l1.21 1.21c.56.56 1.33.8 2.06.48a1.5 1.5 0 0 0 1.2-1.2c-.32-.73-.08-1.5.48-2.06l1.21-1.21a1.5 1.5 0 0 1 1.88-.53 1.5 1.5 0 0 1 1.2 1.2c0 .77-.4 1.44-1 1.76l-.2.46c-.16.37-.12.78.09 1.1.21.33.58.46.9.32.32-.14.65-.38.88-.72l1.21-1.21a1.5 1.5 0 0 1 2.12 0 1.5 1.5 0 0 1 0 2.12l-1.21 1.21c-.37.37-.6.8-.72.88-.14.32-.01.69.32.9.21.32.62.36 1.1.09l.46-.2c.32-.32.99-.62 1.76-1l.46-.2a1.5 1.5 0 0 0 0-2.12 1.5 1.5 0 0 0-2.12 0l-1.21-1.21a3 3 0 0 0-.88-.72 1 1 0 0 0-.9-.32 1 1 0 0 0-1.1.09c-.37.2-.78.16-1.1-.09l-.46.2a1.5 1.5 0 0 1-2.12 0 1.5 1.5 0 0 1 0-2.12l1.21-1.21a3 3 0 0 0 .72-.88 1 1 0 0 0 .32-.9 1 1 0 0 0-.09-1.1l-.2-.46c-.32-.77-.62-1.44-1-1.76a1.5 1.5 0 0 1-.43-1.13c-.4-.4-.9-.62-1.45-.63l-.64-.64A4 4 0 0 0 12 21Z"/></svg>`,
  cat: `<svg class="w-[11px] h-[11px] fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-.07 1.22 2.41-1.54 5.41.79 5.71.25 0 .49-.17.61-.43a.6.6 0 0 0-.16-.9c-1.3-1.17-2.92-1.7-4.66-1.27C9.93 2.63 8.52 3.33 7.36 4.81c-1.74-1.1-3.71-.3-5.18 1.3-.14.15-.22.36-.24.58-.02.33.12.63.36.81 2.02 1.6 3.96 3.91 4.8 6.46-.09.44-.39.81-.83.91-.42.09-.84-.06-1.06-.4l-.14-.22c-.08-.14-.19-.27-.3-.38-.53-.53-1.3-1.15-2.25-1.15-.95 0-1.73.62-2.26 1.15-.11.11-.22.24-.3.38l-.14.22c-.22.34-.64.49-1.06.4-.44.1-.74-.27-.83-.91.84-2.55 2.78-4.86 4.8-6.46.24-.18.38-.48.36-.81-.02-.22-.1-.43-.24-.58-1.47-1.6-3.44-2.3-5.18-1.3-1.16-1.48-2.57-2.18-3.71-.69-.26.17-.4.38-.24.58 2.37 3.01 4.14 5.41.79 5.71 1.39 2.77 4.64 1.93 6.42.07.65-.17 1.33-.26 2-.26Z"/><path stroke="currentColor" stroke-width="1.8" d="M8 14v.5M16 14v.5"/></svg>`,
  other: `<svg class="w-[11px] h-[11px] fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M11 4a2 2 0 1 1 0 4h6a8 8 0 0 1-7 7.95M15.5 19a4.5 4.5 0 0 1-3.83-6.44"/></svg>`,
};

const createCustomIcon = (status: string, species?: string) => {
  const color = statusColors[status] || 'text-emerald-500';
  const speciesSvg = speciesIcons[species as keyof typeof speciesIcons] || speciesIcons.other;
  const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-8 h-8 fill-white stroke-[2.5px]"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06a5.5 5.5 0 0 0 7.78 0l1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  
  return L.divIcon({
    html: `<div class="${color} relative">${pinSvg}<div class="absolute inset-0 flex items-center justify-center pt-0.5">${speciesSvg}</div></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    className: 'custom-leaflet-icon',
  });
};

const createApproximateIcon = (species?: string) => {
  const speciesSvg = speciesIcons[species as keyof typeof speciesIcons] || speciesIcons.other;
  return L.divIcon({
    html: `<div class="w-8 h-8 rounded-full border-2 border-dashed border-amber-500 bg-amber-100/80 flex items-center justify-center shadow-sm">${speciesSvg}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    className: 'custom-leaflet-icon',
  });
};

function ContactLinks({ pet }: { pet: Pet }) {
  const contact = getPublicContact(pet);
  if (!contact.type) return null;
  if (contact.type === 'email') {
    return (
      <a href={`mailto:${contact.value}`} className="flex-1 bg-brand-primary text-white py-1.5 rounded-lg text-center text-[10px] font-bold shadow-sm no-underline inline-flex items-center justify-center gap-1">
        <Mail className="w-3 h-3" /> Escribir
      </a>
    );
  }
  return (
    <div className="flex gap-2">
      <a href={`tel:${contact.value}`} className="flex-1 bg-brand-primary text-white py-1.5 rounded-lg text-center text-[10px] font-bold shadow-sm no-underline">Llamar</a>
      <a href={`https://wa.me/${contact.value.replace(/\D/g, '')}`} className="flex-1 bg-emerald-500 text-white py-1.5 rounded-lg text-center text-[10px] font-bold shadow-sm no-underline">WhatsApp</a>
    </div>
  );
}

function getPetApproximateCoords(pet: Pet): { lat: number; lng: number; label: string } | null {
  const ns = (() => {
    if (Array.isArray(pet.neighborhoods)) return pet.neighborhoods;
    if (typeof pet.neighborhoods === 'string') try { return JSON.parse(pet.neighborhoods); } catch { return []; }
    return [];
  })();
  if (ns.length === 0) return null;
  const centers = ns.map(id => NEIGHBORHOODS.find(n => n.id === id)?.center).filter(Boolean) as { lat: number; lng: number }[];
  if (centers.length === 0) return null;
  const lat = centers.reduce((s, c) => s + c.lat, 0) / centers.length;
  const lng = centers.reduce((s, c) => s + c.lng, 0) / centers.length;
  return { lat, lng, label: ns.map(id => NEIGHBORHOODS.find(n => n.id === id)?.name).filter(Boolean).join(', ') };
}

function getApproxCircleRadius(ns: string[]): number {
  const bounds = ns.map(id => NEIGHBORHOODS.find(n => n.id === id)?.bounds).filter(Boolean) as { south: number; west: number; north: number; east: number }[];
  if (bounds.length === 0) return 800;
  const maxLatDiff = Math.max(...bounds.map(b => b.north - b.south));
  const maxLngDiff = Math.max(...bounds.map(b => b.east - b.west));
  const deg = Math.max(maxLatDiff, maxLngDiff) / 2;
  return deg * 111000;
}

const statusLabel = (s: string) => {
  switch (s) {
    case 'lost': return 'Perdido';
    case 'retained': return 'Retenido';
    case 'sighted': return 'Avistado';
    case 'accidented': return 'Accidentado';
    case 'needs_attention': return 'Necesita Atención';
    case 'for_adoption_simple': return 'Adopción (Difusión)';
    case 'transitada': return 'En Tránsito';
    default: return 'En Adopción';
  }
};

export default function PetMap({ pets, center }: PetMapProps) {
  const navigate = useNavigate();

  const openDetail = (pet: Pet) => {
    sessionStorage.setItem('pet_list_scroll', window.scrollY.toString());
    navigate(`/pet/${pet.id}`);
  };

  return (
    <div className="w-full h-[400px] md:h-[600px] rounded-[2.5rem] overflow-hidden border border-brand-accent shadow-xl relative z-0">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        zoomControl={false}
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomControl position="topright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {pets.map(pet => {
          const coords = getPetCoordinates(pet);
          if (coords) {
            return (
              <Marker
                key={pet.id}
                position={[coords.lat, coords.lng]}
                icon={createCustomIcon(pet.status, pet.species)}
              >
                <Popup>
                  <div className="p-1 max-w-[200px]">
                    <img
                      src={getPetImageUrl(pet) || '/sigotuhuella.jpg'}
                      className="w-full h-24 rounded-lg mb-2"
                      alt={pet.name || ''}
                      style={!getPetImageUrl(pet) ? { objectFit: 'contain', opacity: 0.15 } : { objectFit: 'cover' }}
                    />
                    <h4 className="font-bold text-brand-primary text-sm m-0">{pet.name || 'Mascota'}</h4>
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-1 mt-0">{statusLabel(pet.status)}</p>
                    <p className="text-[10px] text-gray-600 mb-3 line-clamp-2">{pet.description ? <LinkifiedText text={pet.description} /> : ''}</p>
                    <ContactLinks pet={pet} />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openDetail(pet); }}
                      className="w-full mt-2 bg-gray-800 text-white py-1.5 rounded-lg text-center text-[10px] font-bold shadow-sm hover:bg-gray-700 cursor-pointer"
                    >
                      Ver detalle →
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          }

          const approx = getPetApproximateCoords(pet);
          if (!approx) return null;

          const ns = (Array.isArray(pet.neighborhoods) ? pet.neighborhoods :
            typeof pet.neighborhoods === 'string' ? (() => { try { return JSON.parse(pet.neighborhoods); } catch { return []; } })() : []) as string[];

          return (
            <React.Fragment key={pet.id}>
              <Circle
                center={[approx.lat, approx.lng]}
                radius={getApproxCircleRadius(ns)}
                pathOptions={{
                  color: '#F59E0B',
                  fillColor: '#FBBF24',
                  fillOpacity: 0.12,
                  weight: 2,
                  dashArray: '6 4',
                  opacity: 0.6,
                }}
              />
              <Marker
                position={[approx.lat, approx.lng]}
                icon={createApproximateIcon(pet.species)}
              >
                <Popup>
                  <div className="p-1 max-w-[200px]">
                    <img
                      src={getPetImageUrl(pet) || '/sigotuhuella.jpg'}
                      className="w-full h-24 rounded-lg mb-2"
                      alt={pet.name || ''}
                      style={!getPetImageUrl(pet) ? { objectFit: 'contain', opacity: 0.15 } : { objectFit: 'cover' }}
                    />
                    <h4 className="font-bold text-brand-primary text-sm m-0">{pet.name || 'Mascota'}</h4>
                    <p className="text-[10px] text-gray-500 uppercase font-bold mb-1 mt-0">{statusLabel(pet.status)}</p>
                    <p className="text-[10px] text-amber-600 font-bold mb-1">📍 Ubicación aproximada</p>
                    <p className="text-[10px] text-gray-500 mb-1">Zona: {approx.label}</p>
                    <p className="text-[10px] text-gray-600 mb-3 line-clamp-2">{pet.description ? <LinkifiedText text={pet.description} /> : ''}</p>
                    <ContactLinks pet={pet} />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openDetail(pet); }}
                      className="w-full mt-2 bg-gray-800 text-white py-1.5 rounded-lg text-center text-[10px] font-bold shadow-sm hover:bg-gray-700 cursor-pointer"
                    >
                      Ver detalle →
                    </button>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
