import axios from 'axios';
import pool from '../db.js';

const GRAPH_API = 'https://graph.facebook.com/v22.0';
const INSTAGRAM_API = 'https://graph.instagram.com/v22.0';

const igApi = axios.create({ baseURL: GRAPH_API });
igApi.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.data?.error) {
      const ig = err.response.data.error;
      const msg = ig.error_user_msg || ig.message || err.message;
      const enhanced = new Error(`Instagram API ${err.response.status}: ${msg}`);
      enhanced.raw = err;
      enhanced.igError = ig;
      return Promise.reject(enhanced);
    }
    return Promise.reject(err);
  }
);

function getSettings() {
  return {
    appId: process.env.INSTAGRAM_APP_ID || '',
    appSecret: process.env.INSTAGRAM_APP_SECRET || '',
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
  const { appId, redirectUri } = getSettings();
  const scope = [
    'instagram_business_basic',
    'instagram_business_manage_comments',
    'instagram_business_manage_messages',
    'instagram_business_content_publish',
  ].join(',');
  return `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
}

export async function exchangeCodeForToken(code) {
  const { appId, appSecret, redirectUri } = getSettings();
  const { data } = await igApi.post('https://api.instagram.com/oauth/access_token',
    new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const shortToken = data.access_token;
  const igUserId = data.user_id;
  await saveSetting('instagram_user_id', String(igUserId));
  const longToken = await exchangeForLongLivedToken(shortToken);
  return { accessToken: longToken, igUserId };
}

export async function exchangeForLongLivedToken(shortToken) {
  const { appSecret } = getSettings();
  const { data } = await igApi.get(`${INSTAGRAM_API}/access_token`, {
    params: {
      grant_type: 'ig_exchange_token',
      client_secret: appSecret,
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
    const { data } = await igApi.get(`${INSTAGRAM_API}/refresh_access_token`, {
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

export async function createContainer(petImages, caption, mediaType = 'IMAGE') {
  const token = await getStoredToken();
  const igUserId = await getInstagramUserId();
  if (!token || !igUserId) throw new Error('Instagram not connected');
  if (petImages.length === 0) throw new Error('No images to publish');

  if (petImages.length === 1) {
    const { data } = await igApi.post(`${GRAPH_API}/${igUserId}/media`, null, {
      params: {
        image_url: petImages[0],
        caption,
        access_token: token,
        media_type: mediaType,
      },
    });
    return data.id;
  }

  const childrenIds = [];
  for (const url of petImages.slice(0, 10)) {
    const { data } = await igApi.post(`${GRAPH_API}/${igUserId}/media`, null, {
      params: {
        image_url: url,
        is_carousel_item: true,
        access_token: token,
      },
    });
    childrenIds.push(data.id);
  }
  const { data } = await igApi.post(`${GRAPH_API}/${igUserId}/media`, null, {
    params: {
      media_type: 'CAROUSEL',
      children: childrenIds.join(','),
      caption,
      access_token: token,
    },
  });
  return data.id;
}

export async function publishContainer(containerId) {
  const token = await getStoredToken();
  const igUserId = await getInstagramUserId();
  if (!token || !igUserId) throw new Error('Instagram not connected');
  const { data } = await igApi.post(`${GRAPH_API}/${igUserId}/media_publish`, null, {
    params: {
      creation_id: containerId,
      access_token: token,
    },
  });
  return data;
}

export async function waitForContainer(containerId, maxRetries = 30) {
  const token = await getStoredToken();
  for (let i = 0; i < maxRetries; i++) {
    const { data } = await igApi.get(`${GRAPH_API}/${containerId}`, {
      params: {
        fields: 'status_code',
        access_token: token,
      },
    });
    if (data.status_code === 'FINISHED') return true;
    if (data.status_code === 'ERROR') {
      const errData = await igApi.get(`${GRAPH_API}/${containerId}`, {
        params: {
          fields: 'error_message',
          access_token: token,
        },
      });
      throw new Error(`Container error: ${errData.data.error_message || 'Unknown'}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Container did not finish processing');
}

export async function getComments(mediaId) {
  const token = await getStoredToken();
  if (!token) throw new Error('Instagram not connected');
  const { data } = await igApi.get(`${GRAPH_API}/${mediaId}/comments`, {
    params: {
      fields: 'id,text,timestamp,username,like_count',
      access_token: token,
    },
  });
  return data.data || [];
}

export async function replyToComment(commentId, message) {
  const token = await getStoredToken();
  if (!token) throw new Error('Instagram not connected');
  const { data } = await igApi.post(`${GRAPH_API}/${commentId}/replies`, null, {
    params: {
      message,
      access_token: token,
    },
  });
  return data;
}

export async function sendPrivateReply(commentId, message) {
  const token = await getStoredToken();
  const igUserId = await getInstagramUserId();
  if (!token || !igUserId) throw new Error('Instagram not connected');
  const { data } = await igApi.post(`${GRAPH_API}/${igUserId}/messages`, {
    recipient: { comment_id: commentId },
    message: { text: message },
  }, {
    params: { access_token: token },
  });
  return data;
}

export async function getMedia(mediaId) {
  const token = await getStoredToken();
  if (!token) throw new Error('Instagram not connected');
  const { data } = await igApi.get(`${GRAPH_API}/${mediaId}`, {
    params: {
      fields: 'id,media_type,media_url,permalink,caption,timestamp,like_count,comments_count',
      access_token: token,
    },
  });
  return data;
}

export async function getUserMedia(userId = null) {
  const token = await getStoredToken();
  const igUserId = userId || await getInstagramUserId();
  if (!token || !igUserId) throw new Error('Instagram not connected');
  const { data } = await igApi.get(`${GRAPH_API}/${igUserId}/media`, {
    params: {
      fields: 'id,media_type,media_url,permalink,caption,timestamp,like_count,comments_count',
      access_token: token,
      limit: 25,
    },
  });
  return data.data || [];
}

export async function getMediaInsights(mediaId) {
  const token = await getStoredToken();
  if (!token) throw new Error('Instagram not connected');
  try {
    const { data } = await igApi.get(`${GRAPH_API}/${mediaId}/insights`, {
      params: {
        metric: 'engagement,impressions,reach,saved',
        access_token: token,
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
