import pool from '../db.js';
import { geocodeAddress } from '../services/geocoding.js';

async function main() {
  const pets = await pool.query(
    `SELECT id, location, latitude, longitude
     FROM pets
     WHERE source_type = 'whatsapp'
       AND location IS NOT NULL AND location != ''
       AND (latitude IS NOT NULL OR longitude IS NOT NULL)`
  );

  console.log(`[Backfill] Pets a procesar: ${pets.rows.length}`);

  let updated = 0, skipped = 0;
  for (let i = 0; i < pets.rows.length; i++) {
    const pet = pets.rows[i];
    const coords = await geocodeAddress(pet.location).catch(() => null);
    if (coords) {
      await pool.query(
        'UPDATE pets SET latitude = $1, longitude = $2 WHERE id = $3',
        [coords.lat, coords.lng, pet.id]
      );
      updated++;
      console.log(`[${i + 1}/${pets.rows.length}] OK ${pet.id}: "${pet.location}" -> ${coords.lat}, ${coords.lng}`);
    } else {
      skipped++;
      console.log(`[${i + 1}/${pets.rows.length}] SKIP ${pet.id}: geocode fallo para "${pet.location}"`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n[Backfill] Fin. Actualizados: ${updated} | Skipped: ${skipped} | Total: ${pets.rows.length}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
