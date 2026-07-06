import fs from 'fs';
import path from 'path';
import { getGlobalStats } from './videoAssembler.js';
import { getPetPhotos } from '../services/pexelsService.js';

const SCREENSHOTS_DIR = path.join(process.env.PUBLIC_DIR || 'public', 'generated', 'screenshots');

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
      }
    } else if (scene.type === 'pexels') {
      const photos = await getPetPhotos(1);
      if (photos.length > 0) {
        let overlayText = scene.overlayText || '';
        overlayText = overlayText.replace(/\{(\w+)\}/g, (_, key) => stats[key] !== undefined ? String(stats[key]) : key);
        resolvedScenes.push({
          type: 'photo',
          imageBase64: photos[0],
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
