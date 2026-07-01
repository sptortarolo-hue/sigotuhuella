import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { rimraf } from 'rimraf';
import pool from '../db.js';
import { synthesizeSpeech } from '../services/ttsService.js';
import { getPetPhotos } from '../services/pexelsService.js';

const execFileAsync = promisify(execFile);

const PUBLIC_DIR = process.env.PUBLIC_DIR || 'public';
const PROJECT_ROOT = process.env.PWD || process.cwd();
const VIDEO_OUTPUT_DIR = path.join(PROJECT_ROOT, PUBLIC_DIR, 'generated', 'videos');
const MUSIC_DIR = path.join(PROJECT_ROOT, PUBLIC_DIR, 'generated', 'music');
const LOGO_PATH = path.join(PROJECT_ROOT, PUBLIC_DIR, 'sigotuhuella.jpg');
const OVERLAYS_DIR = path.join(PROJECT_ROOT, PUBLIC_DIR, 'overlays');
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
  elena: { rate: '-10%', pitch: '-5Hz' },
  tomas: { rate: '-15%', pitch: '-3Hz' },
  mateo: { rate: '-12%', pitch: '-2Hz' },
};

const STYLE_VOICE_PARAMS = {
  emotive: {
    elena: { rate: '-10%', pitch: '-5Hz' },
    tomas: { rate: '-15%', pitch: '-3Hz' },
    mateo: { rate: '-12%', pitch: '-2Hz' },
  },
  informative: {
    elena: { rate: '+0%', pitch: '+0Hz' },
    tomas: { rate: '-5%', pitch: '+0Hz' },
    mateo: { rate: '-3%', pitch: '+0Hz' },
  },
  viral: {
    elena: { rate: '+5%', pitch: '+3Hz' },
    tomas: { rate: '+0%', pitch: '+2Hz' },
    mateo: { rate: '+3%', pitch: '+3Hz' },
  },
};

function getVoiceParams(voiceKey, style) {
  const styleParams = STYLE_VOICE_PARAMS[style]?.[voiceKey];
  if (styleParams) return styleParams;
  return VOICE_PARAMS[voiceKey] || VOICE_PARAMS.elena;
}

const STYLE_TRANSITIONS = {
  emotive: ['fade', 'dissolve', 'fadeblack', 'fadewhite', 'smoothright', 'smoothleft'],
  informative: ['fade', 'dissolve', 'fadeblack', 'fadewhite', 'smoothright', 'smoothleft'],
  viral: ['fade', 'dissolve', 'fadeblack', 'fadewhite', 'smoothright', 'smoothleft'],
};

const STYLE_ZOOMPAN = {
  emotive: { zoomDir: 1, zoomSpeed: 0.0012, panAmp: 0 },
  informative: { zoomDir: 0, zoomSpeed: 0, panAmp: 0.02 },
  viral: { zoomDir: -1, zoomSpeed: 0.0018, panAmp: 0 },
};

const TRANSITION_DUR = 0.6;
const OPENING_DUR = 2;
const CLOSING_DUR = 4;
const FPS = 25;
const FF_PRESET = 'veryfast';
const FF_CRF = 17;



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
  script += 'Sé parte de esta comunidad que ya reúne familias. ';
  return script;
}

async function generateTTS(config, voiceScript, workDir) {
  const stats = await getGlobalStats();
  const baseScript = voiceScript || buildAutoScript(config.style, stats);
  const script = baseScript + '\n\nIngresá en triple doble b punto sigotuhuella punto online y sé parte de nuestra comunidad.';
  const voiceKeys = normalizeVoiceKeys(config.voices || [config.voice || 'elena']);

  const ttsPath = path.join(workDir, 'tts.mp3');
  if (!config.includeVoice || !script) return null;

  if (voiceKeys.length === 1) {
    const voice = VOICE_OPTIONS[voiceKeys[0]] || VOICE_OPTIONS.elena;
    const params = getVoiceParams(voiceKeys[0], config.style);
    const ok = await synthesizeToFile(script, voice, params, ttsPath);
    if (ok) return ttsPath;
    return null;
  }

  return generateMultiVoice(script, voiceKeys, workDir, ttsPath, config.style);
}

async function synthesizeToFile(text, voice, params, outputPath) {
  try {
    const buffer = await synthesizeSpeech(text, voice, params);
    fs.writeFileSync(outputPath, buffer);
    return true;
  } catch (err) {
    console.warn('[TTS] Edge-TTS failed:', err.message);
    return false;
  }
}

async function generateMultiVoice(script, voiceKeys, workDir, ttsPath, style = 'emotive') {
  const blocks = splitByParagraphs(script, voiceKeys, style);

  const clipPaths = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const clipPath = path.join(workDir, `tts_clip_${i}.mp3`);
    const ok = await synthesizeToFile(block.text, block.voice, block.params, clipPath);
    if (ok && fs.existsSync(clipPath)) {
      clipPaths.push(clipPath);
    } else {
      console.warn('[TTS-multi] Clip', i, 'failed');
    }
  }

  if (clipPaths.length === 0) return null;
  if (clipPaths.length === 1) {
    fs.renameSync(clipPaths[0], ttsPath);
    return ttsPath;
  }

  const breakPath = path.join(workDir, 'silence_400ms.mp3');
  await new Promise((resolve, reject) => {
    const cmd = spawn('ffmpeg', [
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
      '-t', '0.4', '-acodec', 'libmp3lame', '-b:a', '192k', '-y', breakPath,
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
      '-acodec', 'libmp3lame', '-b:a', '192k', '-y', ttsPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    cmd.on('close', code => code === 0 ? resolve() : reject(new Error(`concat exit ${code}`)));
  });

  if (fs.existsSync(ttsPath)) return ttsPath;
  fs.copyFileSync(clipPaths[0], ttsPath);
  return ttsPath;
}

const FONT_MONTSERRAT = path.join(PROJECT_ROOT, PUBLIC_DIR, 'fonts', 'Montserrat-Bold.ttf');

function getFontPath() {
  const candidates = [
    FONT_MONTSERRAT,
    '/usr/share/fonts/truetype/montserrat/Montserrat-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) return f;
  }
  console.warn('[Font] No font found on system. Text overlays will use fallback font (may be invisible)');
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
    .replace(/\\/g, '\\\\')
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

async function generatePhotoClip(photoPath, clipDur, zoompan, dims, workDir, clipIndex, overlayText) {
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

  let filter = `zoompan=z='${zf}':x=${xf}:y=${yf}:d=${totalFrames}:s=${w}x${h}:fps=${FPS}`;

  if (overlayText && overlayText.trim()) {
    const fontPath = getFontPath();
    const isVertical = h > w;
    const fontSize = isVertical ? 80 : 60;
    const lineSpacing = 8;
    const maxChars = isVertical ? 20 : 30;
    const animDur = 0.4;
    const enableExpr = `between(t\\,${animDur}\\,${clipDur})`;
    const slideOffset = 60;

    const lines = wrapText(overlayText, maxChars);

    const safeZoneBottom = isVertical ? Math.round(h * 0.76) : Math.round(h * 0.72);
    const textBlockH = fontSize * lines.length + lineSpacing * (lines.length - 1) + 20;
    const boxPad = 20;
    const boxTotalH = textBlockH + boxPad * 2;
    const textY = safeZoneBottom - boxTotalH;

    const longLine = lines.reduce((a, b) => a.length > b.length ? a : b, '');
    const estTextW = longLine.length * fontSize * 0.6;
    const boxW = Math.min(Math.round(estTextW + boxPad * 2 + 20), Math.round(w * 0.88));
    const boxX = Math.round((w - boxW) / 2);

    filter += `,drawbox=x=${boxX}:y=${textY}:w=${boxW}:h=${boxTotalH}:color=black@0.65:t=fill:enable='${enableExpr}'`;

    for (let li = 0; li < lines.length; li++) {
      const escaped = escDrawText(lines[li]);
      const yPos = textY + boxPad + li * (fontSize + lineSpacing);
      const yExpr = `if(lt(t,${animDur}),${yPos+slideOffset}-t/${animDur}*${slideOffset},${yPos})`;
      const ft = fontPath ? `:fontfile='${fontPath}'` : '';
      filter += `,drawtext=text='${escaped}'${ft}:fontcolor=white:fontsize=${fontSize}:bordercolor=black:borderw=2:x=(w-tw)/2:y='${yExpr}':shadowcolor=black:shadowx=2:shadowy=2:enable='${enableExpr}'`;
    }
  }

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

async function generateOpeningClip(dims, style, workDir, firstPhotoPath, hookText) {
  const clipPath = path.join(workDir, 'clip_opening.mp4');
  const { w, h } = dims;
  const fontPath = getFontPath();
  const dur = OPENING_DUR;

  const text = escDrawText(hookText || '');
  const fontSize = h > w ? 90 : 68;
  const maxChars = h > w ? 25 : 35;
  const lines = text ? wrapText(text, maxChars) : [];
  const lineH = fontSize + 6;

  const args = ['-y', '-i', firstPhotoPath];

  const filterParts = [];

  filterParts.push(`scale=${w}:${h}:force_original_aspect_ratio=2,crop=${w}:${h},setsar=1`);

  filterParts.push(`drawbox=x=0:y=0:w=${w}:h=${h}:color=black@0.30:t=fill`);

  for (let li = 0; li < lines.length; li++) {
    const escaped = escDrawText(lines[li]);
    const y = Math.round(h / 2 - (lines.length * lineH) / 2 + li * lineH);
    if (fontPath) {
      filterParts.push(`drawtext=text='${escaped}':fontfile='${fontPath}':fontcolor=white:fontsize=${fontSize}:x=(w-tw)/2:y=${y}:shadowcolor=black:shadowx=4:shadowy=4:enable='between(t\\,0.15\\,${dur})'`);
    } else {
      filterParts.push(`drawtext=text='${escaped}':fontcolor=white:fontsize=${fontSize}:x=(w-tw)/2:y=${y}:shadowcolor=black:shadowx=4:shadowy=4:enable='between(t\\,0.15\\,${dur})'`);
    }
  }

  filterParts.push(`fade=out:st=${dur - 0.4}:d=0.4,format=yuv420p`);

  args.push('-vf', filterParts.join(','));
  args.push('-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF));
  args.push('-pix_fmt', 'yuv420p', '-t', String(dur), '-an');
  args.push(clipPath);

  await runFfmpeg(args, 'opening');
  return clipPath;
}

async function generateClosingClip(dims, style, workDir, lastPhotoPath) {
  const clipPath = path.join(workDir, 'clip_closing.mp4');
  const { w, h } = dims;
  const fontPath = getFontPath();
  const dur = CLOSING_DUR;
  const isVertical = h > w;

  const olive = '0x5A5A40';
  const terracotta = '0xD48C70';
  const cream = '0xF5F5F0';

  const titleText = escDrawText('SIGO TU HUELLA');
  const urlText = escDrawText('sigotuhuella.online');

  const titleFontSize = isVertical ? 60 : 48;
  const urlFontSize = isVertical ? 44 : 32;

  const logoW = Math.round(Math.min(w, h) * 0.28);
  const logoAreaH = Math.round(h * 0.35);
  const logoY = Math.round((logoAreaH - logoW) / 2);
  const titleY = Math.round(logoAreaH + 20);
  const urlY = Math.round(titleY + titleFontSize + 24);

  let textFilters = '';
  if (fontPath) {
    textFilters = `drawtext=text='${titleText}':fontfile='${fontPath}':fontcolor=${cream}:fontsize=${titleFontSize}:x=(w-tw)/2:y=${titleY}:shadowcolor=${olive}@0.6:shadowx=3:shadowy=3:enable='between(t\\,0.5\\,${dur})'`;
    textFilters += `,drawtext=text='${urlText}':fontfile='${fontPath}':fontcolor=${terracotta}:fontsize=${urlFontSize}:x=(w-tw)/2:y=${urlY}:shadowcolor=${olive}@0.5:shadowx=2:shadowy=2:enable='between(t\\,0.8\\,${dur})'`;
  } else {
    textFilters = `drawtext=text='${titleText}':fontcolor=${cream}:fontsize=${titleFontSize}:x=(w-tw)/2:y=${titleY}:shadowcolor=${olive}@0.6:shadowx=3:shadowy=3:enable='between(t\\,0.5\\,${dur})'`;
    textFilters += `,drawtext=text='${urlText}':fontcolor=${terracotta}:fontsize=${urlFontSize}:x=(w-tw)/2:y=${urlY}:shadowcolor=${olive}@0.5:shadowx=2:shadowy=2:enable='between(t\\,0.8\\,${dur})'`;
  }

  const args = ['-y'];
  const hasPhoto = lastPhotoPath && fs.existsSync(lastPhotoPath);

  if (hasPhoto) {
    args.push('-i', lastPhotoPath);
    if (fs.existsSync(LOGO_PATH)) {
      args.push('-i', LOGO_PATH);
      args.push('-filter_complex', `[0:v]scale=${w}:${h}:force_original_aspect_ratio=2,crop=${w}:${h},gblur=sigma=20[bg];[1:v]scale=${logoW}:-1[logo];[bg][logo]overlay=(W-w)/2:${logoY}:format=auto:eval=frame:eof_action=repeat[withlogo];[withlogo]fade=in:st=0:d=0.4,${textFilters},fade=out:st=${dur - 0.4}:d=0.4,format=yuv420p[v]`);
      args.push('-map', '[v]');
    } else {
      args.push('-filter_complex', `[0:v]scale=${w}:${h}:force_original_aspect_ratio=2,crop=${w}:${h},gblur=sigma=20[bg];[bg]fade=in:st=0:d=0.4,${textFilters},fade=out:st=${dur - 0.4}:d=0.4,format=yuv420p[v]`);
      args.push('-map', '[v]');
    }
  } else {
    args.push('-f', 'lavfi', '-i', `color=c=${cream}:s=${w}x${h}:d=${dur}:rate=${FPS}`);
    if (fs.existsSync(LOGO_PATH)) {
      args.push('-i', LOGO_PATH);
      args.push('-filter_complex', `[1:v]scale=${logoW}:-1[logo];[0:v][logo]overlay=(W-w)/2:${logoY}:format=auto:eval=frame:eof_action=repeat[withlogo];[withlogo]fade=in:st=0:d=0.4,${textFilters},fade=out:st=${dur - 0.4}:d=0.4,format=yuv420p[v]`);
      args.push('-map', '[v]');
    } else {
      args.push('-filter_complex', `[0:v]fade=in:st=0:d=0.4,${textFilters},fade=out:st=${dur - 0.4}:d=0.4,format=yuv420p[v]`);
      args.push('-map', '[v]');
    }
  }

  args.push('-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF));
  args.push('-pix_fmt', 'yuv420p', '-t', String(dur), '-an');
  args.push(clipPath);

  await runFfmpeg(args, 'closing');

  return clipPath;
}

function formatSrtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const cs = Math.round((s - Math.floor(s)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')},${String(cs).padStart(3, '0')}`;
}

async function applyPostProcessing(mainVideoPath, dims, style, workDir, config) {
  const { w, h } = dims;
  const {
    frame = 'none',
    videoDuration,
  } = config;

  const outPath = path.join(workDir, 'processed.mp4');

  const hasLogo = fs.existsSync(LOGO_PATH);

  const inputs = ['-i', mainVideoPath];
  let inputIdx = 1;
  const chains = [];

  // 1. Watermark
  if (hasLogo) {
    const pad = Math.round(Math.min(w, h) * 0.03);
    const wmSize = Math.round(Math.min(w, h) * 0.10);
    inputs.push('-i', LOGO_PATH);
    chains.push(`[${inputIdx}:v]scale=${wmSize}:-1,format=rgba,colorchannelmixer=aa=0.60[wm]`);
    const prev = chains.length > 1 ? `[wm${inputIdx-1}o]` : '[0:v]';
    chains.push(`${prev}[wm]overlay=W-w-${pad}:${pad}:format=auto[wm${inputIdx}o]`);
    inputIdx++;
  }

  // 2. Frame overlay
  if (frame && frame !== 'none') {
    const formatName = h > w ? 'vertical' : (w === h ? 'square' : 'landscape');
    const framePath = path.join(FRAMES_DIR, `${frame}-${formatName}.png`);
    if (fs.existsSync(framePath)) {
      inputs.push('-i', framePath);
      chains.push(`[${inputIdx}:v]format=rgba[frm]`);
      const prev = lastStreamLabel(chains);
      chains.push(`[${prev}][frm]overlay=0:0:format=auto:eval=frame:eof_action=repeat[frm${inputIdx}o]`);
      inputIdx++;
    }
  }

  // 3. Color grading
  const gradeFilter = STYLE_COLOR_GRADING[style];
  if (gradeFilter) {
    const prev = lastStreamLabel(chains);
    chains.push(`[${prev}]${gradeFilter},format=yuv420p[gradeo]`);
  }

  // 4. Vignette (emotive only)
  if (style === 'emotive') {
    const prev = lastStreamLabel(chains);
    chains.push(`[${prev}]vignette=angle=0.3:mode=forward,format=yuv420p[vigo]`);
  }

  // Nothing to do? Just trim
  if (chains.length === 0) {
    if (mainVideoPath !== outPath) {
      try { fs.copyFileSync(mainVideoPath, outPath); } catch { return mainVideoPath; }
    }
    return outPath;
  }

  // Final: trim to exact duration
  const lastStream = lastStreamLabel(chains);
  const filterComplex = chains.join(';') + `;[${lastStream}]trim=duration=${videoDuration},format=yuv420p[v]`;

  const args = [
    '-y', ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[v]',
    '-c:v', 'libx264', '-preset', FF_PRESET, '-crf', String(FF_CRF),
    '-pix_fmt', 'yuv420p', '-an',
    outPath,
  ];

  try {
    await runFfmpeg(args, 'postprocess');
    try { fs.unlinkSync(mainVideoPath); } catch {}
    return outPath;
  } catch (err) {
    console.warn('[PostProcess] Failed, returning original:', err.message);
    return mainVideoPath;
  }
}

function lastStreamLabel(chains) {
  if (chains.length === 0) return '0:v';
  const labelMatch = chains[chains.length - 1].match(/\[(\w+)\]$/);
  return labelMatch ? labelMatch[1] : '0:v';
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

async function concatenateClipsWithTransitions(clipPaths, transitionsArr, workDir) {
  if (clipPaths.length === 1) return clipPaths[0];

  const getT = (i) => {
    if (!Array.isArray(transitionsArr)) return transitionsArr;
    return transitionsArr[i % transitionsArr.length];
  };

  if (clipPaths.length === 2) {
    const outPath = path.join(workDir, 'concat.mp4');
    const firstDur = await ffprobeDuration(clipPaths[0]);
    const offset = Math.max(0.1, firstDur - TRANSITION_DUR);

    await runFfmpeg([
      '-y', '-i', clipPaths[0], '-i', clipPaths[1],
      '-filter_complex', `[0:v][1:v]xfade=transition=${getT(0)}:duration=${TRANSITION_DUR}:offset=${offset}[v]`,
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
      '-filter_complex', `[0:v][1:v]xfade=transition=${getT(i - 1)}:duration=${TRANSITION_DUR}:offset=${offset}[v]`,
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
  const result = await pool.query('SELECT name, species, breed, status, description FROM pets WHERE id = $1', [petId]);
  if (result.rows.length > 0) return result.rows[0];
  return null;
}

async function fetchRandomPetPhotos(count) {
  console.log('[fetchRandomPetPhotos] fetching from Pexels...');
  return getPetPhotos(count);
}

async function generateVideo(config) {
  const {
    style = 'emotive',
    duration = 20,
    music = 'emotional',
    includeVoice = true,
    format = 'vertical',
    voiceScript = '',
    scenes = [],
    voices = ['elena'],
    frame = 'none',
  } = config;

  const dims = FORMAT_DIMS[format] || FORMAT_DIMS.vertical;
  const { w, h } = dims;
  const zoompan = STYLE_ZOOMPAN[style] || STYLE_ZOOMPAN.emotive;
  const transitions = STYLE_TRANSITIONS[style] || STYLE_TRANSITIONS.emotive;

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

    const photoClipsCount = numPhotoScenes - 1;
    const fixedDur = OPENING_DUR + CLOSING_DUR;
    const totalTransitionDur = (photoClipsCount + 1) * TRANSITION_DUR;
    const availableDur = Math.max(videoDuration - fixedDur + totalTransitionDur, photoClipsCount * 2);
    const photoClipDur = photoClipsCount > 0 ? availableDur / photoClipsCount : 2;

    const hookText = photoScenes[0]?.overlayText || '';
    const lastPhotoPath = photoPaths[numPhotoScenes - 1];
    const [openingClip, closingClip, audioPath] = await Promise.all([
      generateOpeningClip(dims, style, workDir, photoPaths[0], hookText),
      generateClosingClip(dims, style, workDir, lastPhotoPath),
      generateAudio(config, voiceScript, workDir, videoDuration, ttsPath),
    ]);
    logStep('opening+closing+audio parallel');

    const mainClips = [];
    mainClips.push(openingClip);

  for (let i = 1; i < numPhotoScenes; i++) {
    const scene = photoScenes[i];
    const clipPath = await generatePhotoClip(photoPaths[i], photoClipDur, zoompan, dims, workDir, i, scene.overlayText);
    logStep(`photo clip ${i}`);
    mainClips.push(clipPath);
  }

    mainClips.push(closingClip);

    let mainVideoPath;
    try {
      mainVideoPath = await concatenateClipsWithTransitions(mainClips, transitions, workDir);
      logStep('concat+xfade');
    } catch (xfadeErr) {
      console.warn('xfade failed, falling back to simple concat:', xfadeErr.message);
      mainVideoPath = await concatenateSimple(mainClips, workDir);
      logStep('concat-simple fallback');
    }

    mainVideoPath = await applyPostProcessing(mainVideoPath, dims, style, workDir, {
      frame,
      videoDuration,
    });
    logStep('post-process (merged)');

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
