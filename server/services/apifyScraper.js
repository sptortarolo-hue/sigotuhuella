import pool from '../db.js';
import { ApifyClient } from 'apify-client';

const APIFY_ACTOR = 'crowdpull~facebook-group-posts-scraper';

function arDateHour(date) {
  return parseInt(new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false }).format(date));
}

function arDateStr(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

function getApifyClient() {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN not configured');
  return new ApifyClient({ token });
}

async function getActiveGroups() {
  const result = await pool.query(
    "SELECT id, name, url, fb_group_id FROM facebook_groups WHERE is_active = true AND scrape_enabled = true ORDER BY name ASC"
  );
  return result.rows;
}

function extractGroupIdFromUrl(url) {
  const match = url?.match(/facebook\.com\/groups\/(\d+)/);
  return match ? match[1] : null;
}

async function scrapeGroupsWithApify(groups) {
  const client = getApifyClient();
  const allPosts = [];

  for (const group of groups) {
    const groupUrl = group.url;
    if (!groupUrl) {
      console.log(`[Apify] Grupo ${group.name} sin URL, saltando`);
      continue;
    }

    console.log(`[Apify] Scrapeando grupo: ${group.name} (${groupUrl})`);

    try {
      const input = {
        startUrls: [{ url: groupUrl }],
        maxPosts: 30,
        sortOrder: 'CHRONOLOGICAL',
        includeTopComments: true,
        enableDedup: true,
        proxyConfig: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
      };

      const run = await client.actor(APIFY_ACTOR).call(input, {
        waitSecs: 120,
        memory: 1024,
      });

      console.log(`[Apify] Actor run ${run.id} terminado (${run.status}), datasetItems: ${run.defaultDatasetId}`);

      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      for (const item of items) {
        const postId = item.postId || item.id;
        if (!postId) continue;

        const postUrl = item.postUrl || `https://www.facebook.com/groups/${group.fb_group_id || extractGroupIdFromUrl(groupUrl) || 'unknown'}/posts/${postId}/`;
        const text = item.postText || item.text || item.message || '';
        const images = (item.imageUrls || item.images || []).filter(Boolean);
        const author = item.authorName || item.author || item.username || '';
        const timestamp = item.timestamp || item.postedAt || null;
        const comments = (item.topComments || item.comments || []).map(c => ({
          id: c.id || c.commentId || null,
          author: c.authorName || c.author || c.username || '',
          text: c.text || c.message || '',
          timestamp: c.timestamp || c.postedAt || null,
        }));

        allPosts.push({
          group_id: group.id,
          fb_post_id: String(postId),
          fb_post_url: postUrl,
          author_name: author,
          content: text,
          image_urls: images,
          posted_at: timestamp,
          comments,
        });
      }

      console.log(`[Apify] ${items.length} posts extraídos de ${group.name}`);
    } catch (err) {
      console.error(`[Apify] Error scrapeando ${group.name}:`, err.message);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  return allPosts;
}

async function processPosts(posts, scraperToken) {
  if (posts.length === 0) return { inserted: 0, updated: 0, errors: 0 };

  const resp = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/facebook/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${scraperToken}`,
    },
    body: JSON.stringify({ posts }),
    signal: AbortSignal.timeout(300000),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Webhook HTTP ${resp.status}: ${errText.slice(0, 200)}`);
  }

  return await resp.json();
}

async function runApifyScrape() {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error('[Apify] APIFY_TOKEN no configurado');
    return;
  }

  const groups = await getActiveGroups();
  if (groups.length === 0) {
    console.log('[Apify] No hay grupos activos para scrapear');
    return;
  }

  console.log(`[Apify] Iniciando scrape de ${groups.length} grupos`);

  const posts = await scrapeGroupsWithApify(groups);
  console.log(`[Apify] Total posts extraídos: ${posts.length}`);

  if (posts.length === 0) {
    console.log('[Apify] Sin posts nuevos');
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('apify_last_scrape_at', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text"
    );
    return;
  }

  const scraperToken = await pool.query("SELECT value FROM settings WHERE key = 'fb_scraper_token'");
  const tokenValue = scraperToken.rows[0]?.value || 'sihuella';

  const result = await processPosts(posts, tokenValue);
  console.log(`[Apify] Procesados: ${result.inserted} insertados, ${result.updated} actualizados, ${result.errors} errores`);

  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('apify_last_scrape_at', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text"
  );
  await pool.query("DELETE FROM settings WHERE key = 'fb_scrape_pending'");
}

let isScraping = false;

async function tryScrapeIfScheduled() {
  if (isScraping) return;

  const enabled = await pool.query("SELECT value FROM settings WHERE key = 'fb_scraping_enabled'");
  if (enabled.rows[0]?.value !== 'true') return;

  const token = process.env.APIFY_TOKEN;
  if (!token) return;

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
          console.log(`[Apify] Saltando (${Math.round(minSince)} min desde último scrape, mínimo 30)`);
          return;
        }
      }
    }

    isScraping = true;
    console.log('[Apify] Iniciando scrape programado...');
    await runApifyScrape();
    isScraping = false;
  } catch (err) {
    isScraping = false;
    console.error('[Apify] Error en scheduler:', err.message);
  }
}

export async function triggerApifyScrape() {
  if (isScraping) throw new Error('Scrape ya en curso');
  isScraping = true;
  try {
    await runApifyScrape();
  } finally {
    isScraping = false;
  }
}

export function startFbScraperScheduler() {
  console.log('[Apify] Scheduler cada 60s (horas configurables desde Admin)');

  setTimeout(async () => {
    await tryScrapeIfScheduled();
  }, 10000);

  setInterval(async () => {
    await tryScrapeIfScheduled();
  }, 60000);
}
