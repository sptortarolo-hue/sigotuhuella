#!/usr/bin/env node
/**
 * Migración: clip-vit-base-patch32 (512-dim) → clip-vit-large-patch14 (768-dim)
 *
 * Uso: DATABASE_URL="..." node server/scripts/migrate-embeddings.js
 *
 * Pasos:
 * 1. Dropea índices IVFFlat viejos
 * 2. Dropea y recrea columnas embedding con vector(768)
 * 3. Recrea índices
 * 4. Re-genera embeddings con el modelo nuevo
 */
import pool from '../db.js';
import { generateImageEmbedding } from '../services/embeddingService.js';

const TABLES = [
  { name: 'pets', imageQuery: true },
  { name: 'facebook_posts', imageQuery: false },
  { name: 'whatsapp_scraped_messages', imageQuery: false },
];

async function run() {
  const client = await pool.connect();
  try {
    console.log('=== Migrando embeddings a clip-vit-large-patch14 (768-dim) ===\n');

    for (const t of TABLES) {
      console.log(`--- ${t.name} ---`);

      await client.query(`DROP INDEX IF EXISTS idx_${t.name === 'pets' ? 'pets' : t.name === 'facebook_posts' ? 'fb_posts' : 'wa_scraped'}_embedding`);
      console.log(`  Índice viejo dropeado`);

      await client.query(`ALTER TABLE ${t.name} DROP COLUMN IF EXISTS embedding`);
      await client.query(`ALTER TABLE ${t.name} ADD COLUMN embedding vector(768)`);
      console.log(`  Columna recreada como vector(768)`);

      const lists = Math.min(100, Math.floor((await client.query(`SELECT COUNT(*) FROM ${t.name} WHERE image_data IS NOT NULL`)).rows[0].count / 10) || 10);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_${t.name === 'pets' ? 'pets' : t.name === 'facebook_posts' ? 'fb_posts' : 'wa_scraped'}_embedding ON ${t.name} USING ivfflat (embedding vector_cosine_ops) WITH (lists = ${lists})`);
      console.log(`  Índice recreado`);
    }

    console.log('\n--- Regenerando embeddings ---\n');

    let total = 0;
    let errors = 0;

    for (const t of TABLES) {
      const res = await client.query(`SELECT id, image_data FROM ${t.name} WHERE image_data IS NOT NULL`);
      console.log(`${t.name}: ${res.rows.length} registros`);
      for (const row of res.rows) {
        try {
          const buf = Buffer.from(row.image_data, 'base64');
          const emb = await generateImageEmbedding(buf);
          const vecStr = '[' + emb.map(v => String(v)).join(',') + ']';
          await client.query(`UPDATE ${t.name} SET embedding = $1 WHERE id = $2`, [vecStr, row.id]);
          total++;
          process.stdout.write(`\r  ${t.name}: ${total}/${res.rows.length}`);
        } catch (err) {
          console.error(`\n  ERROR ${t.name}/${row.id}: ${err.message}`);
          errors++;
        }
      }
      console.log('');
    }

    console.log(`\n=== Migración completa ===`);
    console.log(`  Actualizados: ${total}`);
    console.log(`  Errores: ${errors}`);
  } finally {
    client.release();
  }
  process.exit();
}

run();
