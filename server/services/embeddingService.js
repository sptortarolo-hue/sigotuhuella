import sharp from 'sharp';
import jpeg from 'jpeg-js';
import pool from '../db.js';
import { sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from './pushService.js';

let clipModel = null;
let clipRawImage = null;

async function getClipModel() {
  if (!clipModel) {
    const { pipeline, RawImage } = await import('@xenova/transformers');
    clipModel = { fn: await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32'), RawImage };
    clipRawImage = RawImage;
  }
  return { ...clipModel, RawImage: clipRawImage };
}

function vecToString(arr) {
  return '[' + arr.map(v => String(v)).join(',') + ']';
}

function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? vec : vec.map(v => v / norm);
}

async function imageToRawImage(imageBuffer) {
  const jpegBuf = await sharp(imageBuffer).resize(224, 224, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
  const decoded = jpeg.decode(jpegBuf, { formatAsRGBA: false, useTArray: true });
  const { RawImage } = await getClipModel();
  const image = new RawImage(new Uint8ClampedArray(decoded.data), decoded.width, decoded.height, 3);
  image.resize = async () => image;
  image.center_crop = async () => image;
  return image;
}

export async function generateImageEmbedding(imageBuffer) {
  const { fn } = await getClipModel();
  const image = await imageToRawImage(imageBuffer);
  const result = await fn(image);
  return normalize(Array.from(result.data));
}

let zeroShotPipeline = null;
async function getZeroShotPipeline() {
  if (!zeroShotPipeline) {
    const { pipeline } = await import('@xenova/transformers');
    zeroShotPipeline = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
  }
  return zeroShotPipeline;
}

const BREED_CANDIDATES = {
  dog: ['labrador', 'golden retriever', 'pastor aleman', 'bulldog', 'poodle', 'beagle', 'rottweiler', 'yorkshire', 'dachshund', 'husky', 'doberman', 'shih tzu', 'criollo', 'otro'],
  cat: ['siames', 'persa', 'maine coon', 'bengala', 'british shorthair', 'fold escoces', 'siberiano', 'criollo', 'otro'],
};
const COLOR_CANDIDATES = ['negro', 'blanco', 'marron', 'gris', 'dorado', 'rojo', 'crema', 'atigrado', 'bicolor', 'tricolor', 'manchado', 'otro'];
const SPECIES_CANDIDATES = ['dog', 'cat', 'none'];

export async function classifyPetAttributes(imageBuffer) {
  try {
    const fn = await getZeroShotPipeline();
    const image = await imageToRawImage(imageBuffer);

    const speciesRes = await fn(image, SPECIES_CANDIDATES);
    const best = speciesRes[0];
    if (!best || best.label === 'none' || best.score < 0.55) {
      return { detected: false, species: null, speciesScore: best?.score || 0, breed: null, breedScore: null, color: null, colorScore: null };
    }

    const breedList = BREED_CANDIDATES[best.label] || BREED_CANDIDATES.dog;
    const breedRes = await fn(image, breedList);
    const colorRes = await fn(image, COLOR_CANDIDATES);

    return {
      detected: true,
      species: best.label,
      speciesScore: best.score,
      breed: breedRes[0].label,
      breedScore: breedRes[0].score,
      color: colorRes[0].label,
      colorScore: colorRes[0].score,
    };
  } catch (err) {
    console.error('classifyPetAttributes error:', err);
    return null;
  }
}

async function saveAnimalDetection(table, id, attrs) {
  if (!attrs) return;
  await pool.query(
    `UPDATE ${table} SET animal_detected = $1, animal_species = $2, animal_confidence = $3 WHERE id = $4`,
    [attrs.detected, attrs.species, attrs.speciesScore, id]
  );
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
  const { maxCandidates = 20 } = opts;
  const oppositeStatuses = STATUS_OPPOSITE[sourceStatus] || ['lost', 'found', 'sighted'];
  const { table } = targetCfg;
  const vecStr = vecToString(embedding);
  const hasSrcCoords = srcLat != null && srcLng != null;

  const selectCols = `t.id, t.name, t.species, t.breed, t.color, t.description,
    t.location, t.latitude, t.longitude, t.created_at`;

  const distExpr = hasSrcCoords ? `
    CASE
      WHEN t.latitude IS NOT NULL AND t.longitude IS NOT NULL
      THEN (6371 * acos(cos(radians(${srcLat})) * cos(radians(t.latitude))
            * cos(radians(t.longitude) - radians(${srcLng}))
            + sin(radians(${srcLat})) * sin(radians(t.latitude))))
      ELSE NULL
    END` : 'NULL';

  const params = [vecStr, oppositeStatuses, maxCandidates];

  const query = `
    SELECT ${selectCols},
      1 - (t.embedding <=> $1::vector) AS visual_sim,
      ${distExpr} AS distance_km
    FROM ${table} t
    WHERE t.embedding IS NOT NULL
      AND 1 - (t.embedding <=> $1::vector) > 0.55
      AND t.${targetCfg.statusCol} = ANY($2::text[])
    ORDER BY t.embedding <=> $1::vector
    LIMIT $3
  `;

  const result = await pool.query(query, params);
  return result.rows;
}



export async function embedAndMatch(table, id, { species, status, imageBuffer, croppedFaceBuffer }) {
  if (!imageBuffer) return [];

  const embedding = await generateImageEmbedding(imageBuffer);
  await saveEmbedding(table, id, embedding);

  const faceBuffer = croppedFaceBuffer || imageBuffer;

  let srcAttrs = null;
  try {
    srcAttrs = await classifyPetAttributes(faceBuffer);
    if (srcAttrs) {
      console.log(`[embedAndMatch] CLIP: ${srcAttrs.detected ? (srcAttrs.species + ' ' + (srcAttrs.speciesScore * 100).toFixed(0) + '%') : 'no animal'}`);
      await saveAnimalDetection(table, id, srcAttrs);
    }
  } catch (err) {
    console.warn('[embedAndMatch] classifyPetAttributes error:', err.message);
  }

  const srcRes = await pool.query(
    `SELECT latitude, longitude FROM ${table} WHERE id = $1`,
    [id]
  );
  const srcLat = srcRes.rows[0]?.latitude;
  const srcLng = srcRes.rows[0]?.longitude;

  const targets = targetConfig(table);

  const settingsRes = await pool.query(
    "SELECT key, value FROM settings WHERE key = ANY($1::text[])",
    [['matching_min_score', 'matching_radius_km', 'matching_max_candidates']]
  );
  const s = {};
  for (const row of settingsRes.rows) s[row.key] = row.value;

  const minScore = parseInt(s.matching_min_score || '70');
  const radiusKm = parseFloat(s.matching_radius_km || '20');
  const maxCandidates = parseInt(s.matching_max_candidates || '20');

  const allCandidates = [];
  for (const tgt of targets) {
    const rows = await searchTable(tgt, srcLat, srcLng, embedding, status, { maxCandidates });
    console.log(`[embedAndMatch DEBUG] target=${tgt.table} rows=${rows.length} minScore=${minScore} radiusKm=${radiusKm} srcAttrs?.species=${srcAttrs?.species}`);
    for (const r of rows) {
      const visual = r.visual_sim || 0;
      if (r.distance_km !== null && r.distance_km > radiusKm) { console.log(`[embedAndMatch DEBUG] skip dist: ${r.name||r.id} dist=${r.distance_km} > ${radiusKm}`); continue; }
      if (r.species && srcAttrs?.species && r.species !== srcAttrs.species) { console.log(`[embedAndMatch DEBUG] skip species: ${r.name||r.id} r.species=${r.species} src.species=${srcAttrs.species}`); continue; }
      const score = Math.round(visual * 100);
      if (score >= minScore) {
        allCandidates.push({
          ...r, visual, distance_km: r.distance_km,
          score, targetType: tgt.targetType,
        });
      } else {
        console.log(`[embedAndMatch DEBUG] skip score: ${r.name||r.id} score=${score} < ${minScore}`);
      }
    }
  }

  allCandidates.sort((a, b) => b.score - a.score);
  const best = allCandidates.slice(0, maxCandidates);

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
    if (c.breed) reasons.push(`Raza: ${c.breed}`);
    if (c.color) reasons.push(`Color: ${c.color}`);
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
