import sharp from 'sharp';
import jpeg from 'jpeg-js';
import pool from '../db.js';
import { sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from './pushService.js';

let clipModel = null;
let clipRawImage = null;
let textModel = null;

async function getClipModel() {
  if (!clipModel) {
    const { pipeline, RawImage } = await import('@xenova/transformers');
    clipModel = { fn: await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32'), RawImage };
    clipRawImage = RawImage;
  }
  return { ...clipModel, RawImage: clipRawImage };
}

let textExtractor = null;
async function getTextModel() {
  if (!textExtractor) {
    const { pipeline } = await import('@xenova/transformers');
    textExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return textExtractor;
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

export async function generateTextEmbedding(text) {
  if (!text || !text.trim()) return null;
  const fn = await getTextModel();
  const result = await fn(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
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
const SPECIES_CANDIDATES = ['perro', 'gato'];

export async function classifyPetAttributes(imageBuffer) {
  try {
    const fn = await getZeroShotPipeline();
    const image = await imageToRawImage(imageBuffer);

    const speciesRes = await fn(image, SPECIES_CANDIDATES);
    const speciesLabel = speciesRes[0].label;
    const speciesScore = speciesRes[0].score;
    const breedList = BREED_CANDIDATES[speciesLabel] || BREED_CANDIDATES.dog;
    const breedRes = await fn(image, breedList);
    const colorRes = await fn(image, COLOR_CANDIDATES);

    return {
      species: speciesLabel,
      speciesScore,
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

async function saveEmbedding(table, id, embedding) {
  await pool.query(
    `UPDATE ${table} SET embedding = $1 WHERE id = $2`,
    [vecToString(embedding), id]
  );
}

async function saveTextEmbedding(table, id, embedding) {
  await pool.query(
    `UPDATE ${table} SET text_embedding = $1 WHERE id = $2`,
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

async function searchTable(targetCfg, srcLat, srcLng, embedding, textEmb, sourceStatus, opts = {}) {
  const { maxCandidates = 50 } = opts;
  const oppositeStatuses = STATUS_OPPOSITE[sourceStatus] || ['lost', 'found', 'sighted'];
  const { table } = targetCfg;
  const vecStr = vecToString(embedding);
  const hasSrcCoords = srcLat != null && srcLng != null;
  const hasText = textEmb != null;

  const selectCols = `t.id, t.name, t.species, t.breed, t.color, t.description,
    t.location, t.latitude, t.longitude, t.created_at`;

  const visualExpr = `1 - (t.embedding <=> $1::vector)`;
  const textExpr = hasText ? `, 1 - (t.text_embedding <=> $4::vector) AS text_sim` : `, NULL AS text_sim`;
  const distExpr = hasSrcCoords ? `
    CASE
      WHEN t.latitude IS NOT NULL AND t.longitude IS NOT NULL
      THEN (6371 * acos(cos(radians(${srcLat})) * cos(radians(t.latitude))
            * cos(radians(t.longitude) - radians(${srcLng}))
            + sin(radians(${srcLat})) * sin(radians(t.latitude))))
      ELSE NULL
    END` : 'NULL';

  const params = [vecStr, oppositeStatuses, maxCandidates];
  if (hasText) params.push(vecToString(textEmb));

  const query = `
    SELECT ${selectCols},
      ${visualExpr} AS visual_sim
      ${textExpr},
      ${distExpr} AS distance_km
    FROM ${table} t
    WHERE t.embedding IS NOT NULL
      AND t.${targetCfg.statusCol} = ANY($2::text[])
    ORDER BY t.embedding <=> $1::vector
    LIMIT $3
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

function breedColorScore(srcAttrs, tgt) {
  if (!srcAttrs) return 0.5;
  let matches = 0;
  let total = 0;
  if (srcAttrs.species && tgt.species) {
    total++;
    if (srcAttrs.species === tgt.species) matches++;
  }
  if (srcAttrs.breed && tgt.breed) {
    total++;
    const sb = srcAttrs.breed.toLowerCase();
    const tb = tgt.breed.toLowerCase();
    if (sb === tb || sb.includes(tb) || tb.includes(sb)) matches += 0.7;
    else if (sb !== 'otro' && tb !== 'otro') matches += 0.1;
    else matches += 0.4;
  }
  if (srcAttrs.color && tgt.color) {
    total++;
    const sc = srcAttrs.color.toLowerCase();
    const tc = tgt.color.toLowerCase();
    if (sc === tc) matches++;
    else if (sc.includes(tc) || tc.includes(sc)) matches += 0.5;
  }
  return total > 0 ? matches / total : 0.5;
}

function recencyScore(dateStr) {
  if (!dateStr) return 0.5;
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000;
  return Math.max(0, Math.min(1, 1 - days / 365));
}

export async function embedAndMatch(table, id, { species, status, imageBuffer, content, croppedFaceBuffer }) {
  if (!imageBuffer) return [];

  const faceBuffer = croppedFaceBuffer || imageBuffer;
  const embedding = await generateImageEmbedding(faceBuffer);
  await saveEmbedding(table, id, embedding);

  let textEmb = null;
  if (content && content.trim()) {
    textEmb = await generateTextEmbedding(content);
    if (textEmb) await saveTextEmbedding(table, id, textEmb);
  }

  let srcAttrs = null;
  try {
    srcAttrs = await classifyPetAttributes(faceBuffer);
    if (srcAttrs) {
      console.log(`[embedAndMatch] CLIP: ${srcAttrs.species} (${(srcAttrs.speciesScore * 100).toFixed(0)}%), raza: ${srcAttrs.breed}, color: ${srcAttrs.color}`);
    }
  } catch (err) {
    console.warn('[embedAndMatch] classifyPetAttributes error:', err.message);
  }

  const srcRes = await pool.query(
    `SELECT latitude, longitude, created_at FROM ${table} WHERE id = $1`,
    [id]
  );
  const srcLat = srcRes.rows[0]?.latitude;
  const srcLng = srcRes.rows[0]?.longitude;
  const srcCreatedAt = srcRes.rows[0]?.created_at;

  const targets = targetConfig(table);

  const settingsRes = await pool.query(
    "SELECT key, value FROM settings WHERE key = ANY($1::text[])",
    [['matching_min_score', 'matching_radius_km',
      'matching_weight_visual', 'matching_weight_distance',
      'matching_weight_breed_color', 'matching_weight_text',
      'matching_weight_recency', 'matching_max_candidates']]
  );
  const s = {};
  for (const row of settingsRes.rows) s[row.key] = row.value;

  const minScore = parseInt(s.matching_min_score || '70');
  const radiusKm = parseFloat(s.matching_radius_km || '20');
  let wVisual = parseFloat(s.matching_weight_visual || '55');
  let wDist = parseFloat(s.matching_weight_distance || '15');
  let wBreedColor = parseFloat(s.matching_weight_breed_color || '15');
  let wText = parseFloat(s.matching_weight_text || '10');
  let wRecency = parseFloat(s.matching_weight_recency || '5');
  const total = wVisual + wDist + wBreedColor + wText + wRecency;
  if (total > 0) {
    wVisual /= total;
    wDist /= total;
    wBreedColor /= total;
    wText /= total;
    wRecency /= total;
  }
  const maxCandidates = parseInt(s.matching_max_candidates || '10');

  const allCandidates = [];
  for (const tgt of targets) {
    const rows = await searchTable(tgt, srcLat, srcLng, embedding, textEmb, status, { maxCandidates: 50 });
    for (const r of rows) {
      const visual = r.visual_sim || 0;
      const dist = r.distance_km !== null ? Math.max(0, 1 - r.distance_km / radiusKm) : 0.5;
      const breedColor = srcAttrs ? breedColorScore(srcAttrs, r) : 0.5;
      const textSim = r.text_sim != null ? r.text_sim : 0.5;
      const recency = srcCreatedAt ? recencyScore(r.created_at) : 0.5;
      const score = Math.round((visual * wVisual + dist * wDist + breedColor * wBreedColor + textSim * wText + recency * wRecency) * 100);
      if (score >= minScore) {
        allCandidates.push({
          ...r, visual, distance_km: r.distance_km,
          breedColor: Math.round(breedColor * 100),
          textSim: textSim != null ? Math.round(textSim * 100) : null,
          recency: Math.round(recency * 100),
          score, targetType: tgt.targetType,
        });
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
    if (c.breedColor !== null) reasons.push(`Raza/color: ${c.breedColor}%`);
    if (c.textSim !== null) reasons.push(`Texto: ${c.textSim}%`);
    if (c.distance_km !== null) reasons.push(`Distancia: ${Math.round(c.distance_km)}km`);
    if (c.recency !== null) reasons.push(`Recencia: ${c.recency}%`);

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
