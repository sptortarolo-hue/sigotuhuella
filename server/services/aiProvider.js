import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';

const groq = GROQ_API_KEY ? new Groq({ apiKey: GROQ_API_KEY }) : null;

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
    console.log(`[aiProvider] Gemini 429, cooldown 5min until ${new Date(geminiCooldownUntil).toISOString()}`);
  } else if (msg.includes('403') || msg.includes('quota') || msg.includes('exhausted')) {
    geminiCooldownUntil = Date.now() + COOLDOWN_QUOTA;
    console.log(`[aiProvider] Gemini quota exhausted, cooldown 60min until ${new Date(geminiCooldownUntil).toISOString()}`);
  }
}

async function callOpenRouter(model, messages, options = {}) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY no configurada');

  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0,
    max_tokens: options.max_tokens ?? 1000,
  };
  if (options.responseFormat) {
    body.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 429) throw new Error('OpenRouter 429 rate limited');
      throw new Error(`OpenRouter ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

async function callNVIDIA(model, messages, options = {}) {
  if (!NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY no configurada');

  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0,
    max_tokens: options.max_tokens ?? 1000,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 429) throw new Error('NVIDIA 429 rate limited');
      throw new Error(`NVIDIA ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

async function callGroqDirect(model, messages, options = {}) {
  if (!groq) throw new Error('Groq no configurado');

  const result = await groq.chat.completions.create({
    model,
    messages,
    temperature: options.temperature ?? 0,
    max_tokens: options.max_tokens ?? 1000,
  });

  return result.choices?.[0]?.message?.content || '';
}

async function callGeminiDirect(systemPrompt, prompt) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');
  if (!isGeminiAvailable()) throw new Error('Gemini en cooldown');

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite',
      contents: systemPrompt + '\n\n' + prompt,
      config: { responseMimeType: 'application/json' },
    });
    return response.text;
  } catch (err) {
    handleGeminiError(err);
    throw err;
  }
}

function chain(providers) {
  return async (...args) => {
    const errors = [];
    for (const { name, call } of providers) {
      try {
        const text = await call(...args);
        if (text) return { text, provider: name };
      } catch (err) {
        console.warn(`[aiProvider] ${name} falló: ${err.message}`);
        errors.push(`${name}: ${err.message}`);
      }
    }
    throw new Error(`Todos los proveedores fallaron: ${errors.join('; ')}`);
  };
}

const CLASSIFICATION_CHAIN_WITH_IMAGES = chain([
  { name: 'OpenRouter Scout', call: (m) => callOpenRouter('meta-llama/llama-4-scout-17b-16e-instruct', m, { max_tokens: 1000 }) },
  { name: 'NVIDIA 70B', call: (m) => callNVIDIA('meta/llama-3.3-70b-instruct', m, { max_tokens: 1000 }) },
  { name: 'Groq Scout', call: (m) => callGroqDirect('meta-llama/llama-4-scout-17b-16e-instruct', m, { max_tokens: 1000 }) },
  { name: 'OpenRouter 70B', call: (m) => callOpenRouter('meta-llama/llama-3.3-70b-instruct', m, { max_tokens: 1000 }) },
  { name: 'Groq 70B', call: (m) => callGroqDirect('llama-3.3-70b-versatile', m, { max_tokens: 1000 }) },
]);

const CLASSIFICATION_CHAIN_TEXT = chain([
  { name: 'OpenRouter 70B', call: (m) => callOpenRouter('meta-llama/llama-3.3-70b-instruct', m, { max_tokens: 1000 }) },
  { name: 'NVIDIA 70B', call: (m) => callNVIDIA('meta/llama-3.3-70b-instruct', m, { max_tokens: 1000 }) },
  { name: 'Groq 70B', call: (m) => callGroqDirect('llama-3.3-70b-versatile', m, { max_tokens: 1000 }) },
  { name: 'OpenRouter Scout', call: (m) => callOpenRouter('meta-llama/llama-4-scout-17b-16e-instruct', m, { max_tokens: 1000 }) },
  { name: 'Groq Scout', call: (m) => callGroqDirect('meta-llama/llama-4-scout-17b-16e-instruct', m, { max_tokens: 1000 }) },
]);

const MATCHING_CHAIN = chain([
  { name: 'Gemini', call: (sys, p) => callGeminiDirect(sys, p) },
  { name: 'OpenRouter 70B', call: (sys, p) => callOpenRouter('meta-llama/llama-3.3-70b-instruct', [{ role: 'user', content: sys + '\n\n' + p }], { max_tokens: 1000 }) },
  { name: 'NVIDIA 70B', call: (sys, p) => callNVIDIA('meta/llama-3.3-70b-instruct', [{ role: 'user', content: sys + '\n\n' + p }], { max_tokens: 1000 }) },
  { name: 'Groq Scout', call: (sys, p) => callGroqDirect('meta-llama/llama-4-scout-17b-16e-instruct', [{ role: 'user', content: sys + '\n\n' + p }], { max_tokens: 1000 }) },
]);

const IMAGE_CAPTION_CHAIN = chain([
  { name: 'Groq Scout', call: (m) => callGroqDirect('meta-llama/llama-4-scout-17b-16e-instruct', m, { max_tokens: 1000 }) },
  { name: 'OpenRouter Scout', call: (m) => callOpenRouter('meta-llama/llama-4-scout-17b-16e-instruct', m, { max_tokens: 1000 }) },
]);

const TEXT_INTENT_CHAIN = chain([
  { name: 'Groq 70B', call: (m) => callGroqDirect('llama-3.3-70b-versatile', m, { max_tokens: 10 }) },
  { name: 'OpenRouter 70B', call: (m) => callOpenRouter('meta-llama/llama-3.3-70b-instruct', m, { max_tokens: 10 }) },
  { name: 'NVIDIA 70B', call: (m) => callNVIDIA('meta/llama-3.3-70b-instruct', m, { max_tokens: 10 }) },
]);

const FACE_CROP_CHAIN = chain([
  { name: 'Groq Scout', call: (m) => callGroqDirect('meta-llama/llama-4-scout-17b-16e-instruct', m, { max_tokens: 200 }) },
  { name: 'OpenRouter Scout', call: (m) => callOpenRouter('meta-llama/llama-4-scout-17b-16e-instruct', m, { max_tokens: 200 }) },
]);

export async function classificationAI(messages, hasImages) {
  const fn = hasImages ? CLASSIFICATION_CHAIN_WITH_IMAGES : CLASSIFICATION_CHAIN_TEXT;
  return fn(messages);
}

export async function matchingAI(systemPrompt, prompt) {
  return MATCHING_CHAIN(systemPrompt, prompt);
}

export async function imageCaptionAI(messages) {
  return IMAGE_CAPTION_CHAIN(messages);
}

export async function textIntentAI(messages) {
  return TEXT_INTENT_CHAIN(messages);
}

export async function faceCropAI(messages) {
  return FACE_CROP_CHAIN(messages);
}
