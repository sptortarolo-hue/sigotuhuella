const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_MODEL = '@cf/meta/llama-3.2-3b-instruct';

const CLASSIFICATION_PROMPT = `Eres un clasificador de publicaciones de Facebook sobre mascotas perdidas y encontradas para la app "Sigo Tu Huella".
Analizá el post y los comentarios asociados. Devolvé SOLO un JSON válido sin markdown ni explicaciones:

{
  "classification": "lost" | "found" | "sighting" | "reunion" | "other",
  "species": "dog" | "cat" | "other" | null,
  "species_other": "string | null",
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
- species: si no se puede determinar, null
- confidence: 0-100 que tan seguro estás
- No incluyas la URL del post ni metadatos de Facebook en el summary`;

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

function fallbackClassification(text) {
  const lower = (text || '').toLowerCase();
  const lostWords = ['perd', 'perdi', 'escap', 'busco', 'busca', 'desapareci'];
  const foundWords = ['encontr', 'apareci', 'rescata', 'recog', 'hall'];
  const reunionWords = ['apareci', 'encontr', 'volvi', 'regres', 'ya esta', 'gracias a todos'];
  const sightingWords = ['vi', 'visto', 'vi a', 'lo vi', 'la vi', 'avistar'];
  let classification = 'other';
  if (reunionWords.some(w => lower.includes(w)) && foundWords.some(w => lower.includes(w))) classification = 'reunion';
  else if (lostWords.some(w => lower.includes(w))) classification = 'lost';
  else if (foundWords.some(w => lower.includes(w))) classification = 'found';
  else if (sightingWords.some(w => lower.includes(w))) classification = 'sighting';
  const dogWords = ['perr', 'can', 'cachorr'];
  const catWords = ['gat', 'felino', 'mich'];
  let species = null;
  if (dogWords.some(w => lower.includes(w))) species = 'dog';
  else if (catWords.some(w => lower.includes(w))) species = 'cat';
  const phoneMatch = text.match(/(\d{7,15})/);
  const phone = phoneMatch ? phoneMatch[1] : null;
  return {
    classification, species, species_other: null, color: null, colors: [],
    location_hint: null, phone, confidence: classification === 'other' ? 0 : 30,
    location_lat: null, location_lng: null, comments: [],
  };
}

export async function classifyPost(text, imageUrls, comments = []) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return fallbackClassification(text);

  const commentsText = comments.map(c => `- ${c.author}: "${c.text}"`).join('\n');
  let imagePart = '';
  if (imageUrls && imageUrls.length > 0) {
    const validUrls = imageUrls.filter(u => u && u.startsWith('http'));
    if (validUrls.length > 0) {
      imagePart = `\n\nImagenes del post:\n${validUrls.slice(0, 3).map(u => `[Imagen: ${u}]`).join('\n')}`;
    }
  }

  const prompt = `${CLASSIFICATION_PROMPT}\n\nPost:\n${text || '(sin texto)'}${imagePart}\n\nComentarios:\n${commentsText || '(sin comentarios)'}`;

  try {
    const responseText = await callCloudflare(prompt);
    const cleaned = responseText.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim();
    const result = JSON.parse(cleaned);
    return {
      classification: ['lost', 'found', 'sighting', 'reunion', 'other'].includes(result.classification) ? result.classification : 'other',
      species: ['dog', 'cat', 'other', null].includes(result.species) ? result.species : null,
      species_other: result.species_other || null,
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
  } catch (err) {
    console.error('Cloudflare classification error:', err.message);
    return fallbackClassification(text);
  }
}
