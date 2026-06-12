import axios from 'axios';
import pool from '../db.js';

const GRAPH_API = 'https://graph.instagram.com';

let lastCreateContainerResponse = null;

function getSettings() {
  return {
    appId: process.env.FACEBOOK_APP_ID || '',
    instagramAppId: process.env.INSTAGRAM_APP_ID || '',
    instagramAppSecret: process.env.INSTAGRAM_APP_SECRET || '',
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI || 'https://sigotuhuella.online/api/instagram/callback',
  };
}

export async function getStoredToken() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'instagram_access_token'");
  return result.rows[0]?.value || '';
}

export async function getInstagramUserId() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'instagram_user_id'");
  return result.rows[0]?.value || '';
}

function saveSetting(key, value) {
  return pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

export function getAuthUrl() {
  const { instagramAppId, redirectUri } = getSettings();
  const scope = [
    'instagram_business_basic',
    'instagram_business_content_publish',
    'instagram_business_manage_comments',
    'instagram_business_manage_messages',
  ].join(',');
  return `https://api.instagram.com/oauth/authorize?client_id=${instagramAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
}

export async function exchangeCodeForToken(code) {
  const { instagramAppId, instagramAppSecret, redirectUri } = getSettings();

  const params = new URLSearchParams();
  params.append('client_id', instagramAppId);
  params.append('client_secret', instagramAppSecret);
  params.append('grant_type', 'authorization_code');
  params.append('redirect_uri', redirectUri);
  params.append('code', code);

  let data;
  try {
    const resp = await axios.post('https://api.instagram.com/oauth/access_token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    data = resp.data;
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[Instagram] Token exchange failed:', err.response?.status, detail);
    throw new Error(`Error al conectar Instagram: ${detail}`);
  }

  const shortToken = data.access_token;
  const igUserId = data.user_id;
  if (!shortToken) throw new Error(`Token vacío: ${JSON.stringify(data)}`);

  const longToken = await exchangeForLongLivedToken(shortToken);

  await saveSetting('instagram_user_id', String(igUserId));

  let username = '';
  try {
    const meRes = await axios.get(`${GRAPH_API}/me`, {
      params: {
        fields: 'username',
        access_token: longToken,
      },
    });
    username = meRes.data.username;
    await saveSetting('instagram_username', username);
  } catch (meErr) {
    console.error('[Instagram] Failed to fetch username:', meErr.message);
  }

  return { accessToken: longToken, igUserId, username };
}

export async function exchangeForLongLivedToken(shortToken) {
  const { instagramAppSecret } = getSettings();
  const { data } = await axios.get('https://graph.instagram.com/access_token', {
    params: {
      grant_type: 'ig_exchange_token',
      client_secret: instagramAppSecret,
      access_token: shortToken,
    },
  });
  const longToken = data.access_token;
  const expiresIn = data.expires_in || 5184000;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await saveSetting('instagram_access_token', longToken);
  await saveSetting('instagram_token_expires_at', expiresAt);
  return longToken;
}

export async function refreshToken() {
  const currentToken = await getStoredToken();
  if (!currentToken) return null;
  try {
    const { data } = await axios.get('https://graph.instagram.com/refresh_access_token', {
      params: {
        grant_type: 'ig_refresh_token',
        access_token: currentToken,
      },
    });
    const newToken = data.access_token;
    const expiresIn = data.expires_in || 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    await saveSetting('instagram_access_token', newToken);
    await saveSetting('instagram_token_expires_at', expiresAt);
    return newToken;
  } catch (err) {
    console.error('Token refresh failed:', err.message);
    return null;
  }
}

async function igPost(url, params, accessToken) {
  try {
    const { access_token, ...body } = params;
    const { data } = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token || accessToken || ''}`,
      },
    });
    console.log(`[Instagram] POST ${url} success:`, JSON.stringify(data).slice(0, 200));
    return data;
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`[Instagram] POST ${url} failed:`, err.response?.status, detail);
    throw new Error(`Instagram API ${err.response?.status || 400}: ${detail}`);
  }
}

export async function createContainer(petImages, caption, mediaType = 'IMAGE') {
  const igUserId = await getInstagramUserId();
  if (!igUserId) throw new Error('Instagram not connected');
  if (petImages.length === 0) throw new Error('No images to publish');

  const accessToken = await getStoredToken();

  if (petImages.length === 1) {
    const data = await igPost(`${GRAPH_API}/${igUserId}/media`, {
      image_url: petImages[0],
      caption,
      media_type: mediaType,
    }, accessToken);
    lastCreateContainerResponse = data;
    return data.id;
  }

  const childrenIds = [];
  for (const url of petImages.slice(0, 10)) {
    const data = await igPost(`${GRAPH_API}/${igUserId}/media`, {
      image_url: url,
      is_carousel_item: true,
    }, accessToken);
    childrenIds.push(data.id);
  }
  const data = await igPost(`${GRAPH_API}/${igUserId}/media`, {
    media_type: 'CAROUSEL',
    children: childrenIds.join(','),
    caption,
  }, accessToken);
  lastCreateContainerResponse = data;
  return data.id;
}

export async function publishContainer(containerId) {
  const igUserId = await getInstagramUserId();
  if (!igUserId) throw new Error('Instagram not connected');
  const accessToken = await getStoredToken();
  try {
    const data = await igPost(`${GRAPH_API}/${igUserId}/media_publish`, {
      creation_id: containerId,
    }, accessToken);
    return data;
  } catch (err) {
    err.message += ` | CreateResponse: ${JSON.stringify(lastCreateContainerResponse)}`;
    throw err;
  }
}

export async function waitForContainer(containerId, mediaType = 'IMAGE') {
  const delay = mediaType === 'VIDEO' ? 15000 : mediaType === 'CAROUSEL' ? 8000 : 5000;
  await new Promise(r => setTimeout(r, delay));
  return true;
}

export async function getComments(mediaId) {
  const accessToken = await getStoredToken();
  const { data } = await axios.get(`${GRAPH_API}/${mediaId}/comments`, {
    params: {
      fields: 'id,text,timestamp,username,like_count',
      access_token: accessToken,
    },
  });
  return data.data || [];
}

export async function replyToComment(commentId, message) {
  const accessToken = await getStoredToken();
  const { data } = await axios.post(`${GRAPH_API}/${commentId}/replies`, null, {
    params: {
      message,
      access_token: accessToken,
    },
  });
  return data;
}

export async function sendPrivateReply(commentId, message) {
  const accessToken = await getStoredToken();
  const igUserId = await getInstagramUserId();
  const { data } = await axios.post(`${GRAPH_API}/${igUserId}/messages`, {
    recipient: { comment_id: commentId },
    message: { text: message },
  }, {
    params: { access_token: accessToken },
  });
  return data;
}

export async function getMedia(mediaId) {
  const accessToken = await getStoredToken();
  const { data } = await axios.get(`${GRAPH_API}/${mediaId}`, {
    params: {
      fields: 'id,media_type,media_url,permalink,caption,timestamp,like_count,comments_count',
      access_token: accessToken,
    },
  });
  return data;
}

export async function getUserMedia(userId = null) {
  const accessToken = await getStoredToken();
  const igUserId = userId || await getInstagramUserId();
  const { data } = await axios.get(`${GRAPH_API}/${igUserId}/media`, {
    params: {
      fields: 'id,media_type,media_url,permalink,caption,timestamp,like_count,comments_count',
      access_token: accessToken,
      limit: 25,
    },
  });
  return data.data || [];
}

export async function getMediaInsights(mediaId) {
  const accessToken = await getStoredToken();
  try {
    const { data } = await axios.get(`${GRAPH_API}/${mediaId}/insights`, {
      params: {
        metric: 'engagement,impressions,reach,saved',
        access_token: accessToken,
      },
    });
    return data.data || [];
  } catch {
    return [];
  }
}

export function verifyWebhook(mode, token, challenge) {
  const expectedToken = process.env.INSTAGRAM_VERIFY_TOKEN || 'sihuella-ig-2026';
  return mode === 'subscribe' && token === expectedToken ? challenge : null;
}

export async function isConnected() {
  const token = await getStoredToken();
  if (!token) return false;
  const expiresAt = await pool.query("SELECT value FROM settings WHERE key = 'instagram_token_expires_at'");
  if (!expiresAt.rows[0]?.value) return false;
  const expires = new Date(expiresAt.rows[0].value);
  if (expires < new Date()) {
    const refreshed = await refreshToken();
    return !!refreshed;
  }
  return true;
}
