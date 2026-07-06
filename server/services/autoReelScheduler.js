import pool from '../db.js';
import { resolveTemplate } from '../lib/videoTemplates.js';
import { generateVideo } from '../lib/videoAssembler.js';

const TEMPLATE_IDS = ['app-showcase', 'app-success', 'app-feature'];

let intervalHandle = null;
let isRunning = false;

export async function startReelScheduler() {
  const enabledResult = await pool.query("SELECT value FROM settings WHERE key = 'reel_enabled'");
  if (enabledResult.rows[0]?.value !== 'true') {
    console.log('[AutoReel] Disabled by settings');
    return;
  }

  const intervalResult = await pool.query("SELECT value FROM settings WHERE key = 'reel_interval_hours'");
  const intervalHours = parseInt(intervalResult.rows[0]?.value) || 6;

  console.log(`[AutoReel] Started (every ${intervalHours}h)`);

  setTimeout(cycleReel, 60_000);

  intervalHandle = setInterval(cycleReel, intervalHours * 3600000);
}

export function stopReelScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

async function cycleReel() {
  if (isRunning) {
    console.log('[AutoReel] Previous cycle still running, skipping');
    return;
  }
  isRunning = true;
  try {
    const idxResult = await pool.query("SELECT value FROM settings WHERE key = 'reel_template_index'");
    let idx = parseInt(idxResult.rows[0]?.value) || 0;
    const templateId = TEMPLATE_IDS[idx % TEMPLATE_IDS.length];

    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('reel_template_index', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
      [String((idx + 1) % TEMPLATE_IDS.length)]
    );

    console.log(`[AutoReel] Generating from '${templateId}'`);

    const templateConfig = await resolveTemplate(templateId);
    if (templateConfig.scenes.length < 2) {
      console.warn(`[AutoReel] '${templateId}' only ${templateConfig.scenes.length} scenes, skipping`);
      return;
    }

    const result = await generateVideo({
      style: templateConfig.style,
      duration: 20,
      music: templateConfig.music,
      includeVoice: true,
      format: 'vertical',
      voiceScript: templateConfig.voiceScript,
      voices: templateConfig.voices,
      frame: 'none',
      scenes: templateConfig.scenes,
    });

    const title = `Auto ${templateId} ${new Date().toLocaleDateString('es-AR')}`;
    await pool.query(
      `INSERT INTO promotional_videos (title, video_data, thumbnail_data, style, duration, music_track, voice_enabled, format, status, story_interval_minutes)
       VALUES ($1, $2, $3, $4, 20, $5, true, 'vertical', 'ready', 360)`,
      [title, result.filename, result.thumbnail, templateConfig.style, templateConfig.music]
    );

    console.log(`[AutoReel] Done: '${templateId}' -> ${result.filename}`);
  } catch (err) {
    console.error('[AutoReel] Error:', err.message);
  } finally {
    isRunning = false;
  }
}
