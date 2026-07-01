import { captureAllScreenshots } from './screenshotService.js';
import pool from '../db.js';

let intervalHandle = null;

export async function startScreenshotScheduler() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'screenshots_interval_hours'");
  const intervalHours = parseInt(result.rows[0]?.value) || 6;

  console.log(`[AutoScreenshots] Scheduler started (every ${intervalHours}h)`);

  await captureAllScreenshots();

  intervalHandle = setInterval(captureAllScreenshots, intervalHours * 3600000);
}

export function stopScreenshotScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
