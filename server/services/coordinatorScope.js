// Zonas de un coordinador: barrios asignados + polígonos dibujados en el mapa.
// Una mascota pertenece al alcance si sus barrios coinciden O su pin cae dentro
// de algún polígono de las agrupaciones que coordina.
import { normalizeNb, nbOverlapSql } from './neighborhoodUtils.js';

export function pointInPolygon(lat, lng, ring) {
  if (lat == null || lng == null || !Array.isArray(ring) || ring.length < 3) return false;
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

function parseRing(raw) {
  if (!raw) return null;
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(parsed) || parsed.length < 3) return null;
  const ring = parsed
    .map(p => Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p?.lat), Number(p?.lng)])
    .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  return ring.length >= 3 ? ring : null;
}

function parseNeighborhoods(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw).filter(Boolean).map(String); } catch { return []; }
  }
  return [];
}

export function nbOverlapJS(petNbs, coordNbs) {
  const normSet = new Set(coordNbs.map(normalizeNb));
  return petNbs.some(nb => normSet.has(normalizeNb(nb)));
}

// Carga las zonas activas de un coordinador desde la DB.
export async function getCoordinatorZones(pool, userId) {
  const res = await pool.query(
    `SELECT neighborhoods, zone_polygon FROM agrupaciones WHERE coordinator_user_id = $1 AND is_active = TRUE`,
    [userId]
  );
  const neighborhoodIds = [];
  const polygons = [];
  for (const row of res.rows) {
    neighborhoodIds.push(...parseNeighborhoods(row.neighborhoods));
    const ring = parseRing(row.zone_polygon);
    if (ring) polygons.push(ring);
  }
  return { neighborhoodIds, polygons };
}

export function zonesAreEmpty(zones) {
  return zones.neighborhoodIds.length === 0 && zones.polygons.length === 0;
}

// Chequeo exacto en JS sobre una mascota (pet.neighborhoods puede venir como TEXT JSON).
export function petInZones(pet, zones) {
  const nbs = parseNeighborhoods(pet.neighborhoods);
  if (nbs.length > 0 && nbOverlapJS(nbs, zones.neighborhoodIds)) return true;
  if (zones.polygons.length === 0) return false;
  const lat = Number(pet.latitude), lng = Number(pet.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return zones.polygons.some(ring => pointInPolygon(lat, lng, ring));
}

// Cláusula SQL "generosa" para el pre-filtro: overlap de barrios OR coordenadas
// presentes (si hay polígonos). El filtrado exacto se hace después en JS con
// petInZones().
export function coarseZoneSql(paramIdx, hasPolygons) {
  const nbCond = nbOverlapSql(`$${paramIdx}`, "(NULLIF(p.neighborhoods, '')::jsonb)");
  if (!hasPolygons) return `(${nbCond})`;
  return `(${nbCond} OR (p.latitude IS NOT NULL AND p.longitude IS NOT NULL))`;
}
