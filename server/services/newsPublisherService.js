import pool from '../db.js';
import { applyBrandOverlay, generatePlatformContent, getBrandSettings, getAutoPublishSettings } from './brandIdentityService.js';
import { getStoredToken, isConnected, createContainer, publishContainer, waitForContainer } from './instagramService.js';
import { publishNewsToPage, publishNewsToGroups } from './facebookPublisher.js';
import { enqueue } from './phoneRelayService.js';
import { enqueueStatus } from './whatsappStatusService.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

async function upsertPublication(newsId, platform, status, platformPostId, errorMessage) {
  const existing = await pool.query(
    `SELECT id FROM news_publications WHERE news_id = $1 AND platform = $2`,
    [newsId, platform]
  );
  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE news_publications
       SET status = $3, platform_post_id = COALESCE($4, platform_post_id),
           error_message = $5,
           published_at = CASE WHEN $3 = 'published' THEN NOW() ELSE published_at END,
           updated_at = NOW()
       WHERE news_id = $1 AND platform = $2`,
      [newsId, platform, status, platformPostId || null, errorMessage || null]
    );
  } else {
    await pool.query(
      `INSERT INTO news_publications (news_id, platform, status, platform_post_id, error_message, published_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $3 = 'published' THEN NOW() ELSE NULL END)`,
      [newsId, platform, status, platformPostId || null, errorMessage || null]
    );
  }
}

async function getExistingPublication(newsId, platform) {
  try {
    const { rows } = await pool.query(
      `SELECT status FROM news_publications WHERE news_id = $1 AND platform = $2`,
      [newsId, platform]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function shouldPublish(newsId, platform) {
  const existing = await getExistingPublication(newsId, platform);
  if (!existing) return true;
  return existing.status === 'failed';
}

async function publishToInstagram(news) {
  const connected = await isConnected();
  if (!connected) return { success: false, error: 'Instagram no conectado' };
  const token = await getStoredToken();
  if (!token) return { success: false, error: 'Instagram sin token' };

  const imageUrl = `${FRONTEND_URL}/api/news/${news.id}/publish-image`;

  const caption = generatePlatformContent(news, 'instagram');

  try {
    const containerId = await createContainer([imageUrl], caption);
    await waitForContainer(containerId, 'IMAGE');
    const result = await publishContainer(containerId);
    const permalink = result.permalink || `https://www.instagram.com/p/${result.id}/`;
    return { success: true, platformPostId: result.id, permalink };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function publishToFacebook(news) {
  const brand = await getBrandSettings();
  const message = generatePlatformContent(news, 'facebook');

  const imageBuffer = news.image_data ? Buffer.from(news.image_data, 'base64') : null;
  const brandedImage = imageBuffer ? await applyBrandOverlay(imageBuffer, news) : null;
  const imageBase64 = brandedImage ? brandedImage.toString('base64') : null;

  const pageResult = await publishNewsToPage(message, imageBase64);

  const groupsResult = await pool.query(
    `SELECT id, name, fb_group_id FROM facebook_groups
     WHERE is_active = true AND publish_on_create = true AND page_is_member = true
       AND fb_group_id IS NOT NULL AND fb_group_id != ''
     ORDER BY name`
  );

  let groupsOk = true;
  let groupsError = null;
  if (groupsResult.rows.length > 0) {
    const eligibleGroups = groupsResult.rows.map(g => ({
      id: g.id, fb_group_id: g.fb_group_id, name: g.name,
    }));
    const gResult = await publishNewsToGroups(eligibleGroups, message, imageBase64);
    if (!gResult.success) {
      groupsOk = false;
      groupsError = gResult.error;
    }
  }

  return {
    success: pageResult.success || false,
    pagePostId: pageResult.pagePostId || null,
    groupsOk,
    groupsError,
    error: pageResult.error || groupsError,
  };
}

async function publishToWhatsApp(news) {
  const text = generatePlatformContent(news, 'whatsapp');
  const imageBuffer = news.image_data ? Buffer.from(news.image_data, 'base64') : null;
  let imageUrl = null;

  if (imageBuffer) {
    const brandedImage = await applyBrandOverlay(imageBuffer, news);
    imageUrl = `${FRONTEND_URL}/api/news/${news.id}/publish-image`;
  }

  const groups = await pool.query(
    "SELECT id FROM whatsapp_groups WHERE is_active = TRUE AND auto_broadcast = TRUE"
  );

  let sent = 0;
  let lastError = null;
  for (const group of groups.rows) {
    try {
      await enqueue(group.id, text, imageUrl);
      sent++;
    } catch (err) {
      lastError = err.message;
    }
  }

  return { success: sent > 0, error: sent === 0 ? lastError || 'Sin grupos activos' : null, sent };
}

async function publishToStatus(news) {
  const text = generatePlatformContent(news, 'status');
  const imageBuffer = news.image_data ? Buffer.from(news.image_data, 'base64') : null;
  let imageUrl = null;

  if (imageBuffer) {
    const brandedImage = await applyBrandOverlay(imageBuffer, news);
    imageUrl = `${FRONTEND_URL}/api/news/${news.id}/publish-image`;
  }

  try {
    const id = await enqueueStatus(text, imageUrl);
    return { success: true, platformPostId: id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function publishNewsToAll(newsId, platforms) {
  try {
    const { rows } = await pool.query('SELECT * FROM news WHERE id = $1', [newsId]);
    if (rows.length === 0) return { error: 'News not found' };
    const news = rows[0];

    if (!platforms) {
      const auto = await getAutoPublishSettings();
      if (!auto.enabled) {
        return { info: 'Auto-publish disabled' };
      }
      platforms = auto.platforms;
    }

    const platformFns = [
      { name: 'instagram', fn: publishToInstagram },
      { name: 'facebook_page', fn: publishToFacebook },
      { name: 'whatsapp', fn: publishToWhatsApp },
      { name: 'status', fn: publishToStatus },
    ];

    const results = {};

    for (const { name, fn } of platformFns) {
      if (!platforms.includes(name)) {
        results[name] = { success: true, skipped: true };
        continue;
      }
      try {
        if (!(await shouldPublish(newsId, name))) {
          results[name] = { success: true, skipped: true };
          continue;
        }

        const result = await fn(news);
        if (result.success) {
          await upsertPublication(newsId, name, 'published', result.platformPostId || result.pagePostId || null, null);
        } else {
          await upsertPublication(newsId, name, 'failed', null, result.error || 'Error desconocido');
        }
        results[name] = result;
      } catch (err) {
        try { await upsertPublication(newsId, name, 'failed', null, err.message); } catch {}
        results[name] = { success: false, error: err.message };
      }
    }

    return results;
  } catch (err) {
    return { error: err.message };
  }
}

export async function getNewsPublications(newsId) {
  try {
    const { rows } = await pool.query(
      `SELECT platform, status, platform_post_id, error_message, created_at, published_at
       FROM news_publications WHERE news_id = $1 ORDER BY platform`,
      [newsId]
    );
    return rows;
  } catch {
    return [];
  }
}
