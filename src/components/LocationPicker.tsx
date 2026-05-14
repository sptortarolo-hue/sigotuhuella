import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

// Fix for default marker icon in Leaflet + React
const customIcon = L.divIcon({
  html: renderToStaticMarkup(<div className="text-brand-primary"><MapPin className="w-8 h-8 fill-white stroke-[2.5px]" /></div>),
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  className: 'custom-leaflet-icon',
});

interface LocationPickerProps {
  initialCenter: { lat: number; lng: number };
  onLocationSelect: (location: { lat: number; lng: number }) => void;
  selectedLocation?: { lat: number; lng: number };
}

function LocationMarker({ onSelect, selectedLocation }: { onSelect: (loc: {lat: number, lng: number}) => void, selectedLocation?: {lat: number, lng: number} }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng);
    },
  });

  return selectedLocation ? (
    <Marker position={selectedLocation} icon={customIcon} />
  ) : null;
}

export default function LocationPicker({ initialCenter, onLocationSelect, selectedLocation }: LocationPickerProps) {
  return (
    <div className="w-full h-[300px] rounded-2xl overflow-hidden border border-brand-accent shadow-sm relative z-0">
      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={15}
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker onSelect={onLocationSelect} selectedLocation={selectedLocation} />
      </MapContainer>
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-brand-accent text-[10px] font-bold text-brand-primary shadow-sm pointer-events-none z-[1000]">
        Haz click en el mapa para marcar la ubicación
      </div>
    </div>
  );
}
