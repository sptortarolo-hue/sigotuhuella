import pool from '../db.js';
import { geocodeAddress } from '../services/geocoding.js';

async function main() {
  const result = await pool.query(
    `SELECT id, location FROM pets
     WHERE location IS NOT NULL
       AND location != ''
       AND location != 'Sin ubicación'
       AND (latitude IS NULL OR longitude IS NULL)
     ORDER BY created_at DESC`
  );

  const rows = result.rows;
  console.log(`Pets sin coordenadas: ${rows.length}\n`);

  let geocoded = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const pet = rows[i];
    try {
      const coords = await geocodeAddress(pet.location);
      if (coords) {
        await pool.query(
          'UPDATE pets SET latitude = $1, longitude = $2 WHERE id = $3',
          [coords.lat, coords.lng, pet.id]
        );
        console.log(`[${i + 1}/${rows.length}] ✓ ${pet.location} → ${coords.lat}, ${coords.lng}`);
        geocoded++;
      } else {
        console.log(`[${i + 1}/${rows.length}] ✗ ${pet.location} → sin resultados`);
        failed++;
      }
    } catch (err) {
      console.log(`[${i + 1}/${rows.length}] ✗ ${pet.location} → error: ${err.message}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`\nGeocodificados: ${geocoded} | Sin resultado: ${failed}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
