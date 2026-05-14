import React from 'react';

// Leaflet doesn't need an API key
export const hasValidKey = true;

export default function MapLoader({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
