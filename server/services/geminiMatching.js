import crypto from 'crypto';
import sharp from 'sharp';
import pool from '../db.js';
import { sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from './pushService.js';
import { embedAndMatch, generateImageEmbedding, generateTextEmbedding, classifyPetAttributes } from './embeddingService.js';
import { textIntentAI, imageCaptionAI, faceCropAI } from './aiProvider.js';

const faceCropCache = new Map();
const FACE_CROP_CACHE_MAX = 200;

function faceCropHash(imageBase64) {
  return crypto.createHash('sha1').update(imageBase64).digest('hex');
}

// ─── Reunion detection (keyword-based, no AI) ───

const RESOLUTION_KEYWORDS = [
  'ya apareció', 'ya lo encontré', 'ya lo encontramos', 'apareció',
  'gracias a todos', 'resuelto', 'ya está en casa', 'encontrado',
  'ya volvió', 'se resolvió', 'muchas gracias',
  'ya aparecio', 'ya lo encontre', 'aparecio',
];

function checkTextForResolution(text) {
  const lower = (text || '').toLowerCase();
  return RESOLUTION_KEYWORDS.find(kw => lower.includes(kw));
}

export async function detectReunion(postId) {
  try {
    const existing = await pool.query(
      'SELECT classification, is_matched FROM facebook_posts WHERE id = $1',
      [postId]
    );
    if (existing.rows.length === 0) return null;
    if (existing.rows[0].classification === 'reunion' || existing.rows[0].is_matched) return null;

    const postRes = await pool.query(
      `SELECT fp.*, json_agg(json_build_object('text', fc.text, 'author', fc.author_name)) as comments
       FROM facebook_posts fp
       LEFT JOIN facebook_comments fc ON fc.post_id = fp.id
       WHERE fp.id = $1 GROUP BY fp.id`,
      [postId]
    );
    if (postRes.rows.length === 0) return null;

    const post = postRes.rows[0];
    const allText = [post.content || '', ...(post.comments || []).map(c => c.text || '')].join(' ');
    const matched = checkTextForResolution(allText);
    if (!matched) return null;

    await pool.query(
      `UPDATE facebook_posts SET classification = 'reunion', is_matched = true, notes = $1 WHERE id = $2`,
      [`Detectado por keyword: "${matched}"`, postId]
    );

    const petRes = await pool.query(
      `SELECT id, status FROM pets WHERE source_facebook_post_id = $1 AND status IN ('lost', 'sighted', 'retained')`,
      [postId]
    );
    if (petRes.rows.length > 0) {
      for (const pet of petRes.rows) {
        await pool.query(`UPDATE pets SET status = 'reunited', updated_at = NOW() WHERE id = $1`, [pet.id]);
        await pool.query(
          `INSERT INTO pet_history (pet_id, event_type, description, from_status, to_status, changed_by)
           VALUES ($1, 'status_change', 'Reencuentro detectado por publicación de Facebook', $2, 'reunited', NULL)`,
          [pet.id, pet.status]
        );
        console.log(`Pet ${pet.id} → reunited via FB post ${postId} (keyword: "${matched}")`);
      }
    }

    sendAdminNotificationEmail(
      '🔄 Posible reencuentro detectado',
      `<p>Se detectó un posible reencuentro en una publicación de Facebook (detección por keywords).</p>
       <p><strong>Keyword:</strong> ${matched}</p>
       <p><strong>Post:</strong> ${post.fb_post_url || postId}</p>`
    );
    sendPushToAdmins({
      title: '🔄 Posible reencuentro',
      body: matched ? `Reencuentro: "${matched}"` : 'Revisar publicación',
      url: `${process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar'}/admin/facebook/posts`,
    }).catch(err => console.error('Push error:', err));

    return { reunited: true, keyword: matched };
  } catch (err) {
    console.error('detectReunion error:', err);
    return null;
  }
}

// ─── Wrappers that use embeddingService.embedAndMatch ───

export async function matchPostToPet(postId) {
  try {
    const post = (await pool.query('SELECT * FROM facebook_posts WHERE id = $1', [postId])).rows[0];
    if (!post || post.is_matched) return [];

    let imageBuffer = null;
    if (post.image_data) {
      imageBuffer = Buffer.from(post.image_data, 'base64');
    }
    if (!imageBuffer && post.image_urls?.length > 0) {
      console.log(`[matchPostToPet] No image_data, skipping (would need URL download for ${postId})`);
      return [];
    }

    let croppedFaceBuffer = null;
    if (imageBuffer) {
      const cropped = await detectAndCropPetFace(imageBuffer.toString('base64'), 'image/jpeg');
      if (cropped) croppedFaceBuffer = Buffer.from(cropped.cropped, 'base64');
    }

    const status = post.classification === 'unclassified' ? 'lost' : post.classification;
    return await embedAndMatch('facebook_posts', postId, {
      species: post.species || undefined,
      status,
      imageBuffer,
      croppedFaceBuffer,
      content: post.content,
      petName: post.pet_name || null,
      breed: post.breed || null,
      color: post.color || null,
      gender: post.gender || null,
    });
  } catch (err) {
    console.error('matchPostToPet error:', err);
    return [];
  }
}

export async function matchPetToPosts(pet, opts = {}) {
  try {
    const imgRes = await pool.query(
      "SELECT image_data, mime_type FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1",
      [pet.id]
    );
    let imageBuffer = null;
    let mimeType = 'image/jpeg';
    if (imgRes.rows.length > 0 && imgRes.rows[0].image_data) {
      imageBuffer = Buffer.from(imgRes.rows[0].image_data, 'base64');
      mimeType = imgRes.rows[0].mime_type || 'image/jpeg';
    }
    if (!imageBuffer) return [];

    let croppedFaceBuffer = null;
    if (opts.croppedFaceBuffer) {
      croppedFaceBuffer = Buffer.from(opts.croppedFaceBuffer, 'base64');
    } else {
      const cropped = await detectAndCropPetFace(imageBuffer.toString('base64'), mimeType);
      if (cropped) croppedFaceBuffer = Buffer.from(cropped.cropped, 'base64');
    }

    return await embedAndMatch('pets', pet.id, {
      species: pet.species,
      status: pet.status,
      imageBuffer,
      croppedFaceBuffer,
      content: pet.description,
      petName: pet.name || null,
      breed: pet.breed || null,
      color: pet.color || null,
      gender: pet.gender || null,
    });
  } catch (err) {
    console.error('matchPetToPosts error:', err);
    return [];
  }
}

export async function matchWhatsAppToPets(newPetId, opts = {}) {
  try {
    const pet = (await pool.query('SELECT * FROM pets WHERE id = $1', [newPetId])).rows[0];
    if (!pet) return [];

    return await matchPetToPosts(pet, opts);
  } catch (err) {
    console.error('matchWhatsAppToPets error:', err);
    return [];
  }
}

export async function runFullMatching() {
  try {
    const posts = await pool.query(
      `SELECT id FROM facebook_posts WHERE is_matched = false AND classification IN ('lost', 'found')`
    );
    const results = [];
    for (const row of posts.rows) {
      const matches = await matchPostToPet(row.id);
      results.push({ postId: row.id, matches: matches.length });
    }
    return results;
  } catch (err) {
    console.error('runFullMatching error:', err);
    return [];
  }
}

export async function matchScrapedToAppPets(scrapedMessageId) {
  try {
    const msg = (await pool.query('SELECT * FROM whatsapp_scraped_messages WHERE id = $1', [scrapedMessageId])).rows[0];
    if (!msg || msg.is_matched) return [];

    let imageBuffer = null;
    if (msg.image_data) {
      imageBuffer = Buffer.from(msg.image_data, 'base64');
    }
    if (!imageBuffer) return [];

    let croppedFaceBuffer = null;
    const cropped = await detectAndCropPetFace(msg.image_data, msg.image_mime || 'image/jpeg');
    if (cropped) croppedFaceBuffer = Buffer.from(cropped.cropped, 'base64');

    return await embedAndMatch('whatsapp_scraped_messages', scrapedMessageId, {
      species: msg.animal_species || msg.species || undefined,
      status: msg.classification === 'unclassified' ? 'lost' : msg.classification,
      imageBuffer,
      croppedFaceBuffer,
      content: msg.content,
      petName: msg.pet_name || null,
      breed: msg.breed || null,
      color: msg.color || null,
      gender: msg.gender || null,
    });
  } catch (err) {
    console.error('matchScrapedToAppPets error:', err);
    return [];
  }
}

export async function matchScrapedToScraped(messageId) {
  try {
    const msg = (await pool.query('SELECT * FROM whatsapp_scraped_messages WHERE id = $1', [messageId])).rows[0];
    if (!msg || msg.is_matched) return [];

    let imageBuffer = null;
    if (msg.image_data) {
      imageBuffer = Buffer.from(msg.image_data, 'base64');
    }
    if (!imageBuffer) return [];

    let croppedFaceBuffer = null;
    const cropped = await detectAndCropPetFace(msg.image_data, msg.image_mime || 'image/jpeg');
    if (cropped) croppedFaceBuffer = Buffer.from(cropped.cropped, 'base64');

    const matches = await embedAndMatch('whatsapp_scraped_messages', messageId, {
      species: msg.animal_species || msg.species || undefined,
      status: msg.classification === 'unclassified' ? 'lost' : msg.classification,
      imageBuffer,
      croppedFaceBuffer,
      content: msg.content,
      petName: msg.pet_name || null,
      breed: msg.breed || null,
      color: msg.color || null,
      gender: msg.gender || null,
    });

    if (matches.length > 0) {
      await pool.query(
        'UPDATE whatsapp_scraped_messages SET is_matched = true WHERE id = ANY($1::uuid[])',
        [matches.map(m => m.id)]
      );
    }
    return matches;
  } catch (err) {
    console.error('matchScrapedToScraped error:', err);
    return [];
  }
}

// ─── AI helpers kept as-is (not matching-related) ───

const CLASSIFY_PROMPT = `Classify this message from a pet rescue app user. Return ONLY a single word:
- "lost" if they lost their pet
- "found" if they found a pet
- "sighted" if they saw a stray/sighting
- "adopt" if they want to adopt
- "volunteer" if they want to volunteer
- "donate" if they want to donate
- "info_qr" if they ask about QR tags
- "report_from_fb" if they want to report a Facebook post or link their Facebook
- "human" if they want to talk to a person
- "greeting" if they just say hello/hi
- "other" for anything else

Message:`;

export async function classifyTextIntent(text) {
  try {
    const { text: raw, provider } = await textIntentAI([
      { role: 'system', content: CLASSIFY_PROMPT },
      { role: 'user', content: text },
    ]);
    console.log(`[classifyTextIntent] Usó ${provider}`);
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim().toLowerCase();
    const valid = ['lost', 'found', 'sighted', 'adopt', 'volunteer', 'donate', 'info_qr', 'report_from_fb', 'human', 'greeting', 'other'];
    return valid.includes(cleaned) ? cleaned : null;
  } catch (err) {
    console.error('classifyTextIntent error:', err);
    return null;
  }
}

const PROCESS_IMAGE_CAPTION_PROMPT = `Analizá el siguiente mensaje de WhatsApp sobre una mascota y determiná:

1. INTENCIÓN: si la persona:
   - "found": encontró una mascota
   - "lost": perdió una mascota
   - "sighted": vio/avió una mascota
   - "unclear": no se puede determinar

2. Datos de la mascota (extraé todo lo que puedas de la imagen y el texto):
   - especie: "dog" | "cat" | "other" | null
   - género/sexo: "male" | "female" | null (null si no se puede determinar)
   - raza: ej "labrador", "criollo", null
   - color: ej "negro", "blanco y marrón", null
   - nombre: si se ve una chapita con nombre, null si no
   - ubicación: barrio, ciudad, dirección, punto de referencia
    - teléfono de contacto (phone): solo números, sin + ni guiones, ej 2215551234
    - teléfono secundario (phone2): si hay OTRO número de contacto distinto en el mismo mensaje/imagen, solo números, ej 2215555678. Si solo hay un número, poner null
    - descripción: tamaño, estado físico, señas particulares

Respondé SOLO un JSON:
{
  "intent": "found" | "lost" | "sighted" | "unclear",
  "species": "dog" | "cat" | "other" | null,
  "gender": "male" | "female" | null,
  "breed": "texto" | null,
  "color": "texto" | null,
  "name": "texto" | null,
  "location": "texto" | null,
  "phone": "texto solo números" | null,
  "phone2": "texto solo números" | null,
  "description": "texto" | null
}`;

export async function processImageCaption(caption, imageData, imageMime) {
  if (!caption && !imageData) {
    return { intent: 'unclear', location: null, phone: null, phone2: null, description: null };
  }
  try {
    const userContent = [];
    if (imageData && imageMime) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${imageMime};base64,${imageData}` },
      });
    }
    if (caption) {
      userContent.push({ type: 'text', text: caption });
    }

    const { text: raw, provider } = await imageCaptionAI([
      { role: 'system', content: PROCESS_IMAGE_CAPTION_PROMPT },
      { role: 'user', content: userContent },
    ]);
    console.log(`[processImageCaption] Usó ${provider}`);
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      intent: parsed.intent || 'unclear',
      species: parsed.species || null,
      gender: (parsed.gender && parsed.gender !== 'unknown') ? parsed.gender : null,
      breed: parsed.breed || null,
      color: parsed.color || null,
      name: parsed.name || null,
      location: parsed.location || null,
      phone: parsed.phone || null,
      phone2: parsed.phone2 || null,
      description: parsed.description || null,
    };
  } catch (err) {
    console.error('processImageCaption error:', err.message);
    if (caption) {
      const lower = caption.toLowerCase();
      let intent = 'unclear';
      if (/perdi[óo]|perd[ií]|se (me )?(fue|escap|perdi)|busco |busca |desapareci[óo]|extravi[oó]|no aparece|no vuelve|no regresa|se nos fue/.test(lower)) intent = 'lost';
      else if (/encontr[eé]|encontrada|hall[ae]|rescata[dr]|recog[ií]|lo?[s]? encontr[eé]/.test(lower)) intent = 'found';
      else if (/avist[ae]?|vist[ao]?|l[oae] vi\b|la vi\b|lo vi\b|vi a\b|and[aaiu] suelto?|and[aaiu] perdid/.test(lower)) intent = 'sighted';
      const phoneMatch = caption.match(/(\d{7,15})/);
      const phone = phoneMatch ? phoneMatch[1] : null;
      const species = /gato|felino|mich|minino|felix/.test(lower) ? 'cat' : /perr[oai]|can|canino|cachorr|perrito/.test(lower) ? 'dog' : null;
      return { intent, species, gender: null, breed: null, color: null, name: null, location: null, phone, phone2: null, description: caption.substring(0, 200) };
    }
    return { intent: 'unclear', species: null, gender: null, breed: null, color: null, name: null, location: null, phone: null, phone2: null, description: null };
  }
}

async function doFaceCrop(imageBase64, mimeType) {
  if (!imageBase64) return null;
  try {
    const { text: raw, provider } = await faceCropAI([{
      role: 'user',
      content: [
        { type: 'text', text: 'You are a pet photo cropper. This image contains a pet (dog or cat). Find the animal\'s face/head and return its bounding box as normalized coordinates (0-1) where (x,y) is the top-left corner and (width,height) extends right and down. Return ONLY a JSON object with this exact format: {"x":0.35,"y":0.3,"width":0.3,"height":0.3}. If no animal face is visible, return {"error":"no_face"}.' },
        { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
      ],
    }]);
    console.log(`[detectAndCropPetFace] Usó ${provider}`);
    const noThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*/gi, '');
    const jsonStart = noThink.indexOf('{');
    if (jsonStart < 0) return null;
    const jsonEnd = noThink.lastIndexOf('}');
    if (jsonEnd < 0) return null;
    const base = noThink.slice(jsonStart, jsonEnd + 1);
    const cleaned = base.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let faceData;
    try {
      faceData = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[^{}]*"x"\s*:\s*[\d.]+[^{}]*\}/);
      if (!match) return null;
      faceData = JSON.parse(match[0]);
    }
    if (faceData.error === 'no_face') return null;
    if (typeof faceData.x !== 'number' || typeof faceData.y !== 'number' || typeof faceData.width !== 'number' || typeof faceData.height !== 'number') return null;

    const buffer = Buffer.from(imageBase64, 'base64');
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const imgW = metadata.width || 1000;
    const imgH = metadata.height || 1000;

    const padding = 1.0;
    const cx = (faceData.x + faceData.width / 2) * imgW;
    const cy = (faceData.y + faceData.height / 2) * imgH;
    let cw = faceData.width * imgW * (1 + padding);
    let ch = faceData.height * imgH * (1 + padding);
    let left = Math.round(cx - cw / 2);
    let top = Math.round(cy - ch / 2);
    let width = Math.round(cw);
    let height = Math.round(ch);

    if (left < 0) { width += left; left = 0; }
    if (top < 0) { height += top; top = 0; }
    width = Math.min(width, imgW - left);
    height = Math.min(height, imgH - top);
    if (width < 50 || height < 50) return null;

    const cropped = await image.extract({ left, top, width, height }).jpeg({ quality: 85 }).toBuffer();
    return { cropped: cropped.toString('base64'), mimeType: 'image/jpeg' };
  } catch (err) {
    console.error('detectAndCropPetFace error:', err);
    return null;
  }
}

const FACE_CROP_CACHE_TTL_MS = 10 * 60 * 1000;

export async function detectAndCropPetFace(imageBase64, mimeType) {
  if (!imageBase64) return null;

  const hash = faceCropHash(imageBase64);
  const cached = faceCropCache.get(hash);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }

  const promise = doFaceCrop(imageBase64, mimeType);

  faceCropCache.set(hash, { promise, expiresAt: Date.now() + FACE_CROP_CACHE_TTL_MS });
  if (faceCropCache.size > FACE_CROP_CACHE_MAX) {
    const oldestKey = faceCropCache.keys().next().value;
    faceCropCache.delete(oldestKey);
  }

  promise.finally(() => {
    const entry = faceCropCache.get(hash);
    if (entry && entry.promise === promise && entry.expiresAt <= Date.now()) {
      faceCropCache.delete(hash);
    }
  }).catch(() => {});

  return promise;
}

// ─── Pet ↔ Pet duplicate detection ───

// Estados que generan pet_cases (para la lógica de root/member).
const CASE_STATUSES = ['lost', 'transitada', 'found', 'retained', 'accidented', 'needs_attention'];
const NEW_EVENT_DAYS = 7;

function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // embeddings ya normalizados
}

export async function matchPetToPets(pet, opts = {}) {
  try {
    const imgRes = await pool.query(
      'SELECT image_data, mime_type FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 1',
      [pet.id]
    );
    let imageBuffer = null;
    let mimeType = 'image/jpeg';
    if (imgRes.rows.length > 0 && imgRes.rows[0].image_data) {
      imageBuffer = Buffer.from(imgRes.rows[0].image_data, 'base64');
      mimeType = imgRes.rows[0].mime_type || 'image/jpeg';
    }
    if (!imageBuffer) return [];

    let croppedFaceBuffer = null;
    if (opts.croppedFaceBuffer) {
      croppedFaceBuffer = Buffer.from(opts.croppedFaceBuffer, 'base64');
    } else {
      const cropped = await detectAndCropPetFace(imageBuffer.toString('base64'), mimeType);
      if (cropped) croppedFaceBuffer = Buffer.from(cropped.cropped, 'base64');
    }

    const embeddingBuffer = croppedFaceBuffer || imageBuffer;
    const embedding = await generateImageEmbedding(embeddingBuffer);

    const enrichedText = [pet.name, pet.breed, pet.color, pet.species, pet.gender, pet.description].filter(Boolean).join('. ');
    const srcTextEmb = enrichedText.length > 3 ? await generateTextEmbedding(enrichedText) : null;

    const vecStr = '[' + embedding.map(v => String(v)).join(',') + ']';

    const settingsRes = await pool.query(
      "SELECT key, value FROM settings WHERE key = ANY($1::text[])",
      [['matching_pet_dup_score', 'matching_radius_km', 'matching_weight_visual', 'matching_weight_text']]
    );
    const s = {};
    for (const row of settingsRes.rows) s[row.key] = row.value;
    const minScore = parseInt(s.matching_pet_dup_score || '85');
    const radiusKm = parseFloat(s.matching_radius_km || '20');
    const wVisual = parseInt(s.matching_weight_visual || '55');
    const wText = parseInt(s.matching_weight_text || '10');

    const srcLat = pet.latitude;
    const srcLng = pet.longitude;

    const candidates = await pool.query(
      `SELECT id, name, species, breed, color, gender, description, status, case_number, created_at,
              reunited_at, latitude, longitude, text_embedding,
              1 - (embedding <=> $1::vector) AS visual_sim
       FROM pets
       WHERE embedding IS NOT NULL
         AND id != $2
         AND group_id IS NULL
         AND status = ANY($3::text[])
         AND 1 - (embedding <=> $1::vector) > 0.70
       ORDER BY embedding <=> $1::vector
       LIMIT 20`,
      [vecStr, pet.id, CASE_STATUSES]
    );

    const matches = [];
    for (const c of candidates.rows) {
      if (srcLat != null && srcLng != null && c.latitude != null && c.longitude != null) {
        const distKm = 6371 * Math.acos(
          Math.cos(srcLat * Math.PI / 180) * Math.cos(c.latitude * Math.PI / 180) *
          Math.cos(c.longitude * Math.PI / 180 - srcLng * Math.PI / 180) +
          Math.sin(srcLat * Math.PI / 180) * Math.sin(c.latitude * Math.PI / 180)
        );
        if (distKm > radiusKm) continue;
        c.distance_km = distKm;
      }

      const visualScore = Math.round(c.visual_sim * 100);
      let textScore = 0;
      if (srcTextEmb && c.text_embedding) {
        let tVec = c.text_embedding;
        if (typeof tVec === 'string') { try { tVec = JSON.parse(tVec); } catch { tVec = null; } }
        if (tVec) textScore = Math.round(cosineSim(srcTextEmb, tVec) * 100);
      }

      let bonus = 0;
      if (pet.name && c.name && pet.name.toLowerCase() === c.name.toLowerCase()) bonus += 15;
      if (pet.breed && c.breed && pet.breed.toLowerCase() === c.breed.toLowerCase()) bonus += 5;
      if (pet.color && c.color && pet.color.toLowerCase() === c.color.toLowerCase()) bonus += 3;
      if (pet.gender && c.gender && pet.gender.toLowerCase() === c.gender.toLowerCase()) bonus += 2;

      const imgTextTotal = wVisual + wText;
      const score = imgTextTotal > 0
        ? Math.round((visualScore * wVisual + textScore * wText) / imgTextTotal + bonus)
        : visualScore + bonus;

      if (score < minScore) continue;

      const matchRow = {
        target_pet_id: c.id,
        target_case_number: c.case_number,
        target_status: c.status,
        score,
        visual_score: visualScore,
        text_score: textScore,
        distance_km: c.distance_km || null,
      };
      matches.push({ ...matchRow, c });
    }

    matches.sort((a, b) => b.score - a.score);

    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';

    for (const m of matches) {
      // Determinar root automático (regla 1)
      const sourceHasCase = CASE_STATUSES.includes(pet.status);
      const targetHasCase = CASE_STATUSES.includes(m.c.status);
      let rootPetId, memberPetId;
      if (sourceHasCase && targetHasCase) {
        if (new Date(pet.created_at) <= new Date(m.c.created_at)) {
          rootPetId = pet.id; memberPetId = m.target_pet_id;
        } else {
          rootPetId = m.target_pet_id; memberPetId = pet.id;
        }
      } else if (sourceHasCase) {
        rootPetId = pet.id; memberPetId = m.target_pet_id;
      } else if (targetHasCase) {
        rootPetId = m.target_pet_id; memberPetId = pet.id;
      } else {
        continue; // ninguno tiene case — solo informativo, no sugerir agrupar
      }

      // Determinar acción (regla 2): new_event vs pending
      let status = 'pending';
      let newEventReason = null;
      const rootRow = rootPetId === pet.id ? pet : m.c;
      if (rootRow.status === 'reunited' || rootRow.status === 'adopted') {
        const reunitedAt = rootRow.reunited_at ? new Date(rootRow.reunited_at) : null;
        const memberCreated = new Date((memberPetId === pet.id ? pet : m.c).created_at);
        if (reunitedAt) {
          const daysAfter = (memberCreated - reunitedAt) / (1000 * 60 * 60 * 24);
          if (daysAfter > NEW_EVENT_DAYS) {
            status = 'new_event';
            newEventReason = `Reportado ${Math.round(daysAfter)} días después del reencuentro del caso principal`;
          }
        }
      }

      await pool.query(
        `INSERT INTO pet_matches (source_pet_id, target_pet_id, score, visual_score, text_score, distance_km, status, new_event_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (source_pet_id, target_pet_id)
         DO UPDATE SET score = EXCLUDED.score, visual_score = EXCLUDED.visual_score,
                       text_score = EXCLUDED.text_score, distance_km = EXCLUDED.distance_km,
                       status = EXCLUDED.status, new_event_reason = EXCLUDED.new_event_reason,
                       updated_at = NOW()`,
        [pet.id, m.target_pet_id, m.score, m.visual_score, m.text_score, m.distance_km, status, newEventReason]
      );

      if (status === 'pending' && m.score >= minScore) {
        sendPushToAdmins({
          title: '📋 Posible reporte duplicado',
          body: `STH${pet.case_number} (${m.score}%) ↔ ${m.target_case_number}`,
          url: `${frontendUrl}/admin`,
        }).catch(() => {});
      }
    }

    return matches;
  } catch (err) {
    console.error('matchPetToPets error:', err);
    return [];
  }
}
