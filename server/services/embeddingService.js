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
    clipModel = { fn: await pipeline('image-feature-extraction', 'Xenova/clip-vit-large-patch14'), RawImage };
    clipRawImage = RawImage;
  }
  return { ...clipModel, RawImage: clipRawImage };
}

let textModel = null;
async function getTextModel() {
  if (!textModel) {
    const { pipeline } = await import('@xenova/transformers');
    textModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return textModel;
}

export async function generateTextEmbedding(text) {
  if (!text || text.trim().length < 3) return null;
  const fn = await getTextModel();
  const result = await fn(text, { pooling: 'mean', normalize: true });
  return normalize(Array.from(result.data));
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
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

// Rellena breed/color/coat normalizados desde la clasificación CLIP cuando
// están vacíos. Umbrales conservadores: solo alta confianza.
async function fillNormalizedFromImage(petId, attrs) {
  const { normalizeBreedStrict, normalizeColor, normalizeCoatLength } = await import('./taxonomy.js');
  const sets = [];
  const params = [];
  const cur = await pool.query(
    'SELECT breed_normalized, color_normalized, coat_length FROM pets WHERE id = $1',
    [petId]
  );
  const row = cur.rows[0];
  if (!row) return;

  let breedNorm = row.breed_normalized;
  if (!breedNorm && attrs.breed && (attrs.breedScore || 0) >= 0.5) {
    breedNorm = await normalizeBreedStrict(attrs.species, attrs.breed);
    if (breedNorm && breedNorm !== 'Mestizo') {
      sets.push(`breed_normalized = $${sets.length + 1}`);
      params.push(breedNorm);
    } else {
      breedNorm = null;
    }
  }
  if (!row.color_normalized && attrs.color && (attrs.colorScore || 0) >= 0.5) {
    const colorNorm = normalizeColor(attrs.color);
    if (colorNorm && colorNorm !== 'desconocido') {
      sets.push(`color_normalized = $${sets.length + 1}`);
      params.push(colorNorm);
    }
  }
  if (!row.coat_length && breedNorm) {
    const coat = normalizeCoatLength(breedNorm);
    if (coat && coat !== 'desconocido') {
      sets.push(`coat_length = $${sets.length + 1}`);
      params.push(coat);
    }
  }
  if (sets.length === 0) return;
  params.push(petId);
  await pool.query(`UPDATE pets SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
}

async function saveEmbedding(table, id, embedding, embeddingType = 'full') {
  try {
    await pool.query(
      `UPDATE ${table} SET embedding = $1, embedding_type = $2 WHERE id = $3`,
      [vecToString(embedding), embeddingType, id]
    );
  } catch (err) {
    if (err.code === '42703') {
      await pool.query(
        `UPDATE ${table} SET embedding = $1 WHERE id = $2`,
        [vecToString(embedding), id]
      );
    } else throw err;
  }
}

async function saveTextEmbedding(table, id, textEmbedding) {
  if (!textEmbedding) return;
  try {
    await pool.query(
      `UPDATE ${table} SET text_embedding = $1 WHERE id = $2`,
      [vecToString(textEmbedding), id]
    );
  } catch (err) {
    if (err.code !== '42703') throw err;
  }
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

  const selectCols = table === 'pets'
    ? `t.id, t.name, t.species, t.breed, t.color, t.description,
       t.location, t.latitude, t.longitude, t.created_at, t.text_embedding, t.name AS pet_name, t.gender`
    : `t.id, t.name, t.species, t.breed, t.color, t.description,
       t.location, t.latitude, t.longitude, t.created_at, t.text_embedding, t.pet_name, t.gender`;

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



export async function embedAndMatch(table, id, { species, status, imageBuffer, croppedFaceBuffer, content, petName, breed, color, gender }) {
  if (!imageBuffer) return [];

  const embeddingBuffer = croppedFaceBuffer || imageBuffer;
  const embeddingType = croppedFaceBuffer ? 'face' : 'full';
  const embedding = await generateImageEmbedding(embeddingBuffer);
  await saveEmbedding(table, id, embedding, embeddingType);

  const petInfo = { petName: petName || null, breed: breed || null, color: color || null, gender: gender || null };

  const enrichedText = [petName, breed, color, species, gender, content].filter(Boolean).join('. ');
  let srcTextEmbedding = null;
  if (enrichedText.length > 3) {
    srcTextEmbedding = await generateTextEmbedding(enrichedText);
    if (srcTextEmbedding) await saveTextEmbedding(table, id, srcTextEmbedding);
  }

  const faceBuffer = croppedFaceBuffer || imageBuffer;

  let srcAttrs = null;
  try {
    srcAttrs = await classifyPetAttributes(faceBuffer);
    if (srcAttrs) {
      console.log(`[embedAndMatch] CLIP: ${srcAttrs.detected ? (srcAttrs.species + ' ' + (srcAttrs.speciesScore * 100).toFixed(0) + '%') : 'no animal'}`);
      await saveAnimalDetection(table, id, srcAttrs);
      // La IA rellena facetados vacíos (nunca pisa dato humano/taxonomía).
      if (table === 'pets' && srcAttrs.detected) {
        await fillNormalizedFromImage(id, srcAttrs).catch(e => console.warn('[embedAndMatch] fillNormalized error:', e.message));
      }
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
    [['matching_min_score', 'matching_radius_km', 'matching_max_candidates',
      'matching_weight_visual', 'matching_weight_text']]
  );
  const s = {};
  for (const row of settingsRes.rows) s[row.key] = row.value;

  const minScore = parseInt(s.matching_min_score || '70');
  const radiusKm = parseFloat(s.matching_radius_km || '20');
  const maxCandidates = parseInt(s.matching_max_candidates || '20');
  const wVisual = parseInt(s.matching_weight_visual || '55');
  const wText = parseInt(s.matching_weight_text || '10');

  const allCandidates = [];
  for (const tgt of targets) {
    const rows = await searchTable(tgt, srcLat, srcLng, embedding, status, { maxCandidates });
    for (const r of rows) {
      const visual = r.visual_sim || 0;
      if (r.distance_km !== null && r.distance_km > radiusKm) continue;
      if (r.species && srcAttrs?.species && r.species !== srcAttrs.species) continue;

      const visualScore = Math.round(visual * 100);

      let textScore = 0;
      if (srcTextEmbedding) {
        let targetTextEmb = null;
        if (r.text_embedding) {
          try {
            const tVec = r.text_embedding;
            targetTextEmb = typeof tVec === 'string' ? JSON.parse(tVec) : tVec;
          } catch { targetTextEmb = null; }
        }
        if (!targetTextEmb && r.description) {
          const tgtEnrichedText = [r.pet_name, r.breed, r.color, r.species, r.gender, r.description].filter(Boolean).join('. ');
          targetTextEmb = await generateTextEmbedding(tgtEnrichedText);
        }
        if (targetTextEmb) {
          textScore = Math.round(cosineSimilarity(srcTextEmbedding, targetTextEmb) * 100);
        }
      }

      let breedColorBonus = 0;
      if (petInfo.petName && r.pet_name && petInfo.petName.toLowerCase() === r.pet_name.toLowerCase()) breedColorBonus += 15;
      if (petInfo.breed && r.breed && petInfo.breed.toLowerCase() === r.breed.toLowerCase()) breedColorBonus += 5;
      if (petInfo.color && r.color && petInfo.color.toLowerCase() === r.color.toLowerCase()) breedColorBonus += 3;
      if (petInfo.gender && r.gender && petInfo.gender.toLowerCase() === r.gender.toLowerCase()) breedColorBonus += 2;

      const imgTextTotal = wVisual + wText;
      const score = imgTextTotal > 0
        ? Math.round((visualScore * wVisual + textScore * wText) / imgTextTotal + breedColorBonus)
        : visualScore + breedColorBonus;

      if (score >= minScore) {
        allCandidates.push({
          ...r, visual, distance_km: r.distance_km,
          score, visualScore, textScore, breedColorBonus, targetType: tgt.targetType,
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
    const reasons = [`Visual: ${c.visualScore}%`];
    if (c.textScore > 0) reasons.push(`Texto: ${c.textScore}%`);
    if (c.breedColorBonus > 0) reasons.push(`+${c.breedColorBonus}% raza/color`);
    if (c.breed) reasons.push(`Raza: ${c.breed}`);
    if (c.color) reasons.push(`Color: ${c.color}`);
    if (c.distance_km !== null) reasons.push(`Distancia: ${Math.round(c.distance_km)}km`);

    const res = await pool.query(
      `INSERT INTO facebook_matches (source_type, source_id, target_type, target_id, score, reasons, method)
       VALUES ($1, $2, $3, $4, $5, $6, 'ai')
       ON CONFLICT (source_type, source_id, target_type, target_id)
       DO UPDATE SET score = $5, reasons = $6, method = 'ai'
       RETURNING id`,
      [sourceType, id, c.targetType, c.id, c.score, reasons]
    );
    if (res.rows.length > 0) matches.push(c);
  }

  if (matches.length > 0) {
    const names = matches.map(m => m.name || `#${m.id.slice(0, 8)}`).join(', ');
    await sendAdminNotificationEmail(
      `🔗 Match detectado: ${label} coincide con ${matches.length} mascota(s)`,
      `Se detectó un match automático entre un ${label} y:\n\n${matches.map(m => `- ${m.name || 'Sin nombre'} (${m.species}) — ${m.score}% (V:${m.visualScore}% T:${m.textScore || 0}%${m.breedColorBonus > 0 ? ' +' + m.breedColorBonus + '%' : ''})`).join('\n')}`
    );
    sendPushToAdmins({ title: `🔗 Match: ${matches.length} coincidencia(s)`, body: `${label} vinculado a ${names}` });
  }

  return matches;
}
