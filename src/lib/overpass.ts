import { parseRoad } from './grid';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function extractNum(name: string): string {
  const m = name.match(/(\d+\s*b?)/i);
  return m ? m[1].trim() : name;
}

export async function fetchEntreCalles(
  road: string,
  lat: number,
  lng: number
): Promise<{ from: string; to: string } | null> {
  const info = parseRoad(road);
  if (info.axis === 'unknown' || info.num === null) return null;

  const query = `[out:json][timeout:10];
way["name"="${road.replace(/"/g, '\\"')}"](around:200,${lat},${lng})->.road;
node(w.road)->.roadNodes;
way(bn.roadNodes)["name"];
out body geom;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) return null;

    const data = await res.json();
    const ways: any[] = data.elements.filter((e: any) => e.type === 'way');

    const roadWay = ways.find((w: any) => w.tags?.name === road);
    if (!roadWay?.geometry?.length) return null;

    const crossAxis = info.axis === 'a1' ? 'a2' : 'a1';
    const nodes = new Set(roadWay.nodes as number[]);
    const intersectPos = new Map<number, number>();

    for (const w of ways) {
      if (w.id === roadWay.id || !w.tags?.name) continue;
      const wInfo = parseRoad(w.tags.name);
      if (wInfo.axis !== crossAxis) continue;
      for (const nid of w.nodes as number[]) {
        if (nodes.has(nid)) {
          const idx = roadWay.nodes.indexOf(nid);
          if (idx >= 0) intersectPos.set(nid, idx);
        }
      }
    }

    if (intersectPos.size === 0) return null;

    const geom = roadWay.geometry as { lat: number; lon: number }[];

    let minSegIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < geom.length - 1; i++) {
      const ax = geom[i].lon, ay = geom[i].lat;
      const bx = geom[i + 1].lon, by = geom[i + 1].lat;
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

    const sorted = [...intersectPos.entries()].sort((a, b) => a[1] - b[1]);

    let before: number | null = null;
    let after: number | null = null;
    for (const [nid, pos] of sorted) {
      if (pos <= minSegIdx) before = nid;
      else if (after === null) after = nid;
    }

    if (before === null && after === null) return null;
    if (before === null || after === null) return null;

    const getNameForNode = (nid: number): string | null => {
      for (const w of ways) {
        if (w.id === roadWay.id || !w.tags?.name) continue;
        const wInfo = parseRoad(w.tags.name);
        if (wInfo.axis !== crossAxis) continue;
        if ((w.nodes as number[]).includes(nid)) return w.tags.name;
      }
      return null;
    };

    const bn = getNameForNode(before);
    const an = getNameForNode(after);
    if (!bn || !an) return null;

    return { from: extractNum(bn), to: extractNum(an) };
  } catch {
    return null;
  }
}
