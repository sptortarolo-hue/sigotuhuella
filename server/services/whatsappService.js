import axios from 'axios';
import pool from '../db.js';
import { enqueue } from './phoneRelayService.js';

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

export async function sendListMessage(to, bodyText, rows, { buttonLabel = 'Ver opciones', headerText, footerText } = {}) {
  const phoneNumberId = await getPhoneNumberId();
  const token = await getAccessToken();
  if (!phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonLabel,
        sections: [{
          title: '🐾 Sigo Tu Huella',
          rows: rows.map((r, i) => ({
            id: String(r.id || i),
            title: r.title.slice(0, 24),
          })),
        }],
      },
    },
  };
  if (headerText) payload.interactive.header = { type: 'text', text: headerText.slice(0, 60) };
  if (footerText) payload.interactive.footer = { text: footerText.slice(0, 60) };

  const { data } = await axios.post(`${GRAPH_API}/${phoneNumberId}/messages`, payload,
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

function parseOneMessage(msg, contacts) {
  const from = msg.from;
  const waMessageId = msg.id;
  const profileName = contacts?.[0]?.profile?.name || '';

  let messageType = 'text';
  let textBody = '';
  let mediaId = null;
  let locationLat = null;
  let locationLng = null;
  let flowToken = null;
  let flowData = null;

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
    textBody = msg.interactive?.button_reply?.title ||
               msg.interactive?.list_reply?.title ||
               '';
    if (msg.interactive?.type === 'flow') {
      messageType = 'flow_response';
      flowToken = msg.interactive?.flow_reply?.flow_token || null;
      try {
        const raw = msg.interactive?.flow_reply?.data;
        flowData = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch { flowData = null; }
    } else {
      messageType = 'interactive';
    }
  }

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
    flowToken,
    flowData,
  };
}

export function processIncomingMessage(payload) {
  if (!payload?.entry?.[0]?.changes?.[0]?.value) return [];

  const value = payload.entry[0].changes[0].value;
  if (!value.messages || value.messages.length === 0) return [];

  const contacts = value.contacts || [];
  return value.messages.map(msg => parseOneMessage(msg, contacts));
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

// ─── Group messaging ───

export async function sendGroupMessage(groupId, text) {
  const phoneNumberId = await getPhoneNumberId();
  const token = await getAccessToken();
  if (!phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const { data } = await axios.post(`${GRAPH_API}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: groupId,
      type: 'text',
      text: { preview_url: true, body: text },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return data;
}

export async function sendGroupImage(groupId, imageUrl, caption) {
  const phoneNumberId = await getPhoneNumberId();
  const token = await getAccessToken();
  if (!phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const { data } = await axios.post(`${GRAPH_API}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: groupId,
      type: 'image',
      image: { link: imageUrl, caption: caption || '' },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return data;
}

export async function broadcastPetToGroups(petId) {
  try {
    const enabled = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_broadcast_enabled'");
    if (enabled.rows[0]?.value !== 'true') return;

    const groups = await pool.query("SELECT * FROM whatsapp_groups WHERE is_active = TRUE AND auto_broadcast = TRUE");
    if (groups.rows.length === 0) return;

    const pet = (await pool.query(`
      SELECT p.*,
        (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as image_data,
        (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as mime_type
      FROM pets p WHERE p.id = $1
    `, [petId])).rows[0];
    if (!pet) return;

    const statusLabels = {
      lost: '🐾 SE PERDIÓ', retained: '🔄 RETENIDO', sighted: '👀 AVISTADO',
      for_adoption: '❤️ EN ADOPCIÓN', adopted: '✅ ADOPTADO',
      reunited: '🎉 REENCUENTRO', accidented: '🚑 ACCIDENTADO',
      needs_attention: '⚠️ NECESITA ATENCIÓN',
    };
    const label = statusLabels[pet.status] || '🐾 MASCOTA';
    const speciesLabel = pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species || 'Mascota';
    const genderLabel = pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : '';
    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

    const caption = [
      `${label}`,
      pet.name ? `Nombre: ${pet.name}` : '',
      `${speciesLabel}${pet.breed ? ' · ' + pet.breed : ''}`,
      genderLabel && pet.age ? `${genderLabel} · ${pet.age}` : genderLabel || pet.age || '',
      `📍 ${pet.location || 'Sin ubicación'}`,
      pet.contact_info ? `📞 ${pet.contact_info}` : '',
      '',
      pet.description ? pet.description.substring(0, 300) : '',
      '',
      `🔗 ${frontendUrl}/pet/${pet.id}`,
    ].filter(Boolean).join('\n');

    const coverUrl = pet.image_data
      ? `${frontendUrl}/api/images/pet/${petId}/cover`
      : null;

    for (const group of groups.rows) {
      try {
        await enqueue(group.group_id, caption, coverUrl);
      } catch (relayErr) {
        console.warn(`[Broadcast] Relay error to ${group.name}, fallback to Meta:`, relayErr.message);
        try {
          if (coverUrl) {
            await sendGroupImage(group.group_id, coverUrl, caption);
          } else {
            await sendGroupMessage(group.group_id, caption);
          }
        } catch (metaErr) {
          console.error(`[Broadcast] Meta fallback error to ${group.name}:`, metaErr.message);
        }
      }
    }
  } catch (err) {
    console.error('[Broadcast] Error:', err.message);
  }
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
