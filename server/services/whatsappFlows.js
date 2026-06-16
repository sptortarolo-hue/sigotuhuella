import pool from '../db.js';
import axios from 'axios';
import { sendMessage, sendInteractiveButtons } from './whatsappService.js';
import { sendPushToAdmins } from './pushService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLOW_JSON_PATH = path.join(__dirname, '..', 'flows', 'main-flow.json');

async function getWabaId() {
  const r = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_waba_id'");
  return r.rows[0]?.value || '';
}

async function getAccessToken() {
  const r = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_access_token'");
  return r.rows[0]?.value || '';
}

export async function getFlowId() {
  const r = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_main_flow_id'");
  return r.rows[0]?.value || '';
}

async function setFlowId(id) {
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('whatsapp_main_flow_id', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [id]
  );
}

const GRAPH_API = 'https://graph.facebook.com/v22.0';

async function getSetting(key) {
  const r = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
  return r.rows[0]?.value || '';
}

export async function registerFlow() {
  const wabaId = await getWabaId();
  const token = await getAccessToken();
  if (!wabaId || !token) throw new Error('WhatsApp WABA ID or token not configured');

  const flowJson = JSON.parse(fs.readFileSync(FLOW_JSON_PATH, 'utf-8'));
  const endpointUri = await getSetting('whatsapp_flow_endpoint') || 'https://sigotuhuella.online/api/whatsapp/flow-endpoint';
  const existingFlowId = await getFlowId();

  let flowId;

  if (existingFlowId) {
    const { data } = await axios.post(`${GRAPH_API}/${existingFlowId}/assets`,
      {
        messaging_product: 'whatsapp',
        flow_json_uri: null,
        flow_json: JSON.stringify(flowJson),
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    flowId = existingFlowId;
  } else {
    const { default: FormData } = await import('form-data');
    const form = new FormData();
    form.append('name', 'Sigo Tu Huella - Menu Principal');
    form.append('categories', JSON.stringify(['OTHER']));
    form.append('endpoint_uri', endpointUri);
    form.append('flow_json', JSON.stringify(flowJson));

    const { data } = await axios.post(`${GRAPH_API}/${wabaId}/flows`, form, {
      headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
    });
    flowId = data.id;
    await setFlowId(flowId);
  }

  return flowId;
}

export async function publishFlow() {
  const flowId = await getFlowId();
  const token = await getAccessToken();
  if (!flowId || !token) throw new Error('Flow not registered or token missing');

  const { data } = await axios.post(`${GRAPH_API}/${flowId}/publish`, {},
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return data;
}

export async function sendFlow(to, flowToken = null) {
  const flowId = await getFlowId();
  const phoneNumberId = await getSetting('whatsapp_phone_number_id');
  const token = await getAccessToken();
  if (!flowId || !phoneNumberId || !token) throw new Error('WhatsApp not configured');

  const flowActionToken = flowToken || `flow_${Date.now()}_${to}`;

  const { data } = await axios.post(`${GRAPH_API}/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: {
          type: 'text',
          text: '🐾 Sigo Tu Huella',
        },
        body: {
          text: '¿En qué podemos ayudarte? Abrí el menú interactivo:',
        },
        footer: {
          text: 'Red Vecinal de Mascotas',
        },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_id: flowId,
            flow_token: flowActionToken,
            mode: 'draft',
            flow_action: 'navigate',
            flow_action_payload: {
              screen: 'MAIN_MENU',
              data: {},
            },
          },
        },
      },
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return data;
}

export async function handleDataExchange(payload) {
  const { flow_token, user_id, screen, data, version } = payload;

  switch (screen) {
    case 'MAIN_MENU': {
      const selected = data?.selected_option || 'lost';
      const screenMap = {
        lost: 'REPORT_LOST',
        sighted: 'REPORT_SIGHTED',
        found: 'REPORT_FOUND',
        adopt: 'ADOPT_FILTER',
        chapita: 'CHAPITA_INFO',
        donate: 'DONATE_INFO',
        volunteer: 'VOLUNTEER_ONBOARDING',
        facebook: 'FACEBOOK_LINK',
        contact: 'CONTACT_FORM',
      };
      return {
        version: '3.0',
        screen: screenMap[selected] || 'MAIN_MENU',
        data: {},
      };
    }

    case 'DONATE_INFO': {
      const method = data?.donation_method || 'transfer';
      const accounts = (await pool.query('SELECT * FROM collaboration_accounts ORDER BY bank_name')).rows;

      if (method === 'transfer' || method === 'mercadopago') {
        let text;
        if (method === 'transfer') {
          const transferAccounts = accounts.filter(a => a.cbu || a.alias);
          text = transferAccounts.length > 0
            ? transferAccounts.map(a =>
                `🏦 *${a.bank_name}*\nAlias: ${a.alias}\nCBU: ${a.cbu}${a.cvu ? '\nCVU: ' + a.cvu : ''}`
              ).join('\n\n')
            : 'No hay cuentas registradas. Consultanos por MP.';
        } else {
          const mpAccount = accounts.find(a => a.mercadopago_link);
          text = mpAccount
            ? `💳 *Mercado Pago*\n${mpAccount.mercadopago_link}`
            : 'No hay link de MP registrado. Consultanos por transferencia.';
        }
        return {
          version: '3.0',
          screen: 'DONATE_SHOW',
          data: { accounts_text: text },
        };
      }

      const shareText = encodeURIComponent(
        '🐾 Ayudame a ayudar a Sigo Tu Huella!\nCualquier donación ayuda para alimentos, atención veterinaria y refugio.\n\nhttps://sigotuhuella.online/donar'
      );
      const waLink = `https://wa.me/?text=${shareText}`;
      return {
        version: '3.0',
        screen: 'DONATE_SHOW',
        data: {
          accounts_text: `📲 Compartí este mensaje con tus contactos:\n\n${waLink}`,
        },
      };
    }

    default:
      return {
        version: '3.0',
        screen: 'MAIN_MENU',
        data: {},
      };
  }
}

export async function handleFlowComplete(payload) {
  const { flow_token, user_id, screen, data, version } = payload;

  const waFrom = user_id;
  let conv = (await pool.query(
    `SELECT * FROM whatsapp_conversations WHERE wa_from = $1 AND status = 'active' ORDER BY last_message_at DESC LIMIT 1`,
    [waFrom]
  )).rows[0];

  if (!conv) {
    conv = (await pool.query(
      `INSERT INTO whatsapp_conversations (wa_from, bot_name, flow, context)
       VALUES ($1, 'Tute', 'menu', $2) RETURNING *`,
      [waFrom, JSON.stringify({})]
    )).rows[0];
  }

  await pool.query(
    `INSERT INTO whatsapp_messages (wa_from, conversation_id, message_type, text_body, status, direction)
     VALUES ($1, $2, 'flow_submit', $3, 'processed', 'inbound')`,
    [waFrom, conv.id, JSON.stringify({ screen, data })]
  );

  switch (screen) {
    case 'REPORT_LOST': {
      const { pet_name, species, location, description } = data;
      const speciesLabel = species === 'dog' ? 'perro' : species === 'cat' ? 'gato' : 'otro';
      const petResult = await pool.query(
        `INSERT INTO pets (name, species, status, location, description, contact_info, source)
         VALUES ($1, $2, 'lost', $3, $4, $5, 'whatsapp') RETURNING id`,
        [
          pet_name || 'Sin nombre',
          speciesLabel,
          location || 'Sin ubicación',
          description || '',
          waFrom,
        ]
      );
      const petId = petResult.rows[0].id;

      await pool.query(
        `UPDATE whatsapp_conversations SET context = jsonb_set(COALESCE(context, '{}'), '{last_pet_report}', $1::jsonb) WHERE id = $2`,
        [JSON.stringify({ id: petId, name: pet_name, type: 'lost' }), conv.id]
      );

      sendPushToAdmins({
        title: '🐾 Perdida reportada desde WhatsApp',
        body: `${pet_name || 'Mascota sin nombre'} (${speciesLabel}) - ${location || 'Sin ubicación'}`,
        tag: `whatsapp-lost-${petId}`,
      }).catch(() => {});

      await sendMessage(waFrom,
        `✅ *${conv.bot_name}:* ¡Reporte de mascota perdida creado!\n\n` +
        `📝 ${pet_name || 'Sin nombre'} · ${speciesLabel}\n` +
        `📍 ${location || 'Sin ubicación'}\n\n` +
        `📸 *¿Tenés una foto?* Enviala ahora para que todos puedan identificarla mejor.`
      );
      break;
    }

    case 'REPORT_SIGHTED': {
      const { species, location, description } = data;
      const speciesLabel = species === 'dog' ? 'perro' : species === 'cat' ? 'gato' : 'otro';
      const petResult = await pool.query(
        `INSERT INTO pets (species, status, location, description, contact_info, source)
         VALUES ($1, 'sighted', $2, $3, $4, 'whatsapp') RETURNING id`,
        [speciesLabel, location || 'Sin ubicación', description || '', waFrom]
      );
      const petId = petResult.rows[0].id;

      sendPushToAdmins({
        title: '👀 Avistaje reportado desde WhatsApp',
        body: `${speciesLabel} - ${location || 'Sin ubicación'}`,
        tag: `whatsapp-sighted-${petId}`,
      }).catch(() => {});

      await sendMessage(waFrom,
        `✅ *${conv.bot_name}:* ¡Avistaje registrado! Gracias por ayudar.\n\n` +
        `📍 ${location || 'Sin ubicación'}\n` +
        `📝 ${description ? description.substring(0, 100) : 'Sin descripción'}\n\n` +
        `📸 *¿Tenés una foto?* Enviala para mejorar la identificación.`
      );
      break;
    }

    case 'REPORT_FOUND': {
      const { species, location, description } = data;
      const speciesLabel = species === 'dog' ? 'perro' : species === 'cat' ? 'gato' : 'otro';
      const petResult = await pool.query(
        `INSERT INTO pets (species, status, location, description, contact_info, source)
         VALUES ($1, 'retained', $2, $3, $4, 'whatsapp') RETURNING id`,
        [speciesLabel, location || 'Sin ubicación', description || '', waFrom]
      );
      const petId = petResult.rows[0].id;

      sendPushToAdmins({
        title: '✅ Mascota encontrada desde WhatsApp',
        body: `${speciesLabel} - ${location || 'Sin ubicación'}`,
        tag: `whatsapp-found-${petId}`,
      }).catch(() => {});

      await sendMessage(waFrom,
        `✅ *${conv.bot_name}:* ¡Gracias por reportar la mascota encontrada!\n\n` +
        `📍 ${location || 'Sin ubicación'}\n` +
        `📝 ${description ? description.substring(0, 100) : 'Sin descripción'}\n\n` +
        `📸 *¿Tenés una foto?* Enviala para ayudar a encontrar a su familia.`
      );
      break;
    }

    case 'ADOPT_FILTER': {
      const { species_preference } = data;
      const speciesLabel = species_preference === 'any' ? 'cualquiera' : species_preference === 'dog' ? 'perro' : 'gato';

      await pool.query(
        `INSERT INTO whatsapp_adoption_interests (wa_from, species_preference, status)
         VALUES ($1, $2, 'pending')`,
        [waFrom, species_preference]
      );

      sendPushToAdmins({
        title: '🙋 Interés en adopción desde WhatsApp',
        body: `Busca ${speciesLabel}`,
        tag: `whatsapp-adopt-${Date.now()}`,
      }).catch(() => {});

      const pets = (await pool.query(
        `SELECT id, name, species, breed, age FROM pets
         WHERE status = 'for_adoption'
         ${species_preference !== 'any' ? "AND species = '" + speciesLabel + "'" : ''}
         ORDER BY created_at DESC LIMIT 3`
      )).rows;

      let msg = `✅ *${conv.bot_name}:* Registramos tu interés en adoptar.\n\n`;
      if (pets.length > 0) {
        msg += '🐾 *Mascotas disponibles:*\n\n';
        for (const p of pets) {
          msg += `• *${p.name || 'Sin nombre'}* (${p.species}${p.breed ? ' · ' + p.breed : ''}${p.age ? ' · ' + p.age : ''})\n`;
          msg += `  🔗 https://sigotuhuella.online/pet/${p.id}\n\n`;
        }
        msg += 'Si te interesa alguna, decinos y te contactamos.';
      } else {
        msg += 'Hoy no tenemos mascotas en adopción que coincidan, pero cuando aparezca una te avisamos. 🙌\n\nTambién podés ver en nuestra web: https://sigotuhuella.online';
      }

      await sendMessage(waFrom, msg);
      break;
    }

    case 'CHAPITA_FORM': {
      const { pet_name, species, requester_name } = data;
      const speciesLabel = species === 'dog' ? 'perro' : species === 'cat' ? 'gato' : 'otro';

      await pool.query(
        `INSERT INTO whatsapp_chapita_requests (wa_from, pet_name, species, requester_name, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [waFrom, pet_name, speciesLabel, requester_name || 'Anónimo']
      );

      sendPushToAdmins({
        title: 'ℹ️ Solicitud de chapita QR desde WhatsApp',
        body: `${requester_name || 'Anónimo'} solicita QR para ${pet_name} (${speciesLabel})`,
        tag: `whatsapp-chapita-${Date.now()}`,
      }).catch(() => {});

      await sendMessage(waFrom,
        `✅ *${conv.bot_name}:* ¡Solicitud recibida!\n\n` +
        `Te pedimos una chapita QR para *${pet_name}* (${speciesLabel}).\n` +
        `Te vamos a notificar por este chat cuando esté lista para retirar. 🐾`
      );
      break;
    }

    case 'VOLUNTEER_FORM': {
      const { name, phone } = data;
      const onboarding = conv.context?.onboarding || {};
      const zone = onboarding.zone || '';
      const hasPets = onboarding.has_pets || '';
      const alertsOptin = onboarding.alerts_optin === 'yes';

      if (alertsOptin) {
        await pool.query(
          `INSERT INTO whatsapp_groups (name, group_id, is_active)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (group_id) DO NOTHING`,
          [`Voluntario ${waFrom}`, waFrom]
        );
      }

      sendPushToAdmins({
        title: '🙌 Nuevo voluntario desde WhatsApp',
        body: `${name || 'Anónimo'} · ${phone || waFrom} · Zona: ${zone}`,
        tag: `whatsapp-volunteer-${Date.now()}`,
      }).catch(() => {});

      await sendMessage(waFrom,
        `✅ *${conv.bot_name}:* ¡Gracias por sumarte, ${name || 'voluntari@'}! 🙌\n\n` +
        `Te vamos a contactar pronto con más información.\n` +
        `Mientras tanto, si ves alguna mascota en situación de calle ya sabés cómo reportarla 🐾`
      );
      break;
    }

    case 'DONATE_SHOW': {
      await sendMessage(waFrom,
        `🙌 *${conv.bot_name}:* ¡Gracias por tu generosidad!\n\n` +
        `Cada aporte, por pequeño que sea, ayuda a mantener la red activa.\n\n` +
        `¿Querés recibir novedades de cómo se usa tu ayuda?\n` +
        `Decinos "Sí" o "No" por este chat.`
      );

      await pool.query(
        `UPDATE whatsapp_conversations SET context = jsonb_set(COALESCE(context, '{}'), '{donation_completed}', 'true') WHERE id = $1`,
        [conv.id]
      );
      break;
    }

    case 'CONTACT_FORM': {
      const motive = data?.motive || 'general';
      const motiveLabels = {
        question: 'Consulta general',
        suggestion: 'Sugerencia',
        problem: 'Problema con la app',
        other: 'Otro',
      };

      sendPushToAdmins({
        title: '🗣 Nuevo mensaje desde WhatsApp',
        body: `${motiveLabels[motive] || motive}: ${(data?.message || '').substring(0, 100)}`,
        tag: `whatsapp-contact-${Date.now()}`,
      }).catch(() => {});

      await sendMessage(waFrom,
        `✅ *${conv.bot_name}:* Recibimos tu mensaje. Te vamos a responder a la brevedad.\n\n` +
        `Mientras tanto, si necesitas ayuda urgente con una mascota, usa las opciones del menú principal.`
      );
      break;
    }

    default:
      await sendMessage(waFrom, `${conv.bot_name}: ¿En qué más puedo ayudarte?`);
  }

  await pool.query(
    `UPDATE whatsapp_conversations SET last_message_at = NOW(), context = COALESCE(context, '{}') WHERE id = $1`,
    [conv.id]
  );

  return { version: '3.0', screen: 'MAIN_MENU', data: {} };
}

export async function getFlowStatus() {
  const flowId = await getFlowId();
  const wabaId = await getWabaId();
  const token = await getAccessToken();

  return {
    registered: !!flowId,
    flowId: flowId || null,
    wabaId: wabaId || null,
    hasToken: !!token,
    flowJsonSize: fs.existsSync(FLOW_JSON_PATH) ? fs.statSync(FLOW_JSON_PATH).size : 0,
  };
}
