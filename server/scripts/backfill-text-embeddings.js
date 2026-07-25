#!/usr/bin/env node
/**
 * Backfill: generar text_embeddings para registros existentes
 *
 * Uso: DATABASE_URL="..." node server/scripts/backfill-text-embeddings.js
 */
import pool from '../db.js';
import { generateTextEmbedding } from '../services/embeddingService.js';

const TABLES = [
  { table: 'pets', textCol: 'description', idCol: 'id',
    enrichCols: ['name', 'breed', 'color', 'species', 'gender'] },
  { table: 'facebook_posts', textCol: 'content', idCol: 'id',
    enrichCols: ['pet_name', 'breed', 'color', 'species', 'gender'] },
  { table: 'whatsapp_scraped_messages', textCol: 'content', idCol: 'id',
    enrichCols: ['pet_name', 'breed', 'color', 'species', 'gender'] },
];

function vecToString(arr) {
  return '[' + arr.map(v => String(v)).join(',') + ']';
}

async function run() {
  const client = await pool.connect();
  let total = 0, skipped = 0, errors = 0;

  try {
    console.log('=== Backfill text embeddings (all-MiniLM-L6-v2, 384-dim) ===\n');

    for (const { table, textCol, idCol, enrichCols } of TABLES) {
      const allCols = [idCol, textCol, ...enrichCols].join(', ');
      const result = await client.query(
        `SELECT ${allCols} FROM ${table} WHERE ${textCol} IS NOT NULL AND length(${textCol}) > 3`
      );
      console.log(`--- ${table}: ${result.rows.length} registros con texto ---`);

      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows[i];
        try {
          const enrichedText = [row.pet_name || row.name, row.breed, row.color, row.species, row.gender, row[textCol]]
            .filter(Boolean).join('. ');
          const emb = await generateTextEmbedding(enrichedText);
          if (!emb) { skipped++; continue; }
          await client.query(
            `UPDATE ${table} SET text_embedding = $1 WHERE ${idCol} = $2`,
            [vecToString(emb), row.id]
          );
          total++;
          process.stdout.write(`\r  [${table}] ${i + 1}/${result.rows.length} (${total} done, ${skipped} skipped, ${errors} errors)`);
        } catch (err) {
          console.error(`\n  ERROR ${table}/${row.id}: ${err.message}`);
          errors++;
        }
      }
      console.log('\n');
    }

    console.log(`=== Backfill completo ===`);
    console.log(`  Embeddings generados: ${total}`);
    console.log(`  Saltados (texto muy corto): ${skipped}`);
    console.log(`  Errores: ${errors}`);
  } finally {
    client.release();
  }
  process.exit();
}

run();
