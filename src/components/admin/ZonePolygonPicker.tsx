import { useState } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { Undo2, Trash2 } from 'lucide-react';

const vertexIcon = L.divIcon({
  html: '<div style="width:10px;height:10px;background:#7c3aed;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

function ClickCatcher({ onAddPoint }: { onAddPoint: (p: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onAddPoint([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

interface ZonePolygonPickerProps {
  value: [number, number][] | null;
  onChange: (v: [number, number][] | null) => void;
}

export default function ZonePolygonPicker({ value, onChange }: ZonePolygonPickerProps) {
  const points = value || [];
  const [hint, setHint] = useState('Hacé click en el mapa para marcar los vértices de la zona');

  const addPoint = (p: [number, number]) => {
    const next = [...points, p] as [number, number][];
    onChange(next);
    if (next.length === 3) setHint('Zona cerrada automáticamente. Seguí agregando vértices o guardá.');
  };

  return (
    <div className="space-y-2">
      <div className="relative w-full h-[260px] sm:h-[320px] rounded-2xl overflow-hidden border border-brand-accent shadow-sm z-0">
        <MapContainer
          center={points.length > 0 ? points[0] : [-34.9214, -57.9544]}
          zoom={12}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickCatcher onAddPoint={addPoint} />
          {points.length >= 3 ? (
            <Polygon
              positions={points}
              pathOptions={{ color: '#7c3aed', weight: 2, fillColor: '#7c3aed', fillOpacity: 0.15 }}
            />
          ) : points.length === 2 ? (
            <Polyline positions={points} pathOptions={{ color: '#7c3aed', weight: 2, dashArray: '6 6' }} />
          ) : null}
          {points.map((p, i) => (
            <Marker key={i} position={p} icon={vertexIcon} />
          ))}
        </MapContainer>
        <div className="absolute bottom-3 left-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-brand-accent text-[10px] font-bold text-brand-primary shadow-sm pointer-events-none z-[1000]">
          {hint}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs sm:text-sm ${points.length >= 3 ? 'text-emerald-600' : 'text-gray-500'}`}>
          {points.length >= 3
            ? `Polígono con ${points.length} vértices`
            : points.length > 0
              ? `${points.length} vértices (mínimo 3)`
              : 'Sin zona dibujada'}
        </span>
        <div className="flex gap-2 ml-auto">
          <button
            type="button"
            onClick={() => onChange(points.length > 0 ? points.slice(0, -1) : null)}
            disabled={points.length === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-brand-bg text-brand-primary hover:bg-brand-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Undo2 className="w-3.5 h-3.5" /> Deshacer
          </button>
          <button
            type="button"
            onClick={() => { onChange(null); setHint('Hacé click en el mapa para marcar los vértices de la zona'); }}
            disabled={points.length === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" /> Limpiar
          </button>
        </div>
      </div>
    </div>
  );
}
