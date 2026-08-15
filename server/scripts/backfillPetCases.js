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
    const createdCase = await createPetCase(pet, { source: 'backfill', createdAt: pet.created_at });
    if (createdCase) {
      created++;
      console.log(`[${i + 1}/${orphans.rows.length}] caso creado para pet ${pet.id} (${pet.name || pet.species})`);
    } else {
      skipped++;
      console.log(`[${i + 1}/${orphans.rows.length}] SIN caso (skip) pet ${pet.id}`);
    }
  }

  // Corrige casos de backfills previos: alinea created_at de pet_cases y el evento case_created
  // con la fecha real de creación del pet (el backfill anterior usaba NOW()).
  const fix = await pool.query(
    `UPDATE pet_cases pc
     SET created_at = p.created_at, active_until = p.created_at + INTERVAL '45 days', updated_at = pc.updated_at
     FROM pets p
     WHERE pc.pet_id = p.id AND pc.reporter_source = 'backfill' AND pc.created_at <> p.created_at
     RETURNING pc.id`
  );
  console.log(`\nCasos corregidos (fecha del reporte): ${fix.rowCount}`);
  if (fix.rowCount > 0) {
    const eventFix = await pool.query(
      `UPDATE case_events ce
       SET created_at = pc.created_at
       FROM pet_cases pc
       WHERE ce.case_id = pc.id AND ce.event_type = 'case_created' AND ce.created_at <> pc.created_at
         AND pc.reporter_source = 'backfill'`
    );
    console.log(`Eventos case_created realineados: ${eventFix.rowCount}`);
  }

  console.log(`\nCasos creados: ${created} | sin caso: ${skipped}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });