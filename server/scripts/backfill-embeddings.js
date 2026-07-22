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
import { generateImageEmbedding, generateTextEmbedding, classifyPetAttributes } from '../services/embeddingService.js';

function vecToString(arr) {
  return '[' + arr.map(v => String(v)).join(',') + ']';
}

async function backfillTable(table, idColumn, imageQuery, textColumn) {
  const rows = await pool.query(
    `SELECT ${idColumn} AS id${textColumn ? `, ${textColumn} AS text_content` : ''} FROM ${table} WHERE embedding IS NULL ORDER BY created_at`
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
      console.log(`  ✓ ${row.id.slice(0, 8)}... embedding OK`);
    } catch (err) {
      console.error(`  ✗ ${row.id.slice(0, 8)}...: ${err.message}`);
    }
  }

  // Text embeddings
  if (textColumn) {
    const textRows = await pool.query(
      `SELECT ${idColumn} AS id, ${textColumn} AS text_content FROM ${table}
       WHERE text_embedding IS NULL AND ${textColumn} IS NOT NULL AND ${textColumn} != ''
       ORDER BY created_at`
    );
    console.log(`[backfill] ${table}: ${textRows.rows.length} sin text_embedding`);
    for (const row of textRows.rows) {
      try {
        const textEmb = await generateTextEmbedding(row.text_content);
        if (textEmb) {
          await pool.query(
            `UPDATE ${table} SET text_embedding = $1 WHERE ${idColumn} = $2`,
            [vecToString(textEmb), row.id]
          );
          console.log(`  ✓ ${row.id.slice(0, 8)}... text_emb OK`);
        }
      } catch (err) {
        console.error(`  ✗ ${row.id.slice(0, 8)}... text_emb: ${err.message}`);
      }
    }
  }

  // Zero-shot classification for image rows
  const classRows = await pool.query(
    `SELECT ${idColumn} AS id FROM ${table} WHERE embedding IS NOT NULL ORDER BY created_at`
  );
  if (classRows.rows.length > 0) {
    console.log(`[backfill] ${table}: clasificando ${classRows.rows.length} imagenes...`);
    let done = 0;
    for (const row of classRows.rows) {
      try {
        const imgRes = await pool.query(imageQuery, [row.id]);
        if (imgRes.rows.length === 0 || !imgRes.rows[0].image_data) continue;
        const imageBuffer = Buffer.from(imgRes.rows[0].image_data, 'base64');
        const attrs = await classifyPetAttributes(imageBuffer);
        if (attrs) {
          console.log(`  ${row.id.slice(0, 8)}... ${attrs.species} (${(attrs.speciesScore * 100).toFixed(0)}%), ${attrs.breed}, ${attrs.color}`);
        }
        done++;
        if (done % 10 === 0) console.log(`  ... ${done}/${classRows.rows.length} clasificados`);
      } catch (err) {
        // ignore per-item errors
      }
    }
  }
}

async function main() {
  console.log('=== Backfill de embeddings + texto + clasificacion ===\n');

  // 1. Pets
  await backfillTable('pets', 'id',
    `SELECT image_data FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1`,
    'description'
  );

  // 2. Facebook posts
  await backfillTable('facebook_posts', 'id',
    `SELECT image_data FROM facebook_posts WHERE id = $1 AND image_data IS NOT NULL`,
    'content'
  );

  // 3. WhatsApp scraped messages
  await backfillTable('whatsapp_scraped_messages', 'id',
    `SELECT image_data FROM whatsapp_scraped_messages WHERE id = $1 AND image_data IS NOT NULL`,
    'content'
  );

  console.log('\n=== Backfill completo ===');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
