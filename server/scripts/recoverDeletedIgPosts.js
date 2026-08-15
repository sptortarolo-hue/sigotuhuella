// Recovery: reconstruye posts de Instagram que la migración 'deduplicate instagram posts'
// (removida en server/db.js) borró en cada arranque del server entre junio y agosto 2026.
// Base: recordPublicationEvent guardó { permalink, media_id } en case_events (instagram_published).
// Si el media_id ya no existe en instagram_posts, el posteo original fue borrado por esa migración.
// Reconstruye el registro desde la API de Instagram (caption, permalink, timestamp, likes, comentarios reales).
//
// Uso (desde server/):
//   node scripts/recoverDeletedIgPosts.js            # dry-run: lista lo recuperable sin insertar
//   node scripts/recoverDeletedIgPosts.js --apply    # inserta los posts recuperados
import 'dotenv/config';
import axios from 'axios';
import pool from '../db.js';
import { getMedia, getStoredToken } from '../services/instagramService.js';

const CELEBRATION_PHRASES = [
  '¡Qué alegría!', '¡Final feliz!', '¡Buenas noticias!',
  '¡Nuevo hogar!', '¡Feliz adopción!', '¡Un final feliz más!',
];

const APPLY = process.argv.includes('--apply');

async function main() {
  // 1. Todos los eventos instagram_published registrados, con el pet/caso asociado.
  const eventsRes = await pool.query(
    `SELECT ce.id AS event_id, ce.case_id, ce.payload, ce.created_at AS event_created_at,
            pc.pet_id, p.case_number, p.name AS pet_name, p.status AS pet_status
     FROM case_events ce
     JOIN pet_cases pc ON pc.id = ce.case_id
     LEFT JOIN pets p ON p.id = pc.pet_id
     WHERE ce.event_type = 'instagram_published'
       AND ce.payload ? 'media_id'
     ORDER BY ce.created_at ASC`
  );

  // 2. Media ids que aún existen en instagram_posts (posts vivos, incluida la celebración).
  const existingRes = await pool.query(
    `SELECT ig_media_id FROM instagram_posts WHERE ig_media_id IS NOT NULL`
  );
  const existing = new Set(existingRes.rows.map(r => r.ig_media_id));

  const recovered = [];
  const skipped = [];
  const events = eventsRes.rows;

  for (const ev of events) {
    const mediaId = ev.payload.media_id;
    if (!mediaId) continue;
    if (existing.has(mediaId)) continue; // el post sigue vivo (o la celebración ya lo cubre)

    // Ya considerado (mismo media_id duplicado en varios eventos).
    if (recovered.some(r => r.media_id === mediaId)) {
      skipped.push({ media_id: mediaId, reason: 'duplicate event' });
      continue;
    }

    recovered.push({
      media_id: mediaId,
      permalink: ev.payload.permalink || null,
      case_number: ev.case_number,
      pet_id: ev.pet_id,
      pet_name: ev.pet_name,
      pet_status: ev.pet_status,
      event_created_at: ev.event_created_at,
    });
  }

  console.log(`Eventos instagram_published: ${events.length}`);
  console.log(`Posts vivos en instagram_posts: ${existing.size}`);
  console.log(`Posts a recuperar (media_id no existe en DB): ${recovered.length}`);
  if (skipped.length) console.log(`Duplicados por media_id: ${skipped.length}`);

  if (recovered.length === 0) {
    console.log('Nada para recuperar. El fix de db.js ya evita nuevas pérdidas.');
    process.exit(0);
  }

  console.log('\n=== Detalle de posts recuperables ===');
  for (const r of recovered) {
    console.log(`- ${r.permalink || '(sin permalink)'} | caso ${r.case_number || '-'} | pet ${r.pet_id} | ${r.pet_name || '(sin nombre)'} | publicado~${r.event_created_at.toISOString()}`);
  }

  if (!APPLY) {
    console.log('\nDRY-RUN: no se insertó nada. Correr con --apply para insertar.');
    process.exit(0);
  }

  // 3. Reconstrucción: fetch de datos reales a Instagram + insert.
  let inserted = 0, failed = 0;
  for (const r of recovered) {
    try {
      const media = await getMedia(r.media_id);
      const caption = media.caption || null;
      const permalink = media.permalink || r.permalink || null;
      const publishedAt = media.timestamp ? new Date(media.timestamp) : r.event_created_at;
      const likeCount = parseInt(media.like_count, 10) || 0;
      const commentCount = parseInt(media.comments_count, 10) || 0;
      const isCelebration = caption && CELEBRATION_PHRASES.some(p => caption.includes(p));

      // Pide la imagen real del posteo original (misma fuente que el embeds del front).
      const mediaType = media.media_type || 'IMAGE';

      const insertRes = await pool.query(
        `INSERT INTO instagram_posts
           (pet_id, media_type, caption, status, ig_media_id, ig_permalink,
            published_at, created_at, is_celebration, like_count, comment_count)
         VALUES ($1, $2, $3, 'published', $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [r.pet_id, mediaType, caption, r.media_id, permalink, publishedAt, publishedAt, isCelebration, likeCount, commentCount]
      );

      // Comentarios reales del posteo (solo los que IG expone via comments API).
      try {
        const comments = await getComments(r.media_id);
        for (const c of comments) {
          await pool.query(
            `INSERT INTO instagram_comments (ig_comment_id, ig_media_id, ig_post_id, username, text, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (ig_comment_id) DO NOTHING`,
            [c.id, r.media_id, insertRes.rows[0].id, c.username || 'unknown', c.text || '', new Date(c.timestamp).toISOString()]
          ).catch(() => {});
        }
      } catch (_) {}

      inserted++;
      console.log(`✔ ${permalink || r.media_id} | caso ${r.case_number || '-'} | is_celebration=${isCelebration} | ${likeCount} likes / ${commentCount} comentarios`);
    } catch (err) {
      failed++;
      console.error(`✘ ${r.media_id} | caso ${r.case_number || '-'} | error: ${err.message}`);
    }
  }

  console.log(`\nInsertados: ${inserted} | Fallidos: ${failed}`);
  process.exit(0);
}

// Versión liviana de getComments (misma lógica que metaEngagement) para no importar el servicio completo.
async function getComments(mediaId) {
  const token = await getStoredToken();
  const GRAPH = 'https://graph.instagram.com';
  const { data } = await axios.get(`${GRAPH}/${mediaId}/comments`, {
    params: { fields: 'id,text,timestamp,username', access_token: token },
  }).catch(() => ({ data: { data: [] } }));
  return data.data || [];
}

main().catch(err => { console.error(err); process.exit(1); });