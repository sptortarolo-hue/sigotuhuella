import { captureAllScreenshots } from './screenshotService.js';
import pool from '../db.js';

let intervalHandle = null;
let timeoutHandle = null;

function msUntilNext4AM() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(4, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

export async function startScreenshotScheduler() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'screenshots_interval_hours'");
  const intervalHours = parseInt(result.rows[0]?.value) || 24;

  const msToNext = msUntilNext4AM();
  const hoursToNext = (msToNext / 3600000).toFixed(1);
  console.log(`[AutoScreenshots] Scheduled at 04:00 server time, next run in ${hoursToNext}h (interval: ${intervalHours}h)`);

  timeoutHandle = setTimeout(() => {
    captureAllScreenshots().catch(err => console.error('[AutoScreenshots] capture failed:', err.message));
    intervalHandle = setInterval(() => {
      captureAllScreenshots().catch(err => console.error('[AutoScreenshots] capture failed:', err.message));
    }, intervalHours * 3600000);
  }, msToNext);
}

export function stopScreenshotScheduler() {
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
