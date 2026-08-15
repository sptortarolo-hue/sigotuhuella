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
  if (n >= 81 && n <= 129) return { axis: 'a1', num: n };
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

export interface AddressLocation {
  lat: number;
  lng: number;
  road: string;
  from: string;
  to: string;
}

// Parsea direcciones del estilo de La Plata. Devuelve null si no matchea.
// Acepta prefijos "calle", "av"/"av."/"avenida" y números sueltos:
//   "Calle 12 entre 52 y 53" / "12 entre 52 y 53" / "12 52 y 53"
//   "12 y 53" (esquina) / "12 esquina 53"
// "Diagonal" NO se reduce a número: el grid no la modela.
export function parseAddress(raw: string): { road: string; from: string; to: string } | null {
  const t = raw.toLowerCase().replace(/[.,;()]+/g, ' ').replace(/\b(?:calle|avenida|av\.?)\s+/g, ' ').replace(/\s+/g, ' ').trim();
  const num = '(?:\\d{1,3}(?:bis|b)?)';
  const re1 = new RegExp(`(?:^|\\s)(?<!\\b(?:diagonal|entre)\\s)(${num})\\s+entre\\s+(${num})\\s+y\\s+(${num})(?:\\s|$)`);
  const re2 = new RegExp(`(?:^|\\s)(?<!\\b(?:diagonal|entre)\\s)(${num})\\s+(${num})\\s+y\\s+(${num})(?:\\s|$)`);
  const re3 = new RegExp(`(?:^|\\s)(?<!\\b(?:diagonal|entre)\\s)(${num})\\s+y\\s+(${num})(?:\\s|$)`);
  const re4 = new RegExp(`(?:^|\\s)(?<!\\b(?:diagonal|entre)\\s)(${num})\\s+esquina\\s+(${num})(?:\\s|$)`);
  let m = t.match(re1);
  if (m) return { road: m[1], from: m[2], to: m[3] };
  m = t.match(re2);
  if (m) return { road: m[1], from: m[2], to: m[3] };
  m = t.match(re3);
  if (m) return { road: m[1], from: m[2], to: m[2] };
  m = t.match(re4);
  if (m) return { road: m[1], from: m[2], to: m[2] };
  return null;
}

// Convierte una dirección escrita a coordenadas SOLO cuando el grid es fiable
// (casco urbano, calles <= 122). Para numeración externa devuelve null: ahí el
// grid se desvía kilómetros y hay que usar el geocoding del server.
export function addressToLocation(raw: string): AddressLocation | null {
  const p = parseAddress(raw);
  if (!p) return null;
  const road = parseRoad(p.road);
  if (road.axis === 'unknown' || road.num === null) return null;
  const nums = [road.num, xstreetToNum(p.from), xstreetToNum(p.to)];
  if (nums.some(n => n > 122)) return null;
  const c = addressToLatlng(p.road, p.from, p.to);
  if (!c) return null;
  return { lat: c.lat, lng: c.lng, road: p.road, from: p.from, to: p.to };
}

function xstreetToNum(s: string): number {
  return s.endsWith('b') ? parseInt(s) + 0.5 : parseInt(s);
}

export function addressToLatlng(road: string, from: string, to: string): { lat: number; lng: number } | null {
  const p = parseRoad(road);
  if (p.axis === 'unknown' || p.num === null) return null;
  const mid = (xstreetToNum(from) + xstreetToNum(to)) / 2;
  if (p.axis === 'a1') return gridToLatlng(p.num - REF_A, mid - REF_B);
  return gridToLatlng(mid - REF_A, p.num - REF_B);
}
