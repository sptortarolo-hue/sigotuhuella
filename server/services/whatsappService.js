import axios from 'axios';
import pool from '../db.js';

const GRAPH_API = 'https://graph.facebook.com/v22.0';

async function getPhoneNumberId() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_phone_number_id'");
  return result.rows[0]?.value || '';
}

async function getAccessToken() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_access_token'");
  return result.rows[0]?.value || '';
}

export async function sendMessage(to, text) {
  const phoneNumberId = await getPhoneNumberId();
  const token = await getAccessToken();
  if (!phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const { data } = await axios.post(`${GRAPH_API}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return data;
}

export async function sendInteractiveButtons(to, bodyText, buttons) {
  const phoneNumberId = await getPhoneNumberId();
  const token = await getAccessToken();
  if (!phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const { data } = await axios.post(`${GRAPH_API}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b, i) => ({
            type: 'reply',
            reply: { id: String(b.id || i), title: b.title },
          })),
        },
      },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return data;
}

export async function sendImage(to, imageIdOrUrl, caption) {
  const phoneNumberId = await getPhoneNumberId();
  const token = await getAccessToken();
  if (!phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const isUrl = typeof imageIdOrUrl === 'string' && (imageIdOrUrl.startsWith('http') || imageIdOrUrl.startsWith('data:'));
  const imageField = isUrl
    ? { link: imageIdOrUrl, caption: caption || '' }
    : { id: imageIdOrUrl, caption: caption || '' };

  const { data } = await axios.post(`${GRAPH_API}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: imageField,
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return data;
}

export async function uploadMedia(base64Data, mimeType) {
  const phoneNumberId = await getPhoneNumberId();
  const token = await getAccessToken();
  if (!phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const { default: FormData } = await import('form-data');
  const buffer = Buffer.from(base64Data, 'base64');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', buffer, { filename: 'pet.jpg', contentType: mimeType || 'image/jpeg' });
  form.append('type', mimeType || 'image/jpeg');

  const { data } = await axios.post(`${GRAPH_API}/${phoneNumberId}/media`, form, {
    headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return data.id;
}

export async function downloadMedia(mediaId) {
  const token = await getAccessToken();
  if (!token) throw new Error('WhatsApp not configured');

  const { data: mediaInfo } = await axios.get(`${GRAPH_API}/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const { data: mediaBuffer } = await axios.get(mediaInfo.url, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${token}` },
  });

  return {
    buffer: Buffer.from(mediaBuffer),
    mimeType: mediaInfo.mime_type,
    fileSize: mediaInfo.file_size,
  };
}

export async function sendReply(to, text, contextMessageId) {
  const phoneNumberId = await getPhoneNumberId();
  const token = await getAccessToken();
  if (!phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const { data } = await axios.post(`${GRAPH_API}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      context: { message_id: contextMessageId },
      text: { preview_url: false, body: text },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return data;
}

export function verifyWebhook(mode, token, challenge) {
  return mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN;
}

export function processIncomingMessage(payload) {
  if (!payload?.entry?.[0]?.changes?.[0]?.value) return null;

  const value = payload.entry[0].changes[0].value;

  if (!value.messages || value.messages.length === 0) return null;

  const msg = value.messages[0];
  const from = msg.from;
  const waMessageId = msg.id;

  let messageType = 'text';
  let textBody = '';
  let mediaId = null;
  let locationLat = null;
  let locationLng = null;

  if (msg.type === 'text') {
    messageType = 'text';
    textBody = msg.text?.body || '';
  } else if (msg.type === 'image') {
    messageType = 'image';
    textBody = msg.image?.caption || '';
    mediaId = msg.image?.id;
  } else if (msg.type === 'location') {
    messageType = 'location';
    locationLat = msg.location?.latitude;
    locationLng = msg.location?.longitude;
    textBody = msg.location?.name || '';
  } else if (msg.type === 'interactive') {
    messageType = 'interactive';
    textBody = msg.interactive?.button_reply?.title ||
               msg.interactive?.list_reply?.title ||
               '';
  }

  const profileName = value.contacts?.[0]?.profile?.name || '';
  const buttonId = msg.interactive?.button_reply?.id || null;

  return {
    waMessageId,
    from,
    messageType,
    textBody,
    buttonId,
    mediaId,
    locationLat,
    locationLng,
    profileName,
    timestamp: msg.timestamp,
  };
}

export async function isWhatsAppEnabled() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_enabled'");
  return result.rows[0]?.value === 'true';
}

export async function getBusinessProfile() {
  const phoneNumberId = await getPhoneNumberId();
  const token = await getAccessToken();
  if (!phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const { data } = await axios.get(
    `${GRAPH_API}/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data?.data?.[0] || null;
}

export async function updateBusinessProfile(fields) {
  const phoneNumberId = await getPhoneNumberId();
  const token = await getAccessToken();
  if (!phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const { data } = await axios.post(
    `${GRAPH_API}/${phoneNumberId}/whatsapp_business_profile`,
    { messaging_product: 'whatsapp', ...fields },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return data;
}
