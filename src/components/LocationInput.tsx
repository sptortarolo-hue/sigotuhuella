import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Rectangle, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, X, ChevronDown, ChevronUp, Crosshair } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NEIGHBORHOODS, Neighborhood } from '@/src/lib/neighborhoods';
import { buildAddress } from '@/src/lib/grid';
import { fetchEntreCalles } from '@/src/lib/overpass';

const FEATURED_IDS = ['parque_sicardi', 'villa_garibaldi', 'ignacio_correas'];
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
    map.flyTo(coords, Math.max(map.getZoom(), 13), { duration: 1.5 });
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
  const [mode, setMode] = useState<'exacta' | 'zona'>('zona');
  const [showRest, setShowRest] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

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

  const reverseGeocode = async (latlng: { lat: number; lng: number }) => {
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latlng.lat}&lon=${latlng.lng}&format=json&addressdetails=1`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await res.json();
      const road = data.address?.road;
      if (road) {
        const ec = await fetchEntreCalles(road, latlng.lat, latlng.lng);
        if (ec) {
          onLocationChange(`${road} entre ${ec.from} y ${ec.to}`);
        } else {
          onLocationChange(buildAddress(road, latlng.lat, latlng.lng));
        }
      } else {
        const locality = data.address?.city || data.address?.town || data.address?.village || data.address?.municipality;
        onLocationChange(locality || `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`);
      }
    } catch {
      onLocationChange(`${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`);
    } finally {
      setGeocoding(false);
    }
  };

  const handlePin = (latlng: { lat: number; lng: number }) => {
    onCoordinatesChange(latlng);
    reverseGeocode(latlng);
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización');
      return;
    }
    const onSuccess = (pos: GeolocationPosition) => {
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      onCoordinatesChange(c);
      reverseGeocode(c);
    };
    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        alert('Permití el acceso a la ubicación en tu navegador y volvé a intentar.');
      } else if (err.code === err.TIMEOUT) {
        navigator.geolocation.getCurrentPosition(onSuccess, () => {
          alert('No se pudo obtener la ubicación. Marcá el punto en el mapa.');
        }, { enableHighAccuracy: false, timeout: 15000 });
      } else {
        alert('No se pudo obtener la ubicación. Marcá el punto en el mapa.');
      }
    };
    navigator.geolocation.getCurrentPosition(onSuccess, onError,
      { enableHighAccuracy: true, timeout: 15000 });
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

  const mapCenter = coordinates || (selectedNeighborhoods.length > 0 ? centroidOf(selectedNeighborhoods) : null) || initialCenter;

  return (
    <div>
      <div className="flex gap-2 mb-3">
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
      </div>

      {mode === 'zona' && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
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
            className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-brand-primary transition-colors mb-3"
          >
            {showRest ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Más barrios ({restNeighborhoods.length})
          </button>

          {showRest && (
            <div className="flex flex-wrap gap-2 mb-3">
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

          <div className="w-full h-[250px] sm:h-[300px] rounded-2xl overflow-hidden border border-brand-accent shadow-sm relative z-0">
            <MapContainer
              center={[mapCenter.lat, mapCenter.lng]}
              zoom={12}
              scrollWheelZoom={true}
              style={{ width: '100%', height: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {selectedNeighborhoods.map(id => {
                const n = NEIGHBORHOODS.find(x => x.id === id);
                if (!n) return null;
                return (
                  <Rectangle
                    key={n.id}
                    bounds={rectBounds(n)}
                    pathOptions={{
                      color: n.color,
                      fillColor: n.color,
                      fillOpacity: 0.25,
                      weight: 3,
                      opacity: 0.8,
                    }}
                    eventHandlers={{
                      click: () => toggleNeighborhood(n.id),
                      mouseover: (e) => {
                        e.target.setStyle({ fillOpacity: 0.35, weight: 3.5 });
                      },
                      mouseout: (e) => {
                        e.target.setStyle({ fillOpacity: 0.25, weight: 3 });
                      },
                    }}
                  />
                );
              })}
              <FlyToLocation coords={mapCenter} />
            </MapContainer>
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-brand-accent text-[10px] font-bold text-brand-primary shadow-sm pointer-events-none z-[1000]">
              Click en barrio para seleccionarlo
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
        </>
      )}

      {mode === 'exacta' && (
        <>
          <button
            onClick={getLocation}
            className="flex items-center gap-2 text-sm font-bold text-brand-primary bg-brand-primary/5 px-4 py-2.5 rounded-xl hover:bg-brand-primary/10 transition-colors mb-3 w-full sm:w-auto justify-center"
          >
            <Crosshair className="w-4 h-4" /> Obtener mi ubicación actual
          </button>

          <p className="text-sm text-gray-500 mb-3">Marca el punto en el mapa</p>

          <div className="w-full h-[250px] sm:h-[300px] rounded-2xl overflow-hidden border border-brand-accent shadow-sm relative z-0">
            <MapContainer
              center={[mapCenter.lat, mapCenter.lng]}
              zoom={13}
              scrollWheelZoom={true}
              style={{ width: '100%', height: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <LocationMarker onSelect={handlePin} selectedLocation={coordinates || undefined} />
              <FlyToLocation coords={coordinates} />
            </MapContainer>
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-brand-accent text-[10px] font-bold text-brand-primary shadow-sm pointer-events-none z-[1000]">
              Haz click en el mapa para marcar la ubicación
            </div>
          </div>

          <div className="relative mt-3">
            <input
              value={geocoding ? 'Obteniendo dirección...' : location}
              onChange={e => onLocationChange(e.target.value)}
              placeholder="Dirección (editable)"
              className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors"
            />
          </div>

          {areaLabel && (
            <p className="text-xs text-green-600 mt-2">{areaLabel}</p>
          )}
        </>
      )}
    </div>
  );
}
