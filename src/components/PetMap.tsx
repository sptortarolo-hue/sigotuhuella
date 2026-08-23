import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Pet, getPetImageUrl, getPetCoordinates, getPublicContact } from '@/src/lib/petService';
import { NEIGHBORHOODS } from '@/src/lib/neighborhoods';
import { MapPin, Mail } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
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
  reunited: 'text-green-500',
  found: 'text-green-500',
  transitada: 'text-teal-500',
};

const createCustomIcon = (status: string) => {
  const color = statusColors[status] || 'text-emerald-500';
  return L.divIcon({
    html: renderToStaticMarkup(
      <div className={color}>
        <MapPin className="w-8 h-8 fill-white stroke-[2.5px]" />
      </div>
    ),
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    className: 'custom-leaflet-icon',
  });
};

const approximateIcon = L.divIcon({
  html: renderToStaticMarkup(
    <div className="w-8 h-8 rounded-full border-2 border-dashed border-amber-500 bg-amber-100/80 flex items-center justify-center shadow-sm">
      <MapPin className="w-4 h-4 text-amber-600" />
    </div>
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  className: 'custom-leaflet-icon',
});

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
    case 'for_adoption': return 'En Adopción';
    case 'for_adoption_simple': return 'Adopción (Difusión)';
    case 'adopted': return 'Adoptado';
    case 'reunited': return 'Reencuentro';
    case 'adoption_trial': return 'Período de Prueba';
    case 'transitada': return 'En Tránsito';
    default: return 'Reporte';
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
                icon={createCustomIcon(pet.status)}
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
                icon={approximateIcon}
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
