import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Pet, getPetImageUrl, getPetCoordinates } from '@/src/lib/petService';
import { MapPin } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

interface PetMapProps {
  pets: Pet[];
  center: { lat: number; lng: number };
}

const createCustomIcon = (status: string) => {
  const colorClass = status === 'lost' ? 'text-red-500' : 'text-emerald-500';
  return L.divIcon({
    html: renderToStaticMarkup(
      <div className={colorClass}>
        <MapPin className="w-8 h-8 fill-white stroke-[2.5px]" />
      </div>
    ),
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    className: 'custom-leaflet-icon',
  });
};

export default function PetMap({ pets, center }: PetMapProps) {
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
          if (!coords) return null;
          return (
            <Marker
              key={pet.id}
              position={[coords.lat, coords.lng]}
              icon={createCustomIcon(pet.status)}
            >
              <Popup>
                <div className="p-1 max-w-[200px]">
                  {getPetImageUrl(pet) && (
                    <img src={getPetImageUrl(pet)} className="w-full h-24 object-cover rounded-lg mb-2" alt={pet.name || ''} />
                  )}
                  <h4 className="font-bold text-brand-primary text-sm m-0">{pet.name || 'Mascota'}</h4>
<p className="text-[10px] text-gray-500 uppercase font-bold mb-1 mt-0">
                     {pet.status === 'lost' ? 'Perdido' : pet.status === 'retained' ? 'Retenido' : pet.status === 'sighted' ? 'Avistado' : pet.status === 'accidented' ? 'Accidentado' : 'En Adopción'}
                   </p>
                  <p className="text-[10px] text-gray-600 mb-3 line-clamp-2">{pet.description}</p>
                  
                  {pet.contact_info && (
                    <div className="flex gap-2">
                      <a 
                        href={`tel:${pet.contact_info}`}
                        className="flex-1 bg-brand-primary text-white py-1.5 rounded-lg text-center text-[10px] font-bold shadow-sm no-underline"
                      >
                        Llamar
                      </a>
                      <a 
                        href={`https://wa.me/${pet.contact_info.replace(/\D/g, '')}`}
                        className="flex-1 bg-emerald-500 text-white py-1.5 rounded-lg text-center text-[10px] font-bold shadow-sm no-underline"
                      >
                        WhatsApp
                      </a>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
