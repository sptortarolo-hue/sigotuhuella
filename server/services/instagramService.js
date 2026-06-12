import axios from 'axios';
import pool from '../db.js';

const GRAPH_API = 'https://graph.facebook.com/v22.0';

let lastCreateContainerResponse = null;

function getSettings() {
  return {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI || 'https://sigotuhuella.online/api/instagram/callback',
  };
}

function saveSetting(key, value) {
  return pool.query(
    `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

export async function getStoredToken() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'instagram_access_token'");
  return result.rows[0]?.value || '';
}

export async function getInstagramUserId() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'instagram_user_id'");
  return result.rows[0]?.value || '';
}

const FB_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_posts',
].join(',');

export function getAuthUrl() {
  const { appId, redirectUri } = getSettings();
  if (!appId) throw new Error('FACEBOOK_APP_ID no configurada');
  const extras = JSON.stringify({ setup: { channel: 'IG_API_ONBOARDING' } });
  return `https://www.facebook.com/v22.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&extras=${encodeURIComponent(extras)}&scope=${encodeURIComponent(FB_SCOPES)}`;
}

export async function exchangeCodeForToken(code) {
  const { appId, appSecret, redirectUri } = getSettings();

  if (!appId) throw new Error('FACEBOOK_APP_ID no configurada');
  if (!appSecret) throw new Error('FACEBOOK_APP_SECRET no configurada');

  let shortToken;
  try {
    const resp = await axios.get(`${GRAPH_API}/oauth/access_token`, {
      params: {
        client_id: appId,
        redirect_uri: redirectUri,
        client_secret: appSecret,
        code,
      },
      timeout: 15000,
    });
    shortToken = resp.data.access_token;
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[FB] Code exchange failed:', err.response?.status, detail);
    throw new Error(`Error al conectar Instagram: ${detail}`);
  }

  if (!shortToken) throw new Error('Token vacío del code exchange');

  const longToken = await exchangeForLongLivedToken(shortToken);

  try {
    const permsResp = await axios.get(`${GRAPH_API}/me/permissions`, {
      params: { access_token: longToken },
      timeout: 10000,
    });
    const perms = (permsResp.data?.data || []).filter(p => p.status === 'granted').map(p => p.permission);
    console.log('[FB] Granted permissions:', perms);
  } catch { /* ignore */ }

  let pageToken = '';
  let igUserId = '';
  let pageName = '';
  try {
    const pagesResp = await axios.get(`${GRAPH_API}/me/accounts`, {
      params: {
        fields: 'id,name,access_token,instagram_business_account',
        access_token: longToken,
      },
      timeout: 15000,
    });
    const pages = pagesResp.data?.data || [];
    console.log(`[FB] /me/accounts returned ${pages.length} pages`);
    for (const page of pages) {
      if (page.instagram_business_account) {
        pageToken = page.access_token;
        igUserId = page.instagram_business_account.id;
        pageName = page.name;
        break;
      }
    }

    if (!pageToken || !igUserId) {
      for (const page of pages) {
        try {
          const pageResp = await axios.get(`${GRAPH_API}/${page.id}`, {
            params: { fields: 'instagram_business_account', access_token: longToken },
            timeout: 10000,
          });
          if (pageResp.data?.instagram_business_account?.id) {
            const tokenResp = await axios.get(`${GRAPH_API}/${page.id}`, {
              params: { fields: 'access_token', access_token: longToken },
              timeout: 10000,
            });
            pageToken = tokenResp.data.access_token || page.access_token;
            igUserId = pageResp.data.instagram_business_account.id;
            pageName = page.name;
            break;
          }
        } catch { /* skip */ }
      }
    }

    if (!pageToken || !igUserId) {
      try {
        const igResp = await axios.get(`${GRAPH_API}/17841471476212393`, {
          params: { fields: 'id,username,owner{id,name}', access_token: longToken },
          timeout: 10000,
        });
        if (igResp.data?.id) {
          igUserId = igResp.data.id;
          const ownerId = igResp.data.owner?.id;
          if (ownerId) {
            const ownerResp = await axios.get(`${GRAPH_API}/${ownerId}`, {
              params: { fields: 'access_token', access_token: longToken },
              timeout: 10000,
            });
            pageToken = ownerResp.data?.access_token || '';
            pageName = igResp.data.owner?.name || 'Sigo Tu Huella';
          }
        }
        console.log(`[FB] IG direct lookup: userId=${igUserId}, hasPage=${!!pageToken}`);
      } catch (err) {
        console.log('[FB] IG direct lookup failed:', err.message);
      }
    }

    if (!pageToken || !igUserId) {
      const pageIds = pages.map(p => `"${p.name}" (${p.id})`).join(', ');
      throw new Error(`No se encontró una Page de Facebook vinculada a Instagram Business. Pages disponibles: ${pageIds || '(ninguna)'}. Asegurate que la cuenta IG esté vinculada a una Page en Meta Business Suite.`);
    }
  } catch (err) {
    if (err.message?.startsWith('No se encontró')) throw err;
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('[FB] Failed to get pages:', detail);
    throw new Error(`Error al obtener Pages: ${detail}`);
  }

  await saveSetting('instagram_user_id', igUserId);
  await saveSetting('instagram_page_name', pageName);

  const expiresIn = 5184000;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await saveSetting('instagram_access_token', pageToken);
  await saveSetting('instagram_user_token', longToken);
  await saveSetting('instagram_token_expires_at', expiresAt);

  return { accessToken: pageToken, igUserId, username: pageName };
}

export async function exchangeForLongLivedToken(shortToken) {
  const { appId, appSecret } = getSettings();
  const { data } = await axios.get(`${GRAPH_API}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken,
    },
    timeout: 15000,
  });
  return data.access_token;
}

export async function refreshToken() {
  const userToken = await pool.query("SELECT value FROM settings WHERE key = 'instagram_user_token'");
  if (!userToken.rows[0]?.value) return null;
  try {
    const refreshed = await exchangeForLongLivedToken(userToken.rows[0].value);
    const { data } = await axios.get(`${GRAPH_API}/me/accounts`, {
      params: {
        fields: 'id,access_token,instagram_business_account',
        access_token: refreshed,
      },
      timeout: 15000,
    });
    const pages = data?.data || [];
    for (const page of pages) {
      if (page.instagram_business_account?.id) {
        const igUserId = await getInstagramUserId();
        if (page.instagram_business_account.id === igUserId) {
          await saveSetting('instagram_access_token', page.access_token);
          await saveSetting('instagram_user_token', refreshed);
          const expiresAt = new Date(Date.now() + 5184000 * 1000).toISOString();
          await saveSetting('instagram_token_expires_at', expiresAt);
          return page.access_token;
        }
      }
    }
  } catch (err) {
    console.error('Token refresh failed:', err.message);
  }
  return null;
}

async function igPost(url, params, accessToken) {
  try {
    const { access_token, ...body } = params;
    const token = access_token || accessToken || '';
    console.log(`[Instagram] POST ${url} body:`, JSON.stringify(body).slice(0, 300));
    const { data } = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      timeout: 30000,
    });
    console.log(`[Instagram] POST ${url} response:`, JSON.stringify(data).slice(0, 300));
    return data;
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`[Instagram] POST ${url} failed:`, err.response?.status, detail.slice(0, 500));
    throw new Error(`Instagram API ${err.response?.status || 400}: ${detail}`);
  }
}

export async function createContainer(petImages, caption, mediaType = 'IMAGE') {
  const igUserId = await getInstagramUserId();
  if (!igUserId) throw new Error('Instagram not connected');
  if (petImages.length === 0) throw new Error('No images to publish');

  const accessToken = await getStoredToken();

  if (petImages.length === 1) {
    const params = { image_url: petImages[0], caption };
    if (mediaType !== 'IMAGE') params.media_type = mediaType;
    const data = await igPost(`${GRAPH_API}/${igUserId}/media`, params, accessToken);
    lastCreateContainerResponse = data;
    console.log(`[Instagram] container created: id=${data.id}`, JSON.stringify(data).slice(0, 200));
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
  console.log(`[Instagram] carousel created: id=${data.id} children=${childrenIds.join(',')}`);
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

async function getContainerStatus(containerId) {
  const accessToken = await getStoredToken();
  const { data } = await axios.get(`${GRAPH_API}/${containerId}`, {
    params: { fields: 'status_code', access_token: accessToken },
    timeout: 10000,
  });
  return data.status_code;
}

export async function waitForContainer(containerId, mediaType = 'IMAGE') {
  const maxAttempts = mediaType === 'VIDEO' ? 12 : 6;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const status = await getContainerStatus(containerId);
      console.log(`[Instagram] Container ${containerId} status: ${status}`);
      if (status === 'FINISHED') return true;
      if (status === 'ERROR') throw new Error(`Container processing failed (ERROR)`);
      if (status === 'EXPIRED') throw new Error(`Container expired`);
    } catch (err) {
      if (err.response?.data?.error?.error_subcode === 33 || err.message?.includes('error_subcode')) {
        console.log(`[Instagram] Container ${containerId} subcode 33, retrying...`);
      } else if (err.message?.startsWith('Container')) {
        throw err;
      } else {
        console.error(`[Instagram] Container ${containerId} status error:`, err.message);
      }
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  console.warn(`[Instagram] Container ${containerId} timed out, publishing anyway`);
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
    params: { message, access_token: accessToken },
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
