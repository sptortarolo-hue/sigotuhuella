import { createCanvas, loadImage, registerFont } from 'canvas';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { rimraf } from 'rimraf';
import pool from '../db.js';

const CANVAS_FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
];
const CANVAS_FONT_FAMILY = 'BrandBold';
let canvasFontRegistered = false;
for (const fp of CANVAS_FONT_CANDIDATES) {
  if (fs.existsSync(fp)) {
    try {
      registerFont(fp, { family: CANVAS_FONT_FAMILY });
      canvasFontRegistered = true;
      console.log('[videoAssembler] Registered canvas font:', fp);
      break;
    } catch (e) {
      console.warn('[videoAssembler] Failed to register font:', fp, e.message);
    }
  }
}
const CANVAS_FONT = canvasFontRegistered ? CANVAS_FONT_FAMILY : 'sans-serif';

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
  emotive: 'fade',
  informative: 'slideleft',
  viral: 'circlecrop',
};

const STYLE_ZOOMPAN = {
  emotive: { zoomDir: 1, zoomSpeed: 0.0012, panAmp: 0 },
  informative: { zoomDir: 0, zoomSpeed: 0, panAmp: 0.02 },
  viral: { zoomDir: -1, zoomSpeed: 0.0018, panAmp: 0 },
};

const TRANSITION_DUR = 0.5;
const OPENING_DUR = 3;
const CLOSING_DUR = 3;
const FPS = 30;
const CANVAS_FPS = 24;
const FF_PRESET = 'ultrafast';
const FF_CRF = 23;

let logoCache = null;
async function getLogoImage() {
  if (logoCache) return logoCache;
  try {
    if (fs.existsSync(LOGO_PATH)) logoCache = await loadImage(LOGO_PATH);
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

async function getMusicFile(url) {
  if (fs.existsSync(url) && fs.statSync(url).size > 0) return url;
  console.warn('Local music file not found:', url);
  return null;
}

function escDrawText(text) {
  return text
    .replace(/\\/g, '\\\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '%%')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
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

async function generatePhotoClip(photoBase64, clipDur, zoompan, dims, workDir, clipIndex) {
  const photoPath = path.join(workDir, `photo_${clipIndex}.png`);
  const clipPath = path.join(workDir, `clip_${clipIndex}.mp4`);
  const buffer = Buffer.from(photoBase64, 'base64');
  fs.writeFileSync(photoPath, buffer);

  const { w, h } = dims;
  const { zoomDir, zoomSpeed, panAmp } = zoompan;

  let zf, xf, yf;
  if (zoomDir === 1) {
    zf = `min(zoom+${zoomSpeed},1.4)`;
    xf = panAmp > 0 ? `iw/2-(iw/zoom/2)+${panAmp}*in*h` : `iw/2-(iw/zoom/2)`;
    yf = `ih/2-(ih/zoom/2)`;
  } else if (zoomDir === -1) {
    zf = `max(1.4-${zoomSpeed}*on,1.0)`;
    xf = `iw/2-(iw/zoom/2)`;
    yf = `ih/2-(ih/zoom/2)`;
  } else {
    zf = '1.1';
    xf = `iw/2-(iw/zoom/2)+${panAmp}*sin(in/${FPS}/2)*iw*0.05`;
    yf = `ih/2-(ih/zoom/2)`;
  }

  const totalFrames = Math.round(clipDur * FPS);

  await new Promise((resolve, reject) => {
    ffmpeg()
    .input(photoPath)
    .complexFilter([
      `zoompan=z='${zf}':x=${xf}:y=${yf}:d=${totalFrames}:s=${w}x${h}:fps=${FPS}`,
    ])
    .outputOptions([
      '-c:v', 'libx264',
      '-preset', FF_PRESET,
      '-crf', String(FF_CRF),
      '-pix_fmt', 'yuv420p',
      '-t', String(clipDur),
      '-r', String(FPS),
    ])
    .on('end', resolve)
    .on('error', (err, stdout, stderr) => {
      console.error('zoompan stderr:', stderr);
      reject(err);
    })
    .save(clipPath);
  });

  return clipPath;
}

async function generateOpeningClip(dims, style, workDir) {
  const clipPath = path.join(workDir, 'clip_opening.mp4');
  const { w, h } = dims;
  const olive = '#5A5A40';
  const terracotta = '#D48C70';
  const dur = OPENING_DUR;
  const totalFrames = Math.round(dur * CANVAS_FPS);
  const fadeOutStart = totalFrames - Math.round(0.5 * CANVAS_FPS);

  const renderScale = 0.5;
  const rw = Math.round(w * renderScale);
  const rh = Math.round(h * renderScale);
  const canvas = createCanvas(rw, rh);
  const ctx = canvas.getContext('2d');
  const logo = await getLogoImage();

  for (let i = 0; i < totalFrames; i++) {
    const progress = i / (totalFrames - 1);

    const grad = ctx.createLinearGradient(0, 0, rw, rh);
    grad.addColorStop(0, olive);
    grad.addColorStop(1, terracotta);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, rw, rh);

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let c = 0; c < 3; c++) {
      ctx.beginPath();
      ctx.arc(rw * 0.5, rh * (0.2 + c * 0.3), rw * (0.3 + c * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }

    const haloProgress = Math.min(1, progress * 3);
    const haloAlpha = 0.08 + 0.04 * Math.sin(i * 0.15);
    ctx.fillStyle = `rgba(255,255,255,${haloAlpha * haloProgress})`;
    ctx.beginPath();
    ctx.arc(rw / 2, rh * 0.32, rw * 0.18, 0, Math.PI * 2);
    ctx.fill();

    if (logo) {
      const easeT = Math.min(1, progress * 2.5);
      const eased = easeT < 0.5 ? 2 * easeT * easeT : 1 - Math.pow(-2 * easeT + 2, 2) / 2;
      const logoScale = 0.3 + 0.7 * eased;
      const logoSize = (rh < rw ? rh : rw) * 0.14;
      const actualSize = logoSize * logoScale;
      const logoX = rw / 2 - actualSize / 2;
      const logoY = rh * 0.32 - actualSize / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(rw / 2, rh * 0.32, actualSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logo, logoX, logoY, actualSize, actualSize);
      ctx.restore();

      ctx.strokeStyle = `rgba(255,255,255,${0.5 * haloProgress})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rw / 2, rh * 0.32, actualSize / 2 + 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    const textFadeIn = Math.max(0, Math.min(1, (progress - 0.33) * 4));
    if (textFadeIn > 0) {
      ctx.save();
      ctx.globalAlpha = textFadeIn;
      ctx.fillStyle = '#ffffff';
      const titleSize = rh > rw ? 32 : 24;
      ctx.font = `bold ${titleSize}px ${CANVAS_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SIGO TU HUELLA', rw / 2, rh * 0.52);

      const lineProgress = Math.max(0, Math.min(1, (progress - 0.45) * 5));
      const lineWidth = rw * 0.3 * lineProgress;
      ctx.strokeStyle = terracotta;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rw / 2 - lineWidth / 2, rh * 0.52 + titleSize * 0.6 + 6);
      ctx.lineTo(rw / 2 + lineWidth / 2, rh * 0.52 + titleSize * 0.6 + 6);
      ctx.stroke();

      ctx.restore();
    }

    if (i >= fadeOutStart) {
      const fadeOutProgress = (i - fadeOutStart) / (totalFrames - fadeOutStart);
      ctx.fillStyle = `rgba(90,90,64,${fadeOutProgress * 0.6})`;
      ctx.fillRect(0, 0, rw, rh);
    }

    const frameBuf = canvas.toBuffer('image/jpeg', { quality: 0.85 });
    const framePath = path.join(workDir, `opening_${i.toString().padStart(4, '0')}.jpg`);
    fs.writeFileSync(framePath, frameBuf);
  }

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(workDir, 'opening_%04d.jpg'))
      .inputOptions(['-framerate', String(CANVAS_FPS), '-start_number', '0'])
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', FF_PRESET,
        '-crf', String(FF_CRF),
        '-pix_fmt', 'yuv420p',
        '-vf', `scale=${w}:${h}:flags=lanczos`,
        '-t', String(dur),
      ])
      .on('end', () => {
        for (let i = 0; i < totalFrames; i++) {
          try { fs.unlinkSync(path.join(workDir, `opening_${i.toString().padStart(4, '0')}.jpg`)); } catch {}
        }
        resolve();
      })
      .on('error', (err, stdout, stderr) => {
        console.error('opening clip stderr:', stderr);
        reject(err);
      })
      .save(clipPath);
  });

  return clipPath;
}

async function generateClosingClip(dims, style, workDir) {
  const clipPath = path.join(workDir, 'clip_closing.mp4');
  const { w, h } = dims;
  const olive = '#5A5A40';
  const terracotta = '#D48C70';
  const cream = '#F5F5F0';
  const dur = CLOSING_DUR;
  const totalFrames = Math.round(dur * CANVAS_FPS);
  const fadeInEnd = Math.round(0.5 * CANVAS_FPS);
  const fadeOutStart = totalFrames - Math.round(0.5 * CANVAS_FPS);

  const renderScale = 0.5;
  const rw = Math.round(w * renderScale);
  const rh = Math.round(h * renderScale);
  const canvas = createCanvas(rw, rh);
  const ctx = canvas.getContext('2d');
  const logo = await getLogoImage();

  const isVertical = h > w;
  const logoSize = Math.round((isVertical ? rw : rh) * 0.18);
  const logoCenterY = rh * 0.30;

  const titleSize = isVertical ? 29 : 22;
  const titleY = logoCenterY + logoSize / 2 + titleSize + 8;

  const lineW = rw * 0.30;
  const lineY = titleY + titleSize * 0.55 + 5;

  const urlSize = isVertical ? 19 : 14;
  const urlY = lineY + 8 + urlSize * 0.5;

  const ctaSize = isVertical ? 15 : 11;
  const cta1Y = urlY + urlSize * 0.55 + 10;
  const cta2Y = cta1Y + ctaSize * 0.8 + 5;

  function drawTextWithOutline(text, x, y, font, fillColor) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const offsets = [[-1,0],[1,0],[0,-1],[0,1]];
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    for (const [ox, oy] of offsets) {
      ctx.fillText(text, x + ox, y + oy);
    }
    ctx.fillStyle = fillColor;
    ctx.fillText(text, x, y);
  }

  for (let i = 0; i < totalFrames; i++) {
    const progress = i / (totalFrames - 1);

    const grad = ctx.createLinearGradient(0, 0, 0, rh);
    grad.addColorStop(0, olive);
    grad.addColorStop(0.6, terracotta);
    grad.addColorStop(1, olive);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, rw, rh);

    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.arc(rw * 0.5, logoCenterY, rw * 0.4, 0, Math.PI * 2);
    ctx.fill();

    if (i < fadeInEnd) {
      const fi = 1 - i / fadeInEnd;
      ctx.fillStyle = `rgba(0,0,0,${fi * 0.8})`;
      ctx.fillRect(0, 0, rw, rh);
    }

    const contentStart = fadeInEnd / totalFrames;
    const logoAlpha = Math.max(0, Math.min(1, (progress - contentStart) * 6));
    if (logo) {
      ctx.save();
      ctx.globalAlpha = logoAlpha;

      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(rw / 2, logoCenterY, logoSize / 2 + 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(rw / 2, logoCenterY, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logo, rw / 2 - logoSize / 2, logoCenterY - logoSize / 2, logoSize, logoSize);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = logoAlpha;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rw / 2, logoCenterY, logoSize / 2 + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const textStart = contentStart + 0.04;
    const titleAlpha = Math.max(0, Math.min(1, (progress - textStart) * 6));
    ctx.save();
    ctx.globalAlpha = titleAlpha;
    drawTextWithOutline('SIGO TU HUELLA', rw / 2, titleY, `bold ${titleSize}px ${CANVAS_FONT}`, '#ffffff');
    ctx.restore();

    const lineStart = textStart + 0.05;
    const lineAlpha = Math.max(0, Math.min(1, (progress - lineStart) * 6));
    const lineGrow = Math.max(0, Math.min(1, (progress - lineStart) * 5));
    ctx.save();
    ctx.globalAlpha = lineAlpha;
    ctx.strokeStyle = cream;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rw / 2 - lineW * lineGrow / 2, lineY);
    ctx.lineTo(rw / 2 + lineW * lineGrow / 2, lineY);
    ctx.stroke();
    ctx.restore();

    const urlStart = lineStart + 0.05;
    const urlAlpha = Math.max(0, Math.min(1, (progress - urlStart) * 6));
    ctx.save();
    ctx.globalAlpha = urlAlpha;
    drawTextWithOutline('sigotuhuella.online', rw / 2, urlY, `bold ${urlSize}px ${CANVAS_FONT}`, '#ffffff');
    ctx.restore();

    const ctaStart = urlStart + 0.06;
    const ctaAlpha = Math.max(0, Math.min(1, (progress - ctaStart) * 6));
    ctx.save();
    ctx.globalAlpha = ctaAlpha;
    drawTextWithOutline('Visita nuestra web', rw / 2, cta1Y, `bold ${ctaSize}px ${CANVAS_FONT}`, cream);
    drawTextWithOutline('Descarga la app gratis', rw / 2, cta2Y, `bold ${ctaSize}px ${CANVAS_FONT}`, cream);
    ctx.restore();

    if (i >= fadeOutStart) {
      const fo = (i - fadeOutStart) / (totalFrames - 1 - fadeOutStart);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(0,0,0,${fo})`;
      ctx.fillRect(0, 0, rw, rh);
    }

    const frameBuf = canvas.toBuffer('image/jpeg', { quality: 0.85 });
    const framePath = path.join(workDir, `closing_${i.toString().padStart(4, '0')}.jpg`);
    fs.writeFileSync(framePath, frameBuf);
  }

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(workDir, 'closing_%04d.jpg'))
      .inputOptions(['-framerate', String(CANVAS_FPS), '-start_number', '0'])
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', FF_PRESET,
        '-crf', String(FF_CRF),
        '-pix_fmt', 'yuv420p',
        '-vf', `scale=${w}:${h}:flags=lanczos`,
        '-t', String(dur),
      ])
      .on('end', () => {
        for (let i = 0; i < totalFrames; i++) {
          try { fs.unlinkSync(path.join(workDir, `closing_${i.toString().padStart(4, '0')}.jpg`)); } catch {}
        }
        resolve();
      })
      .on('error', (err, stdout, stderr) => {
        console.error('closing clip stderr:', stderr);
        reject(err);
      })
      .save(clipPath);
  });

  return clipPath;
}

async function prepareLogoWatermark(dims, workDir) {
  const logo = await getLogoImage();
  if (!logo) return null;

  const { w, h } = dims;
  const wmSize = Math.round(Math.min(w, h) * 0.08);
  const padding = Math.round(wmSize * 0.4);
  const canvasSize = wmSize + padding * 2;

  const canvas = createCanvas(canvasSize, canvasSize);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvasSize, canvasSize);

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(canvasSize / 2, canvasSize / 2, wmSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(logo, canvasSize / 2 - wmSize / 2, canvasSize / 2 - wmSize / 2, wmSize, wmSize);
  ctx.restore();

  const wmPath = path.join(workDir, 'logo_watermark.png');
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(wmPath, buf);
  return wmPath;
}

async function addWatermarkAndFrame(videoPath, watermarkPath, framePath, dims, workDir) {
  const outPath = path.join(workDir, 'branded.mp4');
  const { w, h } = dims;
  const pad = Math.round(Math.min(w, h) * 0.03);

  const hasWm = watermarkPath && fs.existsSync(watermarkPath);
  const hasFrame = framePath && fs.existsSync(framePath);

  if (!hasWm && !hasFrame) return videoPath;

  let inputs = 1;
  let filterParts = [];
  let labels = {};

  if (hasWm) {
    inputs++;
    const wmIn = hasFrame ? '1:v' : '1:v';
    if (hasFrame) {
      filterParts.push(`[${wmIn}]format=rgba,colorchannelmixer=aa=0.75[wm]`);
      filterParts.push(`[0:v][wm]overlay=W-w-${pad}:${pad}:format=auto[wmed]`);
      labels.main = '[wmed]';
    } else {
      filterParts.push(`[${wmIn}]format=rgba,colorchannelmixer=aa=0.75[wm]`);
      filterParts.push(`[0:v][wm]overlay=W-w-${pad}:${pad}:format=auto,format=yuv420p[v]`);
      labels.main = '[v]';
    }
  }

  if (hasFrame) {
    inputs++;
    const frameIn = hasWm ? '2:v' : '1:v';
    if (hasWm) {
      filterParts.push(`[${frameIn}]format=rgba[frame]`);
      filterParts.push(`[wmed][frame]overlay=0:0:format=auto,format=yuv420p[v]`);
      labels.main = '[v]';
    } else {
      filterParts.push(`[${frameIn}]format=rgba[frame]`);
      filterParts.push(`[0:v][frame]overlay=0:0:format=auto,format=yuv420p[v]`);
      labels.main = '[v]';
    }
  }

  const cmd = ffmpeg().input(videoPath);
  if (hasWm) cmd.input(watermarkPath);
  if (hasFrame) cmd.input(framePath);

  await new Promise((resolve, reject) => {
    cmd
      .complexFilter([filterParts.join(';')])
      .outputOptions([
        '-map', labels.main,
        '-c:v', 'libx264',
        '-preset', FF_PRESET,
        '-crf', String(FF_CRF),
        '-pix_fmt', 'yuv420p',
        '-an',
      ])
      .on('end', resolve)
      .on('error', (err, stdout, stderr) => {
        console.error('watermark+frame stderr:', stderr);
        reject(err);
      })
      .save(outPath);
  });

  try { fs.unlinkSync(videoPath); } catch {}
  return outPath;
}

async function prepareBrandFrame(dims, workDir) {
  const logo = await getLogoImage();
  const { w, h } = dims;
  const isVertical = h > w;
  const topBarH = isVertical ? 80 : 60;
  const botBarH = isVertical ? 50 : 36;

  const canvas = createCanvas(w, topBarH + botBarH);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, topBarH + botBarH);

  // Top bar: solid olive with gradient fade at bottom edge
  const topGrad = ctx.createLinearGradient(0, 0, 0, topBarH);
  topGrad.addColorStop(0, '#5A5A40');
  topGrad.addColorStop(0.7, '#5A5A40');
  topGrad.addColorStop(1, 'rgba(90,90,64,0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, topBarH);

  // Logo circle + name on top bar
  if (logo) {
    const logoR = Math.round(topBarH * 0.32);
    const logoCX = logoR + 16;
    const logoCY = Math.round(topBarH * 0.40);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(logoCX, logoCY, logoR + 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(logoCX, logoCY, logoR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, logoCX - logoR, logoCY - logoR, logoR * 2, logoR * 2);
    ctx.restore();

    const nameSize = Math.round(topBarH * 0.30);
    ctx.font = `bold ${nameSize}px ${CANVAS_FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Sigo tu Huella', logoCX + logoR + 12, logoCY);
  }

  // Bottom bar: subtle gradient
  const botGrad = ctx.createLinearGradient(0, topBarH, 0, topBarH + botBarH);
  botGrad.addColorStop(0, 'rgba(90,90,64,0)');
  botGrad.addColorStop(0.3, 'rgba(90,90,64,0.6)');
  botGrad.addColorStop(1, '#5A5A40');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, topBarH, w, botBarH);

  const framePath = path.join(workDir, 'brand_frame.png');
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(framePath, buf);
  return { framePath, topBarH, botBarH };
}

async function generateAudio(stats, config, outputPath, voiceScript) {
  const script = voiceScript || buildAutoScript(config.style, stats);
  console.log('[TTS] generateAudio start — includeVoice:', config.includeVoice, 'script length:', script?.length);

  let ttsTmpPath = null;
  let ttsDur = 0;

  if (config.includeVoice && script) {
    const voice = STYLE_VOICES[config.style] || STYLE_VOICES.emotive;
    const params = STYLE_VOICE_PARAMS[config.style] || STYLE_VOICE_PARAMS.emotive;
    const ssml = buildSSML(script, voice, params);
    ttsTmpPath = outputPath.replace('.mp3', '_tts.mp3');

    let ttsOk = false;

    // 1) REST API (primary — most reliable)
    if (process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION) {
      try {
        console.log('[TTS] Trying REST API (primary)...');
        const size = await synthesizeREST(ssml, ttsTmpPath);
        if (size > 0) {
          ttsOk = true;
          console.log('[TTS] REST API success, size:', size);
        }
      } catch (err) {
        console.warn('[TTS] REST API failed:', err.message);
      }
    }

    // 2) SDK speakSsmlAsync (fallback 1)
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
            fs.writeFileSync(ttsTmpPath, Buffer.from(result.audioData));
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

    // 3) SDK speakTextAsync (fallback 2 — plain text, no SSML)
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
            fs.writeFileSync(ttsTmpPath, Buffer.from(result.audioData));
            console.log('[TTS] SDK speakTextAsync success, byteLength:', result.audioData.byteLength);
            ttsOk = true;
          }
        } catch (err2) {
          console.warn('[TTS] SDK speakTextAsync also failed:', err2.message);
        }
      }
    }

    if (ttsOk && fs.existsSync(ttsTmpPath)) {
      ttsDur = await getAudioDuration(ttsTmpPath);
      console.log('[TTS] TTS duration:', ttsDur.toFixed(1), 's');
    } else {
      console.warn('[TTS] All TTS methods failed, using music only');
      ttsTmpPath = null;
    }
  } else if (!script) {
    console.warn('[TTS] No voice script provided');
  }

  const musicUrl = MUSIC_TRACKS[config.music] || MUSIC_TRACKS.emotional;
  const musicPath = await getMusicFile(musicUrl);

  if (ttsTmpPath && fs.existsSync(ttsTmpPath)) {
    if (musicPath) {
      console.log('[Audio] Mixing TTS + music →', outputPath);
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(ttsTmpPath)
          .input(musicPath)
          .complexFilter([
            `[1:a]volume=0.35,atrim=end=${ttsDur > 0 ? ttsDur + 3 : config.duration}[musicVol]`,
            `[0:a][musicVol]amix=inputs=2:duration=longest:dropout_transition=3[mix]`,
          ])
          .outputOptions(['-map', '[mix]', '-c:a', 'libmp3lame', '-b:a', '192k'])
          .on('end', () => {
            const fSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
            console.log('[Audio] Mix complete, output size:', fSize);
            try { fs.unlinkSync(ttsTmpPath); } catch {}
            resolve();
          })
          .on('error', (err, stdout, stderr) => { console.error('[Audio] mix stderr:', stderr); reject(err); })
          .save(outputPath);
      });
    } else {
      console.log('[Audio] TTS only, copying to', outputPath);
      try { fs.copyFileSync(ttsTmpPath, outputPath); } catch {}
      try { fs.unlinkSync(ttsTmpPath); } catch {}
    }
  } else if (musicPath) {
    console.log('[Audio] Music only →', outputPath, 'duration:', config.duration);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(musicPath)
        .outputOptions(['-t', String(config.duration), '-c:a', 'libmp3lame', '-b:a', '192k'])
        .toFormat('mp3')
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });
  }

  const audioSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
  console.log('[Audio] Final audio file:', outputPath, 'size:', audioSize);

  return ttsDur;
}

function getAudioDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata || !metadata.format) {
        resolve(0);
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
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

async function addDrawTextToClip(clipPath, overlayText, clipStart, clipDur, dims, style, workDir, index) {
  if (!overlayText || !overlayText.trim()) return clipPath;

  const outPath = path.join(workDir, `text_${index}.mp4`);
  const { w, h } = dims;
  const fontPath = getFontPath();
  const fontSize = h > w ? 48 : 36;
  const textY = h > w ? Math.round(h * 0.72) : Math.round(h * 0.78);
  const escaped = escDrawText(overlayText);

  const drawboxPart = `drawbox=x=0:y=${textY - 10}:w=iw:h=${fontSize + 24}:color=black@0.45:t=fill:enable='between(t,0.3,${clipDur})'[bg]`;
  let drawtextPart;
  if (fontPath) {
    drawtextPart = `[bg]drawtext=text='${escaped}':fontfile='${fontPath}':fontcolor=white:fontsize=${fontSize}:x=(w-tw)/2:y=${textY}:shadowcolor=black:shadowx=2:shadowy=2:enable='between(t,0.3,${clipDur})'[v]`;
  } else {
    drawtextPart = `[bg]drawtext=text='${escaped}':fontcolor=white:fontsize=${fontSize}:x=(w-tw)/2:y=${textY}:shadowcolor=black:shadowx=2:shadowy=2:enable='between(t,0.3,${clipDur})'[v]`;
  }

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(clipPath)
      .complexFilter([`${drawboxPart};${drawtextPart}`])
    .outputOptions([
      '-map', '[v]',
      '-c:v', 'libx264',
      '-preset', FF_PRESET,
      '-crf', String(FF_CRF),
      '-pix_fmt', 'yuv420p',
    ])
    .on('end', resolve)
    .on('error', (err, stdout, stderr) => {
      console.error('drawtext stderr:', stderr);
      reject(err);
    })
    .save(outPath);
  });

  try { fs.unlinkSync(clipPath); } catch {}
  return outPath;
}

async function concatenateClipsWithTransitions(clipPaths, transition, workDir) {
  if (clipPaths.length === 1) return clipPaths[0];

  if (clipPaths.length === 2) {
    const outPath = path.join(workDir, 'concat.mp4');
    const offset = await getVideoDuration(clipPaths[0]) - TRANSITION_DUR;
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(clipPaths[0])
        .input(clipPaths[1])
        .complexFilter([
        `[0:v][1:v]xfade=transition=${transition}:duration=${TRANSITION_DUR}:offset=${offset}[v]`,
        ])
        .outputOptions(['-map', '[v]', '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF), '-pix_fmt', 'yuv420p', '-an'])
        .on('end', resolve)
        .on('error', (err, stdout, stderr) => {
          console.error('xfade stderr:', stderr);
          reject(err);
        })
        .save(outPath);
      });
      return outPath;
    }

    let currentPath = clipPaths[0];

    for (let i = 1; i < clipPaths.length; i++) {
      const outPath = path.join(workDir, `concat_${i}.mp4`);
      const firstDur = await getVideoDuration(currentPath);
      const offset = Math.max(0.1, firstDur - TRANSITION_DUR);

      await new Promise((resolve, reject) => {
        ffmpeg()
        .input(currentPath)
        .input(clipPaths[i])
        .complexFilter([
          `[0:v][1:v]xfade=transition=${transition}:duration=${TRANSITION_DUR}:offset=${offset}[v]`,
        ])
        .outputOptions(['-map', '[v]', '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF), '-pix_fmt', 'yuv420p', '-an'])
        .on('end', resolve)
        .on('error', (err, stdout, stderr) => {
          console.error('xfade stderr:', stderr);
          reject(err);
        })
        .save(outPath);
    });

    const prevPath = currentPath;
    currentPath = outPath;
    if (i > 1) {
      try { fs.unlinkSync(prevPath); } catch {}
    }
  }

  return currentPath;
}

async function concatenateSimple(clipPaths, workDir) {
  const listPath = path.join(workDir, 'clips.txt');
  const content = clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(listPath, content);

  const outPath = path.join(workDir, 'concat.mp4');
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF), '-pix_fmt', 'yuv420p'])
      .on('end', resolve)
      .on('error', (err, stdout, stderr) => {
        console.error('concat stderr:', stderr);
        reject(err);
      })
      .save(outPath);
  });

  return outPath;
}

async function muxAudioVideo(videoPath, audioPath, outputPath) {
  console.log('[Mux] video:', videoPath, fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 'missing');
  console.log('[Mux] audio:', audioPath, fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 'missing');
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions([
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
      ])
      .on('end', () => {
        const fSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
        console.log('[Mux] complete, output:', outputPath, 'size:', fSize);
        resolve();
      })
      .on('error', (err, stdout, stderr) => { console.error('[Mux] stderr:', stderr); reject(err); })
      .save(outputPath);
  });
}

function getVideoDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata || !metadata.format) {
        resolve(0);
        return;
      }
      resolve(metadata.format.duration || 0);
    });
  });
}

export async function generateVideo(config) {
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
  const zoompan = STYLE_ZOOMPAN[style] || STYLE_ZOOMPAN.emotive;
  const transition = STYLE_TRANSITIONS[style] || STYLE_TRANSITIONS.emotive;

  const jobId = uuidv4();
  const workDir = path.join(os.tmpdir(), `video-${jobId}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const t0 = Date.now();
    const logStep = (label) => console.log(`[VideoGen] ${label} @ ${(Date.now() - t0) / 1000}s`);

    const stats = await getGlobalStats();
    logStep('stats fetched');

    const photoScenes = scenes.filter(s => s.type === 'photo' && s.imageBase64);
    const numPhotoScenes = photoScenes.length;

    if (numPhotoScenes === 0) throw new Error('No hay fotos para generar el video');

    const fixedDur = OPENING_DUR + CLOSING_DUR;
    const totalTransitionDur = (numPhotoScenes + 1) * TRANSITION_DUR;
    const availableDur = Math.max(duration - fixedDur - totalTransitionDur, numPhotoScenes * 2);
    const photoClipDur = availableDur / numPhotoScenes;

    const audioPath = path.join(workDir, 'audio.mp3');

    const [openingClip, closingClip] = await Promise.all([
      generateOpeningClip(dims, style, workDir),
      generateClosingClip(dims, style, workDir),
      generateAudio(stats, { style, duration, music, includeVoice }, audioPath, voiceScript),
    ]);
    logStep('opening+closing+audio parallel');

    if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
      console.warn('No audio generated, creating silent track');
      await new Promise((resolve, reject) => {
        ffmpeg()
        .input('anullsrc=channel_layout=stereo:sample_rate=44100')
        .inputFormat('lavfi')
        .duration(duration)
        .outputOptions(['-c:a', 'libmp3lame', '-b:a', '128k'])
        .on('end', resolve)
        .on('error', reject)
        .save(audioPath);
      });
      logStep('silent audio');
    }

    const mainClips = [];
    mainClips.push(openingClip);

    for (let i = 0; i < numPhotoScenes; i++) {
      const scene = photoScenes[i];
      let clipPath = await generatePhotoClip(scene.imageBase64, photoClipDur, zoompan, dims, workDir, i);
      logStep(`photo clip ${i} zoompan`);

      const overlayText = scene.overlayText || '';
      clipPath = await addDrawTextToClip(clipPath, overlayText, 0, photoClipDur, dims, style, workDir, i);
      logStep(`photo clip ${i} drawtext`);

      mainClips.push(clipPath);
    }

    let mainVideoPath;
    try {
      mainVideoPath = await concatenateClipsWithTransitions(mainClips, transition, workDir);
    } catch (xfadeErr) {
      console.warn('xfade failed, falling back to simple concat:', xfadeErr.message);
      mainVideoPath = await concatenateSimple(mainClips, workDir);
    }
    logStep('concat+xfade');

    const [watermarkPath, brandFrame] = await Promise.all([
      prepareLogoWatermark(dims, workDir),
      prepareBrandFrame(dims, workDir),
    ]);
    mainVideoPath = await addWatermarkAndFrame(mainVideoPath, watermarkPath, brandFrame?.framePath, dims, workDir);
    logStep('watermark+frame');

    const fullVideoPath = path.join(workDir, 'full_video.mp4');
    try {
      const mainDur = await getVideoDuration(mainVideoPath);
      const offset = Math.max(0.1, mainDur - TRANSITION_DUR);
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(mainVideoPath)
          .input(closingClip)
          .complexFilter([
        `[0:v][1:v]xfade=transition=fade:duration=${TRANSITION_DUR}:offset=${offset}[v]`,
        ])
        .outputOptions(['-map', '[v]', '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF), '-pix_fmt', 'yuv420p', '-an'])
        .on('end', resolve)
        .on('error', (err, stdout, stderr) => {
          console.error('final xfade stderr:', stderr);
          reject(err);
        })
        .save(fullVideoPath);
      });
    } catch (err) {
      console.warn('Final xfade failed, using simple concat:', err.message);
      const listPath = path.join(workDir, 'final_clips.txt');
      fs.writeFileSync(listPath, [
        `file '${mainVideoPath.replace(/\\/g, '/')}'`,
        `file '${closingClip.replace(/\\/g, '/')}'`,
      ].join('\n'));
      await new Promise((resolve, reject) => {
        ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF), '-pix_fmt', 'yuv420p', '-an'])
          .on('end', resolve)
          .on('error', reject)
          .save(fullVideoPath);
      });
    }
    logStep('closing xfade');

    const videoFilename = `promo-${style}-${duration}s-${format}-${Date.now()}.mp4`;
    const finalVideoPath = path.join(VIDEO_OUTPUT_DIR, videoFilename);
    await muxAudioVideo(fullVideoPath, audioPath, finalVideoPath);
    logStep('mux audio+video');

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
      try {
        await new Promise((resolve, reject) => {
          ffmpeg()
            .input(finalVideoPath)
            .outputOptions(['-vframes', '1', '-f', 'image2'])
            .on('end', resolve)
            .on('error', reject)
            .save(thumbPath);
        });
      } catch {}
    }

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

export { getRandomReunionPhotos, getGlobalStats, getPetImages, getNewsImage };
