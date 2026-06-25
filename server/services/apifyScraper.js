import { ApifyClient } from 'apify-client';
import axios from 'axios';
import pool from '../db.js';

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const BASE_URL = process.env.BASE_URL || 'https://sigotuhuella.online';
const WEBHOOK_URL = `${BASE_URL}/api/facebook/webhook`;

let client = null;

function getClient() {
  if (!client && APIFY_TOKEN) {
    client = new ApifyClient({ token: APIFY_TOKEN });
  }
  return client;
}

export async function scrapeWithApify() {
  if (!APIFY_TOKEN) {
    console.log('[Apify Scraper] APIFY_TOKEN no configurado');
    return;
  }

  const c = getClient();
  if (!c) return;

  const enabled = await pool.query("SELECT value FROM settings WHERE key = 'fb_scraping_enabled'");
  if (enabled.rows[0]?.value !== 'true') return;

  const groupsResult = await pool.query(
    "SELECT id, name, url FROM facebook_groups WHERE is_active = true AND scrape_enabled = true ORDER BY name ASC"
  );
  if (groupsResult.rows.length === 0) return;

  const groups = groupsResult.rows;
  const urlToGroupId = {};
  for (const g of groups) {
    urlToGroupId[g.url.replace(/\/+$/, '')] = g.id;
  }

  console.log(`[Apify Scraper] ${groups.length} grupo(s)...`);

  const input = {
    startUrls: groups.map(g => g.url),
    maxItems: 30,
    viewOption: 'CHRONOLOGICAL',
    includeComments: true,
    proxy: {
      useApifyProxy: true,
    },
  };

  try {
    const run = await c.actor('memo23/facebook-public-group-posts-scraper').call(input);
    const { items } = await c.dataset(run.defaultDatasetId).listItems();

    if (items.length === 0) {
      console.log('[Apify Scraper] 0 posts nuevos');
      return;
    }

    console.log(`[Apify Scraper] ${items.length} posts`);

    const postsByGroup = {};
    for (const item of items) {
      const inputUrl = (item.inputUrl || item.facebookUrl || '').replace(/\/+$/, '');
      const groupId = urlToGroupId[inputUrl] || null;
      if (!groupId) continue;

      const pidMatch = item.url?.match(/\/posts\/(\d+)/) || item.url?.match(/\/permalink\/(\d+)/);
      const fb_post_id = pidMatch ? pidMatch[1] : item.legacyId || '';
      if (!fb_post_id) continue;

      const images = [];
      if (item.attachments) {
        for (const att of item.attachments) {
          const src = att?.photo_image?.uri || att?.thumbnail || att?.media?.imageUrl || att?.media?.src || att?.imageUrl || '';
          if (src) images.push(src);
        }
      }
      if (item.media?.imageUrl) images.push(item.media.imageUrl);

      const comments = (item.topComments || []).map(c => ({
        id: c.commentId || c.id || '',
        author: c.profileName || '',
        text: c.text || '',
        timestamp: null,
      }));

      const post = {
        fb_post_id,
        group_id: groupId,
        fb_post_url: item.url || '',
        author_name: item.user?.name || '',
        content: (item.text || '').trim().substring(0, 10000),
        image_urls: [...new Set(images)].slice(0, 5),
        posted_at: item.time || null,
        comments,
      };

      if (!postsByGroup[groupId]) postsByGroup[groupId] = [];
      postsByGroup[groupId].push(post);
    }

    const scraperToken = await pool.query("SELECT value FROM settings WHERE key = 'fb_scraper_token'");
    const token = scraperToken.rows[0]?.value || '';

    for (const [groupId, posts] of Object.entries(postsByGroup)) {
      try {
        await axios.post(WEBHOOK_URL, { posts }, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 60000,
        });
        console.log(`[Apify Scraper] ${posts.length} posts enviados`);
      } catch (err) {
        console.error(`[Apify Scraper] Error:`, err.response?.status, err.message);
      }
    }

    const gids = Object.keys(postsByGroup);
    if (gids.length > 0) {
      await pool.query(
        'UPDATE facebook_groups SET last_scraped_at = NOW() WHERE id = ANY($1::uuid[])',
        [gids]
      );
    }

    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('apify_last_scrape_at', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text"
    );
  } catch (err) {
    const body = err.response?.data || err.response?.body || '';
    if (body) {
      console.error('[Apify Scraper] Error 400 body:', typeof body === 'string' ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500));
    }
    console.error('[Apify Scraper] Error:', err.message);
  }
}

async function tryScrapeIfScheduled() {
  try {
    const hoursRes = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('fb_scraper_hour_1', 'fb_scraper_hour_2')"
    );
    const map = {};
    for (const row of hoursRes.rows) {
      const v = parseInt(row.value);
      if (!isNaN(v)) map[row.key] = v;
    }
    const hour1 = map.fb_scraper_hour_1 ?? 8;
    const hour2 = map.fb_scraper_hour_2 ?? 20;

    const now = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: 'numeric', hour12: false,
    }).format(new Date());
    const currentHour = parseInt(now);

    if (currentHour !== hour1 && currentHour !== hour2) return;

    const lastRun = await pool.query("SELECT value FROM settings WHERE key = 'apify_last_scrape_at'");
    if (lastRun.rows[0]?.value) {
      const lastDate = new Date(lastRun.rows[0].value);
      if (!isNaN(lastDate.getTime())) {
        const lastHour = lastDate.getHours();
        const today = new Date().toDateString();
        if (lastHour === currentHour && lastDate.toDateString() === today) return;
      }
    }

    await scrapeWithApify();
  } catch (err) {
    console.error('[Apify Scraper] Error en scheduler:', err.message);
  }
}

export function startApifyScraper() {
  console.log('[Apify Scraper] Scheduler cada 60s (horas configurables desde Admin)');

  setTimeout(async () => {
    await tryScrapeIfScheduled();
  }, 10000);

  setInterval(async () => {
    await tryScrapeIfScheduled();
  }, 60000);
}
