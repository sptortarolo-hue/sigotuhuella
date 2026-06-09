import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Rectangle, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, X, ChevronDown, ChevronUp, Crosshair } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NEIGHBORHOODS, Neighborhood } from '@/src/lib/neighborhoods';

const FEATURED_IDS = ['parque_sicardi', 'villa_garibaldi', 'ignacio_correas', 'arana'];
const featuredNeighborhoods = FEATURED_IDS.map(id => NEIGHBORHOODS.find(n => n.id === id)).filter((n): n is Neighborhood => !!n);
const restNeighborhoods = NEIGHBORHOODS.filter(n => !FEATURED_IDS.includes(n.id));

const pinIcon = L.divIcon({
  html: renderToStaticMarkup(<div className="text-brand-primary"><MapPin className="w-8 h-8 fill-white stroke-[2.5px]" /></div>),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  className: 'custom-leaflet-icon',
});

interface LocationInputProps {
  initialCenter: { lat: number; lng: number };
  location: string;
  onLocationChange: (v: string) => void;
  coordinates: { lat: number; lng: number } | null;
  onCoordinatesChange: (c: { lat: number; lng: number } | null) => void;
  selectedNeighborhoods: string[];
  onNeighborhoodsChange: (ids: string[]) => void;
}

function centroidOf(ids: string[]): { lat: number; lng: number } | null {
  const centers = ids.map(id => NEIGHBORHOODS.find(n => n.id === id)?.center).filter(Boolean) as { lat: number; lng: number }[];
  if (centers.length === 0) return null;
  const lat = centers.reduce((s, c) => s + c.lat, 0) / centers.length;
  const lng = centers.reduce((s, c) => s + c.lng, 0) / centers.length;
  return { lat, lng };
}

function FlyToLocation({ coords }: { coords?: { lat: number; lng: number } }) {
  const map = useMap();
  const prev = map.getCenter();
  if (coords && (coords.lat !== prev.lat || coords.lng !== prev.lng)) {
    map.flyTo(coords, 15, { duration: 1.5 });
  }
  return null;
}

function LocationMarker({ onSelect, selectedLocation }: { onSelect: (loc: { lat: number; lng: number }) => void; selectedLocation?: { lat: number; lng: number } }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng);
    },
  });
  return selectedLocation ? <Marker position={selectedLocation} icon={pinIcon} /> : null;
}

function rectBounds(n: Neighborhood): [[number, number], [number, number]] {
  return [[n.bounds.south, n.bounds.west], [n.bounds.north, n.bounds.east]];
}

export default function LocationInput({
  initialCenter, location, onLocationChange, coordinates, onCoordinatesChange,
  selectedNeighborhoods, onNeighborhoodsChange,
}: LocationInputProps) {
  const [mode, setMode] = useState<'exacta' | 'zona'>(coordinates ? 'exacta' : 'zona');
  const [showRest, setShowRest] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (coordinates) setMode('exacta');
  }, [coordinates]);

  const toggleNeighborhood = (id: string) => {
    let next: string[];
    if (selectedNeighborhoods.includes(id)) {
      next = selectedNeighborhoods.filter(n => n !== id);
    } else {
      next = [...selectedNeighborhoods, id];
    }
    onNeighborhoodsChange(next);
    if (next.length > 0) {
      onCoordinatesChange(centroidOf(next));
    } else {
      onCoordinatesChange(null);
    }
  };

  const handlePin = (latlng: { lat: number; lng: number }) => {
    setMode('exacta');
    onCoordinatesChange(latlng);
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMode('exacta');
        onCoordinatesChange(c);
      },
      () => alert('No se pudo obtener la ubicación. Permití el acceso al GPS o marcá la ubicación en el mapa.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSuggestionPick = (n: Neighborhood) => {
    onLocationChange(n.name);
    onNeighborhoodsChange([n.id]);
    onCoordinatesChange(n.center);
    setMode('zona');
    setShowSuggestions(false);
  };

  const areaLabel = (() => {
    if (mode === 'exacta' && coordinates) return '📍 Ubicación exacta marcada';
    if (selectedNeighborhoods.length > 0) {
      const names = selectedNeighborhoods
        .map(id => NEIGHBORHOODS.find(x => x.id === id)?.name)
        .filter(Boolean);
      return `📍 Zona: ${names.join(', ')}`;
    }
    return null;
  })();

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setMode('exacta')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
            mode === 'exacta'
              ? 'bg-brand-primary text-white border-brand-primary'
              : 'border-brand-accent text-gray-600 hover:border-gray-300'
          }`}
        >
          Dirección exacta
        </button>
        <button
          onClick={() => setMode('zona')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
            mode === 'zona'
              ? 'bg-brand-primary text-white border-brand-primary'
              : 'border-brand-accent text-gray-600 hover:border-gray-300'
          }`}
        >
          Zona / barrio
        </button>
      </div>

      <button
        onClick={getLocation}
        className="flex items-center gap-2 text-sm font-bold text-brand-primary bg-brand-primary/5 px-4 py-2.5 rounded-xl hover:bg-brand-primary/10 transition-colors mb-3"
      >
        <Crosshair className="w-4 h-4" /> Obtener mi ubicación actual
      </button>

      <div className="w-full h-[250px] sm:h-[300px] rounded-2xl overflow-hidden border border-brand-accent shadow-sm relative z-0">
        <MapContainer
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={12}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {NEIGHBORHOODS.map(n => {
            const isSelected = selectedNeighborhoods.includes(n.id);
            return (
              <Rectangle
                key={n.id}
                bounds={rectBounds(n)}
                pathOptions={{
                  color: n.color,
                  fillColor: n.color,
                  fillOpacity: mode === 'zona' ? (isSelected ? 0.35 : 0.12) : 0.06,
                  weight: isSelected ? 3 : (mode === 'zona' ? 2 : 1),
                  opacity: mode === 'zona' ? 0.8 : 0.4,
                }}
                eventHandlers={mode === 'zona' ? {
                  click: () => toggleNeighborhood(n.id),
                  mouseover: (e) => {
                    e.target.setStyle({ fillOpacity: isSelected ? 0.45 : 0.22, weight: isSelected ? 3.5 : 2.5 });
                  },
                  mouseout: (e) => {
                    e.target.setStyle({ fillOpacity: isSelected ? 0.35 : 0.12, weight: isSelected ? 3 : 2 });
                  },
                } : undefined}
              />
            );
          })}
          {mode === 'exacta' && (
            <LocationMarker onSelect={handlePin} selectedLocation={coordinates || undefined} />
          )}
          <FlyToLocation coords={coordinates} />
        </MapContainer>
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-brand-accent text-[10px] font-bold text-brand-primary shadow-sm pointer-events-none z-[1000]">
          {mode === 'exacta' ? 'Haz click en el mapa para marcar la ubicación' : 'Click en barrio para seleccionarlo'}
        </div>
      </div>

      {areaLabel && (
        <p className="text-xs text-green-600 mt-2">{areaLabel}</p>
      )}

      {selectedNeighborhoods.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {selectedNeighborhoods.map(id => {
            const n = NEIGHBORHOODS.find(x => x.id === id);
            if (!n) return null;
            return (
              <button
                key={n.id}
                onClick={() => toggleNeighborhood(n.id)}
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

      {mode === 'zona' && (
        <>
          <label className="block text-xs font-bold text-gray-500 mt-4 mb-2">Zona principal</label>
          <div className="flex flex-wrap gap-2">
            {featuredNeighborhoods.map(n => {
              const isSelected = selectedNeighborhoods.includes(n.id);
              return (
                <button
                  key={n.id}
                  onClick={() => toggleNeighborhood(n.id)}
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
                    onClick={() => toggleNeighborhood(n.id)}
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
        </>
      )}

      <div className="relative mt-3">
        <input
          value={location}
          onChange={e => {
            onLocationChange(e.target.value);
            if (mode === 'zona') {
              onNeighborhoodsChange([]);
              onCoordinatesChange(null);
            }
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={mode === 'exacta' ? 'Ej: Calle 7 y 52' : 'Ej: Villa Garibaldi'}
          className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors"
        />
        {showSuggestions && location.length > 0 && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-brand-accent rounded-xl shadow-lg max-h-48 overflow-y-auto">
            {NEIGHBORHOODS.filter(n => n.name.toLowerCase().includes(location.toLowerCase())).map(n => (
              <button
                key={n.id}
                onMouseDown={e => { e.preventDefault(); handleSuggestionPick(n); }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-brand-accent transition-colors"
              >
                {n.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
