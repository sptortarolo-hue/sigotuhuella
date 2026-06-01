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
  const totalFrames = Math.round(dur * FPS);
  const fadeOutStart = totalFrames - Math.round(0.5 * FPS);

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const logo = await getLogoImage();

  const frames = [];
  for (let i = 0; i < totalFrames; i++) {
    const progress = i / (totalFrames - 1);

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, olive);
    grad.addColorStop(1, terracotta);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let c = 0; c < 3; c++) {
      ctx.beginPath();
      ctx.arc(w * 0.5, h * (0.2 + c * 0.3), w * (0.3 + c * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }

    const haloProgress = Math.min(1, progress * 3);
    const haloAlpha = 0.08 + 0.04 * Math.sin(i * 0.15);
    ctx.fillStyle = `rgba(255,255,255,${haloAlpha * haloProgress})`;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.32, w * 0.18, 0, Math.PI * 2);
    ctx.fill();

    if (logo) {
      const easeT = Math.min(1, progress * 2.5);
      const eased = easeT < 0.5 ? 2 * easeT * easeT : 1 - Math.pow(-2 * easeT + 2, 2) / 2;
      const logoScale = 0.3 + 0.7 * eased;
      const logoSize = (h < w ? h : w) * 0.14;
      const actualSize = logoSize * logoScale;
      const logoX = w / 2 - actualSize / 2;
      const logoY = h * 0.32 - actualSize / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.32, actualSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logo, logoX, logoY, actualSize, actualSize);
      ctx.restore();

      ctx.strokeStyle = `rgba(255,255,255,${0.5 * haloProgress})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.32, actualSize / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    const textFadeIn = Math.max(0, Math.min(1, (progress - 0.33) * 4));
    if (textFadeIn > 0) {
      ctx.save();
      ctx.globalAlpha = textFadeIn;
      ctx.fillStyle = '#ffffff';
      const titleSize = h > w ? 64 : 48;
      ctx.font = `bold ${titleSize}px ${CANVAS_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SIGO TU HUELLA', w / 2, h * 0.52);

      const lineProgress = Math.max(0, Math.min(1, (progress - 0.45) * 5));
      const lineWidth = w * 0.3 * lineProgress;
      ctx.strokeStyle = terracotta;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w / 2 - lineWidth / 2, h * 0.52 + titleSize * 0.6 + 12);
      ctx.lineTo(w / 2 + lineWidth / 2, h * 0.52 + titleSize * 0.6 + 12);
      ctx.stroke();

      ctx.restore();
    }

    if (i >= fadeOutStart) {
      const fadeOutProgress = (i - fadeOutStart) / (totalFrames - fadeOutStart);
      ctx.fillStyle = `rgba(90,90,64,${fadeOutProgress * 0.6})`;
      ctx.fillRect(0, 0, w, h);
    }

    const frameBuf = canvas.toBuffer('image/png');
    const framePath = path.join(workDir, `opening_${i.toString().padStart(4, '0')}.png`);
    fs.writeFileSync(framePath, frameBuf);
    frames.push(framePath);
  }

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(workDir, 'opening_%04d.png'))
      .inputOptions(['-framerate', String(FPS), '-start_number', '0'])
      .outputOptions([
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-t', String(dur),
      ])
      .on('end', () => {
        for (const f of frames) { try { fs.unlinkSync(f); } catch {} }
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
  const dur = CLOSING_DUR;
  const totalFrames = Math.round(dur * FPS);
  const fadeOutStart = totalFrames - Math.round(1.0 * FPS);

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const logo = await getLogoImage();

  const logoSize = Math.round((h < w ? h : w) * 0.35);
  const logoCenterY = h * 0.32;

  const titleSize = h > w ? 64 : 48;
  const titleY = logoCenterY + logoSize / 2 + titleSize * 0.8 + 20;

  const lineWidth = w * 0.35;
  const lineY = titleY + titleSize * 0.6 + 12;

  const urlSize = h > w ? 42 : 32;
  const urlY = lineY + 20 + urlSize * 0.6;

  const ctaSize = h > w ? 32 : 24;
  const cta1Y = urlY + urlSize * 0.6 + 18;
  const cta2Y = cta1Y + ctaSize * 0.7 + 8;

  const frames = [];
  for (let i = 0; i < totalFrames; i++) {
    const progress = i / (totalFrames - 1);

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, olive);
    grad.addColorStop(1, terracotta);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.beginPath();
    ctx.arc(w * 0.5, logoCenterY, w * 0.4, 0, Math.PI * 2);
    ctx.fill();

    const logoAlpha = Math.min(1, progress * 5);
    if (logo) {
      ctx.save();
      ctx.globalAlpha = logoAlpha;

      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(w / 2, logoCenterY, logoSize / 2 + 15, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(w / 2, logoCenterY, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logo, w / 2 - logoSize / 2, logoCenterY - logoSize / 2, logoSize, logoSize);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = logoAlpha;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(w / 2, logoCenterY, logoSize / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const titleAlpha = Math.max(0, Math.min(1, (progress - 0.1) * 5));
    ctx.save();
    ctx.globalAlpha = titleAlpha;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${titleSize}px ${CANVAS_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
    ctx.fillText('SIGO TU HUELLA', w / 2, titleY);
    ctx.restore();

    const lineAlpha = Math.max(0, Math.min(1, (progress - 0.15) * 5));
    const lineProgress = Math.max(0, Math.min(1, (progress - 0.15) * 4));
    ctx.save();
    ctx.globalAlpha = lineAlpha;
    ctx.strokeStyle = terracotta;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2 - lineWidth * lineProgress / 2, lineY);
    ctx.lineTo(w / 2 + lineWidth * lineProgress / 2, lineY);
    ctx.stroke();
    ctx.restore();

    const urlAlpha = Math.max(0, Math.min(1, (progress - 0.2) * 5));
    ctx.save();
    ctx.globalAlpha = urlAlpha;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${urlSize}px ${CANVAS_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
    ctx.fillText('sigotuhuella.online', w / 2, urlY);
    ctx.restore();

    const ctaAlpha = Math.max(0, Math.min(1, (progress - 0.28) * 5));
    ctx.save();
    ctx.globalAlpha = ctaAlpha;
    ctx.font = `bold ${ctaSize}px ${CANVAS_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Visitá nuestra web', w / 2, cta1Y);
    ctx.fillText('Descargá la app gratis', w / 2, cta2Y);
    ctx.restore();

    if (i >= fadeOutStart) {
      const fadeOutProgress = (i - fadeOutStart) / (totalFrames - 1 - fadeOutStart);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(0,0,0,${fadeOutProgress * 0.85})`;
      ctx.fillRect(0, 0, w, h);
    }

    const frameBuf = canvas.toBuffer('image/png');
    const framePath = path.join(workDir, `closing_${i.toString().padStart(4, '0')}.png`);
    fs.writeFileSync(framePath, frameBuf);
    frames.push(framePath);
  }

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(workDir, 'closing_%04d.png'))
      .inputOptions(['-framerate', String(FPS), '-start_number', '0'])
      .outputOptions([
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-t', String(dur),
      ])
      .on('end', () => {
        for (const f of frames) { try { fs.unlinkSync(f); } catch {} }
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

async function addWatermarkToVideo(videoPath, watermarkPath, dims, workDir) {
  if (!watermarkPath || !fs.existsSync(watermarkPath)) return videoPath;

  const outPath = path.join(workDir, 'watermarked.mp4');
  const { w, h } = dims;
  const pad = Math.round(Math.min(w, h) * 0.03);

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(watermarkPath)
      .complexFilter([
        `[1:v]format=rgba,colorchannelmixer=aa=0.75[wm];[0:v][wm]overlay=W-w-${pad}:${pad}:format=auto,format=yuv420p[v]`,
      ])
      .outputOptions(['-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an'])
      .on('end', resolve)
      .on('error', (err, stdout, stderr) => {
        console.error('watermark stderr:', stderr);
        reject(err);
      })
      .save(outPath);
  });

  try { fs.unlinkSync(videoPath); } catch {}
  return outPath;
}

async function generateAudio(stats, config, outputPath, voiceScript) {
  const script = voiceScript || buildAutoScript(config.style, stats);
  console.log('[TTS] generateAudio start — includeVoice:', config.includeVoice, 'script length:', script?.length);

  let ttsTmpPath = null;
  let ttsDur = 0;

  if (config.includeVoice) {
    const sdk = await getSpeechSdk();
    console.log('[TTS] SDK loaded:', !!sdk, 'has key:', !!process.env.AZURE_TTS_KEY, 'has region:', !!process.env.AZURE_TTS_REGION);
    if (sdk && script) {
      const voice = STYLE_VOICES[config.style] || STYLE_VOICES.emotive;
      const params = STYLE_VOICE_PARAMS[config.style] || STYLE_VOICE_PARAMS.emotive;

      ttsTmpPath = outputPath.replace('.mp3', '_tts.mp3');

      let ttsOk = false;

      try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(
          process.env.AZURE_TTS_KEY,
          process.env.AZURE_TTS_REGION || 'eastus',
        );
        speechConfig.speechSynthesisVoiceName = voice;
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

      const ssml = buildSSML(script, voice, params);
      console.log('[TTS] Attempting speakSsmlAsync, voice:', voice, 'SSML length:', ssml.length);
      console.log('[TTS] SSML:\n', ssml);
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
        const result = await new Promise((resolve, reject) => {
          synthesizer.speakSsmlAsync(ssml, res => resolve(res), err => reject(err));
        });
        synthesizer.close();

        console.log('[TTS] SSML result — reason:', result?.reason, 'audioData type:', typeof result?.audioData, 'byteLength:', result?.audioData?.byteLength, 'is ArrayBuffer:', result?.audioData instanceof ArrayBuffer);
        if (result && result.audioData && result.audioData.byteLength > 0
          && result.reason !== sdk.ResultReason.Canceled) {
          fs.writeFileSync(ttsTmpPath, Buffer.from(result.audioData));
          const fSize = fs.statSync(ttsTmpPath).size;
          console.log('[TTS] SSML wrote file:', ttsTmpPath, 'size:', fSize);
          ttsOk = true;
        } else if (result && result.reason === sdk.ResultReason.Canceled) {
          const cancellation = sdk.CancellationDetails.fromResult(result);
          console.warn('[TTS] SSML canceled:', cancellation.reason, cancellation.errorDetails);
        } else {
          console.warn('[TTS] SSML result unexpected:', JSON.stringify({ reason: result?.reason, hasAudioData: !!result?.audioData, byteLength: result?.audioData?.byteLength }));
        }
      } catch (err) {
        console.warn('[TTS] SSML failed with voice', voice, ':', err.message);
      }

      if (!ttsOk) {
        console.warn('[TTS] Retrying with speakTextAsync (plain text, no SSML)...');
        try {
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

          console.log('[TTS] speakTextAsync result — reason:', result?.reason, 'byteLength:', result?.audioData?.byteLength);
          if (result && result.audioData && result.audioData.byteLength > 0) {
            fs.writeFileSync(ttsTmpPath, Buffer.from(result.audioData));
            const fSize = fs.statSync(ttsTmpPath).size;
            console.log('[TTS] speakTextAsync wrote file:', ttsTmpPath, 'size:', fSize);
            ttsOk = true;
          }
        } catch (err2) {
          console.warn('[TTS] speakTextAsync also failed:', err2.message);
        }
      }

      if (ttsOk && fs.existsSync(ttsTmpPath)) {
        ttsDur = await getAudioDuration(ttsTmpPath);
        console.log('[TTS] TTS duration:', ttsDur.toFixed(1), 's');
      } else {
        console.warn('[TTS] TTS failed completely, using music only');
        ttsTmpPath = null;
      }
    } else if (!sdk) {
      console.warn('[TTS] Azure Speech SDK not available');
    } else if (!script) {
      console.warn('[TTS] No voice script provided');
    }
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
        .outputOptions(['-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an'])
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
        .outputOptions(['-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an'])
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
      .outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p'])
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
    const stats = await getGlobalStats();

    const photoScenes = scenes.filter(s => s.type === 'photo' && s.imageBase64);
    const numPhotoScenes = photoScenes.length;

    if (numPhotoScenes === 0) throw new Error('No hay fotos para generar el video');

    const fixedDur = OPENING_DUR + CLOSING_DUR;
    const totalTransitionDur = (numPhotoScenes + 1) * TRANSITION_DUR;
    const availableDur = Math.max(duration - fixedDur - totalTransitionDur, numPhotoScenes * 2);
    const photoClipDur = availableDur / numPhotoScenes;

    const audioPath = path.join(workDir, 'audio.mp3');
    await generateAudio(stats, { style, duration, music, includeVoice }, audioPath, voiceScript);

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
    }

    const mainClips = [];

    const openingClip = await generateOpeningClip(dims, style, workDir);
    mainClips.push(openingClip);

    for (let i = 0; i < numPhotoScenes; i++) {
      const scene = photoScenes[i];
      let clipPath = await generatePhotoClip(scene.imageBase64, photoClipDur, zoompan, dims, workDir, i);

      const overlayText = scene.overlayText || '';
      clipPath = await addDrawTextToClip(clipPath, overlayText, 0, photoClipDur, dims, style, workDir, i);

      mainClips.push(clipPath);
    }

    let mainVideoPath;
    try {
      mainVideoPath = await concatenateClipsWithTransitions(mainClips, transition, workDir);
    } catch (xfadeErr) {
      console.warn('xfade failed, falling back to simple concat:', xfadeErr.message);
      mainVideoPath = await concatenateSimple(mainClips, workDir);
    }

    const watermarkPath = await prepareLogoWatermark(dims, workDir);
    if (watermarkPath) {
      mainVideoPath = await addWatermarkToVideo(mainVideoPath, watermarkPath, dims, workDir);
    }

    const closingClip = await generateClosingClip(dims, style, workDir);

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
          .outputOptions(['-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an'])
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
      .outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an'])
          .on('end', resolve)
          .on('error', reject)
          .save(fullVideoPath);
      });
    }

    const videoFilename = `promo-${style}-${duration}s-${format}-${Date.now()}.mp4`;
    const finalVideoPath = path.join(VIDEO_OUTPUT_DIR, videoFilename);
    await muxAudioVideo(fullVideoPath, audioPath, finalVideoPath);

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
