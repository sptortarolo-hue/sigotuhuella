// Build del dataset local de calles de La Plata (numeración externa).
// Descarga el shapefile de calles del partido desde la API Georef del gobierno
// argentino, lo parsea con shpjs y genera server/data/lp_calles.json con la
// geometría (segmentos) indexada por nombre normalizado.
//
// Uso:
//   node server/scripts/buildLpCalles.js            # descarga y genera
//   node server/scripts/buildLpCalles.js --no-download  # usa zip ya descargado en TMP
//
// El JSON resultante se commitea al repo (se distribuye con el código).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseZip } from 'shpjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'data');
const OUT_FILE = join(OUT_DIR, 'lp_calles.json');
const DEPT_ID = '06441'; // La Plata
const TMP_ZIP = process.env.LP_CALLES_ZIP || join(process.env.TMP || process.env.TEMP || '/tmp', 'lp_calles_shp.zip');

const DOWNLOAD_URL = `https://apis.datos.gob.ar/georef/api/calles?departamento=${DEPT_ID}&formato=shp&max=2500`;

// Normaliza el nombre de una vía a una clave canónica numérica.
// "CALLE 672" -> { num: 672, bis: false }
// "CALLE 20 BIS" / "CALLE 20 BIS - VALLE" -> { num: 20, bis: true }
// "AVENIDA 520" -> { num: 520, bis: false }
// Devuelve null si no es una vía con número reconocible (calles con nombre propio).
function normalizeStreet(name) {
  if (!name) return null;
  const n = name.toUpperCase();
  // Busca el primer número (ignorando sufijos tipo "- LOS MOROS").
  const m = n.match(/(\d+)/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  const bis = /BIS|^C\s*\d+\s*B\b/i.test(n) || /\bB\b/.test(n.replace(/BIS/g, ''));
  return { num, bis };
}

function keyFor(parsed) {
  return parsed.bis ? `${parsed.num} bis` : `${parsed.num}`;
}

// Convierte la geometría de una feature a una lista de segmentos [[lng,lat],[lng,lat]].
function toSegments(geom) {
  const segs = [];
  const pushLine = (coords) => {
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i], b = coords[i + 1];
      segs.push([[a[0], a[1]], [b[0], b[1]]]);
    }
  };
  if (geom.type === 'LineString') pushLine(geom.coordinates);
  else if (geom.type === 'MultiLineString') {
    for (const line of geom.coordinates) pushLine(line);
  }
  return segs;
}

async function downloadZip() {
  if (existsSync(TMP_ZIP)) {
    console.log(`Usando zip existente: ${TMP_ZIP}`);
    return readFileSync(TMP_ZIP);
  }
  console.log(`Descargando shapefile: ${DOWNLOAD_URL}`);
  const resp = await fetch(DOWNLOAD_URL);
  if (!resp.ok) throw new Error(`Error descargando shapefile: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(TMP_ZIP, buf);
  console.log(`Descargado (${buf.length} bytes) a ${TMP_ZIP}`);
  return buf;
}

async function main() {
  const noDownload = process.argv.includes('--no-download');

  let zipBuf;
  if (noDownload) {
    if (!existsSync(TMP_ZIP)) throw new Error(`--no-download requiere el zip en ${TMP_ZIP}`);
    zipBuf = readFileSync(TMP_ZIP);
  } else {
    zipBuf = await downloadZip();
  }

  const data = await parseZip(zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.byteLength));
  const feats = data.features;
  console.log(`Features totales: ${feats.length}`);

  // Consolidar tramos por clave normalizada.
  const byKey = new Map();
  let skipped = 0;
  for (const f of feats) {
    const parsed = normalizeStreet(f.properties.nombre);
    if (!parsed) { skipped++; continue; }
    const key = keyFor(parsed);
    const segs = toSegments(f.geometry);
    if (segs.length === 0) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(...segs);
  }

  // Ordenar claves numéricamente.
  const sortedKeys = [...byKey.keys()].sort((a, b) => {
    const na = parseInt(a, 10) || 0, nb = parseInt(b, 10) || 0;
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });

  const calles = {};
  let totalSegs = 0;
  for (const key of sortedKeys) {
    // Redondear a 6 decimales (~1m) para reducir tamaño.
    const segs = byKey.get(key).map(([a, b]) => [
      [round6(a[0]), round6(a[1])],
      [round6(b[0]), round6(b[1])],
    ]);
    calles[key] = segs;
    totalSegs += segs.length;
  }

  const payload = {
    version: 1,
    partido: 'La Plata',
    departamento_id: DEPT_ID,
    generated: new Date().toISOString().slice(0, 10),
    calles,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(payload));
  console.log(`Escrito ${OUT_FILE}`);
  console.log(`Calles indexadas: ${Object.keys(calles).length} (${skipped} sin nombre numerico)`);
  console.log(`Total segmentos: ${totalSegs}`);
  console.log(`Tamaño JSON: ${(Buffer.byteLength(JSON.stringify(payload)) / 1024 / 1024).toFixed(2)} MB`);
}

function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

main().catch((e) => {
  console.error('Error:', e.message || e);
  process.exit(1);
});
