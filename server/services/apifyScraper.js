import pool from '../db.js';

function arDateHour(date) {
  return parseInt(new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false }).format(date));
}

function arDateStr(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

async function tryScrapeIfScheduled() {
  const enabled = await pool.query("SELECT value FROM settings WHERE key = 'fb_scraping_enabled'");
  if (enabled.rows[0]?.value !== 'true') return;

  try {
    const res = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('fb_scraper_from', 'fb_scraper_to', 'fb_scraper_interval')"
    );
    const map = {};
    for (const row of res.rows) map[row.key] = row.value;
    const from = parseInt(map.fb_scraper_from) || 8;
    const to = parseInt(map.fb_scraper_to) || 20;
    const interval = parseInt(map.fb_scraper_interval) || 4;

    const currentHour = arDateHour(new Date());

    const hours = [];
    for (let h = from; h <= to; h += interval) hours.push(h);
    if (!hours.includes(currentHour)) return;

    const lastRun = await pool.query("SELECT value FROM settings WHERE key = 'apify_last_scrape_at'");
    if (lastRun.rows[0]?.value) {
      const lastDate = new Date(lastRun.rows[0].value);
      if (!isNaN(lastDate.getTime())) {
        const lastHour = arDateHour(lastDate);
        if (lastHour === currentHour && arDateStr(lastDate) === arDateStr(new Date())) return;
        const minSince = (Date.now() - lastDate.getTime()) / 60000;
        if (minSince < 30) {
          console.log(`[Scraper] Saltando (${Math.round(minSince)} min desde último scrape, mínimo 30)`);
          return;
        }
      }
    }

    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('fb_scrape_pending', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text"
    );
    console.log('[Scraper] Scrape marcado como pendiente');
  } catch (err) {
    console.error('[Scraper] Error en scheduler:', err.message);
  }
}

export function startFbScraperScheduler() {
  console.log('[Scraper] Scheduler cada 60s (horas configurables desde Admin)');

  setTimeout(async () => {
    await tryScrapeIfScheduled();
  }, 10000);

  setInterval(async () => {
    await tryScrapeIfScheduled();
  }, 60000);
}
