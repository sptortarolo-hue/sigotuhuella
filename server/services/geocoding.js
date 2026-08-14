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
  'https://overpass.private.coffee/api/interpreter',
];

// Circuit breaker: si un mirror falla (timeout/error), no volver a intentarlo
// durante 60s. Overpass es inestable y un mirror caído quema 25s por consulta.
const OVERPASS_COOLDOWN_MS = 60 * 1000;
const overpassFailureAt = new Map();

function overpassMirrorDown(url) {
  const t = overpassFailureAt.get(url);
  return t && Date.now() - t < OVERPASS_COOLDOWN_MS;
}

async function overpassQuery(query) {
  for (const url of OVERPASS_URLS) {
    if (overpassMirrorDown(url)) continue;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SigoTuHuella/1.0 (WhatsApp bot geocoding; contact: sigotuhuella.com.ar)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(20000),
      });
      if (!resp.ok) { overpassFailureAt.set(url, Date.now()); continue; }
      const text = await resp.text();
      if (!text || text.includes('runtime error') || text.trimStart().startsWith('<')) {
        overpassFailureAt.set(url, Date.now());
        continue;
      }
      try {
        const data = JSON.parse(text);
        if (data && data.elements) {
          overpassFailureAt.delete(url);
          return data;
        }
      } catch { overpassFailureAt.set(url, Date.now()); continue; }
    } catch { overpassFailureAt.set(url, Date.now()); continue; }
  }
  return null;
}

function streetName(raw) {
  const m = raw.match(/^(\d+)/);
  const base = m ? m[1] : raw;
  return /bis|b$/i.test(raw) ? `Calle ${base} bis` : `Calle ${base}`;
}

// Regex para Overpass (engine ICU): acepta prefijos "Calle", "Av" o "Avenida".
// Sin grupos no-capturadores ni \s (verificado en vivo).
function overpassStreetRegex(name) {
  const m = name.match(/^(?:Calle|Av|Avenida)?\s*(\d{1,3})/i);
  const num = m ? m[1] : '';
  if (!num) return null;
  return `^(Calle |Av |Avenida )?${num}( (Bis|bis|BIS))?$`;
}

function streetRegex(name) {
  const m = name.match(/^(?:Calle|Av|Avenida)?\s*(\d{1,3})/i);
  const num = m ? m[1] : '';
  return `^(?:Calle\\s+|Av\\s+|Avenida\\s+)?${num}(?:\\s+(?:[Bb][Ii][Ss]|[Bb]))?$`;
}

// Regex combinado para buscar N calles en una sola consulta Overpass.
// Regex combinado para Overpass (engine ICU): NO usar grupos no-capturadores
// `(?:...)` (da 400) ni `\s` (no matchea). Solo grupos capturadores y espacios
// literales (verificado en vivo contra overpass-api.de).
function streetRegexes(names) {
  const nums = names.map((n) => {
    const m = n.match(/^(?:Calle|Av|Avenida)?\s*(\d{1,3})/i);
    return m ? m[1] : n.match(/\d{1,3}/)?.[0] || '';
  }).filter(Boolean);
  if (nums.length === 0) return null;
  return `^(Calle |Av |Avenida )?(${nums.join('|')})( (Bis|bis|BIS))?$`;
}

// Intersección punto-segmento exacta (geometría), en lugar de depender de que
// dos ways compartan un nodo (fragmentación de OSM rompe node.a.b).
function segmentIntersection(a, b, c, d) {
  const denom = (b.lon - a.lon) * (d.lat - c.lat) - (b.lat - a.lat) * (d.lon - c.lon);
  if (denom === 0) return null;
  const t = ((c.lon - a.lon) * (d.lat - c.lat) - (c.lat - a.lat) * (d.lon - c.lon)) / denom;
  const u = ((c.lon - a.lon) * (b.lat - a.lat) - (c.lat - a.lat) * (b.lon - a.lon)) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { lat: a.lat + t * (b.lat - a.lat), lng: a.lon + t * (b.lon - a.lon) };
}

// Localiza los ways de las calles dadas en TODO el bbox de influencia.
// Fase 1: `out center` (rápido, sin geometría) para descubrir qué ways existen.
// Fase 2: `way(id:...)` + `out body geom` para traer solo la geometría real.
async function overpassWaysByNames(names) {
  const re = streetRegexes(names);
  if (!re) return [];
  const bbox = `${INFLUENCE_BBOX.minLat},${INFLUENCE_BBOX.minLng},${INFLUENCE_BBOX.maxLat},${INFLUENCE_BBOX.maxLng}`;
  const q1 = `[out:json][timeout:40];
way["name"~"${re}"](${bbox});
out center;`;
  const d1 = await overpassQuery(q1);
  if (!d1 || !d1.elements) return [];
  const ids = d1.elements.filter(e => e.type === 'way' && e.id).map(e => e.id);
  if (ids.length === 0) return [];
  if (ids.length > 600) ids.length = 600;
  const q2 = `[out:json][timeout:40];
way(id:${ids.join(',')});
out body geom;`;
  const d2 = await overpassQuery(q2);
  if (!d2 || !d2.elements) return [];
  return d2.elements.filter(e => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 2);
}

// Promedio de intersecciones geométricas entre dos conjuntos de ways.
// Se agrupan los cruces y se elige el grupo más cercano al punto ancla (el grid
// o el centro del barrio): evita cruces de calles homónimas de otros barrios.
// `anchorStrict` (true cuando el ancla viene de un barrio mencionado): si ningún
// cruce queda a <2.5km del ancla, se descarta Overpass (homónimos). En modo no
// estricto (ancla = grid, poco confiable en numeración externa 600-720/130-170),
// un cruce único real se acepta aunque quede lejos del grid.
function intersectWaySets(waysA, waysB, anchor, anchorStrict = true) {
  if (waysA.length === 0 || waysB.length === 0) return null;
  const hits = [];
  for (const w1 of waysA) {
    const g1 = w1.geometry;
    for (let i = 0; i < g1.length - 1; i++) {
      const a = g1[i], b = g1[i + 1];
      for (const w2 of waysB) {
        const g2 = w2.geometry;
        for (let j = 0; j < g2.length - 1; j++) {
          const hit = segmentIntersection(a, b, g2[j], g2[j + 1]);
          if (hit) hits.push(hit);
        }
      }
    }
  }
  if (hits.length === 0) return null;
  // Agrupamos los cruces cercanos (~300m) para promediar cada cruce real.
  // OJO: comparamos contra el centroide (x.lat/x.hits), no contra la suma
  // acumulada, o los cruces se fragmentan en grupos espurios.
  const groups = [];
  for (const h of hits) {
    const g = groups.find(x => Math.hypot(x.lat / x.hits - h.lat, x.lng / x.hits - h.lng) < 0.003);
    if (g) { g.hits++; g.lat += h.lat; g.lng += h.lng; }
    else groups.push({ hits: 1, lat: h.lat, lng: h.lng });
  }
  const cents = groups.map(g => ({ lat: g.lat / g.hits, lng: g.lng / g.hits, hits: g.hits }));
  // Elegimos el grupo más cercano al ancla.
  if (anchor) {
    cents.sort((a, b) => Math.hypot(a.lat - anchor.lat, a.lng - anchor.lng) - Math.hypot(b.lat - anchor.lat, b.lng - anchor.lng));
    const best = cents[0];
    const dist = Math.hypot(best.lat - anchor.lat, best.lng - anchor.lng);
    // Cruce cerca del ancla: confiable (resuelve homónimos del centro).
    if (dist <= 0.022) return { lat: best.lat, lng: best.lng };
    // Cruce lejos del ancla.
    if (anchorStrict) return null; // homónimo de otro barrio
    // Modo no estricto: con un único cruce real, lo aceptamos aunque el grid
    // (ancla) quede lejos — el grid no modela bien la numeración externa.
    if (cents.length === 1) return { lat: best.lat, lng: best.lng };
    return null; // varios cruces ambiguos lejos del ancla
  }
  const best = cents.reduce((a, b) => (b.hits > a.hits ? b : a), cents[0]);
  return { lat: best.lat, lng: best.lng };
}

// Centro aproximado (grid fallback o centro de barrio) que sirve de ancla para
// elegir entre cruces de calles homónimas en distintos barrios del partido.
function searchCenter(lp, address) {
  const neighborhoods = extractNeighborhoods(address);
  if (neighborhoods.length > 0) {
    const center = NEIGHBORHOOD_CENTERS[neighborhoods[0]];
    if (center) return center;
  }
  return gridFallback(lp) || LA_PLATA_CENTER;
}

// Resuelve una dirección estilo La Plata vía Overpass (intersección o tramo).
async function overpassLPCoords(lp, address) {
  const roadName = streetName(lp.road);
  const crossNames = lp.type === 'intersection' ? [lp.cross] : [lp.from, lp.to];
  const ways = await overpassWaysByNames([lp.road, ...crossNames]);
  if (ways.length === 0) return null;
  const anchor = searchCenter(lp, address);
  // El filtro por ancla es estricto si el texto menciona un barrio (ancla =
  // centro del barrio, confiable) o si todos los números son del casco (<=80,
  // donde el grid es confiable). Se relaja solo con números externos (>80):
  // ahí el grid se desvía 3-8km y el cruce Overpass único real le gana al grid.
  const nums = [lp.road, ...crossNames].map(n => parseInt(n)).filter(n => !isNaN(n));
  const hasOuterNumbers = nums.some(n => n > 80);
  const anchorStrict = extractNeighborhoods(address).length > 0 || !hasOuterNumbers;

  const roadWays = ways.filter(w => new RegExp(streetRegex(roadName)).test(w.tags?.name || ''));

  if (lp.type === 'intersection') {
    const crossWays = ways.filter(w => new RegExp(streetRegex(streetName(lp.cross))).test(w.tags?.name || ''));
    return intersectWaySets(roadWays, crossWays, anchor, anchorStrict);
  }

  const fromWays = ways.filter(w => new RegExp(streetRegex(streetName(lp.from))).test(w.tags?.name || ''));
  const toWays = ways.filter(w => new RegExp(streetRegex(streetName(lp.to))).test(w.tags?.name || ''));
  const p1 = intersectWaySets(roadWays, fromWays, anchor, anchorStrict);
  const p2 = intersectWaySets(roadWays, toWays, anchor, anchorStrict);
  if (!p1 && !p2) return null;
  if (!p1) return p2;
  if (!p2) return p1;
  return { lat: (p1.lat + p2.lat) / 2, lng: (p1.lng + p2.lng) / 2 };
}

// Parsea direcciones del estilo de La Plata. Devuelve null si no matchea.
// Acepta prefijos "calle", "av"/"av."/"avenida" (se normalizan) y números sueltos
// ("12 entre 52 y 53", "12 52 y 53", "12 y 53", "12 esquina 53"). "Diagonal" NO se
// reduce a número: el grid no la modela y Overpass la confundiría con la calle.
export function parseLaPlataAddress(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase().replace(/[.,;()]+/g, ' ').replace(/\b(?:calle|avenida|av\.?)\s+/g, ' ');
  const re1 = /(?:^|\s)(?<!\b(?:diagonal|entre)\s)(\d{1,3}(?:bis|b)?)\s+entre\s+(\d{1,3}(?:bis|b)?)\s+y\s+(\d{1,3}(?:bis|b)?)(?:\s|$)/;
  const re2 = /(?:^|\s)(?<!\b(?:diagonal|entre)\s)(\d{1,3}(?:bis|b)?)\s+(\d{1,3}(?:bis|b)?)\s+y\s+(\d{1,3}(?:bis|b)?)(?:\s|$)/;
  const re3 = /(?:^|\s)(?<!\b(?:diagonal|entre)\s)(\d{1,3}(?:bis|b)?)\s+y\s+(\d{1,3}(?:bis|b)?)(?:\s|$)/;
  const re4 = /(?:^|\s)(?<!\b(?:diagonal|entre)\s)(\d{1,3}(?:bis|b)?)\s+esquina\s+(\d{1,3}(?:bis|b)?)(?:\s|$)/;
  let m = t.match(re1);
  if (m) return { type: 'between', road: m[1], from: m[2], to: m[3] };
  m = t.match(re2);
  if (m) return { type: 'between', road: m[1], from: m[2], to: m[3] };
  m = t.match(re3);
  if (m) return { type: 'intersection', road: m[1], cross: m[2] };
  m = t.match(re4);
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
  // El modelo afín solo es fiable en el casco (calles 1-122). Fuera de ahí la
  // numeración externa se desvía kilómetros (verificado: "137 y 90" ~10km,
  // "670 y 19" ~4km). Para numeración externa se usa Overpass, no el grid.
  if (isNaN(roadNum) || roadNum <= 0 || roadNum > 122) return null;
  const crossA = parseInt(lp.from || lp.cross);
  const crossB = parseInt(lp.to || lp.cross);
  const mid = (crossA + crossB) / 2;
  const axis = gridAxis(roadNum);
  if (axis === 'a1') return gridToLatlng(roadNum - GRID_REF_A, mid - GRID_REF_B);
  if (axis === 'a2') return gridToLatlng(mid - GRID_REF_A, roadNum - GRID_REF_B);
  return null;
}

// Detección genérica de direcciones LP con números ("N entre X y Y", "N X y Y",
// "N y X", "N esquina X") que el parser estricto no reconoció (diagonales, calles
// con nombre). Para estas no hay que inventar un pin: si no se resuelve, null.
function looksLikeLpAddress(text) {
  if (!text || typeof text !== 'string') return false;
  const t = ' ' + text.toLowerCase() + ' ';
  if (/\d{1,3}\s+entre\s+\d{1,3}\s+y\s+\d{1,3}/.test(t)) return true;
  if (/\d{1,3}\s+\d{1,3}\s+y\s+\d{1,3}/.test(t)) return true;
  if (/\d{1,3}\s+y\s+\d{1,3}/.test(t)) return true;
  if (/\d{1,3}\s+esquina\s+\d{1,3}/.test(t)) return true;
  return false;
}

// Geocodifica una dirección con bias a La Plata. Nunca devuelve un punto
// fuera del área de influencia. Para direcciones LP que no se pueden ubicar
// con precisión devuelve null (nunca un pin inventado); para texto libre cae
// al centro del barrio coincidente o al centro de La Plata.
const geocodeCache = new Map();
const GEOCODE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 días para éxitos
const NEGATIVE_CACHE_TTL = 5 * 60 * 1000; // 5 min para fallos: no re-quemar Overpass

export async function geocodeAddress(address) {
  if (!address || address.trim().length < 3) return null;
  const key = address.trim().toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached) {
    const ttl = cached.value ? GEOCODE_CACHE_TTL : NEGATIVE_CACHE_TTL;
    if (Date.now() - cached.ts < ttl) return cached.value;
    geocodeCache.delete(key);
  }
  const lp = parseLaPlataAddress(address);
  let result = null;
  try {
    if (lp) {
      const roadNum = parseInt(lp.road);
      if (!isNaN(roadNum) && roadNum <= 122) {
        // Casco (1-122): el grid es exacto e instantáneo. Overpass geométrico no
        // encuentra estos cruces (OSM fragmentado) y solo agrega latencia.
        const grid = gridFallback(lp);
        result = grid && isInInfluenceZone(grid.lat, grid.lng) ? grid : null;
      } else {
        // Numeración externa: solo Overpass conoce la ubicación real.
        const overpass = await overpassLPCoords(lp, address);
        if (overpass && isInInfluenceZone(overpass.lat, overpass.lng)) {
          result = overpass;
        }
      }
      // No inventar pines: si se mencionó un barrio, su centro; si no, null.
      if (!result) result = matchNeighborhoodCenter(address) || null;
    } else if (looksLikeLpAddress(address)) {
      // Dirección LP que el parser no reconoció (diagonal, calle con nombre):
      // no inventar un pin con Nominatim/centro de La Plata.
      result = matchNeighborhoodCenter(address) || null;
    } else {
      // No es dirección estilo La Plata: Nominatim con variantes de contexto.
      const variants = [
        address + ', La Plata, Buenos Aires, Argentina',
        address + ', Buenos Aires, Argentina',
        address + ', Argentina',
        address,
      ];
      for (const v of variants) {
        const coords = await tryGeocode(v);
        if (coords) { result = coords; break; }
      }
      // Texto libre sin coordenadas: barrio mencionado o centro de La Plata.
      if (!result) result = matchNeighborhoodCenter(address) || LA_PLATA_CENTER;
    }
  } catch {
    result = lp
      ? (matchNeighborhoodCenter(address) || null)
      : (matchNeighborhoodCenter(address) || LA_PLATA_CENTER);
  }
  geocodeCache.set(key, { ts: Date.now(), value: result });
  return result;
}

export function extractNeighborhoods(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return Object.keys(NEIGHBORHOOD_CENTERS).filter(k => lower.includes(k));
}
