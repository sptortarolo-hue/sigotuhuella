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
const OVERLAYS_DIR = path.join(PROJECT_ROOT, PUBLIC_DIR, 'overlays');
const STICKERS_DIR = path.join(OVERLAYS_DIR, 'stickers');
const FRAMES_DIR = path.join(OVERLAYS_DIR, 'frames');
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

const VOICE_OPTIONS = {
  elena: 'es-AR-ElenaNeural',
  tomas: 'es-AR-TomasNeural',
  mateo: 'es-UY-MateoNeural',
  both: 'es-AR-ElenaNeural',
};

const VOICE_PARAMS = {
  elena: { rate: '-10%', pitch: '-5%' },
  tomas: { rate: '-15%', pitch: '-3%', contour: '(0%,-3%) (25%,-1%) (50%,+2%) (75%,-1%) (100%,-5%)' },
  mateo: { rate: '-12%', pitch: '-2%', contour: '(0%,-2%) (30%,+1%) (60%,+3%) (100%,-2%)' },
};

const STYLE_VOICE_PARAMS = {
  emotive: {
    elena: { rate: '-10%', pitch: '-5%' },
    tomas: { rate: '-15%', pitch: '-3%', contour: '(0%,-3%) (25%,-1%) (50%,+2%) (75%,-1%) (100%,-5%)' },
    mateo: { rate: '-12%', pitch: '-2%', contour: '(0%,-2%) (30%,+1%) (60%,+3%) (100%,-2%)' },
  },
  informative: {
    elena: { rate: '+0%', pitch: '+0%' },
    tomas: { rate: '-5%', pitch: '+0%', contour: '(0%,+0%) (50%,+1%) (100%,+0%)' },
    mateo: { rate: '-3%', pitch: '+0%', contour: '(0%,+0%) (50%,+1%) (100%,+0%)' },
  },
  viral: {
    elena: { rate: '+5%', pitch: '+3%' },
    tomas: { rate: '+0%', pitch: '+2%', contour: '(0%,+2%) (25%,+5%) (50%,+3%) (75%,+5%) (100%,+2%)' },
    mateo: { rate: '+3%', pitch: '+3%', contour: '(0%,+2%) (30%,+4%) (60%,+5%) (100%,+2%)' },
  },
};

function getVoiceParams(voiceKey, style) {
  const styleParams = STYLE_VOICE_PARAMS[style]?.[voiceKey];
  if (styleParams) return styleParams;
  return VOICE_PARAMS[voiceKey] || VOICE_PARAMS.elena;
}

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
    signal: AbortSignal.timeout(10000),
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

function buildSSML(script, voice, params, { appendClosing = true } = {}) {
  const { rate, pitch, contour } = params;
  const cleaned = escapeXml(script.trim().replace(/\s+/g, ' '));
  const closing = appendClosing ? `\n<break time="600ms"/>\nsigotuhuella.online` : '';
  const contourAttr = contour ? ` contour="${contour}"` : '';
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-AR">
<voice name="${voice}">
<prosody rate="${rate}" pitch="${pitch}"${contourAttr}>
${cleaned}${closing}
</prosody>
</voice>
</speak>`;
}

function normalizeVoiceKeys(input) {
  const valid = ['elena', 'tomas', 'mateo'];
  const arr = Array.isArray(input) ? input : [input];
  const expanded = arr.flatMap(v => v === 'both' ? ['elena', 'tomas'] : v);
  const filtered = expanded.map(v => String(v).toLowerCase()).filter(v => valid.includes(v));
  return filtered.length > 0 ? [...new Set(filtered)] : ['elena'];
}

function splitByParagraphs(script, voiceKeys = ['elena', 'tomas'], style = 'emotive') {
  const paragraphs = script.trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const split = paragraphs.length >= 2 ? paragraphs : (() => {
    const sentences = script.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
    const blocks = [];
    for (let i = 0; i < sentences.length; i += 2) {
      blocks.push(sentences.slice(i, i + 2).join(' '));
    }
    return blocks;
  })();
  return split.map((text, i) => {
    const key = voiceKeys[i % voiceKeys.length];
    return { text, voice: VOICE_OPTIONS[key], params: getVoiceParams(key, style) };
  });
}

function buildAutoScript(style, stats) {
  const { reunited, users } = stats;
  let script = '';
  if (style === 'emotive') {
    script = 'En Sigo Tu Huella, cada historia de reencuentro nos llena el corazón. ';
    script += `Ya reunimos más de ${reunited} mascotas con sus familias.\n\n`;
    script += `Más de ${users} vecinos confían en nosotros. `;
  } else if (style === 'informative') {
    script = '¿Perdiste a tu mascota? ¿Encontraste un animal? ';
    script += 'Sigo Tu Huella es la plataforma que conecta a toda la comunidad.\n\n';
    script += `Contamos con ${users} usuarios activos y ${reunited} reencuentros exitosos. `;
  } else {
    script = '¡La comunidad se mueve! ';
    script += `Más de ${reunited} mascotas ya volvieron a casa.\n\n`;
    script += '¿Vos ya descargaste la app? Unite a la red que devuelve sonrisas. ';
  }
  script += 'Descargá Sigo Tu Huella gratis en sigotuhuella.online y sé parte del cambio.';
  return script;
}

async function generateTTS(config, voiceScript, workDir) {
  const stats = await getGlobalStats();
  const script = voiceScript || buildAutoScript(config.style, stats);
  const voiceKeys = normalizeVoiceKeys(config.voices || [config.voice || 'elena']);
  console.log('[TTS] generateTTS start — includeVoice:', config.includeVoice, 'voices:', voiceKeys, 'script length:', script?.length);

  const ttsPath = path.join(workDir, 'tts.mp3');
  if (!config.includeVoice || !script) return null;

  if (voiceKeys.length === 1) {
    const voice = VOICE_OPTIONS[voiceKeys[0]] || VOICE_OPTIONS.elena;
    const params = getVoiceParams(voiceKeys[0], config.style);
    const ssml = buildSSML(script, voice, params);
    const ok = await synthesizeWithRetry(ssml, voice, ttsPath);
    if (ok) return ttsPath;
    console.warn('[TTS] All TTS methods failed');
    return null;
  }

  return await generateMultiVoice(script, voiceKeys, workDir, ttsPath, config.style);
}

async function synthesizeWithRetry(ssml, voice, outputPath, fastOnly = false) {
  const keys = [process.env.AZURE_TTS_KEY, process.env.AZURE_TTS_KEY2].filter(Boolean);
  const region = process.env.AZURE_TTS_REGION || 'eastus';
  const sdk = await getSpeechSdk();

  for (const key of keys) {
    if (sdk) {
      try {
        console.log('[TTS] Trying SDK speakSsmlAsync with key', key.slice(0, 8) + '...');
        const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
        speechConfig.speechSynthesisVoiceName = voice;
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
        const result = await new Promise((resolve, reject) => {
          synthesizer.speakSsmlAsync(ssml, res => resolve(res), err => reject(err));
        });
        synthesizer.close();

        if (result && result.audioData && result.audioData.byteLength > 0
          && result.reason !== sdk.ResultReason.Canceled) {
          fs.writeFileSync(outputPath, Buffer.from(result.audioData));
          console.log('[TTS] SDK speakSsmlAsync success, byteLength:', result.audioData.byteLength);
          return true;
        } else if (result && result.reason === sdk.ResultReason.Canceled) {
          const c = sdk.CancellationDetails.fromResult(result);
          console.warn('[TTS] SDK speakSsmlAsync canceled:', c.reason, c.errorDetails);
        }
      } catch (err) {
        console.warn('[TTS] SDK speakSsmlAsync failed:', err.message);
      }
    }

    if (fastOnly) continue;

    if (sdk) {
      try {
        console.log('[TTS] Trying SDK speakTextAsync with key', key.slice(0, 8) + '...');
        const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
        speechConfig.speechSynthesisVoiceName = voice;
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

        const text = ssml.replace(/<[^>]+>/g, '').trim();
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
        const result = await new Promise((resolve, reject) => {
          synthesizer.speakTextAsync(text, res => resolve(res), err => reject(err));
        });
        synthesizer.close();

        if (result && result.audioData && result.audioData.byteLength > 0) {
          fs.writeFileSync(outputPath, Buffer.from(result.audioData));
          console.log('[TTS] SDK speakTextAsync success, byteLength:', result.audioData.byteLength);
          return true;
        }
      } catch (err2) {
        console.warn('[TTS] SDK speakTextAsync also failed:', err2.message);
      }
    }

    try {
      console.log('[TTS] Trying REST API with key', key.slice(0, 8) + '...');
      const size = await synthesizeREST(ssml, outputPath, key);
      if (size > 0) {
        console.log('[TTS] REST API success, size:', size);
        return true;
      }
    } catch (err) {
      console.warn('[TTS] REST API failed:', err.message);
    }
  }

  return false;
}

async function generateMultiVoice(script, voiceKeys, workDir, ttsPath, style = 'emotive') {
  const blocks = splitByParagraphs(script, voiceKeys, style);
  blocks.push({
    text: 'sigotuhuella.online',
    voice: VOICE_OPTIONS[voiceKeys[0]] || VOICE_OPTIONS.elena,
    params: getVoiceParams(voiceKeys[0], style),
  });
  console.log('[TTS-multi] Generating', blocks.length, 'voice clips with voices:', voiceKeys);

  const clipPaths = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const clipPath = path.join(workDir, `tts_clip_${i}.mp3`);
    const ssml = buildSSML(block.text, block.voice, block.params, { appendClosing: false });
    const ok = await synthesizeClipFast(ssml, block.voice, clipPath);
    if (ok && fs.existsSync(clipPath)) {
      clipPaths.push(clipPath);
      console.log('[TTS-multi] Clip', i, block.voice.slice(6, 20), 'ok');
    } else {
      console.warn('[TTS-multi] Clip', i, 'failed');
    }
  }

  if (clipPaths.length === 0) {
    console.warn('[TTS-multi] No clips generated');
    return null;
  }

  if (clipPaths.length === 1) {
    fs.renameSync(clipPaths[0], ttsPath);
    return ttsPath;
  }

  const breakPath = path.join(workDir, 'silence_400ms.mp3');
  await new Promise((resolve, reject) => {
    const cmd = spawn('ffmpeg', [
      '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono',
      '-t', '0.4', '-acodec', 'libmp3lame', '-b:a', '32k', '-y', breakPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    cmd.on('close', code => code === 0 ? resolve() : reject(new Error(`silence exit ${code}`)));
  });

  const concatPaths = [];
  for (let i = 0; i < clipPaths.length; i++) {
    concatPaths.push(clipPaths[i]);
    if (i < clipPaths.length - 1) concatPaths.push(breakPath);
  }

  const concatListPath = path.join(workDir, 'tts_concat.txt');
  const concatContent = concatPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(concatListPath, concatContent);

  await new Promise((resolve, reject) => {
    const cmd = spawn('ffmpeg', [
      '-f', 'concat', '-safe', '0', '-i', concatListPath,
      '-acodec', 'libmp3lame', '-b:a', '32k', '-y', ttsPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    cmd.on('close', code => code === 0 ? resolve() : reject(new Error(`concat exit ${code}`)));
  });

  if (fs.existsSync(ttsPath)) {
    console.log('[TTS-multi] Final TTS ready:', ttsPath);
    return ttsPath;
  }

  console.warn('[TTS-multi] Concat failed, using first clip as fallback');
  fs.copyFileSync(clipPaths[0], ttsPath);
  return ttsPath;
}

async function synthesizeClipFast(ssml, voice, outputPath) {
  const keys = [process.env.AZURE_TTS_KEY, process.env.AZURE_TTS_KEY2].filter(Boolean);
  const region = process.env.AZURE_TTS_REGION || 'eastus';
  const sdk = await getSpeechSdk();

  for (const key of keys) {
    if (sdk) {
      let synthesizer = null;
      try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
        speechConfig.speechSynthesisVoiceName = voice;
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
        synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

        const result = await Promise.race([
          new Promise((resolve, reject) => {
            synthesizer.speakSsmlAsync(ssml, res => resolve(res), err => reject(err));
          }),
          new Promise(resolve => setTimeout(() => resolve('timeout'), 10000)),
        ]);

        if (result === 'timeout') {
          console.warn('[TTS-clip] SDK timeout for', voice, '- closing synthesizer');
          try { synthesizer.close(); } catch {}
          continue;
        }

        try { synthesizer.close(); } catch {}

        if (result && result.audioData && result.audioData.byteLength > 0
          && result.reason !== sdk.ResultReason.Canceled) {
          fs.writeFileSync(outputPath, Buffer.from(result.audioData));
          console.log('[TTS-clip] SDK success for', voice, 'byteLength:', result.audioData.byteLength);
          return true;
        } else if (result && result.reason === sdk.ResultReason.Canceled) {
          const c = sdk.CancellationDetails.fromResult(result);
          console.warn('[TTS-clip] SDK canceled:', c.reason, c.errorDetails);
        }
      } catch (err) {
        console.warn('[TTS-clip] SDK error for', voice, ':', err.message);
        try { if (synthesizer) synthesizer.close(); } catch {}
      }
    }

    try {
      await synthesizeREST(ssml, outputPath, key);
      console.log('[TTS-clip] REST success for', voice);
      return true;
    } catch (err) {
      console.warn('[TTS-clip] REST failed for', voice, ':', err.message);
    }
  }
  return false;
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

function wrapText(text, maxCharsPerLine) {
  const words = text.split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current.length + 1 + word.length > maxCharsPerLine && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
    if (lines.length >= 3) break;
  }
  if (current && lines.length < 3) lines.push(current);
  if (lines.length === 3 && words.slice(lines.slice(0, 3).join(' ').split(' ').length).length > 0) {
    lines[2] = lines[2].replace(/.{3}$/, '...');
  }
  return lines;
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
  const isVertical = h > w;
  const fontSize = isVertical ? 56 : 44;
  const lineSpacing = 10;
  const maxChars = isVertical ? 28 : 40;
  const textY = isVertical ? Math.round(h * 0.68) : Math.round(h * 0.72);
  const enableExpr = `between(t\\,0.3\\,${clipDur})`;

  const lines = wrapText(overlayText, maxChars);
  const boxH = fontSize * lines.length + lineSpacing * (lines.length - 1) + 24;

  const filterParts = [];
  filterParts.push(`drawbox=x=0:y=${textY - 12}:w=iw:h=${boxH}:color=0x5A5A40@0.6:t=fill:enable='${enableExpr}'`);

  for (let li = 0; li < lines.length; li++) {
    const escaped = escDrawText(lines[li]);
    const y = textY + li * (fontSize + lineSpacing);
    if (fontPath) {
      filterParts.push(`drawtext=text='${escaped}':fontfile='${fontPath}':fontcolor=white:fontsize=${fontSize}:x=(w-tw)/2:y=${y}:shadowcolor=black:shadowx=2:shadowy=2:enable='${enableExpr}'`);
    } else {
      filterParts.push(`drawtext=text='${escaped}':fontcolor=white:fontsize=${fontSize}:x=(w-tw)/2:y=${y}:shadowcolor=black:shadowx=2:shadowy=2:enable='${enableExpr}'`);
    }
  }

  await runFfmpeg([
    '-y', '-i', clipPath,
    '-vf', filterParts.join(','),
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
  const ctaText = escDrawText('Visita nuestra web - Descarga la app gratis ↓');

  const titleFontSize = isVertical ? 52 : 40;
  const urlFontSize = isVertical ? 40 : 30;
  const ctaFontSize = isVertical ? 24 : 18;

  const logoW = Math.round(Math.min(w, h) * 0.18);

  const titleY = Math.round(h * 0.42);
  const lineY = titleY + Math.round(titleFontSize * 0.8);
  const urlY = lineY + 20;
  const ctaY = urlY + Math.round(urlFontSize * 1.8);

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

async function generateAudio(config, voiceScript, workDir, videoDuration, ttsPath) {
  const audioPath = path.join(workDir, 'audio.mp3');

  const musicPath = MUSIC_TRACKS[config.music] || MUSIC_TRACKS.emotional;
  const hasMusic = fs.existsSync(musicPath) && fs.statSync(musicPath).size > 0;
  const hasTts = ttsPath && fs.existsSync(ttsPath);

  if (hasTts && hasMusic) {
    console.log('[Audio] Mixing TTS (adelay 2s) + music, videoDuration:', videoDuration, 's');

    await runFfmpeg([
      '-y', '-i', ttsPath, '-i', musicPath,
      '-filter_complex',
      `[0:a]adelay=2000|2000[delayed];[1:a]volume=0.35,atrim=0:${videoDuration}[musicVol];[delayed][musicVol]amix=inputs=2:duration=longest:dropout_transition=3[mix]`,
      '-map', '[mix]', '-c:a', 'libmp3lame', '-b:a', '192k',
      '-t', String(videoDuration),
      audioPath,
    ], 'audio-mix');

    try { fs.unlinkSync(ttsPath); } catch {}
  } else if (hasTts) {
    console.log('[Audio] TTS only (adelay 2s + pad to', videoDuration, 's)');

    await runFfmpeg([
      '-y', '-i', ttsPath,
      '-filter_complex',
      `[0:a]adelay=2000|2000,apad=whole_dur=${videoDuration}[padded]`,
      '-map', '[padded]', '-c:a', 'libmp3lame', '-b:a', '192k',
      '-t', String(videoDuration),
      audioPath,
    ], 'audio-tts-padded');

    try { fs.unlinkSync(ttsPath); } catch {}
  } else if (hasMusic) {
    console.log('[Audio] Music only, duration:', videoDuration, 's');

    await runFfmpeg([
      '-y', '-i', musicPath,
      '-t', String(videoDuration),
      '-c:a', 'libmp3lame', '-b:a', '192k',
      audioPath,
    ], 'audio-music');
  } else {
    console.log('[Audio] No audio sources, generating silent track');

    await runFfmpeg([
      '-y', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t', String(videoDuration),
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

const STYLE_COLOR_GRADING = {
  emotive: 'eq=saturation=0.85:gamma=0.95:contrast=1.05',
  informative: 'eq=saturation=0.75:contrast=1.1:gamma=1.02',
  viral: 'eq=saturation=1.2:contrast=1.15:gamma=0.95',
};

const STICKER_LAYOUTS = {
  emotive: [
    { file: 'paw-terracotta.png', pos: 'bottom-left', delay: 0.5, dur: 3 },
    { file: 'heart-paw.png', pos: 'top-right', delay: 1.5, dur: 3 },
  ],
  informative: [
    { file: 'paw-olive.png', pos: 'bottom-right', delay: 0.3, dur: 2.5 },
  ],
  viral: [
    { file: 'star.png', pos: 'top-left', delay: 0.2, dur: 2 },
    { file: 'paw-terracotta.png', pos: 'bottom-left', delay: 0.8, dur: 3 },
    { file: 'heart.png', pos: 'bottom-right', delay: 1.5, dur: 2.5 },
  ],
};

function stickerPosition(pos, w, h, stickerSize) {
  const pad = Math.round(Math.min(w, h) * 0.05);
  const positions = {
    'top-left': `${pad}:${pad}`,
    'top-right': `W-w-${pad}:${pad}`,
    'bottom-left': `${pad}:H-h-${pad}`,
    'bottom-right': `W-w-${pad}:H-h-${pad}`,
  };
  return positions[pos] || positions['bottom-left'];
}

async function addColorGrading(videoPath, style, workDir) {
  const filter = STYLE_COLOR_GRADING[style];
  if (!filter) return videoPath;
  const outPath = path.join(workDir, 'graded.mp4');
  try {
    await runFfmpeg([
      '-y', '-i', videoPath,
      '-vf', `${filter},format=yuv420p`,
      '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
      '-pix_fmt', 'yuv420p', '-an',
      outPath,
    ], 'color-grading');
    try { fs.unlinkSync(videoPath); } catch {}
    return outPath;
  } catch (err) {
    console.warn('[ColorGrading] Failed, skipping:', err.message);
    return videoPath;
  }
}

async function addVignette(videoPath, workDir) {
  const outPath = path.join(workDir, 'vignette.mp4');
  try {
    await runFfmpeg([
      '-y', '-i', videoPath,
      '-vf', 'vignette=angle=0.3:mode=forward,format=yuv420p',
      '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
      '-pix_fmt', 'yuv420p', '-an',
      outPath,
    ], 'vignette');
    try { fs.unlinkSync(videoPath); } catch {}
    return outPath;
  } catch (err) {
    console.warn('[Vignette] Failed, skipping:', err.message);
    return videoPath;
  }
}

async function addStickers(videoPath, style, clipDur, dims, workDir, clipIndex) {
  const layout = STICKER_LAYOUTS[style];
  if (!layout || !fs.existsSync(STICKERS_DIR)) return videoPath;
  const { w, h } = dims;
  const stickerSize = Math.round(Math.min(w, h) * 0.12);
  const outPath = path.join(workDir, `stickered_${clipIndex}.mp4`);

  const offset = (clipIndex * 2) % layout.length;
  const stickers = layout.slice(offset, offset + 2);
  if (stickers.length === 0) return videoPath;

  const inputs = ['-y', '-i', videoPath];
  const filterParts = [];
  const overlayLabels = [];
  let inputIdx = 1;

  for (const sticker of stickers) {
    const stickerPath = path.join(STICKERS_DIR, sticker.file);
    if (!fs.existsSync(stickerPath)) continue;

    inputs.push('-i', stickerPath);
    const label = `s${inputIdx}`;
    const pos = stickerPosition(sticker.pos, w, h, stickerSize);
    const delay = Math.min(sticker.delay, clipDur * 0.3);
    const dur = Math.min(sticker.dur, clipDur - delay);
    if (dur <= 0) continue;
    const enable = `enable='between(t,${delay},${delay + dur})'`;

    filterParts.push(`[${inputIdx}:v]scale=${stickerSize}:-1,format=rgba,fade=in:st=${delay}:d=0.4:alpha=1,fade=out:st=${delay + dur - 0.3}:d=0.3:alpha=1[${label}]`);

    if (overlayLabels.length === 0) {
      overlayLabels.push(`[0:v][${label}]overlay=${pos}:${enable}:format=auto[o1]`);
    } else {
      const prev = overlayLabels.length;
      overlayLabels.push(`[o${prev}][${label}]overlay=${pos}:${enable}:format=auto[o${prev + 1}]`);
    }
    inputIdx++;
  }

  if (filterParts.length === 0) return videoPath;

  const allFilters = [...filterParts, ...overlayLabels];
  const lastLabel = `o${overlayLabels.length}`;
  allFilters.push(`[${lastLabel}]format=yuv420p[v]`);

  try {
    await runFfmpeg([
      ...inputs,
      '-filter_complex', allFilters.join(';'),
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
      '-pix_fmt', 'yuv420p', '-an',
      outPath,
    ], `stickers-clip${clipIndex}`);
    try { fs.unlinkSync(videoPath); } catch {}
    return outPath;
  } catch (err) {
    console.warn('[Stickers] Failed, skipping:', err.message);
    return videoPath;
  }
}

async function addFrameOverlay(videoPath, frameType, dims, workDir) {
  if (!frameType || frameType === 'none') return videoPath;
  const { w, h } = dims;
  const formatName = h > w ? 'vertical' : (w === h ? 'square' : 'landscape');
  const framePath = path.join(FRAMES_DIR, `${frameType}-${formatName}.png`);
  if (!fs.existsSync(framePath)) {
    console.warn('[Frame] Frame file not found:', framePath);
    return videoPath;
  }

  const outPath = path.join(workDir, 'framed.mp4');
  const filterParts = [
    `[1:v]format=rgba[frm]`,
    `[0:v][frm]overlay=0:0:format=auto:eval=frame:eof_action=repeat,format=yuv420p[v]`,
  ];

  try {
    await runFfmpeg([
      '-y', '-i', videoPath, '-i', framePath,
      '-filter_complex', filterParts.join(';'),
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
      '-pix_fmt', 'yuv420p', '-an',
      outPath,
    ], 'frame-overlay');
    try { fs.unlinkSync(videoPath); } catch {}
    return outPath;
  } catch (err) {
    console.warn('[Frame] Failed, skipping:', err.message);
    return videoPath;
  }
}

let cachedConfettiPath = null;

async function generateConfettiVideo(dims, workDir) {
  if (cachedConfettiPath && fs.existsSync(cachedConfettiPath)) return cachedConfettiPath;
  const { w, h } = dims;
  const CONFETTI_DUR = 4;
  const TOTAL_FRAMES = FPS * CONFETTI_DUR;
  const NUM_PARTICLES = 50;
  const COLORS_HEX = ['D48C70', '5A5A40', 'F5F5F0', 'E6E6DF', 'E8A598', '8B8B6E'];

  const confettiCacheDir = path.join(OVERLAYS_DIR, 'confetti_cache');
  fs.mkdirSync(confettiCacheDir, { recursive: true });
  const cachedPath = path.join(confettiCacheDir, `confetti_${w}x${h}.mp4`);
  if (fs.existsSync(cachedPath)) {
    cachedConfettiPath = cachedPath;
    return cachedPath;
  }

  const confettiFramesDir = path.join(workDir, 'confetti_frames');
  fs.mkdirSync(confettiFramesDir, { recursive: true });

  const particles = [];
  for (let i = 0; i < NUM_PARTICLES; i++) {
    particles.push({
      x: Math.random() * w, y: Math.random() * h * -1,
      size: 4 + Math.random() * 10,
      color: COLORS_HEX[Math.floor(Math.random() * COLORS_HEX.length)],
      vx: (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 5,
      rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 8,
      wobble: Math.random() * Math.PI * 2, shape: Math.floor(Math.random() * 3),
    });
  }
  for (let i = 0; i < 20; i++) {
    for (const p of particles) { p.y += p.vy; p.x += p.vx; p.rot += p.rotV; }
  }

  for (let f = 0; f < TOTAL_FRAMES; f++) {
    const shapes = [];
    for (const p of particles) {
      p.y += p.vy; p.x += p.vx + Math.sin(p.wobble) * 1;
      p.rot += p.rotV; p.wobble += 0.08; p.vy += 0.04;
      if (p.y > h + 20) { p.y = -20 - Math.random() * 60; p.x = Math.random() * w; p.vy = 3 + Math.random() * 5; }
      const s = p.size;
      if (p.shape === 0) shapes.push(`<rect x="${p.x-s/2}" y="${p.y-s/2}" width="${s}" height="${s*0.6}" rx="1" fill="#${p.color}" transform="rotate(${p.rot},${p.x},${p.y})"/>`);
      else if (p.shape === 1) shapes.push(`<circle cx="${p.x}" cy="${p.y}" r="${s/2}" fill="#${p.color}"/>`);
      else shapes.push(`<polygon points="${p.x},${p.y-s/2} ${p.x+s*0.3},${p.y+s*0.2} ${p.x-s*0.3},${p.y+s*0.2}" fill="#${p.color}" transform="rotate(${p.rot},${p.x},${p.y})"/>`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${shapes.join('')}</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(confettiFramesDir, `f_${String(f).padStart(4,'0')}.png`));
  }

  const listPath = path.join(workDir, 'confetti_list.txt');
  fs.writeFileSync(listPath, Array.from({ length: TOTAL_FRAMES }, (_, i) =>
    `file '${path.join(confettiFramesDir, `f_${String(i).padStart(4,'0')}.png`).replace(/\\/g, '/')}'`
  ).join('\n'));

  await runFfmpeg([
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:v', 'qtrle', '-pix_fmt', 'argb', cachedPath,
  ], 'confetti-cache-qtrle').catch(async () => {
    console.log('[Confetti] qtrle not available, trying libprores_kar...');
    await runFfmpeg([
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
      '-c:v', 'prores_ks', '-profile:v', 4444, '-pix_fmt', 'yuva444p10le', cachedPath,
    ], 'confetti-cache-prores').catch(async () => {
      console.log('[Confetti] prores4444 not available, using yuv420p with colorkey');
      await runFfmpeg([
        '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
        '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
        '-pix_fmt', 'yuv420p', '-an', cachedPath,
      ], 'confetti-cache-h264');
    });
  });

  try { rimraf.sync(confettiFramesDir); } catch {}
  cachedConfettiPath = cachedPath;
  return cachedPath;
}

async function addConfetti(videoPath, startTime, dims, workDir) {
  const CONFETTI_DUR = 4;

  try {
    const confettiVidPath = await generateConfettiVideo(dims, workDir);
    const outPath = path.join(workDir, 'with_confetti.mp4');

    let filterParts;
    try {
      const probe = await runFfmpegProbe(confettiVidPath);
      const hasAlpha = probe.includes('yuva') || probe.includes('argb') || probe.includes('ya');
      if (hasAlpha) {
        filterParts = [
          `[1:v]format=rgba,colorchannelmixer=aa=0.8,fade=in:st=0:d=0.5:alpha=1,fade=out:st=${CONFETTI_DUR-1}:d=1:alpha=1[conf]`,
          `[0:v][conf]overlay=0:0:enable='between(t,${startTime},${startTime+CONFETTI_DUR})':format=auto:eval=frame:eof_action=repeat,format=yuv420p[v]`,
        ];
      } else {
        filterParts = [
          `[1:v]colorkey=0x000000:0.01:0.1,fade=in:st=0:d=0.5:alpha=1,fade=out:st=${CONFETTI_DUR-1}:d=1:alpha=1[conf]`,
          `[0:v][conf]overlay=0:0:enable='between(t,${startTime},${startTime+CONFETTI_DUR})':format=auto:eval=frame:eof_action=repeat,format=yuv420p[v]`,
        ];
      }
    } catch {
      filterParts = [
        `[1:v]colorkey=0x000000:0.01:0.1[conf]`,
        `[0:v][conf]overlay=0:0:enable='between(t,${startTime},${startTime+CONFETTI_DUR})':format=auto:eval=frame:eof_action=repeat,format=yuv420p[v]`,
      ];
    }

    await runFfmpeg([
      '-y', '-i', videoPath, '-i', confettiVidPath,
      '-filter_complex', filterParts.join(';'),
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
      '-pix_fmt', 'yuv420p', '-an', outPath,
    ], 'confetti-overlay');
    try { fs.unlinkSync(videoPath); } catch {}
    return outPath;
  } catch (err) {
    console.warn('[Confetti] Failed, skipping:', err.message);
    return videoPath;
  }
}

async function runFfmpegProbe(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', ['-v', 'quiet', '-show_streams', filePath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.on('close', code => code === 0 ? resolve(out) : reject(new Error(`ffprobe exit ${code}`)));
  });
}

async function addWatermarkAndFrame(videoPath, dims, workDir) {
const outPath = path.join(workDir, 'branded.mp4');
  const { w, h } = dims;
  const isVertical = h > w;
  const pad = Math.round(Math.min(w, h) * 0.03);

  const hasLogo = fs.existsSync(LOGO_PATH);
  if (!hasLogo) return videoPath;

  const wmSize = Math.round(Math.min(w, h) * 0.08);
  const botBarH = isVertical ? 40 : 30;

  const filterParts = [];
  filterParts.push(`[1:v]scale=${wmSize}:-1,format=rgba,colorchannelmixer=aa=0.75[wm]`);
  filterParts.push(`[0:v][wm]overlay=W-w-${pad}:${pad}:format=auto[wmed]`);

  filterParts.push(`color=c=0xF5F5F0:s=${w}x${botBarH}:d=5:rate=${FPS},format=rgba,colorchannelmixer=aa=0.85[botbar]`);
  filterParts.push(`[wmed][botbar]overlay=0:H-${botBarH}:format=auto:eval=frame:eof_action=repeat,format=yuv420p[v]`);

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

async function muxAudioVideo(videoPath, audioPath, outputPath, videoDuration) {
  console.log('[Mux] video:', videoPath, fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 'missing');
  console.log('[Mux] audio:', audioPath, fs.existsSync(audioPath) ? fs.statSync(audioPath).size : 'missing');

  await runFfmpeg([
    '-y', '-i', videoPath, '-i', audioPath,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', String(videoDuration),
    '-movflags', '+faststart',
    outputPath,
  ], 'mux');
}

async function trimVideo(videoPath, duration, workDir) {
  const outPath = path.join(workDir, 'trimmed.mp4');
  await runFfmpeg([
    '-y', '-i', videoPath,
    '-c:v', 'copy', '-t', String(duration), '-an',
    outPath,
  ], 'trim');
  try { fs.unlinkSync(videoPath); } catch {}
  return outPath;
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

async function getNewsData(newsId) {
  const result = await pool.query('SELECT image_data, title, content FROM news WHERE id = $1', [newsId]);
  if (result.rows.length > 0) return result.rows[0];
  return null;
}

async function getPetInfo(petId) {
  const result = await pool.query('SELECT name, species, breed, status FROM pets WHERE id = $1', [petId]);
  if (result.rows.length > 0) return result.rows[0];
  return null;
}

async function fetchRandomPetPhotos(count) {
  const photos = [];
  const dogCount = Math.ceil(count / 2);
  const catCount = count - dogCount;

  try {
    const dogRes = await fetch(`https://dog.ceo/api/breeds/image/random/${dogCount}`, { signal: AbortSignal.timeout(15000) });
    if (dogRes.ok) {
      const dogData = await dogRes.json();
      if (dogData.message && Array.isArray(dogData.message)) {
        for (const url of dogData.message) {
          try {
            const imgRes = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (imgRes.ok) {
              const buf = Buffer.from(await imgRes.arrayBuffer());
              photos.push(buf.toString('base64'));
            }
          } catch { /* skip failed dog image */ }
        }
      }
    }
  } catch (err) { console.warn('[fetchRandomPetPhotos] Dog CEO failed:', err.message); }

  for (let i = 0; i < catCount; i++) {
    try {
      const catRes = await fetch('https://cataas.com/cat?json=true', { signal: AbortSignal.timeout(15000) });
      if (catRes.ok) {
        const catData = await catRes.json();
        if (catData.url) {
          const imgUrl = catData.url.startsWith('http') ? catData.url : `https://cataas.com${catData.url}`;
          const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(15000) });
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            photos.push(buf.toString('base64'));
          }
        }
      }
    } catch { /* skip failed cat image */ }
  }

  for (let i = photos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [photos[i], photos[j]] = [photos[j], photos[i]];
  }

  console.log('[fetchRandomPetPhotos] fetched', photos.length, '/', count, 'photos from web');
  return photos;
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
    voices = ['elena'],
    frame = 'none',
    stickers = true,
    confetti = false,
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

    let ttsPath = null;
    let ttsDur = 0;
    if (includeVoice && voiceScript) {
      ttsPath = await generateTTS(config, voiceScript, workDir);
      if (ttsPath && fs.existsSync(ttsPath)) {
        ttsDur = await ffprobeDuration(ttsPath);
        console.log('[VideoGen] TTS duration:', ttsDur.toFixed(1), 's');
      }
    }
    logStep('tts generated');

    const videoDuration = ttsDur > 0 ? ttsDur + 4 : duration;
    console.log('[VideoGen] videoDuration:', videoDuration.toFixed(1), 's', ttsDur > 0 ? `(tts ${ttsDur.toFixed(1)}s + 4s)` : `(config ${duration}s)`);

    const fixedDur = OPENING_DUR + CLOSING_DUR;
    const totalTransitionDur = (numPhotoScenes + 1) * TRANSITION_DUR;
    const availableDur = Math.max(videoDuration - fixedDur + totalTransitionDur, numPhotoScenes * 2);
    const photoClipDur = availableDur / numPhotoScenes;

    const [openingClip, closingClip, audioPath] = await Promise.all([
      generateOpeningClip(dims, style, workDir),
      generateClosingClip(dims, style, workDir),
      generateAudio(config, voiceScript, workDir, videoDuration, ttsPath),
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

    if (stickers) {
      clipPath = await addStickers(clipPath, style, photoClipDur, dims, workDir, i);
      logStep(`photo clip ${i} stickers`);
    }

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

  if (frame && frame !== 'none') {
    mainVideoPath = await addFrameOverlay(mainVideoPath, frame, dims, workDir);
    logStep('frame-overlay');
  }

  mainVideoPath = await addColorGrading(mainVideoPath, style, workDir);
  logStep('color-grading');

  if (style === 'emotive') {
    mainVideoPath = await addVignette(mainVideoPath, workDir);
    logStep('vignette');
  }

  if (confetti) {
    const closingStartTime = videoDuration - CLOSING_DUR;
    mainVideoPath = await addConfetti(mainVideoPath, closingStartTime, dims, workDir);
    logStep('confetti');
  }

  mainVideoPath = await trimVideo(mainVideoPath, videoDuration, workDir);
    logStep('trim to videoDuration');

    const videoFilename = `promo-${style}-${Math.round(videoDuration)}s-${format}-${Date.now()}.mp4`;
    const finalVideoPath = path.join(VIDEO_OUTPUT_DIR, videoFilename);

    await muxAudioVideo(mainVideoPath, audioPath, finalVideoPath, videoDuration);
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

export { generateVideo, getRandomReunionPhotos, getGlobalStats, getPetImages, getPetInfo, getNewsImage, getNewsData, fetchRandomPetPhotos };
