import 'dotenv/config';
import pool from '../db.js';
import { detectAnimal } from '../services/animalDetector.js';

const BATCH_SIZE = 5;

async function processRows(label, rows, updateSql, paramsFn) {
  let processed = 0, detected = 0, failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        let imageData = row.image_data;
        let mime = row.image_mime || 'image/jpeg';
        if (!imageData && row.message_id) {
          const img = await pool.query(
            `SELECT image_data, image_mime FROM whatsapp_message_images WHERE message_id = $1 ORDER BY position ASC LIMIT 1`,
            [row.message_id]
          );
          if (img.rows.length === 0) return { id: row.id, ok: false, reason: 'sin_imagen' };
          imageData = img.rows[0].image_data;
          mime = img.rows[0].image_mime || 'image/jpeg';
        }
        if (!imageData) return { id: row.id, ok: false, reason: 'sin_imagen' };

        const result = await detectAnimal(imageData, mime);
        await pool.query(updateSql, paramsFn(row, result));
        return { id: row.id, ok: true, detected: result.detected, species: result.species, confidence: result.confidence };
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        processed++;
        if (r.value.ok && r.value.detected) detected++;
        else if (r.value.reason === 'sin_imagen') failed++;
      } else {
        failed++;
      }
    }
  }
  console.log(`${label}: ${processed} procesados, ${detected} con mascota, ${failed} fallos/sin imagen`);
  return { processed, detected, failed };
}

async function main() {
  console.log('=== Re-detección de animales en posts existentes ===\n');

  // Facebook posts — re-process all with images (previous detections may be wrong)
  const fbRows = (await pool.query(
    `SELECT id, image_data FROM facebook_posts
     WHERE image_data IS NOT NULL`
  )).rows;
  console.log(`Facebook: ${fbRows.length} posts para re-procesar\n`);

  const fbUpdate = `UPDATE facebook_posts SET animal_detected = $1, animal_species = $2, animal_confidence = $3 WHERE id = $4`;
  const fbParams = (row, result) => [result.detected, result.species, result.confidence || 0, row.id];
  await processRows('Facebook', fbRows, fbUpdate, fbParams);

  // WhatsApp messages with image_data directly in the row
  const waRows = (await pool.query(
    `SELECT id, image_data, image_mime FROM whatsapp_scraped_messages
     WHERE image_data IS NOT NULL`
  )).rows;
  console.log(`\nWhatsApp (image_data directo): ${waRows.length} mensajes\n`);

  const waUpdate = `UPDATE whatsapp_scraped_messages SET animal_detected = $1, animal_species = $2, animal_confidence = $3 WHERE id = $4`;
  const waParams = (row, result) => [result.detected, result.species, result.confidence || 0, row.id];
  const r1 = await processRows('WhatsApp (directo)', waRows, waUpdate, waParams);

  // WhatsApp messages with images in whatsapp_message_images table
  const waImgRows = (await pool.query(
    `SELECT wsm.id, wmi.message_id
     FROM whatsapp_scraped_messages wsm
     JOIN whatsapp_message_images wmi ON wmi.message_id = wsm.id
     WHERE wsm.image_data IS NULL
     GROUP BY wsm.id`
  )).rows;
  console.log(`\nWhatsApp (tabla imágenes): ${waImgRows.length} mensajes\n`);

  const r2 = await processRows('WhatsApp (tabla)', waImgRows, waUpdate, waParams);

  console.log(`\n=== Resumen final ===`);
  console.log(`Facebook: ${fbRows.length} procesados`);
  console.log(`WA directo: ${r1.processed} procesados, ${r1.detected} con mascota`);
  console.log(`WA tablas: ${r2.processed} procesados, ${r2.detected} con mascota`);
  console.log('\nHecho.');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });