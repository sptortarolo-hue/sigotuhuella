import { NEIGHBORHOODS } from './neighborhoods';

// Ray-casting point-in-polygon — misma fórmula que server/services/coordinatorScope.js
export function pointInPolygon(lat: number, lng: number, ring: [number, number][]): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat)) {
      const xIntersect = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (lng < xIntersect) inside = !inside;
    }
  }
  return inside;
}

// Un barrio cuenta como cubierto si su centro o alguna esquina de sus bounds cae dentro.
export function neighborhoodsInPolygon(points: [number, number][]): string[] {
  if (!points || points.length < 3) return [];
  return NEIGHBORHOODS.filter(n => {
    const samples: [number, number][] = [
      [n.center.lat, n.center.lng],
      [n.bounds.south, n.bounds.west],
      [n.bounds.south, n.bounds.east],
      [n.bounds.north, n.bounds.west],
      [n.bounds.north, n.bounds.east],
    ];
    return samples.some(([lat, lng]) => pointInPolygon(lat, lng, points));
  }).map(n => n.id);
}
