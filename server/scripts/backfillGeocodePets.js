import pool from '../db.js';
import { geocodeAddress } from '../services/geocoding.js';

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function main() {
  const pets = await pool.query(
    `SELECT id, location, latitude, longitude
     FROM pets
     WHERE location IS NOT NULL AND location != ''`
  );

  console.log(`[Backfill] Pets a procesar: ${pets.rows.length}`);

  let updated = 0, filled = 0, skipped = 0, samePlace = 0;
  for (let i = 0; i < pets.rows.length; i++) {
    const pet = pets.rows[i];
    const coords = await geocodeAddress(pet.location).catch(() => null);
    if (!coords) {
      skipped++;
      console.log(`[${i + 1}/${pets.rows.length}] SKIP ${pet.id}: geocode fallo para "${pet.location}"`);
      await new Promise(r => setTimeout(r, 500));
      continue;
    }
    const hasCoords = pet.latitude != null && pet.longitude != null;
    if (!hasCoords) {
      // Franja de pines vacios: asignar las coords geocodificadas.
      await pool.query(
        'UPDATE pets SET latitude = $1, longitude = $2 WHERE id = $3',
        [coords.lat, coords.lng, pet.id]
      );
      filled++;
      console.log(`[${i + 1}/${pets.rows.length}] FILL ${pet.id}: "${pet.location}" -> ${coords.lat}, ${coords.lng}`);
    } else {
      const dist = haversine(pet.latitude, pet.longitude, coords.lat, coords.lng);
      if (dist > 100) {
        await pool.query(
          'UPDATE pets SET latitude = $1, longitude = $2 WHERE id = $3',
          [coords.lat, coords.lng, pet.id]
        );
        updated++;
        console.log(`[${i + 1}/${pets.rows.length}] UPDATE ${pet.id}: "${pet.location}" -> ${coords.lat}, ${coords.lng} (corrigio ${Math.round(dist)}m)`);
      } else {
        samePlace++;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n[Backfill] Fin. Actualizados: ${updated} | Rellenados: ${filled} | Sin cambio (<100m): ${samePlace} | Skipped: ${skipped} | Total: ${pets.rows.length}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
