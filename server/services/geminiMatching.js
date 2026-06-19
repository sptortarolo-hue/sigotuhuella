import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import sharp from 'sharp';
import pool from '../db.js';
import { sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from './pushService.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

// Shared rate limiter for all Gemini calls
let geminiCooldownUntil = 0;
const COOLDOWN_429 = 5 * 60 * 1000;
const COOLDOWN_QUOTA = 60 * 60 * 1000;

function isGeminiAvailable() {
  return Date.now() > geminiCooldownUntil;
}

function handleGeminiError(error) {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('429') || msg.includes('rate') || msg.includes('too many')) {
    geminiCooldownUntil = Date.now() + COOLDOWN_429;
    console.log(`[gemini] 429 rate limited, cooling down 5 min until ${new Date(geminiCooldownUntil).toISOString()}`);
  } else if (msg.includes('403') || msg.includes('quota') || msg.includes('exhausted')) {
    geminiCooldownUntil = Date.now() + COOLDOWN_QUOTA;
    console.log(`[gemini] Quota exhausted, cooling down 60 min until ${new Date(geminiCooldownUntil).toISOString()}`);
  }
}

// ─── Batch matching prompt (1 call instead of 20) ───

const BATCH_MATCH_PROMPT = `Sos un sistema de matching para mascotas perdidas de la app "Sigo Tu Huella".
Te voy a dar 1 nuevo reporte y una lista de CANDIDATOS numerados.
Determiná cuáles de los candidatos podrían ser el MISMO animal.

Devuelve SOLO un JSON:
{
  "matches": [
    {
      "candidate_index": 0-19,
      "match": true|false,
      "score": 0-100,
      "reasons": ["razón clara 1", "razón clara 2"]
    }
  ]
}

Reglas:
- Score > 70 significa MUY probable que sea el mismo animal
- Score 50-70 significa posible match
- Score < 50 significa que probablemente no es el mismo
- Considerá: especie, color, ubicacion, tamaño, descripcion fisica
- La ubicacion aproximada suma si es cercana
- Si la especie no coincide, score debe ser < 20
- Si un reporte dice "encontrado" y el otro "perdido" y coinciden especie+color+ubicacion -> high score
- Incluí SOLO los que tengan match true con score >= 50
- Si ningún candidato coincide, devolvé matches: []`;

let _callGemini = null;

async function callGemini(prompt, systemPrompt) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');
  if (!isGeminiAvailable()) {
    const retryAt = new Date(geminiCooldownUntil).toISOString();
    throw new Error(`Gemini en cooldown hasta ${retryAt}`);
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-lite',
    contents: systemPrompt + '\n\n' + prompt,
    config: { responseMimeType: 'application/json' },
  });

  return JSON.parse(response.text);
}

export async function matchPostToPet(postId) {
  try {
    const postRes = await pool.query('SELECT * FROM facebook_posts WHERE id = $1', [postId]);
    if (postRes.rows.length === 0) return [];
    const post = postRes.rows[0];
    if (post.is_matched) return [];

    const candidates = await pool.query(
      `SELECT id, name, species, color, description, location, latitude, longitude, status
       FROM pets
       WHERE status IN ('lost', 'sighted') AND (
         $1::text IS NULL OR species = $1::text
       )
       ORDER BY created_at DESC LIMIT 20`,
      [post.species]
    );
    if (candidates.rows.length === 0) return [];

    const sourceText = `Publicación de Facebook:\n${post.content || '(sin texto)'}`;
    const candidatesText = candidates.rows.map((c, i) =>
      `[${i}] ${c.name ? 'Nombre: ' + c.name + ', ' : ''}Especie: ${c.species}, Color: ${c.color || 'no especificado'}, Ubicación: ${c.location || 'no especificada'}, Estado: ${c.status}, Descripción: ${c.description || 'N/A'}`
    ).join('\n');

    const result = await callGemini(
      `NUEVO REPORTE:\n${sourceText}\n\nCANDIDATOS:\n${candidatesText}`,
      BATCH_MATCH_PROMPT
    );

    const matches = [];
    if (result.matches) {
      for (const m of result.matches) {
        if (m.match && m.score >= 50 && m.candidate_index >= 0 && m.candidate_index < candidates.rows.length) {
          const pet = candidates.rows[m.candidate_index];
          const insertRes = await pool.query(
            `INSERT INTO facebook_matches (source_type, source_id, target_type, target_id, score, reasons, method)
             VALUES ('fb_post', $1, 'app_pet', $2, $3, $4, 'ai')
             ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING
             RETURNING id`,
            [postId, pet.id, m.score, m.reasons || []]
          );
          if (insertRes.rows.length > 0) {
            matches.push({ pet, score: m.score, reasons: m.reasons || [] });
          }
        }
      }
    }

    if (matches.length > 0) {
      await pool.query('UPDATE facebook_posts SET is_matched = true WHERE id = $1', [postId]);
      await notifyAdminMatch('post', post, matches);
    }

    return matches;
  } catch (err) {
    console.error('matchPostToPet error:', err);
    return [];
  }
}

export async function matchPetToPosts(pet) {
  try {
    const fbPosts = await pool.query(
      `SELECT * FROM facebook_posts
       WHERE classification IN ('found', 'lost')
       AND is_matched = false
       AND (species IS NULL OR species = $1)
       ORDER BY scraped_at DESC LIMIT 20`,
      [pet.species]
    );
    if (fbPosts.rows.length === 0) return [];

    const sourceText = `${pet.name ? 'Nombre: ' + pet.name + '\n' : ''}Especie: ${pet.species}\nColor: ${pet.color || 'no especificado'}\nUbicación: ${pet.location || 'no especificada'}\nDescripción: ${pet.description || 'N/A'}`;
    const candidatesText = fbPosts.rows.map((p, i) =>
      `[${i}] Publicación FB: ${p.content ? p.content.substring(0, 200) : '(sin texto)'}`
    ).join('\n');

    const result = await callGemini(
      `NUEVO REPORTE:\n${sourceText}\n\nCANDIDATOS:\n${candidatesText}`,
      BATCH_MATCH_PROMPT
    );

    const matches = [];
    if (result.matches) {
      for (const m of result.matches) {
        if (m.match && m.score >= 50 && m.candidate_index >= 0 && m.candidate_index < fbPosts.rows.length) {
          const post = fbPosts.rows[m.candidate_index];
          matches.push({ post, score: m.score, reasons: m.reasons || [] });

          await pool.query(
            `INSERT INTO facebook_matches (source_type, source_id, target_type, target_id, score, reasons, method)
             VALUES ('app_pet', $1, 'fb_post', $2, $3, $4, 'ai')
             ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING`,
            [pet.id, post.id, m.score, m.reasons || []]
          );
        }
      }
    }

    if (matches.length > 0) {
      const matchedIds = matches.map(m => m.post.id);
      await pool.query(
        `UPDATE facebook_posts SET is_matched = true WHERE id = ANY($1::uuid[])`,
        [matchedIds]
      );
      notifyAdminMatch('pet', pet, matches);
    }

    return matches;
  } catch (err) {
    console.error('matchPetToPosts error:', err);
    return [];
  }
}

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
    // GUARD: skip if already classified as reunion or already matched
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
       WHERE fp.id = $1
       GROUP BY fp.id`,
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

    // Update linked pet if exists
    const petRes = await pool.query(
      `SELECT id, status FROM pets WHERE source_facebook_post_id = $1 AND status IN ('lost', 'sighted', 'retained')`,
      [postId]
    );
    if (petRes.rows.length > 0) {
      for (const pet of petRes.rows) {
        await pool.query(
          `UPDATE pets SET status = 'reunited', updated_at = NOW() WHERE id = $1`,
          [pet.id]
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
      url: `${process.env.FRONTEND_URL || 'https://sigotuhuella.online'}/admin/facebook/posts`,
    }).catch(err => console.error('Push error:', err));

    return { reunited: true, keyword: matched };
  } catch (err) {
    console.error('detectReunion error:', err);
    return null;
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

export async function matchWhatsAppToPets(newPetId) {
  try {
    const newPet = (await pool.query('SELECT * FROM pets WHERE id = $1', [newPetId])).rows[0];
    if (!newPet) return [];

    const oppositeStatuses = newPet.status === 'lost' ? ['sighted', 'retained'] : ['lost'];
    const minScore = parseInt((await pool.query("SELECT value FROM settings WHERE key = 'matching_min_score'")).rows[0]?.value || '50');

    const candidates = await pool.query(
      `SELECT * FROM pets WHERE status = ANY($1) AND id != $2
       ORDER BY created_at DESC LIMIT 20`,
      [oppositeStatuses, newPetId]
    );
    if (candidates.rows.length === 0) return [];

    const sourceText = `Nuevo reporte (${newPet.status}):\nEspecie: ${newPet.species}\nColor: ${newPet.color || 'no especificado'}\nUbicación: ${newPet.location || 'no especificada'}\nDescripción: ${newPet.description || 'N/A'}`;
    const candidatesText = candidates.rows.map((c, i) =>
      `[${i}] ${c.status === 'lost' ? 'Perdido' : c.status === 'retained' ? 'Encontrado' : 'Avistaje'}: Especie: ${c.species}, Color: ${c.color || 'no especificado'}, Ubicación: ${c.location || 'no especificada'}, Descripción: ${c.description || 'N/A'}`
    ).join('\n');

    const result = await callGemini(
      `NUEVO REPORTE:\n${sourceText}\n\nCANDIDATOS:\n${candidatesText}`,
      BATCH_MATCH_PROMPT
    );

    const matches = [];
    if (result.matches) {
      for (const m of result.matches) {
        if (m.match && m.score >= minScore && m.candidate_index >= 0 && m.candidate_index < candidates.rows.length) {
          const candidate = candidates.rows[m.candidate_index];
          matches.push({ pet: candidate, score: m.score, reasons: m.reasons || [] });

          await pool.query(
            `INSERT INTO facebook_matches (source_type, source_id, target_type, target_id, score, reasons, method)
             VALUES ('wa_report', $1, 'app_pet', $2, $3, $4, 'ai')
             ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING`,
            [newPetId, candidate.id, m.score, m.reasons || []]
          );
        }
      }
    }

    if (matches.length > 0) {
      notifyAdminMatch('wa_report', newPet, matches);
    }

    return matches;
  } catch (err) {
    console.error('matchWhatsAppToPets error:', err);
    return [];
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
   - género/sexo: "male" | "female" | "unknown" | null
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
  "gender": "male" | "female" | "unknown" | null,
  "breed": "texto" | null,
  "color": "texto" | null,
  "name": "texto" | null,
  "location": "texto" | null,
  "phone": "texto solo números" | null,
  "phone2": "texto solo números" | null,
  "description": "texto" | null
}`;

export async function processImageCaption(caption, imageData, imageMime) {
  if (!groq) {
    return { intent: 'unclear', location: null, phone: null, phone2: null, description: null };
  }
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

    const result = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        { role: 'system', content: PROCESS_IMAGE_CAPTION_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
    });
    let raw = result.choices[0]?.message?.content || '{}';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = JSON.parse(raw);
    return {
      intent: parsed.intent || 'unclear',
      species: parsed.species || null,
      gender: parsed.gender || null,
      breed: parsed.breed || null,
      color: parsed.color || null,
      name: parsed.name || null,
      location: parsed.location || null,
      phone: parsed.phone || null,
      phone2: parsed.phone2 || null,
      description: parsed.description || null,
    };
  } catch (err) {
    console.error('processImageCaption error:', err);
    return { intent: 'unclear', species: null, gender: null, breed: null, color: null, name: null, location: null, phone: null, phone2: null, description: null };
  }
}

async function notifyAdminMatch(type, source, matches) {
  const top = matches.slice(0, 3);
  const url = type === 'post'
    ? `${process.env.FRONTEND_URL || 'https://sigotuhuella.online'}/admin/facebook/posts`
    : `${process.env.FRONTEND_URL || 'https://sigotuhuella.online'}/pet/${source.id}`;

  const matchRows = top.map(m => {
    const label = type === 'post'
      ? `${m.pet.name || m.pet.species || 'Sin nombre'} (${m.score}%)`
      : `Post ID: ${m.post.id?.substring(0, 8) || ''} (${m.score}%)`;
    return `<tr><td style="padding:6px;border:1px solid #e2e8f0;">${label}</td>
                <td style="padding:6px;border:1px solid #e2e8f0;">${(m.reasons || []).join(', ')}</td></tr>`;
  }).join('');

  await sendAdminNotificationEmail(
    '🎯 Match detectado por IA',
    `<p>Se detectaron matches entre ${type === 'post' ? 'un post de Facebook' : 'una mascota reportada'} y las siguientes entradas:</p>
     <table style="width:100%;border-collapse:collapse;"><tr><th style="padding:6px;border:1px solid #e2e8f0;text-align:left;">Match</th>
     <th style="padding:6px;border:1px solid #e2e8f0;text-align:left;">Razones</th></tr>${matchRows}</table>
     <p><a href="${url}">Ver en el panel</a></p>`
  );

  sendPushToAdmins({
    title: '🎯 Match detectado',
    body: `${matches.length} match(es) encontrado(s) por IA`,
    url,
  }).catch(err => console.error('Push error:', err));
}

// ─── Text intent classification (Groq-powered for WhatsApp bot) ───

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
  if (!groq) return null;
  try {
    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: CLASSIFY_PROMPT },
        { role: 'user', content: text },
      ],
      max_tokens: 10,
      temperature: 0,
    });
    let raw = (result.choices[0]?.message?.content || '').trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim().toLowerCase();
    const valid = ['lost', 'found', 'sighted', 'adopt', 'volunteer', 'donate', 'info_qr', 'report_from_fb', 'human', 'greeting', 'other'];
    return valid.includes(raw) ? raw : null;
  } catch (err) {
    console.error('Groq classifyTextIntent error:', err);
    return null;
  }
}

export async function detectAndCropPetFace(imageBase64, mimeType) {
  if (!groq || !imageBase64) return null;
  try {
    const result = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'You are a pet photo cropper. This image contains a pet (dog or cat). Find the animal\'s face/head and return its bounding box as normalized coordinates (0-1) where (x,y) is the top-left corner and (width,height) extends right and down. Return ONLY a JSON object with this exact format: {"x":0.35,"y":0.3,"width":0.3,"height":0.3}. If no animal face is visible, return {"error":"no_face"}.' },
          { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
        ],
      }],
      temperature: 0,
      max_tokens: 200,
    });
    let raw = result.choices[0]?.message?.content || '{}';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const faceData = JSON.parse(raw);
    if (faceData.error === 'no_face') return null;
    if (typeof faceData.x !== 'number' || typeof faceData.y !== 'number' || typeof faceData.width !== 'number' || typeof faceData.height !== 'number') return null;

    const buffer = Buffer.from(imageBase64, 'base64');
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const imgW = metadata.width || 1000;
    const imgH = metadata.height || 1000;

    const padding = 0.5;
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
    return { cropped: cropped.toString('base64'), original: imageBase64, mimeType: 'image/jpeg' };
  } catch (err) {
    console.error('detectAndCropPetFace error:', err);
    return null;
  }
}
