import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CF_MODEL = process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';

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
    model: 'gemini-2.5-flash',
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
