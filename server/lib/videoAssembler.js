import Editly from 'editly';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import pool from '../db.js';

const PUBLIC_DIR = process.env.PUBLIC_DIR || 'public';
const PROJECT_ROOT = process.env.PWD || process.cwd();
const VIDEO_OUTPUT_DIR = path.join(PROJECT_ROOT, PUBLIC_DIR, 'generated', 'videos');
const MUSIC_DIR = path.join(PROJECT_ROOT, PUBLIC_DIR, 'generated', 'music');
const LOGO_PATH = path.join(PROJECT_ROOT, PUBLIC_DIR, 'sigotuhuella.jpg');
if (!fs.existsSync(VIDEO_OUTPUT_DIR)) fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });

const MUSIC_TRACKS = {
  emotional: path.join(MUSIC_DIR, 'emotional.mp3'),
  latin: path.join(MUSIC_DIR, 'latin.mp3'),
  calm: path.join(MUSIC_DIR, 'calm.mp3'),
  energetic: path.join(MUSIC_DIR, 'energetic.mp3'),
};

const FORMAT_DIMS = {
  vertical: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
  landscape: { w: 1920, h: 1080 },
};

const STYLE_VOICES = {
  emotive: 'es-AR-ElenaNeural',
  informative: 'es-AR-ElenaNeural',
  viral: 'es-AR-ElenaNeural',
};

const STYLE_VOICE_PARAMS = {
  emotive: { rate: '-10%', pitch: '-5%' },
  informative: { rate: '+0%', pitch: '+0%' },
  viral: { rate: '+15%', pitch: '+3%' },
};

const STYLE_TRANSITIONS = {
  emotive: { name: 'fade', duration: 0.5 },
  informative: { name: 'directional-left', duration: 0.5 },
  viral: { name: 'fade', duration: 0.5 },
};

const STYLE_ZOOM = {
  emotive: { zoomDirection: 'in', zoomAmount: 0.15 },
  informative: { zoomDirection: null, zoomAmount: 0 },
  viral: { zoomDirection: 'out', zoomAmount: 0.2 },
};

const OPENING_DUR = 3;
const CLOSING_DUR = 3;
const FPS = 25;

let speechSdkPromise = null;
async function getSpeechSdk() {
  if (!process.env.AZURE_TTS_KEY || !process.env.AZURE_TTS_REGION) return null;
  if (!speechSdkPromise) {
    try {
      const sdk = await import('microsoft-cognitiveservices-speech-sdk');
      speechSdkPromise = sdk.default || sdk;
    } catch (e) {
      console.warn('Azure Speech SDK not loaded:', e.message);
      speechSdkPromise = null;
    }
  }
  return speechSdkPromise;
}

async function synthesizeREST(ssml, outputPath) {
  const key = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION || 'eastus';
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  console.log('[TTS-REST] POST', url, 'SSML length:', ssml.length);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
    },
    body: ssml,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`REST TTS ${response.status}: ${text.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  const size = fs.statSync(outputPath).size;
  console.log('[TTS-REST] Wrote', outputPath, 'size:', size);
  return size;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSSML(script, voice, params) {
  const { rate, pitch } = params;
  const cleaned = escapeXml(script.trim().replace(/\s+/g, ' '));

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-AR">
<voice name="${voice}">
<prosody rate="${rate}" pitch="${pitch}">
${cleaned}
<break time="600ms"/>
sigotuhuella.online
</prosody>
</voice>
</speak>`;
}

function buildAutoScript(style, stats) {
  const { reunited, users } = stats;
  let script = '';
  if (style === 'emotive') {
    script = 'En Sigo Tu Huella, cada historia de reencuentro nos llena el corazón. ';
    script += `Ya reunimos más de ${reunited} mascotas con sus familias. `;
    script += `Más de ${users} vecinos confían en nosotros. `;
  } else if (style === 'informative') {
    script = '¿Perdiste a tu mascota? ¿Encontraste un animal? ';
    script += 'Sigo Tu Huella es la plataforma que conecta a toda la comunidad. ';
    script += `Contamos con ${users} usuarios activos y ${reunited} reencuentros exitosos. `;
  } else {
    script = '¡La comunidad se mueve! ';
    script += `Más de ${reunited} mascotas ya volvieron a casa. `;
    script += '¿Vos ya descargaste la app? ';
    script += 'Unite a la red que devuelve sonrisas. ';
  }
  script += 'Descargá Sigo Tu Huella gratis en sigotuhuella.online y sé parte del cambio.';
  return script;
}

async function generateTTS(config, voiceScript, workDir) {
  const stats = await getGlobalStats();
  const script = voiceScript || buildAutoScript(config.style, stats);
  console.log('[TTS] generateTTS start — includeVoice:', config.includeVoice, 'script length:', script?.length);

  const ttsPath = path.join(workDir, 'tts.mp3');
  if (!config.includeVoice || !script) return null;

  const voice = STYLE_VOICES[config.style] || STYLE_VOICES.emotive;
  const params = STYLE_VOICE_PARAMS[config.style] || STYLE_VOICE_PARAMS.emotive;
  const ssml = buildSSML(script, voice, params);

  let ttsOk = false;

  if (process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION) {
    try {
      console.log('[TTS] Trying REST API (primary)...');
      const size = await synthesizeREST(ssml, ttsPath);
      if (size > 0) {
        ttsOk = true;
        console.log('[TTS] REST API success, size:', size);
      }
    } catch (err) {
      console.warn('[TTS] REST API failed:', err.message);
    }
  }

  if (!ttsOk) {
    const sdk = await getSpeechSdk();
    if (sdk) {
      try {
        console.log('[TTS] Trying SDK speakSsmlAsync (fallback)...');
        const speechConfig = sdk.SpeechConfig.fromSubscription(
          process.env.AZURE_TTS_KEY,
          process.env.AZURE_TTS_REGION || 'eastus',
        );
        speechConfig.speechSynthesisVoiceName = voice;
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
        const result = await new Promise((resolve, reject) => {
          synthesizer.speakSsmlAsync(ssml, res => resolve(res), err => reject(err));
        });
        synthesizer.close();

        if (result && result.audioData && result.audioData.byteLength > 0
          && result.reason !== sdk.ResultReason.Canceled) {
          fs.writeFileSync(ttsPath, Buffer.from(result.audioData));
          console.log('[TTS] SDK speakSsmlAsync success, byteLength:', result.audioData.byteLength);
          ttsOk = true;
        } else if (result && result.reason === sdk.ResultReason.Canceled) {
          const c = sdk.CancellationDetails.fromResult(result);
          console.warn('[TTS] SDK speakSsmlAsync canceled:', c.reason, c.errorDetails);
        }
      } catch (err) {
        console.warn('[TTS] SDK speakSsmlAsync failed:', err.message);
      }
    }
  }

  if (!ttsOk) {
    const sdk = await getSpeechSdk();
    if (sdk) {
      try {
        console.log('[TTS] Trying SDK speakTextAsync (fallback 2)...');
        const speechConfig = sdk.SpeechConfig.fromSubscription(
          process.env.AZURE_TTS_KEY,
          process.env.AZURE_TTS_REGION || 'eastus',
        );
        speechConfig.speechSynthesisVoiceName = 'es-AR-ElenaNeural';
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
        const result = await new Promise((resolve, reject) => {
          synthesizer.speakTextAsync(script, res => resolve(res), err => reject(err));
        });
        synthesizer.close();

        if (result && result.audioData && result.audioData.byteLength > 0) {
          fs.writeFileSync(ttsPath, Buffer.from(result.audioData));
          console.log('[TTS] SDK speakTextAsync success, byteLength:', result.audioData.byteLength);
          ttsOk = true;
        }
      } catch (err2) {
        console.warn('[TTS] SDK speakTextAsync also failed:', err2.message);
      }
    }
  }

  if (ttsOk && fs.existsSync(ttsPath)) {
    console.log('[TTS] TTS file ready:', ttsPath);
    return ttsPath;
  }

  console.warn('[TTS] All TTS methods failed');
  return null;
}

function getFontPath() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

async function getRandomReunionPhotos(limit = 8) {
  const result = await pool.query(`
    SELECT pi.image_data FROM pet_images pi
    JOIN pets p ON p.id = pi.pet_id
    WHERE p.status = 'reunited'
    ORDER by RANDOM()
    LIMIT $1
  `, [limit]);
  return result.rows.map(r => r.image_data);
}

async function getGlobalStats() {
  const [pets, reunited, users] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM pets'),
    pool.query("SELECT COUNT(*) FROM pets WHERE status = 'reunited'"),
    pool.query('SELECT COUNT(*) FROM users'),
  ]);
  return {
    total_pets: parseInt(pets.rows[0].count),
    reunited: parseInt(reunited.rows[0].count),
    users: parseInt(users.rows[0].count),
  };
}

async function getPetImages(petId) {
  const imgs = await pool.query(
    'SELECT image_data FROM pet_images WHERE pet_id = $1 ORDER BY created_at',
    [petId],
  );
  return imgs.rows.map(r => r.image_data);
}

async function getNewsImage(newsId) {
  const result = await pool.query('SELECT image_data FROM news WHERE id = $1', [newsId]);
  if (result.rows.length > 0 && result.rows[0].image_data) {
    return result.rows[0].image_data;
  }
  return null;
}

function buildOpeningClip(dims, style) {
  const fontPath = getFontPath();
  const isVertical = dims.h > dims.w;
  const olive = '#5A5A40';
  const terracotta = '#D48C70';

  return {
    duration: OPENING_DUR,
    transition: { ...STYLE_TRANSITIONS[style] },
    layers: [
      { type: 'linear-gradient', colors: [olive, terracotta] },
      {
        type: 'canvas',
        func: ({ width, height, canvas }) => {
          const ctx = canvas.getContext('2d');
          return {
            onRender: async (progress) => {
              ctx.clearRect(0, 0, width, height);

              ctx.fillStyle = 'rgba(255,255,255,0.03)';
              for (let c = 0; c < 3; c++) {
                ctx.beginPath();
                ctx.arc(width * 0.5, height * (0.2 + c * 0.3), width * (0.3 + c * 0.05), 0, Math.PI * 2);
                ctx.fill();
              }

              const haloProgress = Math.min(1, progress * 3);
              const haloAlpha = 0.08 + 0.04 * Math.sin(progress * OPENING_DUR * FPS * 0.15);
              ctx.fillStyle = `rgba(255,255,255,${haloAlpha * haloProgress})`;
              ctx.beginPath();
              ctx.arc(width / 2, height * 0.32, width * 0.18, 0, Math.PI * 2);
              ctx.fill();

              const logoSize = Math.min(width, height) * 0.14;
              const easeT = Math.min(1, progress * 2.5);
              const eased = easeT < 0.5 ? 2 * easeT * easeT : 1 - Math.pow(-2 * easeT + 2, 2) / 2;
              const scale = 0.3 + 0.7 * eased;
              const actualSize = logoSize * scale;
              const logoY = height * 0.32;

              ctx.strokeStyle = `rgba(255,255,255,${0.5 * haloProgress})`;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(width / 2, logoY, actualSize / 2 + 2, 0, Math.PI * 2);
              ctx.stroke();
            },
            onClose: () => {},
          };
        },
      },
      {
        type: 'image-overlay',
        path: LOGO_PATH,
        position: { x: 0.5, y: 0.32, originX: 'center', originY: 'center' },
        width: isVertical ? 0.14 : 0.10,
        height: isVertical ? 0.14 * (dims.w / dims.h) : 0.10 * (dims.h / dims.w),
        start: 0,
        stop: OPENING_DUR,
      },
      {
        type: 'title',
        text: 'SIGO TU HUELLA',
        textColor: '#ffffff',
        ...(fontPath ? { fontPath } : {}),
        position: { x: 0.5, y: 0.52, originX: 'center', originY: 'center' },
        start: 0.33 * OPENING_DUR,
      },
      {
        type: 'canvas',
        func: ({ width, height, canvas }) => {
          const ctx = canvas.getContext('2d');
          return {
            onRender: (progress) => {
              const lineProgress = Math.max(0, Math.min(1, (progress - 0.45) * 5));
              if (lineProgress <= 0) return;
              ctx.clearRect(0, 0, width, height);
              const lineW = width * 0.3 * lineProgress;
              const lineY = height * 0.545;
              ctx.strokeStyle = terracotta;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(width / 2 - lineW / 2, lineY);
              ctx.lineTo(width / 2 + lineW / 2, lineY);
              ctx.stroke();
            },
            onClose: () => {},
          };
        },
      },
    ],
  };
}

function buildClosingClip(dims, style) {
  const fontPath = getFontPath();
  const isVertical = dims.h > dims.w;
  const olive = '#5A5A40';
  const terracotta = '#D48C70';
  const cream = '#F5F5F0';

  return {
    duration: CLOSING_DUR,
    transition: null,
    layers: [
      { type: 'linear-gradient', colors: [olive, terracotta] },
      {
        type: 'canvas',
        func: ({ width, height, canvas }) => {
          const ctx = canvas.getContext('2d');
          return {
            onRender: (progress) => {
              ctx.clearRect(0, 0, width, height);
              ctx.fillStyle = 'rgba(255,255,255,0.04)';
              ctx.beginPath();
              ctx.arc(width * 0.5, height * 0.3, width * 0.4, 0, Math.PI * 2);
              ctx.fill();

              if (progress < 0.17) {
                const fi = 1 - progress / 0.17;
                ctx.fillStyle = `rgba(0,0,0,${fi * 0.8})`;
                ctx.fillRect(0, 0, width, height);
              }

              if (progress > 0.83) {
                const fo = (progress - 0.83) / 0.17;
                ctx.fillStyle = `rgba(0,0,0,${fo})`;
                ctx.fillRect(0, 0, width, height);
              }
            },
            onClose: () => {},
          };
        },
      },
      {
        type: 'image-overlay',
        path: LOGO_PATH,
        position: { x: 0.5, y: 0.30, originX: 'center', originY: 'center' },
        width: isVertical ? 0.18 : 0.12,
        height: isVertical ? 0.18 * (dims.w / dims.h) : 0.12 * (dims.h / dims.w),
        start: 0.08,
      },
      {
        type: 'title',
        text: 'SIGO TU HUELLA',
        textColor: '#ffffff',
        ...(fontPath ? { fontPath } : {}),
        position: { x: 0.5, y: 0.42, originX: 'center', originY: 'center' },
        start: 0.12,
      },
      {
        type: 'canvas',
        func: ({ width, height, canvas }) => {
          const ctx = canvas.getContext('2d');
          return {
            onRender: (progress) => {
              ctx.clearRect(0, 0, width, height);
              const lineStart = 0.17;
              if (progress < lineStart) return;
              const lineGrow = Math.max(0, Math.min(1, (progress - lineStart) * 5));
              const lineW = width * 0.30 * lineGrow;
              const lineY = height * 0.455;
              ctx.strokeStyle = cream;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(width / 2 - lineW / 2, lineY);
              ctx.lineTo(width / 2 + lineW / 2, lineY);
              ctx.stroke();
            },
            onClose: () => {},
          };
        },
      },
      {
        type: 'subtitle',
        text: 'sigotuhuella.online',
        textColor: '#ffffff',
        ...(fontPath ? { fontPath } : {}),
        backgroundColor: 'transparent',
        position: 'center',
        start: 0.22,
      },
      {
        type: 'subtitle',
        text: 'Visita nuestra web  •  Descarga la app gratis',
        textColor: cream,
        ...(fontPath ? { fontPath } : {}),
        backgroundColor: 'transparent',
        position: 'center',
        start: 0.28,
      },
    ],
  };
}

function buildBrandFrameCanvasLayer(dims) {
  const isVertical = dims.h > dims.w;
  const topBarPx = isVertical ? 70 : 50;
  const botBarPx = isVertical ? 40 : 30;

  return {
    type: 'canvas',
    func: ({ width, height, canvas }) => {
      const ctx = canvas.getContext('2d');
      return {
        onRender: () => {
          ctx.clearRect(0, 0, width, height);

          const topH = topBarPx;
          const grad1 = ctx.createLinearGradient(0, 0, 0, topH);
          grad1.addColorStop(0, '#5A5A40');
          grad1.addColorStop(0.7, '#5A5A40');
          grad1.addColorStop(1, 'rgba(90,90,64,0)');
          ctx.fillStyle = grad1;
          ctx.fillRect(0, 0, width, topH);

          const botH = botBarPx;
          const grad2 = ctx.createLinearGradient(0, height - botH, 0, height);
          grad2.addColorStop(0, 'rgba(90,90,64,0)');
          grad2.addColorStop(0.3, 'rgba(90,90,64,0.6)');
          grad2.addColorStop(1, '#5A5A40');
          ctx.fillStyle = grad2;
          ctx.fillRect(0, height - botH, width, botH);
        },
        onClose: () => {},
      };
    },
  };
}

function buildWatermarkLayer(dims) {
  const isVertical = dims.h > dims.w;
  const wmWidth = isVertical ? 0.08 : 0.04;

  return {
    type: 'image-overlay',
    path: LOGO_PATH,
    position: 'top-right',
    width: wmWidth,
    originX: 'right',
    originY: 'top',
  };
}

async function generateVideo(config) {
  const {
    style = 'emotive',
    duration = 30,
    music = 'emotional',
    includeVoice = true,
    format = 'vertical',
    voiceScript = '',
    scenes = [],
  } = config;

  const dims = FORMAT_DIMS[format] || FORMAT_DIMS.vertical;
  const { w, h } = dims;
  const zoomOpts = STYLE_ZOOM[style] || STYLE_ZOOM.emotive;

  const jobId = uuidv4();
  const workDir = path.join(os.tmpdir(), `video-${jobId}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const t0 = Date.now();
    const logStep = (label) => console.log(`[VideoGen] ${label} @ ${(Date.now() - t0) / 1000}s`);

    const photoScenes = scenes.filter(s => s.type === 'photo' && s.imageBase64);
    const numPhotoScenes = photoScenes.length;

    if (numPhotoScenes === 0) throw new Error('No hay fotos para generar el video');

    logStep('scenes filtered');

    const photoPaths = [];
    for (let i = 0; i < numPhotoScenes; i++) {
      const imgPath = path.join(workDir, `photo_${i}.jpg`);
      const buf = Buffer.from(photoScenes[i].imageBase64, 'base64');
      fs.writeFileSync(imgPath, buf);
      photoPaths.push(imgPath);
    }
    logStep('photos saved to disk');

    const ttsPath = await generateTTS({ style, duration, music, includeVoice }, voiceScript, workDir);
    logStep('TTS generated');

    const fixedDur = OPENING_DUR + CLOSING_DUR;
    const transitionDur = (STYLE_TRANSITIONS[style] || STYLE_TRANSITIONS.emotive).duration;
    const totalTransitionDur = numPhotoScenes * transitionDur;
    const availableDur = Math.max(duration - fixedDur - totalTransitionDur, numPhotoScenes * 2);
    const photoClipDur = availableDur / numPhotoScenes;

    const fontPath = getFontPath();
    const brandFrameLayer = buildBrandFrameCanvasLayer(dims);
    const watermarkLayer = buildWatermarkLayer(dims);

    const clips = [];

    clips.push(buildOpeningClip(dims, style));

    for (let i = 0; i < numPhotoScenes; i++) {
      const scene = photoScenes[i];
      const layers = [];

      layers.push({
        type: 'image',
        path: photoPaths[i],
        resizeMode: 'cover',
        ...zoomOpts,
      });

      layers.push(brandFrameLayer);

      if (scene.overlayText && scene.overlayText.trim()) {
        layers.push({
          type: 'subtitle',
          text: scene.overlayText.trim(),
          textColor: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.5)',
          ...(fontPath ? { fontPath } : {}),
          position: 'bottom',
        });
      }

      layers.push(watermarkLayer);

      clips.push({
        duration: photoClipDur,
        transition: { ...STYLE_TRANSITIONS[style] },
        layers,
      });
    }

    clips.push(buildClosingClip(dims, style));

    logStep('editSpec built');

    const musicPath = MUSIC_TRACKS[music] || MUSIC_TRACKS.emotional;
    const hasMusic = fs.existsSync(musicPath) && fs.statSync(musicPath).size > 0;
    if (!hasMusic) console.warn('[Audio] Music file not found:', musicPath);

    const hasTts = ttsPath && fs.existsSync(ttsPath);

    const editlyConfig = {
      outPath: '',
      width: w,
      height: h,
      fps: FPS,
      clips,
      defaults: {
        duration: 4,
        transition: { ...STYLE_TRANSITIONS[style] },
        ...(fontPath ? { layer: { fontPath } } : {}),
      },
      loopAudio: true,
      enableFfmpegLog: false,
      verbose: false,
      logTimes: true,
    };

    if (hasMusic && hasTts) {
      editlyConfig.audioFilePath = musicPath;
      editlyConfig.backgroundAudioVolume = '0.35';
      editlyConfig.audioTracks = [{ path: ttsPath, mixVolume: 1 }];
      editlyConfig.audioNorm = { enable: true, gaussSize: 5, maxGain: 30 };
      editlyConfig.clipsAudioVolume = 1;
    } else if (hasMusic) {
      editlyConfig.audioFilePath = musicPath;
      editlyConfig.backgroundAudioVolume = 1;
    } else if (hasTts) {
      editlyConfig.audioTracks = [{ path: ttsPath, mixVolume: 1 }];
      editlyConfig.clipsAudioVolume = 1;
    }

    const videoFilename = `promo-${style}-${duration}s-${format}-${Date.now()}.mp4`;
    const finalVideoPath = path.join(VIDEO_OUTPUT_DIR, videoFilename);
    editlyConfig.outPath = finalVideoPath;

    logStep('starting editly render');

    await Editly(editlyConfig);

    logStep('editly render complete');

    const thumbFilename = videoFilename.replace('.mp4', '_thumb.jpg');
    const thumbPath = path.join(VIDEO_OUTPUT_DIR, thumbFilename);

    try {
      const firstScene = photoScenes[0];
      const thumbBuf = Buffer.from(firstScene.imageBase64, 'base64');
      await sharp(thumbBuf)
        .resize(w, h, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);
    } catch {
      console.warn('[VideoGen] Thumbnail generation failed');
    }

    return {
      filename: videoFilename,
      filepath: finalVideoPath,
      thumbnail: thumbFilename,
      thumbnailPath: thumbPath,
      size: fs.statSync(finalVideoPath).size,
    };
  } finally {
    const { rimraf } = await import('rimraf');
    if (fs.existsSync(workDir)) {
      rimraf.sync(workDir);
    }
  }
}

export { generateVideo, getRandomReunionPhotos, getGlobalStats, getPetImages, getNewsImage };
