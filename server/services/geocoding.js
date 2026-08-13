const NEIGHBORHOOD_CENTERS = {
  'la plata': { lat: -34.9155, lng: -57.9480 },
  'tolosa': { lat: -34.8918, lng: -57.9742 },
  'los hornos': { lat: -34.9594, lng: -57.9807 },
  'ringuelet': { lat: -34.8848, lng: -57.9915 },
  'gonnet': { lat: -34.8819, lng: -58.0103 },
  'city bell': { lat: -34.8675, lng: -58.0474 },
  'villa elisa': { lat: -34.8515, lng: -58.0854 },
  'villa elvira': { lat: -34.9394, lng: -57.9208 },
  'abasto': { lat: -34.9868, lng: -58.0909 },
  'san carlos': { lat: -34.933, lng: -58.000 },
  'altos de san lorenzo': { lat: -34.954, lng: -57.931 },
  'lisandro olmos': { lat: -34.9991, lng: -58.0486 },
  'melchor romero': { lat: -34.9457, lng: -58.0365 },
  'gorina': { lat: -34.9054, lng: -58.0436 },
  'arana': { lat: -34.9996, lng: -57.8925 },
  'etcheverry': { lat: -35.0245, lng: -58.0781 },
  'segui': { lat: -34.8913, lng: -58.1319 },
  'el peligro': { lat: -34.9333, lng: -58.1667 },
  'jose hernandez': { lat: -34.8989, lng: -58.0106 },
  'parque sicardi': { lat: -34.9875, lng: -57.8598 },
  'villa garibaldi': { lat: -34.9990, lng: -57.8584 },
  'ignacio correas': { lat: -35.0489, lng: -57.8500 },
  'barrio aeropuerto': { lat: -34.968, lng: -57.893 },
};

// Área de influencia de Sigo Tu Huella: La Plata y alrededores.
// Cualquier punto fuera de este bbox no es confiable y se descarta.
const INFLUENCE_BBOX = {
  minLat: -35.10,
  maxLat: -34.82,
  minLng: -58.20,
  maxLng: -57.80,
};

// Centro de La Plata como fallback cuando no hay barrio coincidente.
export const LA_PLATA_CENTER = { lat: -34.9155, lng: -57.9480 };

export function isInInfluenceZone(lat, lng) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return false;
  return lat >= INFLUENCE_BBOX.minLat && lat <= INFLUENCE_BBOX.maxLat
    && lng >= INFLUENCE_BBOX.minLng && lng <= INFLUENCE_BBOX.maxLng;
}

// Viewbox de Nominatim: left, top, right, bottom (coordenadas).
const LP_VIEWBOX = `${INFLUENCE_BBOX.minLng},${INFLUENCE_BBOX.maxLat},${INFLUENCE_BBOX.maxLng},${INFLUENCE_BBOX.minLat}`;

async function tryGeocode(q) {
  if (!q || q.trim().length < 3) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&viewbox=${LP_VIEWBOX}&bounded=1`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'SigoTuHuella/1.0 (whatsapp bot)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data || data.length === 0) return null;
  const pt = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  // Solo aceptamos puntos dentro del área de influencia.
  return isInInfluenceZone(pt.lat, pt.lng) ? pt : null;
}

function matchNeighborhoodCenter(address) {
  if (!address) return null;
  const lower = address.toLowerCase();
  for (const [keyword, center] of Object.entries(NEIGHBORHOOD_CENTERS)) {
    if (lower.includes(keyword)) return center;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Geocoding de intersecciones estilo La Plata ("137 y 90", "137 90 y 91").
// Fuente primaria: Overpass API (intersección real de ways con nombre).
// Fallback offline: modelo de cuadrícula de La Plata (grid).
// ---------------------------------------------------------------------------

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function overpassQuery(query) {
  for (const url of OVERPASS_URLS) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text || text.includes('runtime error') || text.trimStart().startsWith('<')) continue;
      try {
        const data = JSON.parse(text);
        if (data && data.elements) return data;
      } catch { continue; }
    } catch { continue; }
  }
  return null;
}

function streetName(raw) {
  const m = raw.match(/^(\d+)/);
  const base = m ? m[1] : raw;
  return /bis|b$/i.test(raw) ? `Calle ${base} bis` : `Calle ${base}`;
}

function streetRegex(name) {
  const m = name.match(/^Calle\s+(\d+)/);
  const num = m ? m[1] : '';
  return `^(Calle\\s+)?${num}(\\s+(bis|b))?$`;
}

function overpassBbox() {
  return `${INFLUENCE_BBOX.minLat},${INFLUENCE_BBOX.minLng},${INFLUENCE_BBOX.maxLat},${INFLUENCE_BBOX.maxLng}`;
}

// Intersección exacta de dos calles (way "name" compartiendo un nodo).
async function overpassIntersectionCoords(name1, name2) {
  const query = `[out:json][timeout:10];
way["name"~"${streetRegex(name1)}"](${overpassBbox()})->.a;
way["name"~"${streetRegex(name2)}"](${overpassBbox()})->.b;
node.a.b;
out body;`;
  const data = await overpassQuery(query);
  if (!data || !data.elements) return null;
  const nodes = data.elements.filter(e => e.type === 'node' && e.lat != null && e.lon != null);
  if (nodes.length === 0) return null;
  return {
    lat: nodes.reduce((s, n) => s + n.lat, 0) / nodes.length,
    lng: nodes.reduce((s, n) => s + n.lon, 0) / nodes.length,
  };
}

// Punto medio de una calle entre dos calles transversales (o la única intersección).
async function overpassBetweenCoords(road, from, to) {
  const p1 = await overpassIntersectionCoords(road, from);
  const p2 = await overpassIntersectionCoords(road, to);
  if (!p1 && !p2) return null;
  if (!p1) return p2;
  if (!p2) return p1;
  return { lat: (p1.lat + p2.lat) / 2, lng: (p1.lng + p2.lng) / 2 };
}

// Parsea direcciones del estilo de La Plata. Devuelve null si no matchea.
export function parseLaPlataAddress(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase().replace(/[.,;()]+/g, ' ');
  const re1 = /(?:^|\s)(?:calle\s+)?(\d{1,3}(?:bis|b)?)\s+entre\s+(?:calle\s+)?(\d{1,3}(?:bis|b)?)\s+y\s+(?:calle\s+)?(\d{1,3}(?:bis|b)?)(?:\s|$)/;
  const re2 = /(?:^|\s)(?:calle\s+)?(\d{1,3}(?:bis|b)?)\s+(?:calle\s+)?(\d{1,3}(?:bis|b)?)\s+y\s+(?:calle\s+)?(\d{1,3}(?:bis|b)?)(?:\s|$)/;
  const re3 = /(?:^|\s)(?:calle\s+)?(\d{1,3}(?:bis|b)?)\s+y\s+(?:calle\s+)?(\d{1,3}(?:bis|b)?)(?:\s|$)/;
  let m = t.match(re1);
  if (m) return { type: 'between', road: m[1], from: m[2], to: m[3] };
  m = t.match(re2);
  if (m) return { type: 'between', road: m[1], from: m[2], to: m[3] };
  m = t.match(re3);
  if (m) return { type: 'intersection', road: m[1], cross: m[2] };
  return null;
}

// --- Modelo de cuadrícula de La Plata (fallback offline) --------------------

const GRID_REF = { lat: -34.921, lng: -57.955 };
const GRID_REF_A = 13;
const GRID_REF_B = 53;
const GRID_V1 = { lat: -0.001506, lng: -0.0000353 };
const GRID_V2 = { lat: -0.00008652, lng: 0.0001112 };

function gridToLatlng(a, b) {
  return {
    lat: GRID_REF.lat + GRID_V1.lat * a + GRID_V2.lat * b,
    lng: GRID_REF.lng + GRID_V1.lng * a + GRID_V2.lng * b,
  };
}

function gridAxis(n) {
  if (n >= 1 && n <= 31) return 'a1';
  if ((n >= 32 && n <= 80) || (n >= 130 && n <= 170) || (n >= 400 && n <= 530) || (n >= 600 && n <= 720)) return 'a2';
  if (n >= 81 && n <= 129) return 'a1';
  return 'unknown';
}

function gridFallback(lp) {
  const roadNum = parseInt(lp.road);
  if (isNaN(roadNum)) return null;
  const crossA = parseInt(lp.from || lp.cross);
  const crossB = parseInt(lp.to || lp.cross);
  const mid = (crossA + crossB) / 2;
  const axis = gridAxis(roadNum);
  if (axis === 'a1') return gridToLatlng(roadNum - GRID_REF_A, mid - GRID_REF_B);
  if (axis === 'a2') return gridToLatlng(mid - GRID_REF_A, roadNum - GRID_REF_B);
  return null;
}

// Geocodifica una dirección con bias a La Plata. Nunca devuelve un punto
// fuera del área de influencia: si no se puede resolver, cae al centro del
// barrio coincidente o al centro de La Plata. Retorna null solo si no hay texto.
export async function geocodeAddress(address) {
  if (!address || address.trim().length < 3) return null;
  try {
    // 1) Dirección estilo La Plata: intersección / tramo con Overpass + grid fallback.
    const lp = parseLaPlataAddress(address);
    if (lp) {
      const roadName = streetName(lp.road);
      if (lp.type === 'intersection') {
        const overpass = await overpassIntersectionCoords(roadName, streetName(lp.cross));
        if (overpass && isInInfluenceZone(overpass.lat, overpass.lng)) return overpass;
      } else {
        const overpass = await overpassBetweenCoords(roadName, streetName(lp.from), streetName(lp.to));
        if (overpass && isInInfluenceZone(overpass.lat, overpass.lng)) return overpass;
      }
      const grid = gridFallback(lp);
      if (grid && isInInfluenceZone(grid.lat, grid.lng)) return grid;
    }

    // 2) Fallback: Nominatim con variantes de contexto.
    const variants = [
      address + ', La Plata, Buenos Aires, Argentina',
      address + ', Buenos Aires, Argentina',
      address + ', Argentina',
      address,
    ];
    for (const v of variants) {
      const coords = await tryGeocode(v);
      if (coords) return coords;
    }
    // 3) Fallback: barrio coincidente en el texto, si no centro de La Plata.
    return matchNeighborhoodCenter(address) || LA_PLATA_CENTER;
  } catch {
    return matchNeighborhoodCenter(address) || LA_PLATA_CENTER;
  }
}

export function extractNeighborhoods(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return Object.keys(NEIGHBORHOOD_CENTERS).filter(k => lower.includes(k));
}
