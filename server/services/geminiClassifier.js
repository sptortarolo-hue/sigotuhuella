import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let geminiCooldownUntil = 0;

function isGeminiAvailable() { return Date.now() > geminiCooldownUntil; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

export async function classifyPost(text, imageUrls, comments = [], imageBuffers = []) {
  if (!GEMINI_API_KEY) return fallbackClassification(text);
  if (!isGeminiAvailable()) {
    console.log(`classifyPost: en cooldown hasta ${new Date(geminiCooldownUntil).toISOString()}`);
    return fallbackClassification(text);
  }

  const commentsText = comments.map(c => `- ${c.author}: "${c.text}"`).join('\n');
  const promptText = `${CLASSIFICATION_PROMPT}\n\nPost:\n${text || '(sin texto)'}\n\nComentarios:\n${commentsText || '(sin comentarios)'}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      const parts = [{ text: promptText }];

      if (imageBuffers && imageBuffers.length > 0) {
        for (const buf of imageBuffers.slice(0, 3)) {
          parts.push({ inlineData: { data: buf.data, mimeType: buf.mimeType || 'image/jpeg' } });
        }
      } else if (imageUrls && imageUrls.length > 0) {
        for (const url of imageUrls.filter(u => u && u.startsWith('http')).slice(0, 3)) {
          parts.push({ fileData: { fileUri: url, mimeType: 'image/jpeg' } });
        }
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-lite',
        contents: [{ role: 'user', parts }],
        config: { responseMimeType: 'application/json' },
      });

      const result = JSON.parse(response.text);
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
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted') || msg.includes('rate')) {
        if (msg.includes('quota') || msg.includes('exhausted')) {
          geminiCooldownUntil = Date.now() + 60 * 60 * 1000;
          console.log(`classifyPost: cuota agotada, cooldown 60min hasta ${new Date(geminiCooldownUntil).toISOString()}`);
        } else {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`classifyPost: 429 (intento ${attempt}/3), esperando ${delay}ms`);
          await sleep(delay);
          continue;
        }
      }
      console.error('Gemini classification error:', err.message);
      return fallbackClassification(text);
    }
  }
  return fallbackClassification(text);
}

function fallbackClassification(text) {
  const lower = (text || '').toLowerCase();
  const lostWords = ['perd', 'perdi', 'escap', 'busco', 'busca', 'desapareci'];
  const foundWords = ['encontr', 'apareci', 'rescata', 'recog', 'hall'];
  const reunionWords = ['apareci', 'encontr', 'volvi', 'regres', 'ya esta', 'gracias a todos'];
  const sightingWords = ['vi', 'visto', 'vi a', 'lo vi', 'la vi', 'avistar'];

  let classification = 'other';
  if (reunionWords.some(w => lower.includes(w)) && foundWords.some(w => lower.includes(w))) {
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
