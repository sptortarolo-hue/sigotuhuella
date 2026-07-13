import axios from 'axios';
import pool from '../db.js';

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
let scrapingInProgress = false;
const BASE_URL = process.env.BASE_URL || 'https://sigotuhuella.online';
const WEBHOOK_URL = `${BASE_URL}/api/facebook/webhook`;
const APIFY_BASE = 'https://api.apify.com/v2';

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/+$/, '');
    if (u.hostname.startsWith('www.')) u.hostname = u.hostname.slice(4);
    return u.href.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.replace(/\/+$/, '').toLowerCase();
  }
}

function arDateHour(date) {
  return parseInt(new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', hour12: false }).format(date));
}

function arDateStr(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

export async function scrapeWithApify() {
  if (scrapingInProgress) {
    console.log('[Apify Scraper] Ya hay un scrape en curso, saltando');
    return;
  }
  if (!APIFY_TOKEN) {
    console.log('[Apify Scraper] APIFY_TOKEN no configurado');
    return;
  }
  const enabled = await pool.query("SELECT value FROM settings WHERE key = 'fb_scraping_enabled'");
  if (enabled.rows[0]?.value !== 'true') return;

  const groupsResult = await pool.query(
    "SELECT id, name, url FROM facebook_groups WHERE is_active = true AND scrape_enabled = true ORDER BY name ASC"
  );
  if (groupsResult.rows.length === 0) return;

  scrapingInProgress = true;

  const groups = groupsResult.rows;
  const urlToGroupId = {};
  for (const g of groups) {
    urlToGroupId[normalizeUrl(g.url)] = g.id;
  }

  console.log(`[Apify Scraper] ${groups.length} grupo(s)...`);

  const maxPostsSetting = await pool.query("SELECT value FROM settings WHERE key = 'fb_scraper_max_posts'");
  const maxPosts = parseInt(maxPostsSetting.rows[0]?.value) || 30;

  const input = {
    startUrls: groups.map(g => ({ url: g.url })),
    maxPosts,
    sortOrder: 'CHRONOLOGICAL',
    includeTopComments: false,
    enableDedup: true,
    refreshWindowDays: 7,
    proxyConfig: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL'],
    },
  };

  try {
    const { data: runData } = await axios.post(`${APIFY_BASE}/acts/crowdpull~facebook-group-posts-scraper/runs`, input, {
      params: { token: APIFY_TOKEN },
      headers: { 'Content-Type': 'application/json' },
    });
    const run = runData.data;
    const runId = run.id;

    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const { data: statusData } = await axios.get(`${APIFY_BASE}/actor-runs/${runId}`, {
        params: { token: APIFY_TOKEN },
      });
      const status = statusData.data.status;
      if (status === 'SUCCEEDED') { console.log(`[Apify Scraper] Run SUCCEEDED (${i*5}s)`); break; }
      if (i > 0 && i % 12 === 0) console.log(`[Apify Scraper] Waiting... ${status}`);
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        console.error(`[Apify Scraper] Run ${status}`);
        return;
      }
    }

    const { data: listData } = await axios.get(`${APIFY_BASE}/datasets/${run.defaultDatasetId}/items`, {
      params: { token: APIFY_TOKEN, format: 'json' },
    });
    const items = Array.isArray(listData) ? listData : (listData.data || []);

    if (items.length === 0) {
      console.log('[Apify Scraper] 0 posts nuevos');
      return;
    }

    console.log(`[Apify Scraper] ${items.length} posts`);

    const postsByGroup = {};
    for (const item of items) {
      const groupUrl = normalizeUrl(item.groupUrl || '');
      const groupId = urlToGroupId[groupUrl] || null;
      if (!groupId) {
        console.log('[Apify Scraper] Saltado (sin grupo):', groupUrl, (item.postText||'').slice(0, 40));
        continue;
      }

      const fb_post_id = item.postId || '';
      if (!fb_post_id) continue;

      const images = Array.isArray(item.imageUrls) ? item.imageUrls.slice(0, 5) : [];

      const post = {
        fb_post_id,
        group_id: groupId,
        fb_post_url: item.postUrl || '',
        author_name: item.authorName || '',
        content: (item.postText || '').trim().substring(0, 10000),
        image_urls: images,
        posted_at: item.timestamp || null,
        comments: [],
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
    console.error('[Apify Scraper] Error:', err.message);
    let dataStr = '';
    try {
      const errObj = {};
      for (const k of Object.getOwnPropertyNames(err)) errObj[k] = err[k];
      dataStr = JSON.stringify(errObj).slice(0, 600);
    } catch(e) { dataStr = 'circular/error'; }
    console.error('[Apify Scraper] StatusCode:', err.statusCode, 'Type:', err.type, 'Data:', dataStr);
  } finally {
    scrapingInProgress = false;
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

    const currentHour = arDateHour(new Date());

    if (currentHour !== hour1 && currentHour !== hour2) return;

    const lastRun = await pool.query("SELECT value FROM settings WHERE key = 'apify_last_scrape_at'");
    if (lastRun.rows[0]?.value) {
      const lastDate = new Date(lastRun.rows[0].value);
      if (!isNaN(lastDate.getTime())) {
        const lastHour = arDateHour(lastDate);
        if (lastHour === currentHour && arDateStr(lastDate) === arDateStr(new Date())) return;
        const minSince = (Date.now() - lastDate.getTime()) / 60000;
        if (minSince < 30) {
          console.log(`[Apify Scraper] Saltando (${Math.round(minSince)} min desde último scrape, mínimo 30)`);
          return;
        }
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
