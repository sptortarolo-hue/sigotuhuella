import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

import pool from '../db.js';
import { generateImageEmbedding } from '../services/embeddingService.js';

function vecToString(arr) {
  return '[' + arr.map(v => String(v)).join(',') + ']';
}

async function backfillTable(table, idColumn, imageQuery) {
  const rows = await pool.query(
    `SELECT ${idColumn} AS id FROM ${table} WHERE embedding IS NULL ORDER BY created_at`
  );
  console.log(`[backfill] ${table}: ${rows.rows.length} sin embedding`);

  for (const row of rows.rows) {
    try {
      const imgRes = await pool.query(imageQuery, [row.id]);
      if (imgRes.rows.length === 0 || !imgRes.rows[0].image_data) continue;

      const imageBuffer = Buffer.from(imgRes.rows[0].image_data, 'base64');
      const embedding = await generateImageEmbedding(imageBuffer);
      await pool.query(
        `UPDATE ${table} SET embedding = $1 WHERE ${idColumn} = $2`,
        [vecToString(embedding), row.id]
      );
      console.log(`  ✓ ${row.id.slice(0, 8)}...`);
    } catch (err) {
      console.error(`  ✗ ${row.id.slice(0, 8)}...: ${err.message}`);
    }
  }
}

async function main() {
  console.log('=== Backfill de embeddings ===\n');

  // 1. Pets (image from pet_images)
  await backfillTable('pets', 'id',
    `SELECT image_data FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1`
  );

  // 2. Facebook posts (image from image_data column)
  await backfillTable('facebook_posts', 'id',
    `SELECT image_data FROM facebook_posts WHERE id = $1 AND image_data IS NOT NULL`
  );

  // 3. WhatsApp scraped messages (image from image_data column)
  await backfillTable('whatsapp_scraped_messages', 'id',
    `SELECT image_data FROM whatsapp_scraped_messages WHERE id = $1 AND image_data IS NOT NULL`
  );

  console.log('\n=== Backfill completo ===');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
