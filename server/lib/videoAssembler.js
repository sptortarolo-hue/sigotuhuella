import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { rimraf } from 'rimraf';
import pool from '../db.js';

const execFileAsync = promisify(execFile);

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
const CLOSING_DUR = 5;
const FPS = 25;
const FF_PRESET = 'ultrafast';
const FF_CRF = 23;

let speechSdkPromise = null;
async function getSpeechSdk() {
  if (!process.env.AZURE_TTS_KEY) return null;
  if (!process.env.AZURE_TTS_REGION) {
    console.warn('[TTS] AZURE_TTS_REGION not set, defaulting to eastus');
    process.env.AZURE_TTS_REGION = 'eastus';
  }
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

async function synthesizeREST(ssml, outputPath, keyOverride) {
  const key = keyOverride || process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION || 'eastus';
  const resourceName = process.env.AZURE_TTS_RESOURCE || 'sigoth';
  const url = `https://${resourceName}.cognitiveservices.azure.com/cognitiveservices/v1`;

  console.log('[TTS-REST] POST', url, 'SSML length:', ssml.length, 'key:', key.slice(0, 8) + '...');

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
  const keys = [process.env.AZURE_TTS_KEY, process.env.AZURE_TTS_KEY2].filter(Boolean);
  const region = process.env.AZURE_TTS_REGION || 'eastus';
  const resourceName = process.env.AZURE_TTS_RESOURCE || 'sigoth';
  const endpoint = `wss://${resourceName}.cognitiveservices.azure.com/stt/speech/universal/v2`;

  const sdk = await getSpeechSdk();

  for (const key of keys) {
    if (ttsOk) break;

    if (sdk) {
      try {
        console.log('[TTS] Trying SDK speakSsmlAsync with key', key.slice(0, 8) + '...');
        const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
        speechConfig.speechSynthesisVoiceName = voice;
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
        try { speechConfig.endpointId = endpoint; } catch {}

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

    if (!ttsOk && sdk) {
      try {
        console.log('[TTS] Trying SDK speakTextAsync with key', key.slice(0, 8) + '...');
        const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
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

    if (!ttsOk) {
      try {
        console.log('[TTS] Trying REST API with key', key.slice(0, 8) + '...');
        const size = await synthesizeREST(ssml, ttsPath, key);
        if (size > 0) {
          ttsOk = true;
          console.log('[TTS] REST API success, size:', size);
        }
      } catch (err) {
        console.warn('[TTS] REST API failed:', err.message);
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

function ffprobeDuration(filePath) {
  return new Promise((resolve) => {
    const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath];
    execFileAsync('ffprobe', args)
      .then(({ stdout }) => {
        try {
          const data = JSON.parse(stdout);
          resolve(data?.format?.duration ? parseFloat(data.format.duration) : 0);
        } catch {
          resolve(0);
        }
      })
      .catch(() => resolve(0));
  });
}

function runFfmpeg(args, label) {
  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg:${label}]`, 'ffmpeg', args.slice(0, 10).join(' '), '...');
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const err = new Error(`ffmpeg ${label} exit ${code}: ${stderr.slice(-500)}`);
        reject(err);
      }
    });
    proc.on('error', reject);
  });
}

async function generatePhotoClip(photoPath, clipDur, zoompan, dims, workDir, clipIndex) {
  const clipPath = path.join(workDir, `clip_${clipIndex}.mp4`);
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

  const filter = `zoompan=z='${zf}':x=${xf}:y=${yf}:d=${totalFrames}:s=${w}x${h}:fps=${FPS}`;

  await runFfmpeg([
    '-y', '-i', photoPath,
    '-vf', filter,
    '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
    '-pix_fmt', 'yuv420p', '-t', String(clipDur), '-r', String(FPS),
    '-an',
    clipPath,
  ], `zoompan-${clipIndex}`);

  return clipPath;
}

async function addDrawTextToClip(clipPath, overlayText, clipDur, dims, workDir, index) {
  if (!overlayText || !overlayText.trim()) return clipPath;

  const outPath = path.join(workDir, `text_${index}.mp4`);
  const { w, h } = dims;
  const fontPath = getFontPath();
  const fontSize = h > w ? 48 : 36;
  const textY = h > w ? Math.round(h * 0.72) : Math.round(h * 0.78);
  const escaped = escDrawText(overlayText);

  const drawboxPart = `drawbox=x=0:y=${textY - 10}:w=iw:h=${fontSize + 24}:color=0x5A5A40@0.6:t=fill:enable='between(t\\,0.3\\,${clipDur})'[bg]`;

  let drawtextPart;
  if (fontPath) {
    drawtextPart = `[bg]drawtext=text='${escaped}':fontfile='${fontPath}':fontcolor=white:fontsize=${fontSize}:x=(w-tw)/2:y=${textY}:shadowcolor=black:shadowx=2:shadowy=2:enable='between(t\\,0.3\\,${clipDur})'[v]`;
  } else {
    drawtextPart = `[bg]drawtext=text='${escaped}':fontcolor=white:fontsize=${fontSize}:x=(w-tw)/2:y=${textY}:shadowcolor=black:shadowx=2:shadowy=2:enable='between(t\\,0.3\\,${clipDur})'[v]`;
  }

  await runFfmpeg([
    '-y', '-i', clipPath,
    '-vf', `${drawboxPart};${drawtextPart}`,
    '-map', '[v]',
    '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
    '-pix_fmt', 'yuv420p', '-an',
    outPath,
  ], `drawtext-${index}`);

  try { fs.unlinkSync(clipPath); } catch {}
  return outPath;
}

async function generateOpeningClip(dims, style, workDir) {
  const clipPath = path.join(workDir, 'clip_opening.mp4');
  const { w, h } = dims;
  const fontPath = getFontPath();
  const dur = OPENING_DUR;

  const cream = '0xF5F5F0';
  const olive = '0x5A5A40';
  const terracotta = '0xD48C70';

  const titleText = escDrawText('SIGO TU HUELLA');
  const titleFontSize = h > w ? 64 : 48;
  const topMargin = Math.round(h * 0.08);
  const titleY = topMargin;

  const logoW = Math.round(Math.min(w, h) * 0.14);
  const logoY = Math.round(h * 0.30);

  const titleEnable = `between(t\\,0.2\\,${dur})`;
  const lineEnable = `between(t\\,0.4\\,${dur})`;
  const lineW = Math.round(w * 0.3);
  const lineY = titleY + titleFontSize + 8;

  let textFilter;
  if (fontPath) {
    textFilter = `drawtext=text='${titleText}':fontfile='${fontPath}':fontcolor=${olive}:fontsize=${titleFontSize}:x=(w-tw)/2:y=${titleY}:shadowcolor=${terracotta}@0.4:shadowx=2:shadowy=2:enable='${titleEnable}'`;
  } else {
    textFilter = `drawtext=text='${titleText}':fontcolor=${olive}:fontsize=${titleFontSize}:x=(w-tw)/2:y=${titleY}:shadowcolor=${terracotta}@0.4:shadowx=2:shadowy=2:enable='${titleEnable}'`;
  }

  const lineFilter = `drawbox=x=(iw-${lineW})/2:y=${lineY}:w=${lineW}:h=3:color=${terracotta}:t=fill:enable='${lineEnable}'`;

  const args = ['-y'];
  args.push('-f', 'lavfi', '-i', `color=c=${cream}:s=${w}x${h}:d=${dur}:rate=${FPS}`);
  args.push('-f', 'lavfi', '-i', `color=c=${olive}:s=${w}x${h}:d=${dur}:rate=${FPS}`);

  if (fs.existsSync(LOGO_PATH)) {
    args.push('-i', LOGO_PATH);
    args.push('-filter_complex', `[1:v]format=rgba,colorchannelmixer=aa=0.6[tint];[0:v][tint]overlay=0:H-h:format=auto:eval=frame:eof_action=repeat[grad];[grad][2:v]overlay=(W-w)/2:${logoY}:format=auto:eval=frame:eof_action=repeat[withlogo];[withlogo]${textFilter},${lineFilter},fade=out:st=${dur - 0.5}:d=0.5,format=yuv420p[v]`);
  } else {
    args.push('-filter_complex', `[1:v]format=rgba,colorchannelmixer=aa=0.6[tint];[0:v][tint]overlay=0:H-h:format=auto:eval=frame:eof_action=repeat[grad];[grad]${textFilter},${lineFilter},fade=out:st=${dur - 0.5}:d=0.5,format=yuv420p[v]`);
  }

  args.push('-map', '[v]');
  args.push('-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF));
  args.push('-pix_fmt', 'yuv420p', '-t', String(dur), '-an');
  args.push(clipPath);

  await runFfmpeg(args, 'opening');
  return clipPath;
}

async function generateClosingClip(dims, style, workDir) {
  const clipPath = path.join(workDir, 'clip_closing.mp4');
  const { w, h } = dims;
  const fontPath = getFontPath();
  const dur = CLOSING_DUR;
  const isVertical = h > w;

  const cream = '0xF5F5F0';
  const olive = '0x5A5A40';
  const terracotta = '0xD48C70';

  const titleText = escDrawText('SIGO TU HUELLA');
  const urlText = escDrawText('sigotuhuella.online');
  const ctaText = escDrawText('Visita nuestra web - Descarga la app gratis');

  const titleFontSize = isVertical ? 52 : 40;
  const urlFontSize = isVertical ? 32 : 24;
  const ctaFontSize = isVertical ? 24 : 18;

  const logoW = Math.round(Math.min(w, h) * 0.18);

  const titleY = Math.round(h * 0.42);
  const lineY = titleY + Math.round(titleFontSize * 0.8);
  const urlY = lineY + 20;
  const ctaY = urlY + Math.round(urlFontSize * 1.5);

  const lineW = Math.round(w * 0.30);

  const titleEnable = `between(t\\,0.4\\,${dur})`;
  const lineEnable = `between(t\\,0.5\\,${dur})`;
  const urlEnable = `between(t\\,0.7\\,${dur})`;
  const ctaEnable = `between(t\\,0.85\\,${dur})`;

  let textFilters = '';
  if (fontPath) {
    textFilters = `drawtext=text='${titleText}':fontfile='${fontPath}':fontcolor=${olive}:fontsize=${titleFontSize}:x=(w-tw)/2:y=${titleY}:shadowcolor=${terracotta}@0.4:shadowx=2:shadowy=2:enable='${titleEnable}'`;
    textFilters += `,drawbox=x=(iw-${lineW})/2:y=${lineY}:w=${lineW}:h=3:color=${terracotta}:t=fill:enable='${lineEnable}'`;
    textFilters += `,drawtext=text='${urlText}':fontfile='${fontPath}':fontcolor=${terracotta}:fontsize=${urlFontSize}:x=(w-tw)/2:y=${urlY}:shadowcolor=${olive}@0.3:shadowx=1:shadowy=1:enable='${urlEnable}'`;
    textFilters += `,drawtext=text='${ctaText}':fontfile='${fontPath}':fontcolor=${olive}:fontsize=${ctaFontSize}:x=(w-tw)/2:y=${ctaY}:shadowcolor=0xF5F5F0@0.3:shadowx=1:shadowy=1:enable='${ctaEnable}'`;
  } else {
    textFilters = `drawtext=text='${titleText}':fontcolor=${olive}:fontsize=${titleFontSize}:x=(w-tw)/2:y=${titleY}:shadowcolor=${terracotta}@0.4:shadowx=2:shadowy=2:enable='${titleEnable}'`;
    textFilters += `,drawbox=x=(iw-${lineW})/2:y=${lineY}:w=${lineW}:h=3:color=${terracotta}:t=fill:enable='${lineEnable}'`;
    textFilters += `,drawtext=text='${urlText}':fontcolor=${terracotta}:fontsize=${urlFontSize}:x=(w-tw)/2:y=${urlY}:shadowcolor=${olive}@0.3:shadowx=1:shadowy=1:enable='${urlEnable}'`;
    textFilters += `,drawtext=text='${ctaText}':fontcolor=${olive}:fontsize=${ctaFontSize}:x=(w-tw)/2:y=${ctaY}:shadowcolor=0xF5F5F0@0.3:shadowx=1:shadowy=1:enable='${ctaEnable}'`;
  }

  const args = ['-y'];
  args.push('-f', 'lavfi', '-i', `color=c=${cream}:s=${w}x${h}:d=${dur}:rate=${FPS}`);
  if (fs.existsSync(LOGO_PATH)) {
    args.push('-i', LOGO_PATH);
    args.push('-filter_complex', `[1:v]scale=${logoW}:-1[logo];[0:v][logo]overlay=(W-w)/2:${Math.round(h * 0.30 - logoW / 2)}:format=auto:eval=frame:eof_action=repeat[withlogo];[withlogo]fade=in:st=0:d=0.5,${textFilters},fade=out:st=${dur - 0.5}:d=0.5,format=yuv420p[v]`);
  } else {
    args.push('-filter_complex', `[0:v]fade=in:st=0:d=0.5,${textFilters},fade=out:st=${dur - 0.5}:d=0.5,format=yuv420p[v]`);
  }
  args.push('-map', '[v]');
  args.push('-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF));
  args.push('-pix_fmt', 'yuv420p', '-t', String(dur), '-an');
  args.push(clipPath);

  await runFfmpeg(args, 'closing');

  return clipPath;
}

async function generateAudio(config, voiceScript, workDir) {
  const audioPath = path.join(workDir, 'audio.mp3');
  const ttsPath = await generateTTS(config, voiceScript, workDir);

  const musicPath = MUSIC_TRACKS[config.music] || MUSIC_TRACKS.emotional;
  const hasMusic = fs.existsSync(musicPath) && fs.statSync(musicPath).size > 0;
  const hasTts = ttsPath && fs.existsSync(ttsPath);

  if (hasTts && hasMusic) {
    const ttsDur = await ffprobeDuration(ttsPath);
    console.log('[Audio] Mixing TTS + music, TTS dur:', ttsDur.toFixed(1), 's');

    await runFfmpeg([
      '-y', '-i', ttsPath, '-i', musicPath,
      '-filter_complex',
      `[1:a]volume=0.35,atrim=end=${ttsDur > 0 ? ttsDur + 3 : config.duration}[musicVol];[0:a][musicVol]amix=inputs=2:duration=longest:dropout_transition=3[mix]`,
      '-map', '[mix]', '-c:a', 'libmp3lame', '-b:a', '192k',
      audioPath,
    ], 'audio-mix');

    try { fs.unlinkSync(ttsPath); } catch {}
  } else if (hasTts) {
    fs.copyFileSync(ttsPath, audioPath);
    try { fs.unlinkSync(ttsPath); } catch {}
  } else if (hasMusic) {
    console.log('[Audio] Music only, duration:', config.duration);

    await runFfmpeg([
      '-y', '-i', musicPath,
      '-t', String(config.duration),
      '-c:a', 'libmp3lame', '-b:a', '192k',
      audioPath,
    ], 'audio-music');
  } else {
    console.log('[Audio] No audio sources, generating silent track');

    await runFfmpeg([
      '-y', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t', String(config.duration),
      '-c:a', 'libmp3lame', '-b:a', '128k',
      audioPath,
    ], 'audio-silent');
  }

  const audioSize = fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 0;
  console.log('[Audio] Final audio:', audioPath, 'size:', audioSize);
  return audioPath;
}

async function concatenateClipsWithTransitions(clipPaths, transition, workDir) {
  if (clipPaths.length === 1) return clipPaths[0];

  if (clipPaths.length === 2) {
    const outPath = path.join(workDir, 'concat.mp4');
    const firstDur = await ffprobeDuration(clipPaths[0]);
    const offset = Math.max(0.1, firstDur - TRANSITION_DUR);

    await runFfmpeg([
      '-y', '-i', clipPaths[0], '-i', clipPaths[1],
      '-filter_complex', `[0:v][1:v]xfade=transition=${transition}:duration=${TRANSITION_DUR}:offset=${offset}[v]`,
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
      '-pix_fmt', 'yuv420p', '-an',
      outPath,
    ], 'xfade-2');

    return outPath;
  }

  let currentPath = clipPaths[0];

  for (let i = 1; i < clipPaths.length; i++) {
    const outPath = path.join(workDir, `concat_${i}.mp4`);
    const firstDur = await ffprobeDuration(currentPath);
    const offset = Math.max(0.1, firstDur - TRANSITION_DUR);

    await runFfmpeg([
      '-y', '-i', currentPath, '-i', clipPaths[i],
      '-filter_complex', `[0:v][1:v]xfade=transition=${transition}:duration=${TRANSITION_DUR}:offset=${offset}[v]`,
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
      '-pix_fmt', 'yuv420p', '-an',
      outPath,
    ], `xfade-${i}`);

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

  await runFfmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
    '-pix_fmt', 'yuv420p', '-an',
    outPath,
  ], 'concat-simple');

  return outPath;
}

async function addWatermarkAndFrame(videoPath, dims, workDir) {
  const outPath = path.join(workDir, 'branded.mp4');
  const { w, h } = dims;
  const isVertical = h > w;
  const pad = Math.round(Math.min(w, h) * 0.03);

  const hasLogo = fs.existsSync(LOGO_PATH);
  if (!hasLogo) return videoPath;

  const wmSize = Math.round(Math.min(w, h) * 0.08);

  const topBarH = isVertical ? 70 : 50;
  const botBarH = isVertical ? 40 : 30;

  const filterParts = [];
  filterParts.push(`[1:v]scale=${wmSize}:-1,format=rgba,colorchannelmixer=aa=0.75[wm]`);
  filterParts.push(`[0:v][wm]overlay=W-w-${pad}:${pad}:format=auto[wmed]`);

  filterParts.push(`color=c=0xF5F5F0:s=${w}x${topBarH}:d=5:rate=${FPS},format=rgba,colorchannelmixer=aa=0.85[topbar]`);
  filterParts.push(`[wmed][topbar]overlay=0:0:format=auto:eval=frame:eof_action=repeat[wmed2]`);

  filterParts.push(`color=c=0xF5F5F0:s=${w}x${botBarH}:d=5:rate=${FPS},format=rgba,colorchannelmixer=aa=0.85[botbar]`);
  filterParts.push(`[wmed2][botbar]overlay=0:H-${botBarH}:format=auto:eval=frame:eof_action=repeat,format=yuv420p[v]`);

  await runFfmpeg([
    '-y', '-i', videoPath,
    '-i', LOGO_PATH,
    '-filter_complex', filterParts.join(';'),
    '-map', '[v]',
    '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
    '-pix_fmt', 'yuv420p', '-an',
    outPath,
  ], 'watermark+frame');

  try { fs.unlinkSync(videoPath); } catch {}
  return outPath;
}

async function muxAudioVideo(videoPath, audioPath, outputPath) {
  console.log('[Mux] video:', videoPath, fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 'missing');
  console.log('[Mux] audio:', audioPath, fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 'missing');

  await runFfmpeg([
    '-y', '-i', videoPath, '-i', audioPath,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart',
    outputPath,
  ], 'mux');
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
  const zoompan = STYLE_ZOOMPAN[style] || STYLE_ZOOMPAN.emotive;
  const transition = STYLE_TRANSITIONS[style] || STYLE_TRANSITIONS.emotive;

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

    const fixedDur = OPENING_DUR + CLOSING_DUR;
    const totalTransitionDur = (numPhotoScenes + 1) * TRANSITION_DUR;
    const availableDur = Math.max(duration - fixedDur - totalTransitionDur, numPhotoScenes * 2);
    const photoClipDur = availableDur / numPhotoScenes;

  const [openingClip, closingClip, audioPath] = await Promise.all([
    generateOpeningClip(dims, style, workDir),
    generateClosingClip(dims, style, workDir),
    generateAudio({ style, duration, music, includeVoice }, voiceScript, workDir),
  ]);
    logStep('opening+closing+audio parallel');

    const mainClips = [];
    mainClips.push(openingClip);

    for (let i = 0; i < numPhotoScenes; i++) {
      const scene = photoScenes[i];
      let clipPath = await generatePhotoClip(photoPaths[i], photoClipDur, zoompan, dims, workDir, i);
      logStep(`photo clip ${i} zoompan`);

      const overlayText = scene.overlayText || '';
      clipPath = await addDrawTextToClip(clipPath, overlayText, photoClipDur, dims, workDir, i);
      logStep(`photo clip ${i} drawtext`);

      mainClips.push(clipPath);
    }

    mainClips.push(closingClip);

    let mainVideoPath;
    try {
      mainVideoPath = await concatenateClipsWithTransitions(mainClips, transition, workDir);
      logStep('concat+xfade');
    } catch (xfadeErr) {
      console.warn('xfade failed, falling back to simple concat:', xfadeErr.message);
      mainVideoPath = await concatenateSimple(mainClips, workDir);
      logStep('concat-simple fallback');
    }

    mainVideoPath = await addWatermarkAndFrame(mainVideoPath, dims, workDir);
    logStep('watermark+frame');

    const videoFilename = `promo-${style}-${duration}s-${format}-${Date.now()}.mp4`;
    const finalVideoPath = path.join(VIDEO_OUTPUT_DIR, videoFilename);

    await muxAudioVideo(mainVideoPath, audioPath, finalVideoPath);
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
    if (fs.existsSync(workDir)) {
      rimraf.sync(workDir);
    }
  }
}

export { generateVideo, getRandomReunionPhotos, getGlobalStats, getPetImages, getNewsImage };
