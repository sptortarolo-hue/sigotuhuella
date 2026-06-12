import axios from 'axios';
import pool from '../db.js';

const GRAPH_API = 'https://graph.facebook.com/v22.0';

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
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
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

async function getPageId() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'instagram_page_id'");
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
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_messages',
    'pages_show_list',
    'pages_read_engagement',
  ].join(',');
  return `https://www.facebook.com/${process.env.FACEBOOK_API_VERSION || 'v22.0'}/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
}

export async function exchangeCodeForToken(code) {
  const { appId, appSecret, redirectUri } = getSettings();

  const { data } = await igApi.get('/oauth/access_token', {
    params: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    },
  });

  const shortToken = data.access_token;
  const longToken = await exchangeForLongLivedToken(shortToken);

  const pageInfo = await discoverInstagramAccount(longToken);

  return {
    accessToken: longToken,
    igUserId: pageInfo.igUserId,
    pageId: pageInfo.pageId,
  };
}

async function discoverInstagramAccount(userToken) {
  const { data: accountsData } = await igApi.get('/me/accounts', {
    params: {
      fields: 'id,name,access_token,instagram_business_account',
      access_token: userToken,
    },
  });

  const pages = accountsData.data || [];
  for (const page of pages) {
    if (page.instagram_business_account) {
      const igUserId = page.instagram_business_account.id;
      const pageId = page.id;
      const pageToken = page.access_token;

      await saveSetting('instagram_user_id', String(igUserId));
      await saveSetting('instagram_page_id', String(pageId));
      await saveSetting('instagram_page_token', pageToken);

      console.log(`[Instagram] Found IG Business Account: ${igUserId}, Page: ${pageId}`);
      return { igUserId, pageId, pageToken };
    }
  }

  const fallback = pages[0];
  if (fallback) {
    const { data: igData } = await igApi.get(`/${fallback.id}`, {
      params: {
        fields: 'instagram_business_account',
        access_token: fallback.access_token,
      },
    });
    if (igData.instagram_business_account) {
      const igUserId = igData.instagram_business_account.id;
      await saveSetting('instagram_user_id', String(igUserId));
      await saveSetting('instagram_page_id', String(fallback.id));
      await saveSetting('instagram_page_token', fallback.access_token);
      console.log(`[Instagram] Found IG Business Account (fallback): ${igUserId}, Page: ${fallback.id}`);
      return { igUserId, pageId: fallback.id, pageToken: fallback.access_token };
    }
  }

  throw new Error('No se encontró cuenta de Instagram Business vinculada a una Página de Facebook. Asegurate de que la cuenta @sigotuhuella.sicardi esté vinculada a la página "Sigo Tu Huella".');
}

export async function exchangeForLongLivedToken(shortToken) {
  const { appId, appSecret } = getSettings();
  const { data } = await igApi.get('/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
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
    const { appId, appSecret } = getSettings();
    const { data } = await igApi.get('/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: currentToken,
      },
    });
    const newToken = data.access_token;
    const expiresIn = data.expires_in || 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    await saveSetting('instagram_access_token', newToken);
    await saveSetting('instagram_token_expires_at', expiresAt);

    try {
      await discoverInstagramAccount(newToken);
    } catch (e) {
      console.error('[Instagram] Page re-discovery failed during refresh:', e.message);
    }

    return newToken;
  } catch (err) {
    console.error('Token refresh failed:', err.message);
    return null;
  }
}

async function getPageToken() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'instagram_page_token'");
  return result.rows[0]?.value || '';
}

export async function createContainer(petImages, caption, mediaType = 'IMAGE') {
  const igUserId = await getInstagramUserId();
  if (!igUserId) throw new Error('Instagram not connected');
  if (petImages.length === 0) throw new Error('No images to publish');

  const token = await getPageToken();
  const fallback = await getStoredToken();
  const accessToken = token || fallback;

  if (petImages.length === 1) {
    const { data } = await igApi.post(`${GRAPH_API}/${igUserId}/media`, null, {
      params: {
        image_url: petImages[0],
        caption,
        access_token: accessToken,
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
        access_token: accessToken,
      },
    });
    childrenIds.push(data.id);
  }
  const { data } = await igApi.post(`${GRAPH_API}/${igUserId}/media`, null, {
    params: {
      media_type: 'CAROUSEL',
      children: childrenIds.join(','),
      caption,
      access_token: accessToken,
    },
  });
  return data.id;
}

export async function publishContainer(containerId) {
  const igUserId = await getInstagramUserId();
  if (!igUserId) throw new Error('Instagram not connected');
  const token = await getPageToken();
  const fallback = await getStoredToken();
  const accessToken = token || fallback;
  const { data } = await igApi.post(`${GRAPH_API}/${igUserId}/media_publish`, null, {
    params: {
      creation_id: containerId,
      access_token: accessToken,
    },
  });
  return data;
}

export async function waitForContainer(containerId, maxRetries = 30) {
  const token = await getPageToken();
  const fallback = await getStoredToken();
  const accessToken = token || fallback;
  for (let i = 0; i < maxRetries; i++) {
    const { data } = await igApi.get(`${GRAPH_API}/${containerId}`, {
      params: {
        fields: 'status_code',
        access_token: accessToken,
      },
    });
    if (data.status_code === 'FINISHED') return true;
    if (data.status_code === 'ERROR') {
      const errData = await igApi.get(`${GRAPH_API}/${containerId}`, {
        params: {
          fields: 'error_message',
          access_token: accessToken,
        },
      });
      throw new Error(`Container error: ${errData.data.error_message || 'Unknown'}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Container did not finish processing');
}

export async function getComments(mediaId) {
  const token = await getPageToken();
  const fallback = await getStoredToken();
  const accessToken = token || fallback;
  const { data } = await igApi.get(`${GRAPH_API}/${mediaId}/comments`, {
    params: {
      fields: 'id,text,timestamp,username,like_count',
      access_token: accessToken,
    },
  });
  return data.data || [];
}

export async function replyToComment(commentId, message) {
  const token = await getPageToken();
  const fallback = await getStoredToken();
  const accessToken = token || fallback;
  const { data } = await igApi.post(`${GRAPH_API}/${commentId}/replies`, null, {
    params: {
      message,
      access_token: accessToken,
    },
  });
  return data;
}

export async function sendPrivateReply(commentId, message) {
  const token = await getPageToken();
  const fallback = await getStoredToken();
  const accessToken = token || fallback;
  const pageId = await getPageId();
  const endpoint = pageId || await getInstagramUserId();
  const { data } = await igApi.post(`${GRAPH_API}/${endpoint}/messages`, {
    recipient: { comment_id: commentId },
    message: { text: message },
  }, {
    params: { access_token: accessToken },
  });
  return data;
}

export async function getMedia(mediaId) {
  const token = await getPageToken();
  const fallback = await getStoredToken();
  const accessToken = token || fallback;
  const { data } = await igApi.get(`${GRAPH_API}/${mediaId}`, {
    params: {
      fields: 'id,media_type,media_url,permalink,caption,timestamp,like_count,comments_count',
      access_token: accessToken,
    },
  });
  return data;
}

export async function getUserMedia(userId = null) {
  const token = await getPageToken();
  const fallback = await getStoredToken();
  const accessToken = token || fallback;
  const igUserId = userId || await getInstagramUserId();
  const { data } = await igApi.get(`${GRAPH_API}/${igUserId}/media`, {
    params: {
      fields: 'id,media_type,media_url,permalink,caption,timestamp,like_count,comments_count',
      access_token: accessToken,
      limit: 25,
    },
  });
  return data.data || [];
}

export async function getMediaInsights(mediaId) {
  const token = await getPageToken();
  const fallback = await getStoredToken();
  const accessToken = token || fallback;
  try {
    const { data } = await igApi.get(`${GRAPH_API}/${mediaId}/insights`, {
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
