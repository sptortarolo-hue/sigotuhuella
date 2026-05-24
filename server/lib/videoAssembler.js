import { createCanvas, loadImage } from 'canvas';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import rimraf from 'rimraf';
import pool from '../db.js';

// Azure TTS (optional)
let speechSdk;
if (process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION) {
  try {
    speechSdk = require('microsoft-cognitiveservices-speech-sdk');
  } catch (e) {
    console.warn('Azure Speech SDK not loaded:', e.message);
  }
}

// Music tracks (place these in public/audio/)
const MUSIC_TRACKS = {
  'promo_emotional.mp3': '/audio/promo_emotional.mp3',
  'promo_latin.mp3': '/audio/promo_latin.mp3',
  'promo_calm.mp3': '/audio/promo_calm.mp3',
  'promo_energetic.mp3': '/audio/promo_energetic.mp3'
};

// Absolute path on server
const PUBLIC_DIR = process.env.PUBLIC_DIR || 'public';
const AUDIO_BASE = path.join(process.env.PWD || process.cwd(), PUBLIC_DIR, 'audio');
const VIDEO_OUTPUT_DIR = path.join(process.env.PWD || process.cwd(), PUBLIC_DIR, 'generated', 'videos');

// Ensure output dir exists
if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
  fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
}

// Helpers
async function getRandomReunionPhotos(limit = 8) {
  const result = await pool.query(`
    SELECT pi.image_data FROM pet_images pi
    JOIN pets p ON p.id = pi.pet_id
    WHERE p.status = 'reunited'
    ORDER BY RANDOM()
    LIMIT $1
  `, [limit]);
  return result.rows.map(r => r.image_data);
}

async function getRandomTestimonials(limit = 6) {
  const result = await pool.query(`
    SELECT name, description FROM pets 
    WHERE status = 'reunited' AND description IS NOT NULL AND length(description) > 20
    ORDER BY RANDOM() LIMIT $1
  `, [limit]);
  return result.rows;
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

// Draw a single video frame (1080x1920)
async function drawFrame(photoBase64, testimonial, stats, style, index, totalFrames) {
  const { createCanvas, loadImage, registerFont } = require('canvas');
  const canvas = createCanvas(1080, 1920);
  const ctx = canvas.getContext('2d');

  // Brand colors
  const olive = '#5A5A40';
  const terracotta = '#D48C70';
  const cream = '#F5F5F0';
  const gray = '#E6E6DF';

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 1080, 1920);
  grad.addColorStop(0, olive);
  grad.addColorStop(1, terracotta);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1920);

  // Decorative large circles (subtle)
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath();
  ctx.arc(1080 * 0.85, 1920 * 0.25, 400, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1080 * 0.15, 1920 * 0.85, 300, 0, Math.PI * 2);
  ctx.fill();

  // Load and draw photo (square with attention, already processed)
  let photo;
  try {
    const imgBuffer = Buffer.from(photoBase64, 'base64');
    photo = await loadImage(imgBuffer);
  } catch (err) {
    console.error('Failed to load photo:', err.message);
    photo = null;
  }

  if (photo) {
    // Draw as rounded rectangle (like card)
    const x = 140, y = 600, w = 800, h = 800;
    ctx.save();
    // Rounded clip
    const radius = 30;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.clip();
    // Draw image covering
    ctx.drawImage(photo, x, y, w, h);
    ctx.restore();
    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
  }

  // Stats badge (top)
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(70, 100, 940, 120);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${stats.reunited} mascotas reunidas`, 100, 130);
  ctx.font = '48px system-ui';
  ctx.fillText(`${stats.users} vecinos ayudando`, 100, 200);

  // Testimonial (bottom)
  if (testimonial && testimonial.description) {
    const text = testimonial.description.length > 150
      ? testimonial.description.substring(0, 150) + '...'
      : testimonial.description;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textAlign = 'center';
    ctx.font = 'italic 46px "Georgia", serif';
    // Wrap text
    const maxWidth = 940;
    const words = text.split(' ');
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

  // Logo bottom
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px system-ui, -apple-system, sans-serif';
  ctx.fillText('SIGO TU HUELLA', 540, 1830);

  return canvas.toBuffer('image/png');
}

// Generate audio: TTS + background music
async function generateAudio(testimonials, stats, config, outputPath) {
  // Build script
  let script = '';
  if (config.style === 'emotive') {
    script = `En Sigo Tu Huella, cada historia de reencuentro nos llena el corazón. `;
    if (testimonials[0]) {
      const snippet = testimonials[0].description.substring(0, 120) + '...';
      script += `Escuchá este mensaje: "${snippet}". `;
    }
    script += `Ya reunimos más de ${stats.reunited} mascotas con sus familias. `;
    script += `Más de ${stats.users} vecinos confían en nosotros. `;
  } else if (config.style === 'informative') {
    script = `¿Perdiste a tu mascota? ¿Encontraste un animal? `;
    script += `Sigo Tu Huella es la plataforma que conecta a toda la comunidad. `;
    script += `Reportá en segundos y recibí alertas a tu zona. `;
    script += `Contamos con ${stats.users} usuarios activos y ${stats.reunited} reencuentros exitosos. `;
  } else { // viral
    script = `¡La comunidad se mueve! `;
    script += `Más de ${stats.reunited} mascotas ya volvieron a casa. `;
    script += `¿Vos ya descargaste la app? `;
    script += `Unite a la red que devuelve sonrisas. `;
  }
  script += `Descargá Sigo Tu Huella gratis en sigotuhuella.online y sé parte del cambio.`;

  let ttsBuffer = null;
  if (config.includeVoice && speechSdk) {
    try {
      const SpeechConfig = speechSdk.SpeechConfig;
      const AudioConfig = speechSdk.AudioConfig;
      const SpeechSynthesisOutputFormat = speechSdk.SpeechSynthesisOutputFormat;

      const speechConfig = SpeechConfig.fromSubscription(
        process.env.AZURE_TTS_KEY,
        process.env.AZURE_TTS_REGION || 'southamerica-east1'
      );
      speechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
      // Use argentinian voice
      speechConfig.speechSynthesisVoiceName = 'es-AR-ElenaNeural';

      const audioOutput = new (require('microsoft-cognitiveservices-speech-sdk').AudioConfig)(require('microsoft-cognitiveservices-speech-sdk').AudioOutputFormat.DefaultSpeaker);
      const synthesizer = new speechSdk.SpeechSynthesizer(speechConfig, audioOutput);
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

  // Music file path
  const musicFilename = config.music || 'promo_emotional.mp3';
  const musicPath = path.join(AUDIO_BASE, musicFilename);
  if (!fs.existsSync(musicPath)) {
    throw new Error(`Music file not found: ${musicPath}. Please place audio tracks in public/audio/`);
  }

  // Mix audio
  if (ttsBuffer) {
    // Save tts to temp file
    const ttsPath = outputPath.replace('.mp3', '_tts.mp3');
    fs.writeFileSync(ttsPath, ttsBuffer);
    // Mix: TTS at volume 1.2, music at 0.6
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(ttsPath)
        .input(musicPath)
        .audioFilters([
          'volume=0.6:enable=between(t,0,3600)', // music
          'volume=1.2:enable=between(t,0,3600)'  // voice louder
        ])
        .outputOptions('-shortest')
        .toFormat('mp3')
        .audioBitrate('192k')
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });
    fs.unlinkSync(ttsPath);
  } else {
    // Only music (loop to duration? For now, just copy music; ffmpeg will use its length)
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

// Assemble video frames + audio into final mp4
function assembleVideo(framesDir, audioPath, outputPath, frameDuration, numFrames) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(framesDir, 'frame%03d.png'))
      .input(audioPath)
      .outputOptions([
        '-framerate', `1/${frameDuration}`, // each frame lasts N seconds
        '-r', '30', // output framerate
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest'
      ])
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
}

// Main function
export async function generateVideo(config) {
  const { style = 'emotive', duration = 60, music = 'promo_emotional.mp3', includeVoice = true } = config;
  const frameDuration = 5;
  const numFrames = Math.floor(duration / frameDuration);
  if (numFrames < 1) throw new Error('Duration too short');

  // Temp job directory
  const jobId = uuidv4();
  const workDir = path.join(os.tmpdir(), `video-${jobId}`);
  const framesDir = path.join(workDir, 'frames');
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    // 1. Assets
    const photos = await getRandomReunionPhotos(numFrames);
    const testimonials = await getRandomTestimonials(numFrames);
    const stats = await getGlobalStats();

    if (photos.length === 0) throw new Error('No reunion photos found. Need at least one pet with status="reunited".');

    // 2. Generate frames
    for (let i = 0; i < numFrames; i++) {
      const photo = photos[i % photos.length];
      const testimonial = testimonials[i % testimonials.length] || { description: '' };
      const frame = await drawFrame(photo, testimonial, stats, style, i, numFrames);
      fs.writeFileSync(path.join(framesDir, `frame${i.toString().padStart(3, '0')}.png`), frame);
    }

    // 3. Generate audio
    const audioPath = path.join(workDir, 'audio.mp3');
    await generateAudio(testimonials, stats, { style, duration, music, includeVoice }, audioPath);

    // 4. Assemble video
    const videoFilename = `promo-${style}-${duration}s-${Date.now()}.mp4`;
    const finalVideoPath = path.join(VIDEO_OUTPUT_DIR, videoFilename);
    await assembleVideo(framesDir, audioPath, finalVideoPath, frameDuration, numFrames);

    // 5. Generate thumbnail (first frame as jpeg)
    const thumbFilename = videoFilename.replace('.mp4', '_thumb.jpg');
    const thumbPath = path.join(VIDEO_OUTPUT_DIR, thumbFilename);
    const firstFrame = fs.readFileSync(path.join(framesDir, 'frame000.png'));
    await sharp(firstFrame).jpeg({ quality: 80 }).toFile(thumbPath);

    // 6. Get base64 for DB storage if needed, but we'll store file paths in DB
    // Return file paths and metadata
    return {
      filename: videoFilename,
      filepath: finalVideoPath,
      thumbnail: thumbFilename,
      thumbnailPath: thumbPath,
      size: fs.statSync(finalVideoPath).size
    };

  } catch (err) {
    // Cleanup on error
    rimraf.sync(workDir);
    throw err;
  }
}

export { getRandomReunionPhotos, getRandomTestimonials, getGlobalStats, drawFrame };
