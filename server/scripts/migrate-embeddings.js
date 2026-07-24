#!/usr/bin/env node
/**
 * Migración: clip-vit-base-patch32 (512-dim) → clip-vit-large-patch14 (768-dim)
 *
 * Uso: DATABASE_URL="..." node server/scripts/migrate-embeddings.js
 */
import pool from '../db.js';
import { generateImageEmbedding } from '../services/embeddingService.js';

const INDEX_NAMES = { pets: 'pets', facebook_posts: 'fb_posts', whatsapp_scraped_messages: 'wa_scraped' };

async function run() {
  const client = await pool.connect();
  try {
    console.log('=== Migrando embeddings a clip-vit-large-patch14 (768-dim) ===\n');

    for (const table of ['pets', 'facebook_posts', 'whatsapp_scraped_messages']) {
      console.log(`--- ${table} ---`);
      await client.query(`DROP INDEX IF EXISTS idx_${INDEX_NAMES[table]}_embedding`);
      await client.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS embedding`);
      await client.query(`ALTER TABLE ${table} ADD COLUMN embedding vector(768)`);
      console.log(`  Columna recreada como vector(768)`);
    }

    for (const table of ['pets', 'facebook_posts', 'whatsapp_scraped_messages']) {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_${INDEX_NAMES[table]}_embedding ON ${table} USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20)`);
    }
    console.log(`  Índices recreados\n`);

    console.log('--- Regenerando embeddings ---\n');
    let total = 0;
    let errors = 0;

    const petImages = await client.query(`
      SELECT DISTINCT ON (pi.pet_id) pi.pet_id AS id, pi.image_data
      FROM pet_images pi
      INNER JOIN pets p ON p.id = pi.pet_id
      ORDER BY pi.pet_id, pi.created_at
    `);
    console.log(`pets: ${petImages.rows.length} imágenes`);
    for (const row of petImages.rows) {
      try {
        const buf = Buffer.from(row.image_data, 'base64');
        const emb = await generateImageEmbedding(buf);
        const vecStr = '[' + emb.map(v => String(v)).join(',') + ']';
        await client.query(`UPDATE pets SET embedding = $1 WHERE id = $2`, [vecStr, row.id]);
        total++;
        process.stdout.write(`\r  pets: ${total}/${petImages.rows.length}`);
      } catch (err) {
        console.error(`\n  ERROR pets/${row.id}: ${err.message}`);
        errors++;
      }
    }
    console.log('\n');

    const fbPosts = await client.query(`SELECT id, image_data FROM facebook_posts WHERE image_data IS NOT NULL`);
    let fbTotal = 0;
    console.log(`facebook_posts: ${fbPosts.rows.length} registros`);
    for (const row of fbPosts.rows) {
      try {
        const buf = Buffer.from(row.image_data, 'base64');
        const emb = await generateImageEmbedding(buf);
        const vecStr = '[' + emb.map(v => String(v)).join(',') + ']';
        await client.query(`UPDATE facebook_posts SET embedding = $1 WHERE id = $2`, [vecStr, row.id]);
        fbTotal++;
        process.stdout.write(`\r  facebook_posts: ${fbTotal}/${fbPosts.rows.length}`);
      } catch (err) {
        console.error(`\n  ERROR facebook_posts/${row.id}: ${err.message}`);
        errors++;
      }
    }
    console.log('\n');

    const waMessages = await client.query(`SELECT id, image_data FROM whatsapp_scraped_messages WHERE image_data IS NOT NULL`);
    let waTotal = 0;
    console.log(`whatsapp_scraped_messages: ${waMessages.rows.length} registros`);
    for (const row of waMessages.rows) {
      try {
        const buf = Buffer.from(row.image_data, 'base64');
        const emb = await generateImageEmbedding(buf);
        const vecStr = '[' + emb.map(v => String(v)).join(',') + ']';
        await client.query(`UPDATE whatsapp_scraped_messages SET embedding = $1 WHERE id = $2`, [vecStr, row.id]);
        waTotal++;
        process.stdout.write(`\r  whatsapp_scraped_messages: ${waTotal}/${waMessages.rows.length}`);
      } catch (err) {
        console.error(`\n  ERROR whatsapp/${row.id}: ${err.message}`);
        errors++;
      }
    }
    console.log('\n');

    console.log(`=== Migración completa ===`);
    console.log(`  Actualizados: ${total + fbTotal + waTotal}`);
    console.log(`  Errores: ${errors}`);
  } finally {
    client.release();
  }
  process.exit();
}

run();
