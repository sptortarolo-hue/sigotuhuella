import 'dotenv/config';
import pool from '../db.js';
import { geocodeAddress, isInInfluenceZone, parseLaPlataAddress, extractNeighborhoods } from '../services/geocoding.js';

const MIN_DISTANCE_DEG = 0.003; // ~300m: por debajo no actualizamos
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

const PLACE_KEYWORDS = [
  'plaza', 'parque', 'catedral', 'estacion', 'estación', 'hospital',
  'club', 'diag', 'colegio', 'escuela', 'iglesia', 'parroquia',
  'terminal', 'hipermercado', 'shopping', 'centro comercial', 'cementerio',
];

function looksLikeAddress(location) {
  if (!location) return false;
  const s = location.trim();
  if (parseLaPlataAddress(s)) return true;
  if (extractNeighborhoods(s).length > 0) return true;
  const lower = s.toLowerCase();
  if (PLACE_KEYWORDS.some(k => lower.includes(k))) return true;
  return /\d/.test(s);
}

function distanceDeg(aLat, aLng, bLat, bLng) {
  return Math.hypot(aLat - bLat, aLng - bLng);
}

async function processPet(pet, index, total) {
  const coords = await geocodeAddress(pet.location);
  if (!coords || !isInInfluenceZone(coords.lat, coords.lng)) {
    console.log(`[${index}/${total}] ✗ ${pet.location} → sin resultados en zona de influencia`);
    return { status: 'failed' };
  }
  const hasCoords = pet.latitude != null && pet.longitude != null;
  if (hasCoords && distanceDeg(coords.lat, coords.lng, pet.latitude, pet.longitude) < MIN_DISTANCE_DEG) {
    console.log(`[${index}/${total}] = ${pet.location} → sin cambio (${coords.lat}, ${coords.lng})`);
    return { status: 'unchanged' };
  }
  await pool.query(
    'UPDATE pets SET latitude = $1, longitude = $2 WHERE id = $3',
    [coords.lat, coords.lng, pet.id]
  );
  console.log(`[${index}/${total}] ✓ ${pet.location} → ${coords.lat}, ${coords.lng}`);
  return { status: 'updated' };
}

async function main() {
  const result = await pool.query(
    `SELECT id, location, latitude, longitude FROM pets
     WHERE location IS NOT NULL
       AND location != ''
       AND location != 'Sin ubicación'
     ORDER BY created_at DESC`
  );

  const all = result.rows;
  const rows = all.filter(p => looksLikeAddress(p.location));
  const skipped = all.length - rows.length;
  console.log(`Pets con ubicación: ${all.length} | a re-geocodificar: ${rows.length} | sin dirección (saltados): ${skipped}\n`);

  let updated = 0, unchanged = 0, failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((pet, j) => processPet(pet, i + j + 1, rows.length)));
    for (const r of results) {
      if (r.status === 'updated') updated++;
      else if (r.status === 'unchanged') unchanged++;
      else failed++;
    }
    if (i + BATCH_SIZE < rows.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`\nActualizados: ${updated} | Sin cambio: ${unchanged} | Sin resultado: ${failed} | Saltados: ${skipped}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
