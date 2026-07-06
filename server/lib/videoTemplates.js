import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getGlobalStats } from './videoAssembler.js';
import { getPetPhotos } from '../services/pexelsService.js';

const SCREENSHOTS_DIR = path.join(process.env.PUBLIC_DIR || 'public', 'generated', 'screenshots');
const PLACEHOLDERS_DIR = path.join(process.env.PUBLIC_DIR || 'public', 'generated', 'placeholders');

if (!fs.existsSync(PLACEHOLDERS_DIR)) {
  fs.mkdirSync(PLACEHOLDERS_DIR, { recursive: true });
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const PLACEHOLDER_W = 540;
const PLACEHOLDER_H = 960;

async function getPlaceholder(overlayText, label) {
  const cachePath = path.join(PLACEHOLDERS_DIR, `${label}.png`);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath).toString('base64');
  }
  const svg = `<svg width="${PLACEHOLDER_W}" height="${PLACEHOLDER_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#7c6f5b"/>
        <stop offset="100%" stop-color="#5a4f3f"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="${PLACEHOLDER_W / 2}" y="${PLACEHOLDER_H / 2 - 20}" font-family="sans-serif" font-size="24" fill="white" text-anchor="middle" font-weight="bold">${escapeXml(overlayText)}</text>
    <text x="${PLACEHOLDER_W / 2}" y="${PLACEHOLDER_H / 2 + 30}" font-family="sans-serif" font-size="16" fill="rgba(255,255,255,0.5)" text-anchor="middle">Sigo Tu Huella</text>
  </svg>`;
  try {
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    fs.writeFileSync(cachePath, buf);
    return buf.toString('base64');
  } catch (err) {
    console.error(`[Placeholder] sharp failed for '${label}':`, err.message);
    return '';
  }
}

const TEMPLATES = {
  'app-showcase': {
    name: 'App Showcase',
    description: 'Muestra la app funcionando con screenshots reales mezclados con fotos de mascotas',
    style: 'informative',
    music: 'calm',
    voices: ['elena'],
    scenes: [
      { type: 'screenshot', label: 'home', overlayText: 'Encontrá mascotas perdidas cerca tuyo en segundos' },
      { type: 'pexels', overlayText: 'Más de {users} vecinos ya confían en Sigo Tu Huella' },
      { type: 'screenshot', label: 'pet-detail', overlayText: 'Cada perfil tiene datos, fotos y ubicación' },
      { type: 'screenshot', label: 'dashboard', overlayText: 'Seguí cada paso desde tu panel de control' },
    ],
    generateScript: (stats) =>
      `¿Perdiste a tu mascota? En Sigo Tu Huella, más de ${stats.users} vecinos ayudan a reunir familias. ` +
      `Ya logramos ${stats.reunited} reencuentros exitosos. ` +
      `Descargá la app y sé parte de esta comunidad que devuelve sonrisas.`,
  },
  'app-success': {
    name: 'Historias de Éxito',
    description: 'Mascotas reencontradas gracias a la comunidad',
    style: 'emotive',
    music: 'emotional',
    voices: ['elena'],
    scenes: [
      { type: 'pexels', overlayText: 'Más de {reunited} mascotas ya volvieron a casa' },
      { type: 'screenshot', label: 'feed', overlayText: 'La comunidad se moviliza al instante' },
      { type: 'screenshot', label: 'diffusion', overlayText: 'Compartí y ayudá a difundir' },
    ],
    generateScript: (stats) =>
      `Cada reencuentro es una historia de amor y comunidad. ` +
      `Ya reunimos más de ${stats.reunited} mascotas con sus familias gracias a ${stats.users} vecinos ` +
      `que usan Sigo Tu Huella. Sé parte de esta red que no descansa hasta volver a encontrarlos.`,
  },
  'app-feature': {
    name: 'Funcionalidad Destacada',
    description: 'Muestra una funcionalidad específica de la app',
    style: 'viral',
    music: 'energetic',
    voices: ['elena', 'tomas'],
    scenes: [
      { type: 'screenshot', label: 'qr-profile', overlayText: 'Cada mascota tiene su código QR único' },
      { type: 'pexels', overlayText: 'Escaneá y accedé al perfil al instante' },
      { type: 'screenshot', label: 'report-lost', overlayText: 'Reportá en segundos desde cualquier lugar' },
    ],
    generateScript: (stats) =>
      `La chapita QR de Sigo Tu Huella es la identidad digital de tu mascota. ` +
      `Más de ${stats.users} vecinos ya la usan. Escaneá con tu celular y accedé al perfil completo ` +
      `con datos, fotos y contacto del dueño. Pedí la tuya en sigotuhuella.online.`,
  },
  'app-adoption': {
    name: 'Adopción Responsable',
    description: 'Mascotas esperando un hogar, galería de adopción',
    style: 'emotive',
    music: 'emotional',
    voices: ['elena'],
    scenes: [
      { type: 'pexels', overlayText: '{total_pets} mascotas registradas esperan un hogar' },
      { type: 'screenshot', label: 'adoption', overlayText: 'Encontrá a tu próximo compañero' },
      { type: 'pexels', overlayText: 'Adoptar es amor que transforma vidas' },
    ],
    generateScript: (stats) =>
      `Más de ${stats.total_pets} mascotas están registradas en Sigo Tu Huella, y muchas esperan un hogar. ` +
      `Visitá nuestra galería de adopción, conocé sus historias y animate a abrir tu corazón. ` +
      `Adoptar transforma dos vidas: la de ellxs y la tuya. Ingresá en sigotuhuella.online.`,
  },
  'app-lost': {
    name: 'Mascotas Perdidas',
    description: 'Cómo reportar y ayudar a encontrar mascotas perdidas',
    style: 'informative',
    music: 'calm',
    voices: ['elena', 'tomas'],
    scenes: [
      { type: 'screenshot', label: 'lost-pets', overlayText: 'Mascotas perdidas cerca tuyo' },
      { type: 'pexels', overlayText: 'Reportá en segundos y ayudá a difundir' },
      { type: 'screenshot', label: 'report-lost', overlayText: 'Creá un reporte con foto y ubicación' },
    ],
    generateScript: (stats) =>
      `Si perdiste o encontraste una mascota, reportalo al instante en Sigo Tu Huella. ` +
      `Con más de ${stats.users} vecinos conectados, las chances de reencontrarse crecen. ` +
      `Ya logramos ${stats.reunited} reencuentros. Descargá la app desde sigotuhuella.online.`,
  },
};

export function getTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({
    id,
    name: t.name,
    description: t.description,
    style: t.style,
    music: t.music,
    voices: t.voices,
    sceneCount: t.scenes.length,
  }));
}

export async function resolveTemplate(templateId, options = {}) {
  const template = TEMPLATES[templateId];
  if (!template) throw new Error(`Template '${templateId}' not found`);

  const stats = await getGlobalStats();
  const resolvedScenes = [];

  for (const scene of template.scenes) {
    if (scene.type === 'screenshot') {
      const pngPath = path.join(SCREENSHOTS_DIR, `${scene.label}.png`);
      const jpgPath = path.join(SCREENSHOTS_DIR, `${scene.label}.jpg`);
      const filePath = fs.existsSync(pngPath) ? pngPath : (fs.existsSync(jpgPath) ? jpgPath : null);
      if (filePath) {
        const base64 = fs.readFileSync(filePath).toString('base64');
        resolvedScenes.push({
          type: 'photo',
          imageBase64: base64,
          overlayText: scene.overlayText || '',
        });
      } else {
        console.warn(`[Template] Screenshot '${scene.label}' not found at ${pngPath}, using placeholder`);
        const base64 = await getPlaceholder(scene.overlayText || template.name, scene.label);
        if (base64) {
          resolvedScenes.push({
            type: 'photo',
            imageBase64: base64,
            overlayText: scene.overlayText || '',
          });
        }
      }
    } else if (scene.type === 'pexels') {
      let overlayText = scene.overlayText || '';
      overlayText = overlayText.replace(/\{(\w+)\}/g, (_, key) => stats[key] !== undefined ? String(stats[key]) : key);
      let photoBase64 = '';
      try {
        const photos = await getPetPhotos(1);
        if (photos.length > 0) photoBase64 = photos[0];
      } catch (err) {
        console.warn(`[Template] Pexels fetch failed:`, err.message);
      }
      if (!photoBase64) {
        console.warn(`[Template] No Pexels photo available, using placeholder`);
        photoBase64 = await getPlaceholder(overlayText, `pexels-${templateId}-${resolvedScenes.length}`);
      }
      if (photoBase64) {
        resolvedScenes.push({
          type: 'photo',
          imageBase64: photoBase64,
          overlayText,
        });
      }
    }
  }

  let voiceScript = '';
  if (template.generateScript) {
    voiceScript = template.generateScript(stats);
  }

  return {
    style: options.style || template.style,
    music: options.music || template.music,
    voices: options.voices || template.voices,
    voiceScript,
    scenes: resolvedScenes,
  };
}
