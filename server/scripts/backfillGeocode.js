import 'dotenv/config';
import pool from '../db.js';
import { geocodeAddress, isInInfluenceZone } from '../services/geocoding.js';

const FALLBACK_LAT = -34.9155;
const FALLBACK_LNG = -57.9480;

async function main() {
  const result = await pool.query(
    `SELECT id, location, latitude, longitude FROM pets
     WHERE location IS NOT NULL
       AND location != ''
       AND location != 'Sin ubicación'
       AND (
         latitude IS NULL OR longitude IS NULL
         OR (latitude = $1 AND longitude = $2)
         OR latitude < -35.10 OR latitude > -34.82
         OR longitude < -58.20 OR longitude > -57.80
       )
     ORDER BY created_at DESC`,
    [FALLBACK_LAT, FALLBACK_LNG]
  );

  const rows = result.rows;
  console.log(`Pets a re-geocodificar: ${rows.length}\n`);

  let geocoded = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const pet = rows[i];
    try {
      const coords = await geocodeAddress(pet.location);
      if (coords && isInInfluenceZone(coords.lat, coords.lng)) {
        await pool.query(
          'UPDATE pets SET latitude = $1, longitude = $2 WHERE id = $3',
          [coords.lat, coords.lng, pet.id]
        );
        console.log(`[${i + 1}/${rows.length}] ✓ ${pet.location} → ${coords.lat}, ${coords.lng}`);
        geocoded++;
      } else {
        console.log(`[${i + 1}/${rows.length}] ✗ ${pet.location} → sin resultados en zona de influencia`);
        failed++;
      }
    } catch (err) {
      console.log(`[${i + 1}/${rows.length}] ✗ ${pet.location} → error: ${err.message}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`\nRe-geocodificados: ${geocoded} | Sin resultado: ${failed}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });