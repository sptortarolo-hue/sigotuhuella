import { createCanvas, loadImage } from 'canvas';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { rimraf } from 'rimraf';
import pool from '../db.js';

// Azure TTS (optional) — lazy load
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

// Directorios
const PUBLIC_DIR = process.env.PUBLIC_DIR || 'public';
const VIDEO_OUTPUT_DIR = path.join(process.env.PWD || process.cwd(), PUBLIC_DIR, 'generated', 'videos');
const MUSIC_DIR = path.join(process.env.PWD || process.cwd(), PUBLIC_DIR, 'generated', 'music');
if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
  fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
}

// Music URLs (local files, no external downloads needed)
const MUSIC_TRACKS = {
  'emotional': path.join(MUSIC_DIR, 'emotional.mp3'),
  'latin': path.join(MUSIC_DIR, 'latin.mp3'),
  'calm': path.join(MUSIC_DIR, 'calm.mp3'),
  'energetic': path.join(MUSIC_DIR, 'energetic.mp3')
};

// Helpers
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
    pool.query('SELECT COUNT(*) FROM users')
  ]);
  return {
    total_pets: parseInt(pets.rows[0].count),
    reunited: parseInt(reunited.rows[0].count),
    users: parseInt(users.rows[0].count)
  };
}

async function getPetData(petId) {
  const petResult = await pool.query(
    'SELECT * FROM pets WHERE id = $1 AND status = $2',
    [petId, 'reunited']
  );
  if (petResult.rows.length === 0) return null;
  const pet = petResult.rows[0];
  const imgs = await pool.query(
    'SELECT image_data FROM pet_images WHERE pet_id = $1 ORDER BY created_at',
    [petId]
  );
  pet.images = imgs.rows.map(r => r.image_data);
  return pet;
}

async function getMusicFile(url) {
  if (fs.existsSync(url) && fs.statSync(url).size > 0) return url;
  console.warn('Local music file not found:', url);
  return null;
}

// Draw frame with Ken Burns zoom and animated overlay text
async function drawFrame(photoBase64, stats, style, index, totalFrames, overlayText) {
  const canvas = createCanvas(1080, 1920);
  const ctx = canvas.getContext('2d');
  const progress = index / Math.max(totalFrames - 1, 1);

  const olive = '#5A5A40';
  const terracotta = '#D48C70';

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
  grad.addColorStop(0, olive);
  grad.addColorStop(1, terracotta);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1920);

  // Decorative circles (animated: slight scale)
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath(); ctx.arc(1080 * (0.85 + progress * 0.05), 1920 * (0.25 - progress * 0.03), 400 + progress * 50, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(1080 * (0.15 - progress * 0.05), 1920 * (0.85 + progress * 0.03), 300 - progress * 40, 0, Math.PI * 2); ctx.fill();

  // Photo (Ken Burns: slow zoom + slight pan)
  let photo;
  try {
    photo = await loadImage(Buffer.from(photoBase64, 'base64'));
  } catch (err) {
    console.error('Failed to load photo:', err.message);
    photo = null;
  }

  if (photo) {
    const zoom = 1 + progress * 0.7;
    const panX = progress * 50;
    const panY = progress * 25;
    const x = 140 - panX, y = 600 - panY, w = 800 * zoom, h = 800 * zoom;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(140, 600, 800, 800, 30);
    ctx.clip();
    ctx.drawImage(photo, x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 4;
    ctx.strokeRect(140, 600, 800, 800);
  }

  // Stats badge (fade in)
  ctx.globalAlpha = Math.min(1, progress * 3);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(70, 100, 940, 120);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${stats.reunited} mascotas reunidas`, 100, 130);
  ctx.font = '48px system-ui';
  ctx.fillText(`${stats.users} vecinos ayudando`, 100, 200);
  ctx.globalAlpha = 1;

  // Overlay text on dark gradient bar at bottom
  if (overlayText && overlayText.length > 0) {
    let frameText = overlayText[index % overlayText.length];
    if (typeof frameText === 'string' && frameText.trim()) {
      // Dark gradient bar
      const barGrad = ctx.createLinearGradient(0, 1400, 0, 1700);
      barGrad.addColorStop(0, 'rgba(0,0,0,0)');
      barGrad.addColorStop(0.1, 'rgba(0,0,0,0.7)');
      barGrad.addColorStop(0.9, 'rgba(0,0,0,0.7)');
      barGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = barGrad;
      ctx.fillRect(0, 1400, 1080, 300);

      // Animate text opacity: fade in over first 30% of its display
      ctx.globalAlpha = 0.3 + 0.7 * Math.min(1, progress * 3.3);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 56px system-ui, -apple-system, sans-serif';

      // Text shadow
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      const maxWidth = 960;
      const words = frameText.split(' ');
      let line = '';
      let y = 1550;
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line.trim(), 540, y);
          line = words[i] + ' ';
          y += 64;
        } else {
          line = testLine;
        }
      }
      if (line.trim()) {
        ctx.fillText(line.trim(), 540, y);
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
  }

  // Logo bottom (fade in)
  ctx.globalAlpha = Math.min(1, progress * 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px system-ui, -apple-system, sans-serif';
  ctx.fillText('SIGO TU HUELLA', 540, 1830);
  ctx.globalAlpha = 1;

  return canvas.toBuffer('image/png');
}

// Generate audio using customScript if provided
async function generateAudio(stats, config, outputPath, customScript) {
  const script = customScript || buildAutoScript(config.style, stats);

  let ttsBuffer = null;
    if (config.includeVoice) {
      const sdk = await getSpeechSdk();
      if (sdk && script) {
        try {
          const speechConfig = sdk.SpeechConfig.fromSubscription(
            process.env.AZURE_TTS_KEY,
            process.env.AZURE_TTS_REGION || 'southamerica-east1'
          );
          speechConfig.speechSynthesisVoiceName = 'es-AR-ElenaNeural';

          const ttsOutputPath = outputPath.replace('.mp3', '_tts.wav');
          const audioConfig = sdk.AudioConfig.fromAudioFileOutput(ttsOutputPath);
          const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);
          const result = await new Promise((resolve, reject) => {
            synthesizer.speakTextAsync(script, res => resolve(res), err => reject(err));
          });
          synthesizer.close();
          if (fs.existsSync(ttsOutputPath) && fs.statSync(ttsOutputPath).size > 0) {
            ttsBuffer = fs.readFileSync(ttsOutputPath);
          } else if (result && result.audioData && result.audioData.length > 0) {
            ttsBuffer = Buffer.from(result.audioData);
          }
        } catch (err) {
          console.warn('Azure TTS failed, will use music only:', err.message);
          ttsBuffer = null;
        }
      }
    }

  const musicUrl = MUSIC_TRACKS[config.music] || MUSIC_TRACKS['emotional'];
  const musicPath = await getMusicFile(musicUrl);
  if (!musicPath) {
    console.warn('No music available, generating audio without music');
  }

  if (ttsBuffer) {
    const ttsTmp = outputPath.replace('.mp3', '_tts.wav');
    fs.writeFileSync(ttsTmp, ttsBuffer);
    if (musicPath) {
      // Mix TTS (full volume) + music (50% volume) via filter_complex
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(ttsTmp)
          .input(musicPath)
          .complexFilter([
            '[1:a]volume=0.5[musicVol]',
            '[0:a][musicVol]amix=inputs=2:duration=first:dropout_transition=2[mix]'
          ])
          .outputOptions(['-map', '[mix]', '-c:a', 'aac', '-b:a', '192k', '-shortest'])
          .on('end', () => {
            try { fs.unlinkSync(ttsTmp); } catch {}
            resolve();
          })
          .on('error', (err, stdout, stderr) => {
            console.error('mix audio stderr:', stderr);
            reject(err);
          })
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
        '-shortest'
      ])
      .on('end', resolve)
      .on('error', (err, stdout, stderr) => {
        console.error('ffmpeg stderr:', stderr);
        reject(err);
      })
      .save(outputPath);
  });
}

// Build auto-generated script based on style and stats
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

// Main export
export async function generateVideo(config) {
  const {
    style = 'emotive',
    duration = 60,
    music = 'emotional',
    includeVoice = true,
    petId,
    customScript,
    overlayText
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
    // Prepare photos (array of base64 strings)
    let photos = [];
    let audioScript = customScript || '';
    let overlayFrames = [];

    // Process overlayText into array of frames
    if (overlayText) {
      if (Array.isArray(overlayText)) {
        overlayFrames = overlayText.filter(t => typeof t === 'string' && t.trim());
      } else if (typeof overlayText === 'string') {
        const lines = overlayText.split('\n').filter(l => l.trim());
        overlayFrames = lines;
      }
    }

    if (petId) {
      const pet = await getPetData(petId);
      if (!pet) throw new Error('Pet not found or not reunited');
      photos = pet.images;
      if (photos.length === 0) throw new Error('Pet has no images');
      // If no customScript, build from pet description or auto
      if (!customScript && pet.description) {
        audioScript = pet.description;
      }
    } else {
      // Random selection
      const count = Math.min(numFrames, 8);
      photos = await getRandomReunionPhotos(count);
      if (photos.length === 0) throw new Error('No reunion photos available');
    }

    // Ensure we have photos
    if (photos.length === 0) throw new Error('No photos available');

    const stats = await getGlobalStats();

    // Generate frames
    for (let i = 0; i < numFrames; i++) {
      const photo = photos[i % photos.length];
      // Determine overlay text for this frame
      let frameOverlay = [];
      if (overlayFrames.length > 0) {
        frameOverlay = [overlayFrames[i % overlayFrames.length]];
      }

      const frame = await drawFrame(photo, stats, style, i, numFrames, frameOverlay);
      fs.writeFileSync(path.join(framesDir, `frame${i.toString().padStart(3, '0')}.png`), frame);
    }

    // Generate audio
    const audioPath = path.join(workDir, 'audio.mp3');
    await generateAudio(stats, { style, duration, music, includeVoice }, audioPath, audioScript);

    // If no audio generated, create silent audio
    if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
      console.warn('No audio generated, creating silent track');
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input('anullsrc')
          .inputFormat('lavfi')
          .duration(duration)
          .outputOptions(['-c:a', 'libmp3lame', '-b:a', '128k'])
          .on('end', resolve)
          .on('error', (err, stdout, stderr) => {
            console.error('silent audio stderr:', stderr);
            reject(err);
          })
          .save(audioPath);
      });
    }

    // Assemble video
    const videoFilename = `promo-${style}-${duration}s-${Date.now()}.mp4`;
    const finalVideoPath = path.join(VIDEO_OUTPUT_DIR, videoFilename);
    await assembleVideo(framesDir, audioPath, finalVideoPath, frameDuration, numFrames);

    // Thumbnail
    const thumbFilename = videoFilename.replace('.mp4', '_thumb.jpg');
    const thumbPath = path.join(VIDEO_OUTPUT_DIR, thumbFilename);
    const firstFrame = fs.readFileSync(path.join(framesDir, 'frame000.png'));
    await sharp(firstFrame).jpeg({ quality: 80 }).toFile(thumbPath);

    return {
      filename: videoFilename,
      filepath: finalVideoPath,
      thumbnail: thumbFilename,
      thumbnailPath: thumbPath,
      size: fs.statSync(finalVideoPath).size
    };

  } finally {
    if (fs.existsSync(workDir)) {
      rimraf.sync(workDir);
    }
  }
}

export { getRandomReunionPhotos, getGlobalStats, drawFrame };
