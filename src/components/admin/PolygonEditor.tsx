import React, { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Polygon, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

const vertexIcon = L.divIcon({
  html: renderToStaticMarkup(
    <div className="text-red-500"><MapPin className="w-6 h-6 fill-white stroke-[2.5px]" /></div>
  ),
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  className: 'custom-leaflet-icon',
});

const neighborhoodIcon = L.divIcon({
  html: renderToStaticMarkup(
    <div className="text-blue-400"><MapPin className="w-5 h-5 fill-white stroke-[2.5px]" /></div>
  ),
  iconSize: [20, 20],
  iconAnchor: [10, 20],
  className: 'custom-leaflet-icon',
});

const centerIcon = L.divIcon({
  html: renderToStaticMarkup(
    <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md" />
  ),
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  className: 'custom-leaflet-icon',
});

interface Vertex {
  lat: number;
  lng: number;
}

interface Neighborhood {
  name: string;
  lat: number;
  lng: number;
}

interface PolygonEditorProps {
  vertices: Vertex[];
  amplitude: number;
  neighborhoods?: Neighborhood[];
  onChange: (vertices: Vertex[], amplitude: number) => void;
}

function getCenteroid(vertices: Vertex[]): { lat: number; lng: number } | null {
  if (!vertices || vertices.length === 0) return null;
  const sum = vertices.reduce((acc, v) => ({ lat: acc.lat + v.lat, lng: acc.lng + v.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / vertices.length, lng: sum.lng / vertices.length };
}

function scalePolygon(vertices: Vertex[], amplitudePercent: number): Vertex[] {
  const center = getCenteroid(vertices);
  if (!center) return vertices;
  const factor = amplitudePercent / 100;
  return vertices.map(v => ({
    lat: center.lat + (v.lat - center.lat) * factor,
    lng: center.lng + (v.lng - center.lng) * factor,
  }));
}

function MapClickHandler({ onMapClick }: { onMapClick: (latlng: { lat: number; lng: number }) => void }) {
  useMapEvents({
    dblclick(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

function CenterUpdater({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  React.useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom());
  }, [center.lat, center.lng, map]);
  return null;
}

export default function PolygonEditor({ vertices, amplitude, neighborhoods = [], onChange }: PolygonEditorProps) {
  const [localVertices, setLocalVertices] = useState<Vertex[]>(vertices);
  const [localAmplitude, setLocalAmplitude] = useState(amplitude);

  const center = getCenteroid(localVertices) || { lat: -34.87, lng: -57.97 };
  const displayVertices = localVertices.length >= 3
    ? scalePolygon(localVertices, localAmplitude)
    : localVertices;

  const handleVertexDrag = useCallback((index: number, newLatLng: { lat: number; lng: number }) => {
    setLocalVertices(prev => {
      const next = [...prev];
      next[index] = { lat: newLatLng.lat, lng: newLatLng.lng };
      return next;
    });
  }, []);

  const handleMapDblClick = useCallback((latlng: { lat: number; lng: number }) => {
    setLocalVertices(prev => [...prev, { lat: latlng.lat, lng: latlng.lng }]);
  }, []);

  const removeVertex = useCallback((index: number) => {
    if (localVertices.length <= 3) return;
    setLocalVertices(prev => prev.filter((_, i) => i !== index));
  }, [localVertices]);

  const addVertexMidpoint = useCallback(() => {
    if (localVertices.length < 2) return;
    let maxDist = 0;
    let maxIdx = 0;
    for (let i = 0; i < localVertices.length; i++) {
      const j = (i + 1) % localVertices.length;
      const dist = Math.sqrt(
        (localVertices[j].lat - localVertices[i].lat) ** 2 +
        (localVertices[j].lng - localVertices[i].lng) ** 2
      );
      if (dist > maxDist) { maxDist = dist; maxIdx = i; }
    }
    const j = (maxIdx + 1) % localVertices.length;
    const midpoint = {
      lat: (localVertices[maxIdx].lat + localVertices[j].lat) / 2,
      lng: (localVertices[maxIdx].lng + localVertices[j].lng) / 2,
    };
    setLocalVertices(prev => {
      const next = [...prev];
      next.splice(maxIdx + 1, 0, midpoint);
      return next;
    });
  }, [localVertices]);

  const handleSave = () => {
    onChange(localVertices, localAmplitude);
  };

  const handleReset = () => {
    const defaults = [
      { lat: -34.856, lng: -57.984 },
      { lat: -34.876, lng: -57.964 },
      { lat: -34.891, lng: -57.995 },
    ];
    setLocalVertices(defaults);
    setLocalAmplitude(100);
    onChange(defaults, 100);
  };

  return (
    <div className="space-y-4">
      <div className="relative w-full h-[300px] sm:h-[400px] rounded-2xl overflow-hidden border border-brand-accent shadow-sm z-0">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onMapClick={handleMapDblClick} />
          <CenterUpdater center={center} />

          {displayVertices.length >= 3 && (
            <Polygon
              positions={displayVertices.map(v => [v.lat, v.lng])}
              pathOptions={{
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
                weight: 2,
                dashArray: '5, 5',
              }}
            />
          )}

          {displayVertices.map((v, i) => (
            <React.Fragment key={i}>
              <DraggableMarker
                position={v}
                index={i}
                onDrag={handleVertexDrag}
                onRemove={removeVertex}
              />
            </React.Fragment>
          ))}

          {center && (
            <Marker position={[center.lat, center.lng]} icon={centerIcon} />
          )}

          {neighborhoods.filter(n => n.lat && n.lng).map((n, i) => (
            <Marker key={i} position={[n.lat, n.lng]} icon={neighborhoodIcon}>
              <Tooltip direction="top" offset={[0, -10]} permanent>
                <span className="text-xs font-bold">{n.name}</span>
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>

        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-brand-accent text-[10px] font-bold text-brand-primary shadow-sm pointer-events-none z-[1000]">
          Doble click en el mapa para agregar vértice
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-600">Amplitud:</span>
            <input
              type="range"
              min="50"
              max="200"
              value={localAmplitude}
              onChange={(e) => setLocalAmplitude(Number(e.target.value))}
              className="w-28 accent-brand-primary"
            />
            <span className="text-sm font-bold text-brand-primary w-10">{localAmplitude}%</span>
          </div>
          <span className="text-xs text-gray-400">{localVertices.length} vértices</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={addVertexMidpoint}
            disabled={localVertices.length < 2}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar vértice
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-2 text-xs font-bold bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold bg-brand-primary text-white rounded-xl hover:shadow-lg transition-all"
          >
            Guardar Polígono
          </button>
        </div>
      </div>
    </div>
  );
}

function DraggableMarker({
  position,
  index,
  onDrag,
  onRemove,
}: {
  position: { lat: number; lng: number };
  index: number;
  onDrag: (index: number, latlng: { lat: number; lng: number }) => void;
  onRemove: (index: number) => void;
}) {
  const markerRef = React.useRef<L.Marker>(null);

  const eventHandlers = {
    dragend() {
      const marker = markerRef.current;
      if (marker) {
        const latlng = marker.getLatLng();
        onDrag(index, { lat: latlng.lat, lng: latlng.lng });
      }
    },
    click() {
      if (window.confirm('¿Eliminar este vértice?')) {
        onRemove(index);
      }
    },
  };

  return (
    <Marker
      ref={markerRef}
      position={[position.lat, position.lng]}
      draggable={true}
      icon={vertexIcon}
      eventHandlers={eventHandlers}
    >
    </Marker>
  );
}
