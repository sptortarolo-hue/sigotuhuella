import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_MODEL = process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
const VIDEO_GROQ_MODEL = process.env.VIDEO_GROQ_MODEL || 'openai/gpt-oss-20b';

const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

const PROMPT_TEMPLATES = {
  consejo_cuidado: `Generá un artículo sobre cuidado de mascotas en español argentino.
Tema sugerido: {topic}
Respondé ÚNICAMENTE con un objeto JSON válido con dos campos: "title" (máx 60 caracteres) y "content" (3 a 5 párrafos, tono cálido y educativo).
Firmado al final del content: "— Sigo Tu Huella"`,
  historia_adopcion: `Generá una historia emotiva sobre adopción responsable en español argentino.
Tema: {topic}
Respondé ÚNICAMENTE con un objeto JSON válido con dos campos: "title" (emotivo, máx 60 caracteres) y "content" (3 a 4 párrafos).
Firmado al final del content: "— Sigo Tu Huella"`,
  tips_bienestar: `Generá tips de bienestar animal en español argentino.
Tema: {topic}
Respondé ÚNICAMENTE con un objeto JSON válido con dos campos: "title" (llamativo, máx 60 caracteres) y "content" (título + 5 tips en formato texto con emojis, cada tip en una línea separada).
Firmado al final del content: "— Sigo Tu Huella"`,
  dato_curioso: `Generá un dato curioso sobre animales en español argentino.
Tema: {topic}
Respondé ÚNICAMENTE con un objeto JSON válido con dos campos: "title" (llamativo, máx 60 caracteres) y "content" (2 a 3 párrafos interesantes).
Firmado al final del content: "— Sigo Tu Huella"`,
};

const IMAGE_PROMPTS = {
  consejo_cuidado: 'Fotografía cálida y profesional de una mascota doméstica siendo cuidada por una persona, colores suaves, estilo realista, iluminación natural, apto para artículo de bienestar animal',
  historia_adopcion: 'Fotografía emotiva de una familia adoptando un perro o gato, sonrisas genuinas, ambiente hogareño cálido, estilo realista, colores vibrantes',
  tips_bienestar: 'Ilustración colorida de mascotas felices, perros y gatos jugando, estilo moderno y amigable, colores brillantes, apto para redes sociales',
  dato_curioso: 'Fotografía de un animal en la naturaleza, detalle interesante, colores ricos, estilo documental, composición atractiva',
};

export async function generateText(type, topic = '') {
  const template = PROMPT_TEMPLATES[type];
  if (!template) throw new Error(`Tipo inválido: ${type}`);

  const prompt = template.replace('{topic}', topic || 'mascotas en general');
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  const text = response.text;
  if (!text) throw new Error('Respuesta vacía de Gemini');

  try {
    const parsed = JSON.parse(text);
    return {
      title: parsed.title || 'Artículo',
      content: parsed.content || text,
    };
  } catch {
    const lines = text.split('\n').filter(Boolean);
    return {
      title: lines[0] || 'Artículo',
      content: lines.slice(1).join('\n') || text,
    };
  }
}

export async function generateImage(prompt) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN requeridos en .env');
  }

  const fullPrompt = IMAGE_PROMPTS[prompt] || prompt;
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      steps: 1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const isQuota = response.status === 429 || errText.includes('limit') || errText.includes('quota') || errText.includes('neurons');
    const msg = isQuota ? 'Cuota de Cloudflare AI agotada. La imagen de portada se generará con un placeholder. Vuelve a intentar mañana o reduce el uso. ' + errText : `Cloudflare AI error (${response.status}): ${errText}`;
    throw new Error(msg);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');

  return {
    imageData: base64,
    mimeType: contentType,
  };
}

export function getImagePromptForType(type) {
  return IMAGE_PROMPTS[type] || 'Fotografía de mascotas, estilo realista, colores cálidos';
}

export async function generateVideoContent(topic, style, numScenes, sceneDescriptions = null) {
  if (!groq) throw new Error('GROQ_API_KEY requerida para generación de video');

  const styleInstructions = {
    emotive: 'Tono emotivo y conmovedor. Frases cortas que toquen el corazón.',
    informative: 'Tono informativo y claro. Datos concretos y útiles.',
    viral: 'Tono enérgico y llamativo. Frases de impacto, urgencia, con emojis.',
  };

  const hasSceneDescriptions = sceneDescriptions && sceneDescriptions.length > 0;

  let sceneContext = '';
  if (hasSceneDescriptions) {
    sceneContext = `\n\nEscenas reales seleccionadas (usá esta info para crear los textos):\n`;
    sceneDescriptions.forEach((desc, i) => {
      sceneContext += `Escena ${i + 1}: ${desc}\n`;
    });
    sceneContext += `\n- overlayTexts: exactamente ${sceneDescriptions.length} textos cortos contextualizados para cada escena real. Relacioná cada texto con la escena correspondiente.\n- imagePrompts: NO generes imagePrompts (dejá el array vacío []). Las imágenes son fotos reales.`;
  }

  const prompt = `Sos un creativo publicitario argentino que hace reels promocionales para una app de mascotas llamada "Sigo Tu Huella".

Tema del video: ${topic || 'Mascotas perdidas que vuelven a casa gracias a la comunidad'}
Estilo: ${style} — ${styleInstructions[style] || styleInstructions.emotive}
Cantidad de escenas con foto: ${numScenes}
${sceneContext}

Respondé ÚNICAMENTE con un objeto JSON válido con esta estructura exacta:
{
  "voiceScript": "Texto completo para la voz en off. Máximo 25 segundos hablados. En español argentino, natural y fluido. Terminar con 'Descargá Sigo Tu Huella gratis en sigotuhuella.online'",
  "overlayTexts": ["Texto corto para escena 1", "Texto para escena 2", ...],
  "imagePrompts": ${hasSceneDescriptions ? '[]' : `["prompt en inglés para generar imagen de escena 1", "prompt para escena 2", ...]`}
}

Reglas:
- voiceScript: texto natural para voz en off, sin emojis, sin comillas, sin formato markdown. Separá los párrafos con doble salto de línea (\\n\\n) para alternar entre voces cuando se usan dos voces. Cada párrafo es un bloque con sentido completo.
- overlayTexts: exactamente ${numScenes} textos cortos (máx 8 palabras cada uno) que aparecen en pantalla, uno por escena de foto
${hasSceneDescriptions ? '- imagePrompts: array vacío [] porque las imágenes son fotos reales' : '- imagePrompts: exactamente ' + numScenes + ' prompts en INGLÉS para generar imágenes con IA (Flux). Cada prompt debe describir una escena visual concreta, fotorrealista, con iluminación cinematográfica. NO incluir texto en las imágenes. Estilo: fotografía profesional, colores cálidos, 4K quality.'}`;

  const response = await groq.chat.completions.create({
    model: VIDEO_GROQ_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  const text = response.choices?.[0]?.message?.content;
  if (!text) throw new Error('Respuesta vacía de Groq');

  try {
    const parsed = JSON.parse(text);
    return {
      voiceScript: parsed.voiceScript || '',
      overlayTexts: Array.isArray(parsed.overlayTexts) ? parsed.overlayTexts : [],
      imagePrompts: Array.isArray(parsed.imagePrompts) ? parsed.imagePrompts : [],
    };
  } catch {
    return { voiceScript: text, overlayTexts: [], imagePrompts: [] };
  }
}

export async function generateImagePollinations(prompt) {
  const seed = Math.floor(Math.random() * 999999);
  const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Pollinations ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    imageData: buffer.toString('base64'),
    mimeType: 'image/png',
  };
}

export async function generateVideoImages(imagePrompts) {
  const images = [];
  for (const prompt of imagePrompts) {
    let imageData = null;
    try {
      const result = await generateImagePollinations(prompt);
      imageData = result.imageData;
    } catch (err) {
      console.warn('Pollinations image gen failed:', err.message);
    }
    images.push(imageData);
  }
  return images;
}
