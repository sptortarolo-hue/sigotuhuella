// Backfill de eventos de trazabilidad (FB/WA) + permalinks de IG para casos existentes.
// Corre desde server/: node scripts/backfillCaseEvents.js
// Idempotente: solo inserta eventos que faltan y corrige permalinks con patrón roto.
import 'dotenv/config';
import pool from '../db.js';
import { getMedia } from '../services/instagramService.js';

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 150;

// Patrón de permalink roto generado por el fallback viejo: /p/<id numérico>/.
function isBrokenPermalink(permalink) {
  if (!permalink) return true;
  return /\/p\/\d+\/$/.test(permalink);
}

async function ensureCase(caseId, eventType, payload, createdBefore) {
  const exists = await pool.query(
    `SELECT 1 FROM case_events
     WHERE case_id = $1 AND event_type = $2
     LIMIT 1`,
    [caseId, eventType]
  );
  if (exists.rows.length > 0) return false;
  await pool.query(
    `INSERT INTO case_events (case_id, event_type, payload, created_at)
     VALUES ($1, $2, $3, $4)`,
    [caseId, eventType, JSON.stringify(payload), createdBefore || new Date()]
  );
  return true;
}

async function backfillFacebook(caseId, petId) {
  const rows = await pool.query(
    `SELECT id, page_post_id, group_post_ids, status, published_at
     FROM facebook_page_posts
     WHERE pet_id = $1 AND status = 'published' AND page_post_id IS NOT NULL
     ORDER BY published_at ASC`,
    [petId]
  );
  let inserted = 0;
  for (const row of rows.rows) {
    const pagePostUrl = row.page_post_id
      ? `https://www.facebook.com/${row.page_post_id}`
      : null;
    const ok = await ensureCase(caseId, 'facebook_published', {
      page_post_id: row.page_post_id,
      page_post_url: pagePostUrl,
      group_post_ids: row.group_post_ids || [],
    }, row.published_at);
    if (ok) {
      inserted++;
      console.log(`  FB: evento facebook_published para post ${row.page_post_id}`);
    }
  }
  return inserted;
}

async function backfillWhatsApp(caseId, petId, petName) {
  const petLink = `/pet/${petId}`;
  const rows = await pool.query(
    `SELECT rm.id, rm.wa_to, rm.text, rm.created_at,
            wg.name AS group_name
     FROM relay_messages rm
     LEFT JOIN whatsapp_groups wg ON wg.group_id = rm.wa_to
     WHERE rm.text LIKE '%' || $1 || '%'
       AND rm.status = 'sent'
     ORDER BY rm.created_at ASC`,
    [petLink]
  );
  let inserted = 0;
  for (const row of rows.rows) {
    const ok = await ensureCase(caseId, 'whatsapp_group_sent', {
      group_id: row.wa_to,
      group_name: row.group_name || row.wa_to,
      relay_message_id: row.id,
      reached: true,
    }, row.created_at);
    if (ok) {
      inserted++;
      console.log(`  WA: evento whatsapp_group_sent para grupo ${row.group_name || row.wa_to}`);
    }
  }
  if (rows.rows.length === 0) {
    // Fallback: sin historial en relay_messages no podemos reconstruir el nombre del grupo.
    console.log(`  WA: sin broadcast en relay_messages para ${petName || petId}`);
  }
  return inserted;
}

async function fixInstagramPermalinks(caseId, petId) {
  const rows = await pool.query(
    `SELECT id, ig_media_id, ig_permalink FROM instagram_posts
     WHERE pet_id = $1 AND status = 'published' AND ig_media_id IS NOT NULL`,
    [petId]
  );
  let fixed = 0, leftNull = 0;
  for (const row of rows.rows) {
    if (!isBrokenPermalink(row.ig_permalink)) continue;
    let permalink = null;
    try {
      const media = await getMedia(row.ig_media_id);
      if (media?.permalink) permalink = media.permalink;
    } catch (err) {
      console.error(`  IG: getMedia ${row.ig_media_id} error: ${err.message}`);
    }
    if (permalink) {
      await pool.query(`UPDATE instagram_posts SET ig_permalink = $1 WHERE id = $2`, [permalink, row.id]);
      // Corrige también el payload del evento instagram_published del caso
      await pool.query(
        `UPDATE case_events SET payload = payload || jsonb_build_object('permalink', $1)
         WHERE case_id = $2 AND event_type = 'instagram_published'`,
        [permalink, caseId]
      );
      fixed++;
      console.log(`  IG: permalink corregido → ${permalink}`);
    } else {
      await pool.query(`UPDATE instagram_posts SET ig_permalink = NULL WHERE id = $1`, [row.id]);
      leftNull++;
      console.log(`  IG: media ${row.ig_media_id} sin permalink, dejado null`);
    }
  }
  return { fixed, leftNull };
}

async function main() {
  const cases = await pool.query(
    `SELECT pc.id AS case_id, pc.pet_id, p.name AS pet_name
     FROM pet_cases pc
     LEFT JOIN pets p ON p.id = pc.pet_id
     ORDER BY pc.created_at ASC`
  );
  console.log(`Casos a procesar: ${cases.rows.length}\n`);

  let fbEvents = 0, waEvents = 0, igFixed = 0, igNull = 0;
  for (let i = 0; i < cases.rows.length; i += BATCH_SIZE) {
    const batch = cases.rows.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (c, j) => {
      const idx = i + j + 1;
      console.log(`[${idx}/${cases.rows.length}] ${c.pet_name || c.pet_id}`);
      const fb = await backfillFacebook(c.case_id, c.pet_id);
      const wa = await backfillWhatsApp(c.case_id, c.pet_id, c.pet_name);
      const ig = await fixInstagramPermalinks(c.case_id, c.pet_id);
      return { fb, wa, ...ig };
    }));
    for (const r of results) {
      fbEvents += r.fb;
      waEvents += r.wa;
      igFixed += r.fixed;
      igNull += r.leftNull;
    }
    if (i + BATCH_SIZE < cases.rows.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`\nEventos FB insertados: ${fbEvents}`);
  console.log(`Eventos WA insertados: ${waEvents}`);
  console.log(`Permalinks IG corregidos: ${igFixed} | sin permalink (null): ${igNull}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
