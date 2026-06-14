import { GoogleGenAI } from '@google/genai';
import pool from '../db.js';
import { sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from './pushService.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const MATCH_PROMPT = `Sos un sistema de matching para mascotas perdidas de la app "Sigo Tu Huella".
Compará la siguiente publicación de Facebook con una mascota reportada en la app.

Devuelve SOLO un JSON:
{
  "match": true|false,
  "score": 0-100,
  "reasons": ["razón clara 1", "razón clara 2"]
}

Reglas:
- Score > 70 significa MUY probable que sea el mismo animal
- Score 50-70 significa posible match
- Score < 50 significa que probablemente no es el mismo
- Considerá: especie, color, ubicacion, tamaño, descripcion fisica
- La ubicacion aproximada suma si es cercana
- Si la especie no coincide, score debe ser < 20
- Si un post dice "encontrado" y el otro "perdido" y coinciden especie+color+ubicacion -> high score`;

const CROSS_GROUP_PROMPT = `Sos un sistema de detección de posts duplicados en grupos de Facebook.
Compará estas dos publicaciones y decicí si son el MISMO animal/publicación compartido en grupos diferentes.

Devuelve SOLO un JSON:
{
  "same": true|false,
  "score": 0-100,
  "reasons": ["razón 1", "razón 2"]
}

Considerá: mismo texto, misma foto, mismas descripciones del animal.
Si el texto es idéntico o muy similar -> likely same.
Si describen el mismo animal (especie+color+ubicacion) -> possible same.`;



let _callGemini = null;

async function callGemini(prompt, systemPrompt, imageUrls = []) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');

  const parts = imageUrls.length > 0
    ? [{ text: systemPrompt + '\n\n' + prompt }]
    : [{ text: systemPrompt + '\n\n' + prompt }];

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: parts[0].text,
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

    const matches = [];
    for (const pet of candidates.rows) {
      const text = `${pet.name ? 'Nombre: ' + pet.name : ''}
Especie: ${pet.species}
Color: ${pet.color || 'no especificado'}
Ubicación: ${pet.location || 'no especificada'}
Descripción: ${pet.description || ''}`;

      const result = await callGemini(
        `Publicación de Facebook:\n${post.content || '(sin texto)'}\n\nMascota reportada:\n${text}`,
        MATCH_PROMPT
      );

      if (result.match && result.score >= 50) {
        const insertRes = await pool.query(
          `INSERT INTO facebook_matches (source_type, source_id, target_type, target_id, score, reasons, method)
           VALUES ('fb_post', $1, 'app_pet', $2, $3, $4, 'ai')
           ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING
           RETURNING id`,
          [postId, pet.id, result.score, result.reasons || []]
        );
        if (insertRes.rows.length > 0) {
          matches.push({ pet, score: result.score, reasons: result.reasons || [] });
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

    const matches = [];
    for (const post of fbPosts.rows) {
      const text = `${pet.name ? 'Nombre: ' + pet.name : ''}
Especie: ${pet.species}
Color: ${pet.color || 'no especificado'}
Ubicación: ${pet.location || 'no especificada'}
Descripción: ${pet.description || ''}`;

      const result = await callGemini(
        `Publicación de Facebook:\n${post.content || '(sin texto)'}\n\nMascota reportada:\n${text}`,
        MATCH_PROMPT
      );

      if (result.match && result.score >= 50) {
        matches.push({ post, score: result.score, reasons: result.reasons || [] });

        await pool.query(
          `INSERT INTO facebook_matches (source_type, source_id, target_type, target_id, score, reasons, method)
           VALUES ('app_pet', $1, 'fb_post', $2, $3, $4, 'ai')
           ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING`,
          [pet.id, post.id, result.score, result.reasons || []]
        );
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

export async function matchCrossGroup(post1Id, post2Id) {
  try {
    const [p1, p2] = await Promise.all([
      pool.query('SELECT * FROM facebook_posts WHERE id = $1', [post1Id]),
      pool.query('SELECT * FROM facebook_posts WHERE id = $1', [post2Id]),
    ]);
    if (p1.rows.length === 0 || p2.rows.length === 0) return null;

    const post1 = p1.rows[0];
    const post2 = p2.rows[0];

    const result = await callGemini(
      `Post 1 (${post1.group_name || 'grupo A'}):\n${post1.content || '(sin texto)'}\n\nPost 2 (${post2.group_name || 'grupo B'}):\n${post2.content || '(sin texto)'}`,
      CROSS_GROUP_PROMPT
    );

    return result;
  } catch (err) {
    console.error('matchCrossGroup error:', err);
    return null;
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
      `UPDATE facebook_posts SET classification = 'reunion', notes = $1 WHERE id = $2`,
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

    const matches = [];
    for (const candidate of candidates.rows) {
      const text = `Nuevo reporte (${newPet.status}):
Especie: ${newPet.species}
Color: ${newPet.color || 'no especificado'}
Ubicación: ${newPet.location || 'no especificada'}
Descripción: ${newPet.description || ''}

Candidato (${candidate.status}):
Especie: ${candidate.species}
Color: ${candidate.color || 'no especificado'}
Ubicación: ${candidate.location || 'no especificada'}
Descripción: ${candidate.description || ''}`;

      const result = await callGemini(text, MATCH_PROMPT);
      if (result.match && result.score >= minScore) {
        matches.push({ pet: candidate, score: result.score, reasons: result.reasons || [] });

        await pool.query(
          `INSERT INTO facebook_matches (source_type, source_id, target_type, target_id, score, reasons, method)
           VALUES ('wa_report', $1, 'app_pet', $2, $3, $4, 'ai')
           ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING`,
          [newPetId, candidate.id, result.score, result.reasons || []]
        );
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
