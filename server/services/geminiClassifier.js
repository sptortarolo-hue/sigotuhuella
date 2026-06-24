import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

const CLASSIFICATION_PROMPT = `Eres un clasificador de publicaciones de Facebook sobre mascotas perdidas y encontradas para la app "Sigo Tu Huella".
Analizá el post, las imágenes y los comentarios asociados. Devolvé SOLO un JSON válido sin markdown:

{
  "classification": "lost" | "found" | "sighting" | "reunion" | "other",
  "species": "dog" | "cat" | "other" | null,
  "species_other": "string | null",
  "name": "string | null (nombre de la mascota si se menciona)",
  "breed": "string | null (raza si se menciona)",
  "gender": "male" | "female" | null,
  "colors": ["string"],
  "location": "string | null",
  "phone": "string | null",
  "confidence": 0-100,
  "summary": "string (máx 200 chars, español)",
  "comments": [
    {
      "text": "string",
      "classification": "sighting" | "reunion" | "info" | "irrelevant"
    }
  ]
}

Reglas:
- lost = publicacion reportando mascota perdida
- found = publicacion reportando mascota encontrada
- sighting = alguien vio la mascota (tipicamente en comentarios)
- reunion = la mascota ya aparecio / fue encontrada
- other = no es sobre mascota perdida/encontrada
- species: determinar por las imágenes si es posible (perro, gato, otro), si no se puede determinar, null
- name: extraer el nombre de la mascota si aparece en el texto
- breed: extraer la raza si se menciona (ej. "labrador", "criollo", "pastor aleman")
- gender: male si menciona "macho" o "varon", female si menciona "hembra" o "perra" o "gata"
- confidence: 0-100 que tan seguro estás
- No incluyas la URL del post ni metadatos de Facebook en el summary`;

async function groqCreateWithRetry(params, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await groq.chat.completions.create(params);
    } catch (err) {
      if (attempt < retries && (err.status === 429 || err.message?.includes('rate_limit') || err.message?.includes('quota'))) {
        const wait = Math.pow(2, attempt) * 1000;
        console.warn(`Groq rate limited (attempt ${attempt + 1}), retrying in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
}

export async function classifyPost(text, imageUrls, comments = [], imageBuffers = []) {
  if (!groq) return fallbackClassification(text);

  const commentsText = comments.map(c => `- ${c.author}: "${c.text}"`).join('\n');

  try {
    const hasImages = (imageBuffers && imageBuffers.length > 0) || (imageUrls && imageUrls.some(u => u && u.startsWith('http')));

    if (hasImages) {
      const userContent = [];
      userContent.push({
        type: 'text',
        text: `${CLASSIFICATION_PROMPT}\n\nPost:\n${text || '(sin texto)'}\n\nComentarios:\n${commentsText || '(sin comentarios)'}`,
      });

      if (imageBuffers && imageBuffers.length > 0) {
        for (const buf of imageBuffers.slice(0, 3)) {
          userContent.push({
            type: 'image_url',
            image_url: { url: `data:${buf.mimeType || 'image/jpeg'};base64,${buf.data}` },
          });
        }
      } else if (imageUrls && imageUrls.length > 0) {
        for (const url of imageUrls.filter(u => u && u.startsWith('http')).slice(0, 3)) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, signal: controller.signal });
            clearTimeout(timeout);
            if (resp.ok) {
              const buf = Buffer.from(await resp.arrayBuffer());
              userContent.push({
                type: 'image_url',
                image_url: { url: `data:${resp.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}` },
              });
            }
          } catch (e) {
            console.warn('classifyPost: fallo al descargar imagen', url, e.message);
          }
        }
      }

      const result = await groqCreateWithRetry({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'user', content: userContent }],
        temperature: 0,
        max_tokens: 1000,
      });
      let raw = result.choices[0]?.message?.content || '{}';
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      return parseResponse(raw);
    }

    const result = await groqCreateWithRetry({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: `${CLASSIFICATION_PROMPT}\n\nPost:\n${text || '(sin texto)'}\n\nComentarios:\n${commentsText || '(sin comentarios)'}` }],
      temperature: 0,
      max_tokens: 1000,
    });
    let raw = result.choices[0]?.message?.content || '{}';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    return parseResponse(raw);
  } catch (err) {
    console.error('Groq classifyPost error:', err.message);
    return fallbackClassification(text);
  }
}

function parseResponse(raw) {
  const result = JSON.parse(raw);
  return {
    classification: ['lost', 'found', 'sighting', 'reunion', 'other'].includes(result.classification) ? result.classification : 'other',
    species: ['dog', 'cat', 'other', null].includes(result.species) ? result.species : null,
    species_other: result.species_other || null,
    name: result.name || null,
    breed: result.breed || null,
    gender: ['male', 'female', null].includes(result.gender) ? result.gender : null,
    color: Array.isArray(result.colors) ? result.colors.join(', ') : null,
    colors: Array.isArray(result.colors) ? result.colors : [],
    location_hint: result.location || null,
    phone: result.phone || null,
    confidence: Math.min(100, Math.max(0, result.confidence || 0)),
    location_lat: null,
    location_lng: null,
    comments: Array.isArray(result.comments) ? result.comments.map(c => ({
      text: c.text || '',
      classification: ['sighting', 'reunion', 'info', 'irrelevant'].includes(c.classification) ? c.classification : 'info',
    })) : [],
  };
}

function fallbackClassification(text) {
  const lower = (text || '').toLowerCase();
  const negationLost = /(?:no\s+aparec|no\s+apareci|no\s+encontr|no\s+vuelve|no\s+regres|no\s+aparecio)/;
  const lostWords = ['perd', 'perdi', 'escap', 'busco', 'busca', 'desapareci', 'no aparece', 'se nos fue', 'fug', 'extravi'];
  const foundWords = ['encontr', 'rescata', 'recog', 'hall', 'lo encontre', 'la encontre'];
  const reunionWords = ['ya aparecio', 'ya esta en casa', 'volvi', 'regres', 'gracias a todos', 'ya lo encontr', 'ya la encontr'];
  const sightingWords = ['vi ', 'visto', 'vi a', 'lo vi', 'la vi', 'avistar', 'lo vi en', 'la vi en'];

  let classification = 'other';
  if (negationLost.test(lower)) {
    classification = 'lost';
  } else if (reunionWords.some(w => lower.includes(w))) {
    classification = 'reunion';
  } else if (lostWords.some(w => lower.includes(w))) {
    classification = 'lost';
  } else if (foundWords.some(w => lower.includes(w))) {
    classification = 'found';
  } else if (sightingWords.some(w => lower.includes(w))) {
    classification = 'sighting';
  }

  const dogWords = ['perr', 'can', 'cachorr'];
  const catWords = ['gat', 'felino', 'mich'];

  let species = null;
  if (dogWords.some(w => lower.includes(w))) species = 'dog';
  else if (catWords.some(w => lower.includes(w))) species = 'cat';

  const phoneMatch = text.match(/(\d{7,15})/);
  const phone = phoneMatch ? phoneMatch[1] : null;

  return {
    classification,
    species,
    species_other: null,
    color: null,
    colors: [],
    location_hint: null,
    phone,
    confidence: classification === 'other' ? 0 : 30,
    location_lat: null,
    location_lng: null,
    comments: [],
  };
}
