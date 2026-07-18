import sharp from 'sharp';
import pool from '../db.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

const PLATFORMS = ['instagram', 'instagram_stories', 'facebook_page', 'facebook_groups', 'whatsapp', 'whatsapp_channel', 'status'];

async function getSetting(key) {
  const r = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
  return r.rows[0]?.value || '';
}

async function upsertPublication(newsId, platform, status, platformPostId, errorMessage) {
  const existing = await pool.query(
    'SELECT id FROM news_publications WHERE news_id = $1 AND platform = $2',
    [newsId, platform]
  );
  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE news_publications SET status = $1, platform_post_id = $2, error_message = $3,
       updated_at = NOW() WHERE id = $4`,
      [status, platformPostId, errorMessage, existing.rows[0].id]
    );
    if (status === 'published') {
      await pool.query(
        'UPDATE news_publications SET published_at = NOW() WHERE id = $1',
        [existing.rows[0].id]
      );
    }
    return existing.rows[0].id;
  }
  const r = await pool.query(
    `INSERT INTO news_publications (news_id, platform, status, platform_post_id, error_message)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [newsId, platform, status, platformPostId, errorMessage]
  );
  return r.rows[0].id;
}

async function generateImage(imageData, mimeType, width, height) {
  const buf = Buffer.from(imageData, 'base64');
  const bg = await sharp(buf)
    .resize(width, height, { fit: 'cover' })
    .blur(60)
    .png()
    .toBuffer();
  const fg = await sharp(buf)
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(bg)
    .composite([{ input: fg }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

function buildCaption(news, platform) {
  const link = `${FRONTEND_URL}/novedad/${news.id}`;
  const excerpt = news.content.length > 200 ? news.content.substring(0, 200) + '…' : news.content;

  switch (platform) {
    case 'instagram':
      return `📰 ${news.title}\n\n${excerpt}\n\n🔗 ${link}\n\n#SigoTuHuella #Novedades #AdoptaNoCompres`;
    case 'instagram_stories':
      return `${news.title}\n\n${link}`;
    case 'facebook_page':
      return `📰 ${news.title}\n\n${news.content}\n\n🔗 ${link}`;
    case 'facebook_groups':
      return `📰 ${news.title}\n\n${news.content}\n\n🔗 ${link}`;
    case 'whatsapp':
    case 'whatsapp_channel':
      return `📰 *${news.title}*\n\n${excerpt}\n\n${link}`;
    case 'status':
      return `${news.title}\n${link}`;
    default:
      return `${news.title}\n\n${link}`;
  }
}

function getImageUrl(newsId, platform) {
  const formatMap = {
    instagram: 'feed',
    instagram_stories: 'story',
    facebook_page: 'fb',
    facebook_groups: 'square',
    whatsapp: 'square',
    whatsapp_channel: 'square',
    status: 'story',
  };
  return `${FRONTEND_URL}/api/images/news/${newsId}/${formatMap[platform] || 'square'}`;
}

async function publishToInstagram(news) {
  const { createContainer, publishContainer } = await import('./instagramService.js');
  const containerId = await createContainer([getImageUrl(news.id, 'instagram')], buildCaption(news, 'instagram'));
  await publishContainer(containerId);
  return { platformPostId: containerId };
}

async function publishToInstagramStories(news) {
  const { publishImageStory } = await import('./instagramService.js');
  const result = await publishImageStory(getImageUrl(news.id, 'instagram_stories'));
  return { platformPostId: result?.id || '' };
}

async function publishToFacebookPage(news) {
  const axios = (await import('axios')).default;
  const token = await getSetting('instagram_access_token');
  const pageId = await getSetting('facebook_page_id');
  if (!token || !pageId) throw new Error('Facebook Page no configurada');

  const message = buildCaption(news, 'facebook_page');
  const imageUrl = getImageUrl(news.id, 'facebook_page');

  const { data } = await axios.post(`https://graph.facebook.com/v22.0/${pageId}/photos`, null, {
    params: { url: imageUrl, message, access_token: token },
    timeout: 30000,
  });
  return { platformPostId: data.id };
}

async function publishToFacebookGroups(news, pagePostUrl) {
  const { enqueuePublishTask } = await import('./facebookRelayService.js');
  const groups = await pool.query(
    `SELECT id, name, fb_group_id FROM facebook_groups
     WHERE is_active = true AND publish_on_create = true
       AND fb_group_id IS NOT NULL AND fb_group_id != ''
     ORDER BY name`
  );
  if (groups.rows.length === 0) return { platformPostId: '' };

  const caption = buildCaption(news, 'facebook_groups');
  const imageUrl = getImageUrl(news.id, 'facebook_groups');
  const taskIds = [];
  for (const group of groups.rows) {
    try {
      const { taskId } = await enqueuePublishTask(null, group.id, group.fb_group_id, caption, [imageUrl], pagePostUrl);
      taskIds.push(taskId);
    } catch (err) {
      console.warn(`[NewsPublisher] FB group ${group.fb_group_id} enqueue error:`, err.message);
    }
  }
  return { platformPostId: taskIds.join(',') };
}

async function publishToWhatsApp(news) {
  const { enqueue } = await import('./phoneRelayService.js');
  const groups = await pool.query(
    "SELECT group_id FROM whatsapp_groups WHERE is_active = true AND auto_broadcast = true AND group_id IS NOT NULL"
  );
  const caption = buildCaption(news, 'whatsapp');
  const imageUrl = getImageUrl(news.id, 'whatsapp');
  const ids = [];
  for (const group of groups.rows) {
    try {
      const id = await enqueue(group.group_id, caption, imageUrl);
      ids.push(id);
    } catch (err) {
      console.warn(`[NewsPublisher] WA group ${group.group_id} enqueue error:`, err.message);
    }
  }
  return { platformPostId: ids.join(',') };
}

async function publishToWhatsAppChannel(news) {
  const { enqueue } = await import('./phoneRelayService.js');
  const channels = await pool.query(
    "SELECT group_id FROM whatsapp_groups WHERE type = 'channel' AND is_active = true AND auto_broadcast = true AND group_id IS NOT NULL"
  );
  const caption = buildCaption(news, 'whatsapp_channel');
  const imageUrl = getImageUrl(news.id, 'whatsapp_channel');
  const ids = [];
  for (const ch of channels.rows) {
    try {
      const id = await enqueue(ch.group_id, caption, imageUrl, 'channel');
      ids.push(id);
    } catch (err) {
      console.warn(`[NewsPublisher] WA channel ${ch.group_id} enqueue error:`, err.message);
    }
  }
  return { platformPostId: ids.join(',') };
}

async function publishToStatus(news) {
  const { enqueue } = await import('./phoneRelayService.js');
  const caption = buildCaption(news, 'status');
  const imageUrl = getImageUrl(news.id, 'status');
  const id = await enqueue('status', caption, imageUrl);
  return { platformPostId: String(id) };
}

const PUBLISHERS = {
  instagram: publishToInstagram,
  instagram_stories: publishToInstagramStories,
  facebook_page: publishToFacebookPage,
  facebook_groups: publishToFacebookGroups,
  whatsapp: publishToWhatsApp,
  whatsapp_channel: publishToWhatsAppChannel,
  status: publishToStatus,
};

export async function publishNews(newsId, targetPlatforms) {
  const newsResult = await pool.query(
    `SELECT n.*, u.display_name as author_name
     FROM news n LEFT JOIN users u ON u.id = n.created_by
     WHERE n.id = $1 AND n.type = 'manual'`,
    [newsId]
  );
  if (newsResult.rows.length === 0) {
    console.warn(`[NewsPublisher] News ${newsId} not found or not manual type`);
    return [];
  }
  const news = newsResult.rows[0];
  if (!news.image_data) {
    console.warn(`[NewsPublisher] News ${newsId} has no image, skipping`);
    return [];
  }

  let platforms = targetPlatforms;
  if (!platforms) {
    const enabled = await getSetting('news_auto_publish_enabled');
    if (enabled !== 'true') {
      console.log('[NewsPublisher] Auto-publish disabled, skipping');
      return [];
    }
    const raw = await getSetting('news_auto_publish_platforms');
    try { platforms = JSON.parse(raw); } catch { platforms = []; }
    if (!Array.isArray(platforms) || platforms.length === 0) {
      console.log('[NewsPublisher] No platforms configured');
      return [];
    }
  }

  const results = [];
  const hasFacebookPage = platforms.includes('facebook_page');
  const hasFacebookGroups = platforms.includes('facebook_groups');
  let pagePostUrl = null;

  // facebook_page must run first so facebook_groups can use its URL
  if (hasFacebookPage) {
    try {
      const { platformPostId } = await publishToFacebookPage(news);
      await upsertPublication(newsId, 'facebook_page', 'published', platformPostId, null);
      results.push({ platform: 'facebook_page', status: 'published', platformPostId });
      console.log(`[NewsPublisher] Published ${newsId} to facebook_page: ${platformPostId}`);
      const pageId = await getSetting('facebook_page_id');
      if (pageId && platformPostId) {
        pagePostUrl = `https://www.facebook.com/${pageId}/posts/${platformPostId}`;
      }
    } catch (err) {
      console.error(`[NewsPublisher] Failed to publish ${newsId} to facebook_page:`, err.message);
      await upsertPublication(newsId, 'facebook_page', 'failed', null, err.message);
      results.push({ platform: 'facebook_page', status: 'failed', error: err.message });
    }
  }

  for (const platform of platforms) {
    if (platform === 'facebook_page') continue;
    if (!PLATFORMS.includes(platform)) {
      console.warn(`[NewsPublisher] Unknown platform: ${platform}`);
      continue;
    }

    let publisher = PUBLISHERS[platform];
    if (!publisher) continue;

    try {
      let platformPostId;
      if (platform === 'facebook_groups') {
        const r = await publishToFacebookGroups(news, pagePostUrl);
        platformPostId = r.platformPostId;
      } else {
        const r = await publisher(news);
        platformPostId = r.platformPostId;
      }
      await upsertPublication(newsId, platform, 'published', platformPostId, null);
      results.push({ platform, status: 'published', platformPostId });
      console.log(`[NewsPublisher] Published ${newsId} to ${platform}: ${platformPostId}`);
    } catch (err) {
      console.error(`[NewsPublisher] Failed to publish ${newsId} to ${platform}:`, err.message);
      await upsertPublication(newsId, platform, 'failed', null, err.message);
      results.push({ platform, status: 'failed', error: err.message });
    }
  }
  return results;
}
