import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, X, ChevronDown, ChevronUp } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NEIGHBORHOODS } from '@/src/lib/neighborhoods';

const FEATURED_IDS = ['garibaldi_sicardi', 'ignacio_correas', 'el_peligro'];
const featuredNeighborhoods = FEATURED_IDS.map(id => NEIGHBORHOODS.find(n => n.id === id)).filter(Boolean);
const restNeighborhoods = NEIGHBORHOODS.filter(n => !FEATURED_IDS.includes(n.id));

const customIcon = L.divIcon({
  html: renderToStaticMarkup(<div className="text-brand-primary"><MapPin className="w-8 h-8 fill-white stroke-[2.5px]" /></div>),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  className: 'custom-leaflet-icon',
});

interface ZoneSelectorProps {
  initialCenter: { lat: number; lng: number };
  selectedLocation?: { lat: number; lng: number };
  onLocationSelect: (location: { lat: number; lng: number }) => void;
  selectedNeighborhoods: string[];
  onNeighborhoodsChange: (ids: string[]) => void;
}

function FlyToLocation({ coords }: { coords?: { lat: number; lng: number } }) {
  const map = useMap();
  const prev = map.getCenter();
  if (coords && (coords.lat !== prev.lat || coords.lng !== prev.lng)) {
    map.flyTo(coords, 15, { duration: 1.5 });
  }
  return null;
}

function LocationMarker({ onSelect, selectedLocation }: { onSelect: (loc: {lat: number, lng: number}) => void, selectedLocation?: {lat: number, lng: number} }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng);
    },
  });
  return selectedLocation ? <Marker position={selectedLocation} icon={customIcon} /> : null;
}

export default function ZoneSelector({ initialCenter, selectedLocation, onLocationSelect, selectedNeighborhoods, onNeighborhoodsChange }: ZoneSelectorProps) {
  const [showRest, setShowRest] = useState(false);
  const toggleId = (id: string) => {
    if (selectedNeighborhoods.includes(id)) {
      onNeighborhoodsChange(selectedNeighborhoods.filter(n => n !== id));
    } else {
      onNeighborhoodsChange([...selectedNeighborhoods, id]);
    }
  };

  return (
    <div>
      <div className="w-full h-[250px] sm:h-[300px] rounded-2xl overflow-hidden border border-brand-accent shadow-sm relative z-0">
        <MapContainer
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={13}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {NEIGHBORHOODS.map(n => (
            <Polygon
              key={n.id}
              positions={n.polygon}
              pathOptions={{
                color: n.color,
                fillColor: n.color,
                fillOpacity: selectedNeighborhoods.includes(n.id) ? 0.35 : 0.12,
                weight: selectedNeighborhoods.includes(n.id) ? 3 : 2,
                opacity: 0.8,
              }}
              eventHandlers={{
                click: () => toggleId(n.id),
                mouseover: (e) => {
                  e.target.setStyle({ fillOpacity: selectedNeighborhoods.includes(n.id) ? 0.45 : 0.22, weight: selectedNeighborhoods.includes(n.id) ? 3.5 : 2.5 });
                },
                mouseout: (e) => {
                  e.target.setStyle({ fillOpacity: selectedNeighborhoods.includes(n.id) ? 0.35 : 0.12, weight: selectedNeighborhoods.includes(n.id) ? 3 : 2 });
                },
              }}
            />
          ))}
          <LocationMarker onSelect={onLocationSelect} selectedLocation={selectedLocation} />
          <FlyToLocation coords={selectedLocation} />
        </MapContainer>
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-brand-accent text-[10px] font-bold text-brand-primary shadow-sm pointer-events-none z-[1000]">
          Click en barrio para seleccionarlo
        </div>
      </div>

      {selectedNeighborhoods.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {selectedNeighborhoods.map(id => {
            const n = NEIGHBORHOODS.find(x => x.id === id);
            if (!n) return null;
            return (
              <button
                key={n.id}
                onClick={() => toggleId(n.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white transition-opacity hover:opacity-80"
                style={{ backgroundColor: n.color }}
              >
                {n.name}
                <X className="w-3 h-3" />
              </button>
            );
          })}
        </div>
      )}

      <label className="block text-xs font-bold text-gray-500 mt-4 mb-2">Zona principal</label>
      <div className="flex flex-wrap gap-2">
        {(featuredNeighborhoods as typeof NEIGHBORHOODS).map(n => {
          const isSelected = selectedNeighborhoods.includes(n.id);
          return (
            <button
              key={n.id}
              onClick={() => toggleId(n.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all"
              style={{
                borderColor: n.color,
                backgroundColor: isSelected ? n.color : 'transparent',
                color: isSelected ? '#fff' : n.color,
              }}
            >
              {n.name}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => setShowRest(!showRest)}
        className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-brand-primary mt-2 transition-colors"
      >
        {showRest ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Más barrios ({restNeighborhoods.length})
      </button>

      {showRest && (
        <div className="flex flex-wrap gap-2 mt-2">
          {restNeighborhoods.map(n => {
            const isSelected = selectedNeighborhoods.includes(n.id);
            return (
              <button
                key={n.id}
                onClick={() => toggleId(n.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all"
                style={{
                  borderColor: n.color,
                  backgroundColor: isSelected ? n.color : 'transparent',
                  color: isSelected ? '#fff' : n.color,
                }}
              >
                {n.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
