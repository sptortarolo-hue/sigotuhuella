import { createCanvas, loadImage } from 'canvas';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { rimraf } from 'rimraf';
import pool from '../db.js';

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
  informative: 'es-ES-AlvaroNeural',
  viral: 'es-MX-JorgeNeural',
};

let logoCache = null;
async function getLogoImage() {
  if (logoCache) return logoCache;
  try {
    if (fs.existsSync(LOGO_PATH)) {
      logoCache = await loadImage(LOGO_PATH);
    }
  } catch {}
  return logoCache;
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

async function getPetData(petId) {
  const petResult = await pool.query(
    'SELECT * FROM pets WHERE id = $1 AND status = $2',
    [petId, 'reunited'],
  );
  if (petResult.rows.length === 0) return null;
  const pet = petResult.rows[0];
  const imgs = await pool.query(
    'SELECT image_data FROM pet_images WHERE pet_id = $1 ORDER BY created_at',
    [petId],
  );
  pet.images = imgs.rows.map(r => r.image_data);
  return pet;
}

async function getMusicFile(url) {
  if (fs.existsSync(url) && fs.statSync(url).size > 0) return url;
  console.warn('Local music file not found:', url);
  return null;
}

async function loadPhoto(photoBase64) {
  try {
    return await loadImage(Buffer.from(photoBase64, 'base64'));
  } catch (err) {
    console.error('Failed to load photo:', err.message);
    return null;
  }
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function drawFrame(photoBase64, stats, style, index, totalFrames, overlayText, format = 'vertical') {
  const dims = FORMAT_DIMS[format] || FORMAT_DIMS.vertical;
  const { w, h } = dims;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const progress = totalFrames > 1 ? index / (totalFrames - 1) : 0;

  const photo = await loadPhoto(photoBase64);

  if (style === 'emotive') {
    await drawFrameEmotive(ctx, w, h, photo, stats, progress, overlayText, format);
  } else if (style === 'informative') {
    await drawFrameInformative(ctx, w, h, photo, stats, progress, overlayText, format);
  } else {
    await drawFrameViral(ctx, w, h, photo, stats, index, progress, overlayText, format);
  }

  const logo = await getLogoImage();
  if (logo) {
    const logoSize = format === 'landscape' ? 48 : 56;
    const logoX = format === 'landscape' ? 40 : w / 2 - logoSize / 2;
    const logoY = format === 'landscape' ? h - 80 : h - (format === 'square' ? 100 : 150);
    ctx.save();
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
    ctx.restore();
    ctx.strokeStyle = style === 'informative' ? 'rgba(90,90,64,0.4)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  const olive = '#5A5A40';
  const urlFontSize = format === 'landscape' ? 20 : 28;
  const urlY = format === 'landscape' ? h - 55 : h - (format === 'square' ? 40 : 60);
  const urlX = format === 'landscape' ? 110 : w / 2;
  ctx.globalAlpha = Math.min(1, progress * 2);
  ctx.fillStyle = style === 'informative' ? olive : '#ffffff';
  ctx.font = `${urlFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = format === 'landscape' ? 'left' : 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('sigotuhuella.online', urlX, logo ? urlY : urlY + 10);
  ctx.globalAlpha = 1;

  return canvas.toBuffer('image/png');
}

async function drawFrameEmotive(ctx, w, h, photo, stats, progress, overlayText, format) {
  const olive = '#5A5A40';
  const terracotta = '#D48C70';

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, olive);
  grad.addColorStop(1, terracotta);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath();
  ctx.arc(w * (0.85 + progress * 0.05), h * (0.2 - progress * 0.03), w * 0.35 + progress * 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * (0.15 - progress * 0.05), h * (0.8 + progress * 0.03), w * 0.25 - progress * 30, 0, Math.PI * 2);
  ctx.fill();

  if (photo) {
    const r = getEmotivePhotoRect(w, h, format);
    const zoom = 1 + progress * 0.15;
    const panX = progress * 30;
    const panY = progress * 15;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, r.radius);
    ctx.clip();
    ctx.drawImage(photo, r.x - panX, r.y - panY, r.w * zoom, r.h * zoom);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, r.radius);
    ctx.stroke();
  }

  ctx.globalAlpha = Math.min(1, progress * 3);
  const statsY = format === 'landscape' ? 60 : format === 'square' ? 50 : 100;
  const statsFontSize = format === 'landscape' ? 36 : format === 'square' ? 40 : 56;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  const statsPad = 20;
  const statsBoxH = statsFontSize * 2 + statsPad * 2;
  ctx.fillRect(w * 0.06, statsY, w * 0.88, statsBoxH);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${statsFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${stats.reunited} mascotas reunidas`, w * 0.1, statsY + statsPad);
  ctx.font = `${statsFontSize * 0.7}px system-ui`;
  ctx.fillText(`${stats.users} vecinos ayudando`, w * 0.1, statsY + statsPad + statsFontSize + 8);
  ctx.globalAlpha = 1;

  drawOverlayBar(ctx, w, h, overlayText, progress, format, '#ffffff');
}

async function drawFrameInformative(ctx, w, h, photo, stats, progress, overlayText, format) {
  const olive = '#5A5A40';
  const cream = '#F5F5F0';

  ctx.fillStyle = cream;
  ctx.fillRect(0, 0, w, h);

  const barH = format === 'landscape' ? 80 : format === 'square' ? 60 : 90;
  ctx.fillStyle = olive;
  ctx.fillRect(0, 0, w, barH);

  ctx.globalAlpha = Math.min(1, progress * 3);
  ctx.fillStyle = '#ffffff';
  const titleSize = format === 'landscape' ? 32 : format === 'square' ? 36 : 44;
  ctx.font = `bold ${titleSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SIGO TU HUELLA', w / 2, barH / 2);
  ctx.globalAlpha = 1;

  if (photo) {
    const r = getInformativePhotoRect(w, h, format, barH);
    const zoom = 1 + progress * 0.08;
    ctx.save();
    if (r.radius > 0) {
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, r.radius);
      ctx.clip();
    }
    ctx.drawImage(photo, r.x, r.y, r.w * zoom, r.h * zoom);
    ctx.restore();
    ctx.strokeStyle = 'rgba(90,90,64,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, r.radius);
    ctx.stroke();
  }

  const s = getInformativeStatsRect(w, h, format, barH);
  ctx.globalAlpha = Math.min(1, progress * 3);
  const statNumSize = format === 'landscape' ? 40 : format === 'square' ? 44 : 52;
  const statLabelSize = format === 'landscape' ? 18 : format === 'square' ? 20 : 24;

  ctx.fillStyle = olive;
  ctx.font = `bold ${statNumSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(stats.reunited.toString(), s.x, s.y);
  ctx.font = `${statLabelSize}px system-ui`;
  ctx.fillStyle = '#888';
  ctx.fillText('mascotas reunidas', s.x, s.y + statNumSize + 4);

  ctx.fillStyle = olive;
  ctx.font = `bold ${statNumSize}px system-ui`;
  ctx.fillText(stats.users.toString(), s.x, s.y + statNumSize + statLabelSize + 30);
  ctx.font = `${statLabelSize}px system-ui`;
  ctx.fillStyle = '#888';
  ctx.fillText('vecinos ayudando', s.x, s.y + statNumSize * 2 + statLabelSize + 34);
  ctx.globalAlpha = 1;

  drawOverlayBar(ctx, w, h, overlayText, progress, format, olive);
}

async function drawFrameViral(ctx, w, h, photo, stats, index, progress, overlayText, format) {
  const terracotta = '#D48C70';
  const darkOlive = '#3A3A28';

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, darkOlive);
  grad.addColorStop(1, terracotta);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (photo) {
    const r = getViralPhotoRect(w, h, format);
    const zoom = 1 + progress * 0.25;
    const panX = progress * 40;
    const panY = progress * 20;
    ctx.save();
    ctx.drawImage(photo, r.x - panX, r.y - panY, r.w * zoom, r.h * zoom);
    ctx.restore();

    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.globalAlpha = Math.min(1, progress * 4);
  const badgeSize = format === 'landscape' ? 28 : format === 'square' ? 32 : 40;
  const badgeH = badgeSize * 1.5;
  const badgeW = badgeSize * 12;
  const badgeX = w / 2 - badgeW / 2;
  const badgeY = format === 'landscape' ? 20 : format === 'square' ? 20 : 40;
  ctx.fillStyle = terracotta;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${badgeSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${stats.reunited} REUNIDAS`, w / 2, badgeY + badgeH / 2);
  ctx.globalAlpha = 1;

  if (overlayText && overlayText.length > 0) {
    const frameText = overlayText[index % overlayText.length];
    if (typeof frameText === 'string' && frameText.trim()) {
      const popScale = 0.85 + 0.15 * Math.min(1, progress * 5);
      const textY = format === 'landscape' ? h * 0.65 : format === 'square' ? h * 0.55 : h * 0.62;
      const fontSize = format === 'landscape' ? 56 : format === 'square' ? 64 : 72;
      const maxWidth = w * 0.85;

      ctx.save();
      ctx.translate(w / 2, textY);
      ctx.scale(popScale, popScale);

      ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = wrapText(ctx, frameText.toUpperCase(), maxWidth);
      const lineHeight = fontSize * 1.2;

      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 12;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = terracotta;
      ctx.lineWidth = 6;
      for (let i = 0; i < lines.length; i++) {
        const y = (i - (lines.length - 1) / 2) * lineHeight;
        ctx.strokeText(lines[i], 0, y);
        ctx.fillText(lines[i], 0, y);
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
}

function getEmotivePhotoRect(w, h, format) {
  if (format === 'vertical') return { x: 140, y: 500, w: 800, h: 800, radius: 30 };
  if (format === 'square') return { x: w * 0.08, y: h * 0.3, w: w * 0.84, h: h * 0.45, radius: 24 };
  return { x: w * 0.05, y: h * 0.15, w: w * 0.55, h: h * 0.7, radius: 20 };
}

function getInformativePhotoRect(w, h, format, barH) {
  if (format === 'vertical') return { x: w * 0.55, y: barH + 40, w: w * 0.4, h: h * 0.5, radius: 16 };
  if (format === 'square') return { x: w * 0.52, y: barH + 20, w: w * 0.44, h: h * 0.55, radius: 16 };
  return { x: w * 0.5, y: barH + 20, w: w * 0.46, h: h - barH - 80, radius: 16 };
}

function getInformativeStatsRect(w, h, format, barH) {
  if (format === 'vertical') return { x: 60, y: barH + 60 };
  if (format === 'square') return { x: 40, y: barH + 40 };
  return { x: 40, y: barH + 40 };
}

function getViralPhotoRect(w, h, format) {
  return { x: 0, y: 0, w: w, h: h };
}

function drawOverlayBar(ctx, w, h, overlayText, progress, format, textColor) {
  if (!overlayText || overlayText.length === 0) return;
  const frameText = overlayText[0];
  if (typeof frameText !== 'string' || !frameText.trim()) return;

  const fontSize = format === 'landscape' ? 36 : format === 'square' ? 40 : 48;
  const maxWidth = w * 0.85;
  const textY = format === 'landscape' ? h * 0.78 : format === 'square' ? h * 0.78 : h * 0.72;

  ctx.globalAlpha = 0.3 + 0.7 * Math.min(1, progress * 3.3);

  const barGrad = ctx.createLinearGradient(0, textY - 60, 0, textY + 60);
  barGrad.addColorStop(0, 'rgba(0,0,0,0)');
  barGrad.addColorStop(0.1, 'rgba(0,0,0,0.5)');
  barGrad.addColorStop(0.9, 'rgba(0,0,0,0.5)');
  barGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, textY - 60, w, 120);

  ctx.fillStyle = textColor;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 6;

  const lines = wrapText(ctx, frameText, maxWidth);
  const lineH = fontSize * 1.3;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], w / 2, textY + (i - (lines.length - 1) / 2) * lineH);
  }

  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

async function generateAudio(stats, config, outputPath, customScript) {
  const script = customScript || buildAutoScript(config.style, stats);

  let ttsBuffer = null;
  if (config.includeVoice) {
    const sdk = await getSpeechSdk();
    if (sdk && script) {
      try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(
          process.env.AZURE_TTS_KEY,
          process.env.AZURE_TTS_REGION || 'eastus',
        );
        speechConfig.speechSynthesisVoiceName = STYLE_VOICES[config.style] || STYLE_VOICES.emotive;
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

        const ssml = buildSSML(script, config.style);

        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
        const result = await new Promise((resolve, reject) => {
          synthesizer.speakSsmlAsync(ssml, res => resolve(res), err => reject(err));
        });
        synthesizer.close();

        if (result && result.audioData && result.audioData.length > 0) {
          ttsBuffer = Buffer.from(result.audioData);
        }
      } catch (err) {
        console.warn('Azure TTS failed, will use music only:', err.message);
        ttsBuffer = null;
      }
    }
  }

  const musicUrl = MUSIC_TRACKS[config.music] || MUSIC_TRACKS.emotional;
  const musicPath = await getMusicFile(musicUrl);

  if (ttsBuffer) {
    const ttsTmp = outputPath.replace('.mp3', '_tts.mp3');
    fs.writeFileSync(ttsTmp, ttsBuffer);
    if (musicPath) {
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(ttsTmp)
          .input(musicPath)
          .complexFilter([
            '[1:a]volume=0.4[musicVol]',
            '[0:a][musicVol]amix=inputs=2:duration=first:dropout_transition=2[mix]',
          ])
          .outputOptions(['-map', '[mix]', '-c:a', 'aac', '-b:a', '192k', '-shortest'])
          .on('end', () => { try { fs.unlinkSync(ttsTmp); } catch {} resolve(); })
          .on('error', (err, stdout, stderr) => { console.error('mix audio stderr:', stderr); reject(err); })
          .save(outputPath);
      });
    } else {
      try { fs.copyFileSync(ttsTmp, outputPath); } catch {}
      try { fs.unlinkSync(ttsTmp); } catch {}
    }
  } else if (musicPath) {
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(musicPath)
        .outputOptions(['-shortest', '-c:a', 'libmp3lame', '-b:a', '192k'])
        .toFormat('mp3')
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });
  }
}

function buildSSML(script, style) {
  const voice = STYLE_VOICES[style] || STYLE_VOICES.emotive;
  const rate = style === 'viral' ? 'fast' : style === 'emotive' ? 'slow' : 'medium';
  const pitch = style === 'viral' ? 'high' : style === 'emotive' ? '-5%' : 'medium';

  const sentences = script.split('. ').filter(s => s.trim());
  const ssmlParts = sentences.map(s => {
    const trimmed = s.trim();
    if (!trimmed) return '';
    if (trimmed.endsWith('.')) return `<s>${trimmed}</s>`;
    return `<s>${trimmed}.</s>`;
  });

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-AR">
  <voice name="${voice}">
    <prosody rate="${rate}" pitch="${pitch}">
      ${ssmlParts.join('\n      ')}
      <break time="800ms"/>
      <emphasis level="strong">sigotuhuella.online</emphasis>
    </prosody>
  </voice>
</speak>`;
}

function assembleVideo(framesDir, audioPath, outputPath, frameDuration, numFrames) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(framesDir, 'frame%03d.png'))
      .inputOptions(`-framerate ${1 / frameDuration}`)
      .input(audioPath)
      .outputOptions([
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
      ])
      .on('end', resolve)
      .on('error', (err, stdout, stderr) => {
        console.error('ffmpeg stderr:', stderr);
        reject(err);
      })
      .save(outputPath);
  });
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

export async function generateVideo(config) {
  const {
    style = 'emotive',
    duration = 60,
    music = 'emotional',
    includeVoice = true,
    petId,
    customScript,
    overlayText,
    format = 'vertical',
  } = config;

  const frameDuration = 5;
  const numFrames = Math.floor(duration / frameDuration);
  if (numFrames < 1) throw new Error('Duration too short');

  const jobId = uuidv4();
  const workDir = path.join(os.tmpdir(), `video-${jobId}`);
  const framesDir = path.join(workDir, 'frames');
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    let photos = [];
    let audioScript = customScript || '';
    let overlayFrames = [];

    if (overlayText) {
      if (Array.isArray(overlayText)) {
        overlayFrames = overlayText.filter(t => typeof t === 'string' && t.trim());
      } else if (typeof overlayText === 'string') {
        overlayFrames = overlayText.split('\n').filter(l => l.trim());
      }
    }

    if (petId) {
      const pet = await getPetData(petId);
      if (!pet) throw new Error('Pet not found or not reunited');
      photos = pet.images;
      if (photos.length === 0) throw new Error('Pet has no images');
      if (!customScript && pet.description) {
        audioScript = pet.description;
      }
    } else {
      const count = Math.min(numFrames, 8);
      photos = await getRandomReunionPhotos(count);
      if (photos.length === 0) throw new Error('No reunion photos available');
    }

    if (photos.length === 0) throw new Error('No photos available');

    const stats = await getGlobalStats();

    for (let i = 0; i < numFrames; i++) {
      const photo = photos[i % photos.length];
      let frameOverlay = [];
      if (overlayFrames.length > 0) {
        frameOverlay = [overlayFrames[i % overlayFrames.length]];
      }
      const frame = await drawFrame(photo, stats, style, i, numFrames, frameOverlay, format);
      fs.writeFileSync(path.join(framesDir, `frame${i.toString().padStart(3, '0')}.png`), frame);
    }

    const audioPath = path.join(workDir, 'audio.mp3');
    await generateAudio(stats, { style, duration, music, includeVoice }, audioPath, audioScript);

    if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
      console.warn('No audio generated, creating silent track');
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input('anullsrc')
          .inputFormat('lavfi')
          .duration(duration)
          .outputOptions(['-c:a', 'libmp3lame', '-b:a', '128k'])
          .on('end', resolve)
          .on('error', (err, stdout, stderr) => { console.error('silent audio stderr:', stderr); reject(err); })
          .save(audioPath);
      });
    }

    const videoFilename = `promo-${style}-${duration}s-${format}-${Date.now()}.mp4`;
    const finalVideoPath = path.join(VIDEO_OUTPUT_DIR, videoFilename);
    await assembleVideo(framesDir, audioPath, finalVideoPath, frameDuration, numFrames);

    const thumbFilename = videoFilename.replace('.mp4', '_thumb.jpg');
    const thumbPath = path.join(VIDEO_OUTPUT_DIR, thumbFilename);
    const firstFrame = fs.readFileSync(path.join(framesDir, 'frame000.png'));
    await sharp(firstFrame).jpeg({ quality: 80 }).toFile(thumbPath);

    return {
      filename: videoFilename,
      filepath: finalVideoPath,
      thumbnail: thumbFilename,
      thumbnailPath: thumbPath,
      size: fs.statSync(finalVideoPath).size,
    };
  } finally {
    if (fs.existsSync(workDir)) {
      rimraf.sync(workDir);
    }
  }
}

export { getRandomReunionPhotos, getGlobalStats, drawFrame };
