import { parseRoad } from './grid';

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function extractNum(name: string): string {
  const m = name.match(/(\d+\s*b?)/i);
  return m ? m[1].trim() : name;
}

function streetRegex(road: string): string {
  const m = road.match(/^Calle\s+(\d+)/i);
  const num = m ? m[1] : road.replace(/\D+/g, '');
  if (!num) return '';
  return `^(?:Calle\\s+)?${num}(?:\\s+(?:[Bb][Ii][Ss]|[Bb]))?$`;
}

function segmentIntersection(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  c: { lat: number; lon: number },
  d: { lat: number; lon: number }
): { lat: number; lon: number } | null {
  const denom = (b.lon - a.lon) * (d.lat - c.lat) - (b.lat - a.lat) * (d.lon - c.lon);
  if (denom === 0) return null;
  const t = ((c.lon - a.lon) * (d.lat - c.lat) - (c.lat - a.lat) * (d.lon - c.lon)) / denom;
  const u = ((c.lon - a.lon) * (b.lat - a.lat) - (c.lat - a.lat) * (b.lon - a.lon)) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
}

async function overpassQuery(query: string): Promise<any | null> {
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SigoTuHuella/1.0 (web app; contact: sigotuhuella.com.ar)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text.includes('runtime error') || text.trimStart().startsWith('<')) continue;
      return JSON.parse(text);
    } catch {
      continue;
    }
  }
  return null;
}

// Trae geometrías de la calle y sus transversales alrededor del punto.
async function fetchNearbyWays(
  road: string,
  lat: number,
  lng: number
): Promise<any[]> {
  const re = streetRegex(road);
  if (!re) return [];
  const info = parseRoad(road);
  if (info.axis === 'unknown') return [];
  const crossAxis = info.axis === 'a1' ? 'a2' : 'a1';

  const query = `[out:json][timeout:15];
way["name"~"${re}"](around:200,${lat},${lng});
out body geom;`;
  const data = await overpassQuery(query);
  if (!data?.elements) return [];
  return data.elements.filter((e: any) => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 2);
}

export async function fetchEntreCalles(
  road: string,
  lat: number,
  lng: number
): Promise<{ from: string; to: string } | null> {
  const info = parseRoad(road);
  if (info.axis === 'unknown' || info.num === null) return null;
  const crossAxis = info.axis === 'a1' ? 'a2' : 'a1';

  const roadWays = await fetchNearbyWays(road, lat, lng);
  if (roadWays.length === 0) return null;

  const roadGeom = roadWays[0].geometry as { lat: number; lon: number }[];

  // Punto más cercano de la calle al click (índice de segmento).
  let minSegIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < roadGeom.length - 1; i++) {
    const ax = roadGeom[i].lon, ay = roadGeom[i].lat;
    const bx = roadGeom[i + 1].lon, by = roadGeom[i + 1].lat;
    const abx = bx - ax, aby = by - ay;
    const apx = lng - ax, apy = lat - ay;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) continue;
    let t = (apx * abx + apy * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * abx, py = ay + t * aby;
    const d = Math.sqrt((lng - px) ** 2 + (lat - py) ** 2);
    if (d < minDist) { minDist = d; minSegIdx = i + t; }
  }

  // Buscar cruces geométricos de la calle con transversales nombradas.
  // Para eso traemos las transversales alrededor del punto del click.
  const crossRe = `^(?:Calle\\s+)?(\\d{1,3}(?:\\s+(?:[Bb][Ii][Ss]|[Bb]))?)$`;
  const query = `[out:json][timeout:15];
way["name"~"${crossRe}"](around:250,${lat},${lng});
out body geom;`;
  const data = await overpassQuery(query);
  const ways = data?.elements?.filter((e: any) => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 2) || [];
  const crossWays = ways.filter((w: any) => parseRoad(w.tags?.name || '')?.axis === crossAxis);

  // Para cada transversal, intersectar con la calle y guardar posición.
  const crosses: { name: string; idx: number }[] = [];
  for (const cw of crossWays) {
    const cg = cw.geometry as { lat: number; lon: number }[];
    for (let i = 0; i < roadGeom.length - 1; i++) {
      for (let j = 0; j < cg.length - 1; j++) {
        const hit = segmentIntersection(roadGeom[i], roadGeom[i + 1], cg[j], cg[j + 1]);
        if (hit) {
          // distancia a lo largo de la calle hasta el cruce
          let acc = 0;
          for (let k = 0; k < i; k++) {
            acc += Math.hypot(roadGeom[k + 1].lat - roadGeom[k].lat, roadGeom[k + 1].lon - roadGeom[k].lon);
          }
          acc += Math.hypot(hit.lat - roadGeom[i].lat, hit.lon - roadGeom[i].lon);
          crosses.push({ name: cw.tags.name, idx: acc });
          break;
        }
      }
    }
  }

  if (crosses.length < 2) return null;
  crosses.sort((a, b) => a.idx - b.idx);

  const clickDist = minSegIdx;
  let before: string | null = null;
  let after: string | null = null;
  for (const c of crosses) {
    if (c.idx <= clickDist) before = c.name;
    else if (after === null) after = c.name;
  }
  if (!before || !after) return null;

  return { from: extractNum(before), to: extractNum(after) };
}