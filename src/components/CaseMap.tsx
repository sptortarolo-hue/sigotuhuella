import React, { useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polygon, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Eye, EyeOff } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { api } from '@/src/lib/api';

interface SightingsMapProps {
  center: { lat: number; lng: number };
  sightings: any[];
  searchAreas: any[];
  isAdmin?: boolean;
  onReportClick: () => void;
  onToggleSighting: (id: string, hidden: boolean) => void;
}

const petIcon = L.divIcon({
  html: renderToStaticMarkup(
    <div className="text-red-500">
      <MapPin className="w-9 h-9 fill-white stroke-[2.5px]" />
    </div>
  ),
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  className: 'custom-leaflet-icon',
});

const sightingIcon = L.divIcon({
  html: renderToStaticMarkup(
    <div className="relative">
      <div className="w-8 h-8 rounded-full border-2 border-amber-500 bg-amber-500/90 flex items-center justify-center shadow-lg">
        <Eye className="w-4 h-4 text-white" />
      </div>
    </div>
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  className: 'custom-leaflet-icon',
});

const hiddenIcon = L.divIcon({
  html: renderToStaticMarkup(
    <div className="relative">
      <div className="w-8 h-8 rounded-full border-2 border-gray-400 bg-gray-500/80 flex items-center justify-center shadow-lg">
        <EyeOff className="w-4 h-4 text-white" />
      </div>
    </div>
  ),
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  className: 'custom-leaflet-icon',
});

export default function CaseMap({ center, sightings, searchAreas, isAdmin, onReportClick, onToggleSighting }: SightingsMapProps) {
  const mapRef = useRef<any>(null);

  return (
    <div className="w-full h-[320px] md:h-[420px] rounded-[2rem] overflow-hidden border border-brand-accent shadow-inner relative z-0">
      <MapContainer
        ref={mapRef}
        center={[center.lat, center.lng]}
        zoom={14}
        zoomControl={false}
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomControl position="topright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={[center.lat, center.lng]} icon={petIcon}>
          <Popup>
            <div className="p-1 max-w-[180px]">
              <p className="text-sm font-bold text-brand-primary m-0 mb-1">Última ubicación conocida</p>
              <p className="text-[10px] text-gray-500 mb-1">Partiendo de acá se reportan los avistamientos</p>
            </div>
          </Popup>
        </Marker>

        {searchAreas.map((area) => {
          const coords = area.area_geojson?.type === 'Polygon'
            ? area.area_geojson.coordinates[0].map((c: [number, number]) => [c[1], c[0]])
            : [];
          if (coords.length === 0) return null;
          return (
            <Polygon
              key={area.id}
              positions={coords}
              pathOptions={{ color: '#10b981', fillColor: '#34d399', fillOpacity: 0.15, weight: 2 }}
            >
              <Popup>
                <div className="p-1 max-w-[180px]">
                  <p className="text-sm font-bold text-emerald-600 m-0 mb-1">Área cubierta</p>
                  {area.notes && <p className="text-[10px] text-gray-600 mb-0.5">{area.notes}</p>}
                  {area.user_name && <p className="text-[10px] text-gray-400">por {area.user_name}</p>}
                </div>
              </Popup>
            </Polygon>
          );
        })}

        {sightings.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={s.hidden ? hiddenIcon : sightingIcon}>
            <Popup>
              <div className="p-1 max-w-[180px]">
                <p className="text-sm font-bold text-amber-600 m-0 mb-0.5 flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> Avistamiento
                </p>
                <p className="text-[11px] text-gray-600 mb-1">{s.reporter_name}</p>
                {s.description && <p className="text-[11px] text-gray-700 mb-1">{s.description}</p>}
                {s.reporter_whatsapp && (
                  <a href={`https://wa.me/${s.reporter_whatsapp.replace(/\D/g, '')}`} className="block w-full bg-emerald-500 text-white py-1 rounded-lg text-center text-[10px] font-bold shadow-sm mb-1 no-underline">
                    Contactar al que avistó
                  </a>
                )}
                <p className="text-[10px] text-gray-400">{new Date(s.created_at).toLocaleDateString('es-AR')}</p>
                {isAdmin && (
                  <button
                    onClick={() => onToggleSighting(s.id, !s.hidden)}
                    className="w-full mt-1 py-1 rounded-lg text-[10px] font-bold border text-gray-500 border-gray-300 bg-white"
                  >
                    {s.hidden ? 'Mostrar avistamiento' : 'Ocultar (falso)'}
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <button
        onClick={onReportClick}
        className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[500] px-4 py-2.5 bg-amber-500 text-white rounded-full text-sm font-bold shadow-xl hover:bg-amber-600 transition-colors flex items-center gap-2"
      >
        <Eye className="w-4 h-4" /> Reportar avistamiento
      </button>
    </div>
  );
}