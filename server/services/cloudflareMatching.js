import pool from '../db.js';
import { sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from './pushService.js';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_MODEL = '@cf/meta/llama-3.2-3b-instruct';

const MATCH_PROMPT = `Sos un sistema de matching para mascotas perdidas de la app "Sigo Tu Huella".
Compará la siguiente publicación de Facebook con una mascota reportada en la app.

Devolvé SOLO un JSON válido sin markdown ni explicaciones:
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

const REUNION_PROMPT = `Analizá los comentarios de esta publicación de Facebook sobre una mascota perdida.
Determiná si la mascota ya fue encontrada o sigue perdida según la información en los comentarios.

Devolvé SOLO un JSON válido sin markdown ni explicaciones:
{
  "reunited": true|false,
  "confidence": 0-100,
  "evidence": "texto del comentario clave que indica reunion",
  "summary": "explicación en español"
}

Busca comentarios como: "ya apareció", "lo encontré", "gracias a todos ya está en casa", "se resolvió", etc.`;

async function callCloudflare(prompt) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) throw new Error('Cloudflare AI no configurado');
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, stream: false }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Cloudflare AI error ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  if (!data.success) throw new Error(`Cloudflare AI: ${data.errors?.[0]?.message || 'unknown error'}`);
  return data.result.response;
}

function cleanJson(text) {
  return text.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
}

export async function matchPostToPet(postId) {
  try {
    const postRes = await pool.query('SELECT * FROM facebook_posts WHERE id = $1', [postId]);
    if (postRes.rows.length === 0) return [];
    const post = postRes.rows[0];

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

      const responseText = await callCloudflare(
        `Publicación de Facebook:\n${post.content || '(sin texto)'}\n\nMascota reportada:\n${text}\n\n${MATCH_PROMPT}`
      );
      const result = JSON.parse(cleanJson(responseText));

      if (result.match && result.score >= 50) {
        matches.push({ pet, score: result.score, reasons: result.reasons || [] });

        await pool.query(
          `INSERT INTO facebook_matches (source_type, source_id, target_type, target_id, score, reasons, method)
           VALUES ('fb_post', $1, 'app_pet', $2, $3, $4, 'ai')
           ON CONFLICT (source_type, source_id, target_type, target_id) DO NOTHING`,
          [postId, pet.id, result.score, result.reasons || []]
        );
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
    if (!post.comments || post.comments.length === 0) return null;

    const commentsText = post.comments
      .filter(c => c.text)
      .map(c => `- ${c.author}: "${c.text}"`)
      .join('\n');

    const responseText = await callCloudflare(
      `Contenido del post:\n${post.content || '(sin texto)'}\n\nComentarios:\n${commentsText || '(sin comentarios)'}\n\n${REUNION_PROMPT}`
    );
    const result = JSON.parse(cleanJson(responseText));

    if (result.reunited && result.confidence >= 70) {
      await pool.query(
        `UPDATE facebook_posts SET classification = 'reunion', notes = $1 WHERE id = $2`,
        [result.summary || result.evidence, postId]
      );

      sendAdminNotificationEmail(
        '🔄 Posible reencuentro detectado',
        `<p>Se detectó un posible reencuentro en los comentarios de una publicación de Facebook.</p>
         <p><strong>Evidencia:</strong> ${result.evidence || ''}</p>
         <p><strong>Resumen:</strong> ${result.summary || ''}</p>
         <p>Confianza: ${result.confidence}%</p>`
      );

      sendPushToAdmins({
        title: '🔄 Posible reencuentro',
        body: result.summary ? result.summary.substring(0, 100) : 'Revisar comentarios de post de Facebook',
        url: `${process.env.FRONTEND_URL || 'https://sigotuhuella.online'}/admin/facebook/posts`,
      }).catch(err => console.error('Push error:', err));
    }

    return result;
  } catch (err) {
    console.error('detectReunion error:', err);
    return null;
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
