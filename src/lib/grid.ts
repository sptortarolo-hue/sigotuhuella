export interface GridCoord {
  a: number;
  b: number;
}

export interface EntreCalles {
  from: string;
  to: string;
}

export interface RoadInfo {
  axis: 'a1' | 'a2' | 'diag' | 'unknown';
  num: number | null;
}

const REF = { lat: -34.921, lng: -57.955 };
const REF_A = 13;
const REF_B = 53;

const V1 = { lat: -0.001506, lng: -0.0000353 };
const V2 = { lat: -0.00008652, lng: 0.0001112 };

export function latlngToGrid(lat: number, lng: number): GridCoord {
  const dlat = lat - REF.lat;
  const dlng = lng - REF.lng;
  const a = -(652 * dlat + 507 * dlng);
  const b = 8828 * dlng - 207 * dlat;
  return { a, b };
}

export function gridToLatlng(a: number, b: number): { lat: number; lng: number } {
  return {
    lat: REF.lat + V1.lat * a + V2.lat * b,
    lng: REF.lng + V1.lng * a + V2.lng * b,
  };
}

export function parseRoad(road: string): RoadInfo {
  const m = road.match(/(?:Calle|Av\.?\.?\s*|Avenida)\s*(\d+)/i);
  if (!m) return { axis: 'unknown', num: null };
  const n = parseInt(m[1]);
  if (n >= 1 && n <= 31) return { axis: 'a1', num: n };
  if ((n >= 32 && n <= 80) || (n >= 130 && n <= 170) || (n >= 400 && n <= 530) || (n >= 600 && n <= 720)) return { axis: 'a2', num: n };
  return { axis: 'unknown', num: null };
}

export function getEntreCalles(coord: number): EntreCalles {
  const f = Math.floor(coord);
  const r = coord - f;
  if (r < 0.25) return { from: `${f}`, to: `${f + 1}` };
  if (r < 0.75) return { from: `${f}`, to: `${f}b` };
  return { from: `${f}b`, to: `${f + 1}` };
}

export function buildAddress(road: string, lat: number, lng: number): string {
  const p = parseRoad(road);
  if (p.axis === 'unknown' || p.num === null) return road;

  const g = latlngToGrid(lat, lng);
  const entre = p.axis === 'a1' ? getEntreCalles(g.b + REF_B) : getEntreCalles(g.a + REF_A);

  return `${road} entre ${entre.from} y ${entre.to}`;
}

export function parseAddress(raw: string): { road: string; from: string; to: string } | null {
  const m = raw.match(/^(.+?)\s+entre\s+(\S+)\s+y\s+(\S+)$/i);
  if (!m) return null;
  return { road: m[1].trim(), from: m[2].trim(), to: m[3].trim() };
}

function xstreetToNum(s: string): number {
  return s.endsWith('b') ? parseInt(s) + 0.5 : parseInt(s);
}

export function addressToLatlng(road: string, from: string, to: string): { lat: number; lng: number } | null {
  const p = parseRoad(road);
  if (p.axis === 'unknown' || p.num === null) return null;
  const mid = (xstreetToNum(from) + xstreetToNum(to)) / 2;
  if (p.axis === 'a1') return gridToLatlng(p.num, mid);
  return gridToLatlng(mid, p.num);
}
