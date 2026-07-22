import sharp from 'sharp';
import pool from '../db.js';
import { sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from './pushService.js';

let extractor = null;

async function getExtractor() {
  if (!extractor) {
    const { pipeline, RawImage } = await import('@xenova/transformers');
    extractor = { fn: await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32'), RawImage };
  }
  return extractor;
}

function vecToString(arr) {
  return '[' + arr.map(v => String(v)).join(',') + ']';
}

export async function generateImageEmbedding(imageBuffer) {
  const { fn, RawImage } = await getExtractor();

  // Decode buffer to raw pixels with sharp, then wrap in RawImage
  const { data, info } = await sharp(imageBuffer).rotate().raw().toBuffer({ resolveWithObject: true });
  const image = new RawImage(new Uint8ClampedArray(data), info.width, info.height, info.channels);

  const result = await fn(image);
  return Array.from(result.data);
}

async function saveEmbedding(table, id, embedding) {
  await pool.query(
    `UPDATE ${table} SET embedding = $1 WHERE id = $2`,
    [vecToString(embedding), id]
  );
}

const STATUS_OPPOSITE = {
  lost: ['found', 'sighted'],
  found: ['lost', 'sighted'],
  sighted: ['lost', 'found'],
};

function targetConfig(sourceTable) {
  if (sourceTable === 'pets') {
    return [
      { table: 'facebook_posts', statusCol: 'classification', targetType: 'fb_post' },
      { table: 'whatsapp_scraped_messages', statusCol: 'classification', targetType: 'wa_group' },
    ];
  }
  return [
    { table: 'pets', statusCol: 'status', targetType: 'app_pet' },
  ];
}

async function searchTable(targetCfg, srcLat, srcLng, embedding, sourceStatus, opts = {}) {
  const { radiusKm = 20, maxCandidates = 10 } = opts;
  const oppositeStatuses = STATUS_OPPOSITE[sourceStatus] || ['lost', 'found', 'sighted'];
  const { table, statusCol } = targetCfg;
  const vecStr = vecToString(embedding);

  const hasSrcCoords = srcLat != null && srcLng != null;

  const query = `
    SELECT
      t.id, t.name, t.species, t.color, t.description,
      t.location, t.latitude, t.longitude,
      CASE WHEN t.status IS NOT NULL THEN t.status ELSE t.classification END AS status,
      1 - (t.embedding <=> $1::vector) AS visual_sim,
      ${hasSrcCoords ? `
      CASE
        WHEN t.latitude IS NOT NULL AND t.longitude IS NOT NULL
        THEN (6371 * acos(cos(radians(${srcLat})) * cos(radians(t.latitude))
              * cos(radians(t.longitude) - radians(${srcLng}))
              + sin(radians(${srcLat})) * sin(radians(t.latitude))))
        ELSE NULL
      END` : 'NULL'} AS distance_km
    FROM ${table} t
    WHERE t.embedding IS NOT NULL
      AND t.${statusCol} = ANY($2::text[])
    ORDER BY t.embedding <=> $1::vector
    LIMIT $3
  `;

  const result = await pool.query(query, [vecStr, oppositeStatuses, maxCandidates]);
  return result.rows;
}

export async function embedAndMatch(table, id, { species, status, imageBuffer }) {
  if (!imageBuffer) return [];

  const embedding = await generateImageEmbedding(imageBuffer);
  await saveEmbedding(table, id, embedding);

  const srcRes = await pool.query(
    `SELECT latitude, longitude FROM ${table} WHERE id = $1`,
    [id]
  );
  const srcLat = srcRes.rows[0]?.latitude;
  const srcLng = srcRes.rows[0]?.longitude;

  const targets = targetConfig(table);

  const minScore = parseInt((await pool.query(
    "SELECT value FROM settings WHERE key = 'matching_min_score'"
  )).rows[0]?.value || '70');

  const allCandidates = [];
  for (const tgt of targets) {
    const rows = await searchTable(tgt, srcLat, srcLng, embedding, status);
    for (const r of rows) {
      const visual = r.visual_sim || 0;
      const dist = r.distance_km !== null ? Math.max(0, 1 - r.distance_km / 20) : 0.5;
      const score = Math.round((visual * 0.6 + dist * 0.25 + 0.5 * 0.15) * 100);
      if (score >= minScore) {
        allCandidates.push({ ...r, visual, distance_km: r.distance_km, score, targetType: tgt.targetType });
      }
    }
  }

  allCandidates.sort((a, b) => b.score - a.score);
  const best = allCandidates.slice(0, 10);

  const sourceTypeMap = {
    pets: 'app_pet',
    facebook_posts: 'fb_post',
    whatsapp_scraped_messages: 'wa_group',
  };
  const sourceType = sourceTypeMap[table] || 'app_pet';
  const label = sourceType === 'fb_post' ? 'post' : sourceType === 'wa_group' ? 'mensaje WA' : 'mascota';

  const matches = [];
  for (const c of best) {
    const reasons = [`Similitud visual: ${Math.round(c.visual * 100)}%`];
    if (c.distance_km !== null) reasons.push(`Distancia: ${Math.round(c.distance_km)}km`);

    const res = await pool.query(
      `INSERT INTO facebook_matches (source_type, source_id, target_type, target_id, score, reasons, method)
       VALUES ($1, $2, $3, $4, $5, $6, 'ai')
       ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING
       RETURNING id`,
      [sourceType, id, c.targetType, c.id, c.score, reasons]
    );
    if (res.rows.length > 0) matches.push(c);
  }

  if (matches.length > 0) {
    const names = matches.map(m => m.name || `#${m.id.slice(0, 8)}`).join(', ');
    await sendAdminNotificationEmail(
      `🔗 Match detectado: ${label} coincide con ${matches.length} mascota(s)`,
      `Se detectó un match automático entre un ${label} y:\n\n${matches.map(m => `- ${m.name || 'Sin nombre'} (${m.species}) — ${m.score}%`).join('\n')}`
    );
    sendPushToAdmins({ title: `🔗 Match: ${matches.length} coincidencia(s)`, body: `${label} vinculado a ${names}` });
  }

  return matches;
}
