import axios from 'axios';
import pool from '../db.js';
import { enqueue } from './phoneRelayService.js';
import { createCaseEvent } from './caseService.js';
import { generateCelebrationText } from './textTemplates.js';
import { enqueuePublishTask, applySpintax } from './facebookRelayService.js';

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
    textBody = msg.location?.name || msg.location?.address || '';
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

  const buttonId = msg.interactive?.button_reply?.id ||
                   msg.interactive?.list_reply?.id ||
                   null;

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

export async function buildPetBroadcastCaption(pet) {
  const statusLabels = {
    lost: '🐾 SE PERDIÓ', retained: '🔄 RETENIDO', sighted: '👀 AVISTADO',
    for_adoption: '❤️ EN ADOPCIÓN', for_adoption_simple: '📢 EN ADOPCIÓN (DIFUSIÓN)',
    adopted: '✅ ADOPTADO',
    reunited: '🎉 REENCUENTRO', accidented: '🚑 ACCIDENTADO',
    needs_attention: '⚠️ NECESITA ATENCIÓN', transitada: '🏠 EN TRÁNSITO',
  };
  const label = statusLabels[pet.status] || '🐾 MASCOTA';
  const speciesLabel = pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species || 'Mascota';
  const genderLabel = pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : '';
  const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';

  const isCelebration = pet.status === 'reunited' || pet.status === 'adopted';

  if (isCelebration) {
    const hashtagResult = await pool.query("SELECT value FROM settings WHERE key = 'instagram_default_hashtags'");
    const hashtags = hashtagResult.rows[0]?.value || '#SigoTuHuella';
    const celebrationText = generateCelebrationText(pet, pet.status);
    return [
      celebrationText,
      '',
      `🔗 ${frontendUrl}/pet/${pet.id}`,
      '',
      hashtags,
    ].join('\n');
  }

  return [
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
}

export async function broadcastPetToGroups(petId) {
  console.log('[Broadcast] >>> ENTRANDO petId:', petId);
  try {
    const enabled = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_broadcast_enabled'");
    console.log('[Broadcast] whatsapp_broadcast_enabled:', enabled.rows[0]?.value);
    if (enabled.rows[0]?.value !== 'true') {
      console.log('[Broadcast] >>> SALIENDO: whatsapp_broadcast_enabled no está activado');
      return;
    }

    const groups = await pool.query("SELECT * FROM whatsapp_groups WHERE is_active = TRUE");
    console.log('[Broadcast] Grupos encontrados:', groups.rows.length);
    if (groups.rows.length === 0) {
      console.log('[Broadcast] >>> SALIENDO: sin grupos activos');
      return;
    }

    const pet = (await pool.query(`
      SELECT p.*,
        (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as image_data,
        (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as mime_type
      FROM pets p WHERE p.id = $1
    `, [petId])).rows[0];
    if (!pet) {
      console.log('[Broadcast] >>> SALIENDO: pet no encontrado, petId:', petId);
      return;
    }
    if (pet.is_hidden) {
      console.log('[Broadcast] Mascota oculta, saltando broadcast, petId:', petId);
      return;
    }
    console.log('[Broadcast] Pet encontrado, status:', pet.status, 'species:', pet.species);

    const caption = await buildPetBroadcastCaption(pet);
    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';

    let coverUrl = pet.image_data
      ? `${frontendUrl}/api/images/pet/${petId}/cover`
      : null;

    console.log('[Broadcast] >>> ENCOLANDO para', groups.rows.length, 'grupo(s)');
    const caseRes = await pool.query('SELECT id FROM pet_cases WHERE pet_id = $1 LIMIT 1', [petId]);
    const caseId = caseRes.rows[0]?.id || null;
    for (const group of groups.rows) {
      try {
        console.log('[Broadcast] Encolando a grupo:', group.name, 'group_id:', group.group_id);
        const relayMessageId = await enqueue(group.group_id, caption, coverUrl);
        console.log('[Broadcast] Encolado OK:', group.name);
        if (caseId) {
          try {
            await createCaseEvent(caseId, 'whatsapp_group_sent', {
              group_id: group.group_id,
              group_name: group.name,
              relay_message_id: relayMessageId,
              reached: true,
            });
          } catch (eventErr) {
            console.error(`[Broadcast] Error registrando evento para ${group.name}:`, eventErr.message);
          }
        }
      } catch (err) {
        console.error(`[Broadcast] Error encolando a grupo ${group.name} (${group.group_id}):`, err.message);
      }
    }
  } catch (err) {
    console.error('[Broadcast] Error:', err.message);
  }
}

export async function getNextAdoptionPet() {
  const pets = (await pool.query(`
    SELECT p.*,
      (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as image_data,
      (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as mime_type
    FROM pets p
    WHERE p.status IN ('for_adoption', 'for_adoption_simple')
      AND (p.is_hidden = FALSE OR p.is_hidden IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM adoption_assignments aa
        WHERE aa.pet_id = p.id
          AND (aa.status = 'pending_adopter' OR (aa.status = 'completed' AND aa.adopter_id IS NULL))
      )
    ORDER BY p.adoption_broadcasted_at ASC NULLS FIRST, p.created_at ASC
LIMIT 1
  `)).rows;
  return pets.length > 0 ? pets[0] : null;
}

export async function broadcastNextAdoptionPet(existingPet = null) {
  try {
    const waAdoption = await pool.query("SELECT value FROM settings WHERE key = 'wa_adoption_broadcast_enabled'");
    if (waAdoption.rows[0]?.value !== 'true') {
      console.log('[AdoptionBroadcast] wa_adoption_broadcast_enabled desactivado, salteando');
      return;
    }

    let pet = existingPet;
    if (!pet) {
      pet = await getNextAdoptionPet();
      if (!pet) {
        console.log('[AdoptionBroadcast] No adoption pets to broadcast');
        return;
      }
    }

    const groups = (await pool.query("SELECT * FROM whatsapp_groups WHERE is_active = TRUE AND broadcast_adoptions = TRUE")).rows;
    if (groups.length === 0) {
      console.log('[AdoptionBroadcast] No hay grupos con broadcast_adoptions activado');
      return;
    }
    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';

    const speciesLabel = pet.species === 'dog' ? 'perro' : pet.species === 'cat' ? 'gato' : (pet.species || 'mascota');
    const desc = pet.description ? pet.description.substring(0, 200) : '';
    const edadInfo = pet.age ? ` de ${pet.age}` : '';

    const caption = [
      `🏡 *Buscamos hogar para ${pet.name || 'una mascota'}*`,
      '',
      'En Sigo Tu Huella conectamos mascotas con familias.',
      '',
      `Hoy te presentamos a *${pet.name || 'una mascota'}*, ${speciesLabel}${edadInfo} que está buscando un hogar.`,
      desc ? `\n${desc}` : '',
      '',
      `📍 ${pet.location || 'Sin ubicación'}`,
      pet.contact_info ? `📞 ${pet.contact_info}` : '',
      '',
      `👉 ${frontendUrl}/pet/${pet.id}`,
      '',
      'Si no podés adoptar, compartir también ayuda 🐾',
    ].filter(Boolean).join('\n');

    const coverUrl = pet.image_data
      ? `${frontendUrl}/api/images/pet/${pet.id}/cover`
      : null;

    for (const group of groups) {
      try {
        await enqueue(group.group_id, caption, coverUrl);
      } catch (err) {
        console.error(`[AdoptionBroadcast] Error encolando para ${group.name}:`, err.message);
      }
    }

    if (!existingPet) {
      await pool.query('UPDATE pets SET adoption_broadcasted_at = NOW() WHERE id = $1', [pet.id]);
    }
    console.log(`[AdoptionBroadcast] Broadcast "${pet.name}" (${pet.id}) to ${groups.length} groups`);
  } catch (err) {
    console.error('[AdoptionBroadcast] Error:', err.message);
  }
}

export async function broadcastFbAdoptionPets(existingPet = null) {
  try {
    const fbAdoption = await pool.query("SELECT value FROM settings WHERE key = 'fb_adoption_broadcast_enabled'");
    if (fbAdoption.rows[0]?.value !== 'true') {
      console.log('[FbAdoptionBroadcast] fb_adoption_broadcast_enabled desactivado, salteando');
      return;
    }

    let pet = existingPet;
    if (!pet) {
      pet = await getNextAdoptionPet();
      if (!pet) {
        console.log('[FbAdoptionBroadcast] No adoption pets to broadcast');
        return;
      }
    }

    const groups = await pool.query(
      `SELECT id, name, fb_group_id FROM facebook_groups
       WHERE is_active = true AND publish_on_create = true
       AND fb_group_id IS NOT NULL AND fb_group_id != ''
       ORDER BY name`
    );
    if (groups.rows.length === 0) {
      console.log('[FbAdoptionBroadcast] No hay grupos de Facebook con publish_on_create activado');
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
    const hashtags = '#SigoTuHuella #AdoptaNoCompres';

    const speciesLabel = pet.species === 'dog' ? 'perro' : pet.species === 'cat' ? 'gato' : (pet.species || 'mascota');
    const desc = pet.description ? pet.description.substring(0, 200) : '';
    const edadInfo = pet.age ? ` de ${pet.age}` : '';

    const message = applySpintax([
      `{🏡 Buscamos hogar|🌟 En adopción|❤️ Busca familia} para ${pet.name || 'una mascota'}`,
      '',
      'En Sigo Tu Huella conectamos mascotas con familias.',
      '',
      `Hoy te {presentamos|compartimos|mostramos} a *${pet.name || 'una mascota'}*, ${speciesLabel}${edadInfo} que {busca un hogar|necesita familia|está en adopción}.`,
      desc ? `\n${desc}` : '',
      '',
      `{📍 Ubicación|📍 Zona|📍 Se encuentra en}: ${pet.location || 'Sin ubicación'}`,
      pet.contact_info ? `{📞 Contacto|📞 Teléfono|📞 WhatsApp}: ${pet.contact_info}` : '',
      '',
      `👉 ${frontendUrl}/pet/${pet.id}`,
      '',
      '{Si no podés adoptar, compartir también ayuda 🐾|Compartí y ayudanos a encontrarle hogar 🙏|Ayudanos a difundir 🐶}',
      '',
      hashtags,
    ].filter(Boolean).join('\n'));

    const imagesResult = await pool.query(
      'SELECT image_data FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 5',
      [pet.id]
    );
    const imageUrls = imagesResult.rows.length > 0
      ? [`${frontendUrl}/api/images/pet/${pet.id}/cover`, ...imagesResult.rows.slice(1).map((_, i) => `${frontendUrl}/api/images/pet/${pet.id}/${i + 1}`)]
      : [`${frontendUrl}/api/images/pet/${pet.id}/cover`];

    for (const group of groups.rows) {
      try {
        await enqueuePublishTask(pet.id, group.id, group.fb_group_id, message, imageUrls);
      } catch (err) {
        console.error(`[FbAdoptionBroadcast] Error enqueuing to ${group.name}:`, err.message);
      }
    }

    if (!existingPet) {
      await pool.query('UPDATE pets SET adoption_broadcasted_at = NOW() WHERE id = $1', [pet.id]);
    }
    console.log(`[FbAdoptionBroadcast] Enqueued "${pet.name}" (${pet.id}) to ${groups.rows.length} FB groups`);
  } catch (err) {
    console.error('[FbAdoptionBroadcast] Error:', err.message);
  }
}

export async function broadcastAdoptionPet() {
  try {
    const pet = await getNextAdoptionPet();
    if (!pet) {
      console.log('[AdoptionBroadcast] No adoption pets to broadcast');
      return;
    }
    const waEnabled = (await pool.query("SELECT value FROM settings WHERE key = 'wa_adoption_broadcast_enabled'")).rows[0]?.value === 'true';
    const fbEnabled = (await pool.query("SELECT value FROM settings WHERE key = 'fb_adoption_broadcast_enabled'")).rows[0]?.value === 'true';
    if (!waEnabled && !fbEnabled) {
      console.log('[AdoptionBroadcast] Both WA and FB disabled, skipping');
      return;
    }
    if (waEnabled) await broadcastNextAdoptionPet(pet);
    if (fbEnabled) await broadcastFbAdoptionPets(pet);
    await pool.query('UPDATE pets SET adoption_broadcasted_at = NOW() WHERE id = $1', [pet.id]);
    console.log(`[AdoptionBroadcast] Combined broadcast "${pet.name}" (${pet.id})`);
  } catch (err) {
    console.error('[AdoptionBroadcast] Combined error:', err.message);
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
