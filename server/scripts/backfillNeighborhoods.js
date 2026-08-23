// Backfill de barrios: pets con neighborhoods vacío que sí tienen barrio detectable
// en su location. Causa conocida: reportes viejos y /report-lost sin extracción.
// Corre desde server/: node scripts/backfillNeighborhoods.js [--dry]
// Idempotente: solo toca pets con neighborhoods NULL o '[]'.
import 'dotenv/config';
import pool from '../db.js';
import { extractNeighborhoods } from '../services/geocoding.js';

async function main() {
  const dryRun = process.argv.includes('--dry');
  const res = await pool.query(
    `SELECT id, name, location, created_at
     FROM pets
     WHERE neighborhoods IS NULL OR neighborhoods = '[]'
     ORDER BY created_at ASC`
  );
  console.log(`Pets sin barrios a revisar: ${res.rows.length}${dryRun ? ' (DRY RUN)' : ''}\n`);

  let updated = 0, skipped = 0;
  for (const pet of res.rows) {
    const nbs = extractNeighborhoods(pet.location || '');
    if (nbs.length === 0) {
      skipped++;
      continue;
    }
    if (!dryRun) {
      await pool.query('UPDATE pets SET neighborhoods = $1 WHERE id = $2', [
        JSON.stringify(nbs),
        pet.id,
      ]);
    }
    updated++;
    console.log(`  ${pet.name || pet.id} (${new Date(pet.created_at).toISOString().slice(0, 10)}): ${nbs.join(', ')}`);
  }

  console.log(`\nActualizados: ${updated} | sin barrio detectable: ${skipped}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
