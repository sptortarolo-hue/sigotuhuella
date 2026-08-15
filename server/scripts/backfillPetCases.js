// Backfill de casos huérfanos: pets con status que mapea a caso pero sin fila en pet_cases.
// Causa conocida: el endpoint /api/pets/lost-report no llamaba a createPetCase.
// Corre desde server/: node scripts/backfillPetCases.js
// Idempotente: solo crea casos para pets que aún no tienen uno.
import 'dotenv/config';
import pool from '../db.js';
import { createPetCase } from '../services/caseService.js';

const CASEABLE_STATUSES = ['lost', 'transitada', 'found', 'retained', 'accidented', 'needs_attention'];

async function main() {
  const orphans = await pool.query(
    `SELECT p.* FROM pets p
     WHERE p.status = ANY($1)
       AND NOT EXISTS (SELECT 1 FROM pet_cases pc WHERE pc.pet_id = p.id)
     ORDER BY p.created_at ASC`,
    [CASEABLE_STATUSES]
  );
  console.log(`Pets huérfanos sin caso: ${orphans.rows.length}\n`);

  let created = 0, skipped = 0;
  for (let i = 0; i < orphans.rows.length; i++) {
    const pet = orphans.rows[i];
    const createdCase = await createPetCase(pet, { source: 'backfill' });
    if (createdCase) {
      created++;
      console.log(`[${i + 1}/${orphans.rows.length}] caso creado para pet ${pet.id} (${pet.name || pet.species})`);
    } else {
      skipped++;
      console.log(`[${i + 1}/${orphans.rows.length}] SIN caso (skip) pet ${pet.id}`);
    }
  }

  console.log(`\nCasos creados: ${created} | sin caso: ${skipped}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });