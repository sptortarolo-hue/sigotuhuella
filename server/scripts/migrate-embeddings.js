#!/usr/bin/env node
/**
 * Migración: Regenerar embeddings usando face crops
 *
 * 1. Agrega columna embedding_type a las 3 tablas
 * 2. Para cada imagen, detecta y recorta la cara
 * 3. Genera embedding de la cara (o full body si no detecta cara)
 *
 * Uso: DATABASE_URL="..." node server/scripts/migrate-face-embeddings.js
 */
import pool from '../db.js';
import { generateImageEmbedding } from '../services/embeddingService.js';
import { detectAndCropPetFace } from '../services/geminiMatching.js';

const TABLES = ['pets', 'facebook_posts', 'whatsapp_scraped_messages'];

async function addEmbeddingTypeColumns(client) {
  for (const table of TABLES) {
    const colExists = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'embedding_type'`,
      [table]
    );
    if (colExists.rows.length === 0) {
      await client.query(`ALTER TABLE ${table} ADD COLUMN embedding_type VARCHAR(10) DEFAULT 'full'`);
      console.log(`  + Added embedding_type to ${table}`);
    }
  }
}

async function migrateTable(client, table, getImageQuery, idCol = 'id') {
  const result = await client.query(getImageQuery);
  const rows = result.rows;
  console.log(`\n--- ${table}: ${rows.length} registros con imagen ---`);

  let faceCount = 0;
  let fullCount = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const buf = Buffer.from(row.image_data, 'base64');
      const mimeType = row.mime_type || 'image/jpeg';

      let embeddingBuffer = buf;
      let embeddingType = 'full';

      const cropped = await detectAndCropPetFace(buf.toString('base64'), mimeType);
      if (cropped && cropped.cropped) {
        embeddingBuffer = Buffer.from(cropped.cropped, 'base64');
        embeddingType = 'face';
        faceCount++;
      } else {
        fullCount++;
      }

      const emb = await generateImageEmbedding(embeddingBuffer);
      const vecStr = '[' + emb.map(v => String(v)).join(',') + ']';
      await client.query(
        `UPDATE ${table} SET embedding = $1, embedding_type = $2 WHERE ${idCol} = $3`,
        [vecStr, embeddingType, row.id]
      );

      process.stdout.write(`\r  [${table}] ${i + 1}/${rows.length} (${faceCount} face, ${fullCount} full, ${errors} errors)`);
    } catch (err) {
      console.error(`\n  ERROR ${table}/${row.id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n  ${table}: ${faceCount} face, ${fullCount} full, ${errors} errors`);
  return { faceCount, fullCount, errors };
}

async function run() {
  const client = await pool.connect();
  try {
    console.log('=== Migración: Face-first embeddings ===\n');

    console.log('--- Agregando columna embedding_type ---');
    await addEmbeddingTypeColumns(client);

    let totalFace = 0, totalFull = 0, totalErrors = 0;

    const pets = await migrateTable(client, 'pets',
      `SELECT DISTINCT ON (pi.pet_id) pi.pet_id AS id, pi.image_data, pi.mime_type
       FROM pet_images pi
       INNER JOIN pets p ON p.id = pi.pet_id
       ORDER BY pi.pet_id, pi.created_at`
    );
    totalFace += pets.faceCount; totalFull += pets.fullCount; totalErrors += pets.errors;

    const fb = await migrateTable(client, 'facebook_posts',
      `SELECT id, image_data FROM facebook_posts WHERE image_data IS NOT NULL`
    );
    totalFace += fb.faceCount; totalFull += fb.fullCount; totalErrors += fb.errors;

    const wa = await migrateTable(client, 'whatsapp_scraped_messages',
      `SELECT id, image_data FROM whatsapp_scraped_messages WHERE image_data IS NOT NULL`
    );
    totalFace += wa.faceCount; totalFull += wa.fullCount; totalErrors += wa.errors;

    console.log(`\n\n=== Migración completa ===`);
    console.log(`  Face embeddings: ${totalFace}`);
    console.log(`  Full-body embeddings: ${totalFull}`);
    console.log(`  Errores: ${totalErrors}`);
  } finally {
    client.release();
  }
  process.exit();
}

run();
