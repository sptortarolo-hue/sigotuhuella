import { createCanvas, loadImage } from 'canvas';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { rimraf } from 'rimraf';
import pool from '../db.js';
import axios from 'axios';

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

// Music URLs (free, no attribution required)
const MUSIC_TRACKS = {
  'emotional': 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_2320399e9f.mp3',
  'latin': 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3',
  'calm': 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
  'energetic': 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_5b8238377c.mp3'
};

// Directorios
const PUBLIC_DIR = process.env.PUBLIC_DIR || 'public';
const VIDEO_OUTPUT_DIR = path.join(process.env.PWD || process.cwd(), PUBLIC_DIR, 'generated', 'videos');
if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
  fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
}

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
  const cacheDir = path.join(os.tmpdir(), 'video-music');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const filename = `music-${Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
  const localPath = path.join(cacheDir, filename);
  if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) return localPath;
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://pixabay.com/'
      }
    });
    const writeStream = fs.createWriteStream(localPath);
    response.data.pipe(writeStream);
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    return localPath;
  } catch (err) {
    console.warn('Failed to download music:', url, err.message);
    return null;
  }
}

// Draw frame with optional overlay text
async function drawFrame(photoBase64, stats, style, index, totalFrames, overlayText) {
  const canvas = createCanvas(1080, 1920);
  const ctx = canvas.getContext('2d');

  const olive = '#5A5A40';
  const terracotta = '#D48C70';

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
  grad.addColorStop(0, olive);
  grad.addColorStop(1, terracotta);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1920);

  // Decorative circles
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath(); ctx.arc(1080 * 0.85, 1920 * 0.25, 400, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(1080 * 0.15, 1920 * 0.85, 300, 0, Math.PI * 2); ctx.fill();

  // Photo
  let photo;
  try {
    photo = await loadImage(Buffer.from(photoBase64, 'base64'));
  } catch (err) {
    console.error('Failed to load photo:', err.message);
    photo = null;
  }

  if (photo) {
    const x = 140, y = 600, w = 800, h = 800;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 30);
    ctx.clip();
    ctx.drawImage(photo, x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
  }

  // Stats badge
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(70, 100, 940, 120);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${stats.reunited} mascotas reunidas`, 100, 130);
  ctx.font = '48px system-ui';
  ctx.fillText(`${stats.users} vecinos ayudando`, 100, 200);

  // Overlay text (if provided)
  if (overlayText && overlayText.length > 0) {
    let frameText = overlayText[index % overlayText.length];
    if (typeof frameText === 'string' && frameText.trim()) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.textAlign = 'center';
      ctx.font = 'italic 46px "Georgia", serif';
      const maxWidth = 940;
      const words = frameText.split(' ');
      let line = '';
      let y = 1550;
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line.trim(), 540, y);
          line = words[i] + ' ';
          y += 55;
        } else {
          line = testLine;
        }
      }
      if (line.trim()) {
        ctx.fillText(line.trim(), 540, y);
      }
    }
  }

  // Logo bottom
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px system-ui, -apple-system, sans-serif';
  ctx.fillText('SIGO TU HUELLA', 540, 1830);

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

          const audioConfig = new sdk.AudioConfig(sdk.SpeakerAudioDestination.fromDefaultSpeaker());
          const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);
          const result = await new Promise((resolve, reject) => {
            synthesizer.speakTextAsync(script, res => resolve(res), err => reject(err));
          });
          if (result && result.audioData && result.audioData.length > 0) {
            ttsBuffer = Buffer.from(result.audioData);
          }
          synthesizer.close();
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
    const ttsTmp = outputPath.replace('.mp3', '_tts.mp3');
    fs.writeFileSync(ttsTmp, ttsBuffer);
    if (musicPath) {
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(ttsTmp)
          .input(musicPath)
          .audioFilters([
            'volume=0.6:enable=between(t,0,3600)',
            'volume=1.2:enable=between(t,0,3600)'
          ])
          .outputOptions('-shortest')
          .toFormat('mp3')
          .audioBitrate('192k')
          .on('end', resolve)
          .on('error', reject)
          .save(outputPath);
      });
    } else {
      // Just copy TTS as-is (no music)
      fs.copyFileSync(ttsTmp, outputPath);
    }
    fs.unlinkSync(ttsTmp);
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
          .outputOptions(['-c:a', 'aac', '-b:a', '128k'])
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
