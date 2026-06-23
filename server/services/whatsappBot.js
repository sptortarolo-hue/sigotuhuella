import pool from '../db.js';
import { sendMessage, sendInteractiveButtons, sendImage, downloadMedia, uploadMedia, broadcastPetToGroups, sendListMessage } from './whatsappService.js';
import { matchWhatsAppToPets, processImageCaption } from './geminiMatching.js';
import { classifyPost } from './geminiClassifier.js';
import { fetchFbPost } from './vpsSyncService.js';
import { geocodeAddress } from './geocoding.js';
import axios from 'axios';

const BOT_NAMES = ['Tute', 'Lilo', 'Toto'];

function pickBotName() {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}

async function getSetting(key) {
  const r = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
  return r.rows[0]?.value || '';
}

async function setFlow(conv, flow, contextUpdates = {}) {
  const ctx = { ...(conv.context || {}), ...contextUpdates };
  await pool.query(
    `UPDATE whatsapp_conversations SET flow = $1, context = $2, last_message_at = NOW() WHERE id = $3`,
    [flow, JSON.stringify(ctx), conv.id]
  );
  conv.flow = flow;
  conv.context = ctx;
}

function detectIntent(parsed) {
  // Images must be checked before keyword matching — captions could trigger keywords
  if (parsed.messageType === 'image') return 'image_received';

  const text = (parsed.textBody || '').toLowerCase().trim();

  if (parsed.buttonId) {
    switch (parsed.buttonId) {
      case 'report_lost': return 'report_lost';
      case 'report_sighted': return 'report_sighted';
      case 'report_found': return 'report_found';
      case 'info_qr': return 'info_qr';
      case 'volunteer': return 'volunteer';
      case 'adopt': return 'adopt';
      case 'donate': return 'donate';
      case 'human': return 'human';
      case 'end_yes': return 'confirm';
      case 'end_no': return 'cancel';
      case 'confirm_yes': case 'confirm_retained': case 'confirm_sighted': return 'confirm';
      case 'confirm_no': return 'cancel';
      case 'confirm_edit': return 'edit';
      case 'edit_location': case 'edit_contact': case 'edit_description': return 'edit_field';
      case 'menu_back': return 'menu_back';
      case 'motive_report': case 'motive_technical': case 'motive_collab': case 'motive_other': return 'motive';
      case 'species_dog': case 'species_cat': case 'species_other': return 'species';
      case 'report_from_fb': return 'report_from_fb';
      case 'adopt_post': return 'adopt_post';
    }
  }

  if (parsed.messageType === 'interactive') {
    if (/perdida/i.test(text)) return 'report_lost';
    if (/avistaje/i.test(text)) return 'report_sighted';
    if (/encontrada/i.test(text)) return 'report_found';
    if (/info|qr/i.test(text)) return 'info_qr';
    if (/voluntario/i.test(text)) return 'volunteer';
    if (/adoptar|adopt/i.test(text)) return 'adopt';
    if (/publicar|difusi[oó]n/i.test(text)) return 'adopt_post';
    if (/donar|donación|don/i.test(text)) return 'donate';
    if (/face|fb\./i.test(text)) return 'report_from_fb';
    if (/humano/i.test(text)) return 'human';
    if (/s[ií]|confirmar|dale|end_yes/i.test(text)) return 'confirm';
    if (/^no$|no |cancelar|end_no/i.test(text)) return 'cancel';
    if (/saltar|skip|omitir/i.test(text)) return 'skip';
  }
  if (/perdi|perdido|perd[ií]/.test(text)) return 'report_lost';
  if (/avist|vist|vi un/.test(text)) return 'report_sighted';
  if (/encontr[eé]|encontrada/.test(text)) return 'report_found';
  if (/info|información|chapita|qr/.test(text)) return 'info_qr';
  if (/voluntario|ayudar|colaborar/.test(text)) return 'volunteer';
  if (/adoptar|adopt/.test(text)) return 'adopt';
  if (/publicar|difusi[oó]n/.test(text)) return 'adopt_post';
  if (/donar|donación|don/.test(text)) return 'donate';
  if (/face|facebook|fb\./i.test(text)) return 'report_from_fb';
  if (/humano|persona|hablar/.test(text)) return 'human';
  if (/s[ií]|confirmar|dale|end_yes/.test(text)) return 'confirm';
  if (/^no$|no |cancelar|end_no/.test(text)) return 'cancel';
  if (/saltar|omitir/.test(text)) return 'skip';
  return null;
}

async function detectIntentWithAI(text) {
  try {
    const { classifyTextIntent } = await import('./geminiMatching.js');
    const classification = await classifyTextIntent(text);
    if (classification && classification !== 'other' && classification !== 'greeting') {
      const intentMap = {
        lost: 'report_lost', found: 'report_found', sighted: 'report_sighted',
        adopt: 'adopt', volunteer: 'volunteer', donate: 'donate',
        info_qr: 'info_qr', report_from_fb: 'report_from_fb', human: 'human',
      };
      return intentMap[classification] || null;
    }
  } catch (err) {
    console.error('AI intent detection error:', err);
  }
  return null;
}

// Per-user message queue to serialize processing per wa_from
const messageQueues = new Map();

export async function processMessage(parsed) {
  const waFrom = parsed.from;
  const prev = messageQueues.get(waFrom) || Promise.resolve();
  const next = prev.then(
    () => processMessageSync(parsed),
    () => processMessageSync(parsed)
  );
  messageQueues.set(waFrom, next);
  next.finally(() => {
    if (messageQueues.get(waFrom) === next) {
      messageQueues.delete(waFrom);
    }
  });
  return next;
}

async function processMessageSync(parsed) {
  const saved = await pool.query(
    `INSERT INTO whatsapp_messages (wa_message_id, wa_from, sender_name, message_type, text_body, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (wa_message_id) DO NOTHING
     RETURNING id`,
    [parsed.waMessageId, parsed.from, parsed.profileName, parsed.messageType, parsed.textBody]
  );
  if (saved.rows.length === 0) return;
  const msgId = saved.rows[0].id;

  let imageData = null, imageMime = null;
  if (parsed.mediaId) {
    try {
      const media = await downloadMedia(parsed.mediaId);
      imageData = media.buffer.toString('base64');
      imageMime = media.mimeType;
      await pool.query(
        `UPDATE whatsapp_messages SET image_data = $1, image_mime = $2 WHERE id = $3`,
        [imageData, imageMime, msgId]
      );
    } catch (e) { console.error('Media download error:', e); }
  }

  if (parsed.locationLat || parsed.locationLng) {
    await pool.query(
      `UPDATE whatsapp_messages SET location_lat = $1, location_lng = $2 WHERE id = $3`,
      [parsed.locationLat, parsed.locationLng, msgId]
    );
  }

  const user = (await pool.query(
    `SELECT id, display_name FROM users WHERE phone LIKE $1 OR phone LIKE $2 LIMIT 1`,
    [`%${parsed.from.slice(-8)}`, `%${parsed.from.slice(-10)}`]
  )).rows[0];
  if (user) {
    await pool.query(`UPDATE whatsapp_messages SET user_id = $1 WHERE id = $2`, [user.id, msgId]);
  }

  let conv = (await pool.query(
    `SELECT * FROM whatsapp_conversations WHERE wa_from = $1 AND status = 'active' ORDER BY last_message_at DESC LIMIT 1`,
    [parsed.from]
  )).rows[0];

  if (!conv) {
    conv = (await pool.query(
      `INSERT INTO whatsapp_conversations (wa_from, bot_name, flow, context) VALUES ($1, $2, 'welcome', $3) RETURNING *`,
      [parsed.from, pickBotName(), JSON.stringify({ is_new: true })]
    )).rows[0];
  }

  await pool.query(`UPDATE whatsapp_messages SET conversation_id = $1 WHERE id = $2`, [conv.id, msgId]);

  await routeFlow(conv, { ...parsed, imageData, imageMime });
}

async function routeFlow(conv, parsed) {
  const flow = conv.flow || 'menu';
  let intent;

  // AI-first in production mode
  if (process.env.WHATSAPP_AI_PRIMARY === 'true' && parsed.messageType === 'text') {
    intent = await detectIntentWithAI(parsed.textBody || '');
  }

  if (!intent) {
    intent = detectIntent(parsed);
  }

  if (flow !== 'menu' && intent === 'human') {
    await setFlow(conv, 'pending_human');
    await sendMessage(conv.wa_from, `🗣 ${conv.bot_name}: Enseguida te conectamos con una persona. Alguien del equipo te va a responder a la brevedad. Gracias por tu paciencia.`);
    return;
  }

  // Don't intercept cancel when already in end_flow or image_confirm — those flows handle it
  if (flow !== 'menu' && flow !== 'end_flow' && !flow.startsWith('image_confirm_') && intent === 'cancel') {
    await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
    return endFlow(conv);
  }

  // Intercept images at welcome/menu level (user sends photo as first message)
  if (intent === 'image_received' && (flow === 'welcome' || flow === 'menu')) {
    return handleImageFromMenu(conv, parsed);
  }

  // Flow abandonment rescue: if user is mid-flow and types reset words or is >60min inactive
  const isActiveFlow = flow !== 'menu' && flow !== 'welcome' && flow !== 'end_flow' && flow !== 'closed' && flow !== 'flow_interrupted';
  if (isActiveFlow) {
    const text = (parsed.textBody || '').toLowerCase().trim();
    const timeElapsed = conv.last_message_at ? Date.now() - new Date(conv.last_message_at).getTime() : 0;
    const isInactive = timeElapsed > 60 * 60 * 1000;
    const resetWords = ['hola', 'menu', 'menú', 'empezar', 'volver', 'inicio', 'principal'];
    if (isInactive || resetWords.includes(text) || /^(hola|menu|menú|empezar|volver)\b/.test(text)) {
      const stepName = stepNames[flow] || 'completar el proceso';
      await setFlow(conv, 'flow_interrupted', { previous_flow: flow, previous_context: conv.context });
      await sendInteractiveButtons(conv.wa_from,
        `⏰ *${conv.bot_name}:* Tenías un proceso sin terminar (${stepName}). ¿Qué querés hacer?`, [
        { id: 'interrupt_continue', title: '▶️ Continuar' },
        { id: 'interrupt_menu', title: '🏠 Menú principal' },
      ]);
      return;
    }
  }

  switch (flow) {
    case 'welcome': return showWelcome(conv);
    case 'menu': return handleMenu(conv, parsed, intent);
    case 'flow_interrupted': return handleFlowInterrupted(conv, parsed);
    case 'report_lost.species': return rlSpecies(conv, parsed);
    case 'report_lost.photo': return rlPhoto(conv, parsed);
    case 'report_lost.location': return rlLocation(conv, parsed);
    case 'report_lost.contact': return rlContact(conv, parsed);
    case 'report_lost.name': return rlName(conv, parsed);
    case 'report_lost.description': return rlDescription(conv, parsed);
    case 'report_lost.confirm': return rlConfirm(conv, parsed, intent);
    case 'report_sighted.photo': return rsPhoto(conv, parsed);
    case 'report_sighted.species': return rsSpecies(conv, parsed);
    case 'report_sighted.location': return rsLocation(conv, parsed);
    case 'report_sighted.details': return rsDetails(conv, parsed);
    case 'report_sighted.contact': return rsContact(conv, parsed);
    case 'report_sighted.confirm': return rsConfirm(conv, parsed, intent);
    case 'report_found.photo': return rfPhoto(conv, parsed);
    case 'report_found.location': return rfLocation(conv, parsed);
    case 'report_found.contact': return rfContact(conv, parsed);
    case 'report_found.confirm': return rfConfirm(conv, parsed, intent);
    case 'report_found.edit': return rfEdit(conv, parsed);
    case 'report_found.edit_location': return rfEditLocation(conv, parsed);
    case 'report_found.edit_contact': return rfEditContact(conv, parsed);
    case 'report_found.edit_description': return rfEditDescription(conv, parsed);
    case 'image_choice': return handleImageChoice(conv, parsed, intent);
    case 'image_confirm_found': return handleImageConfirm(conv, parsed, intent);
    case 'image_confirm_lost': return handleImageConfirm(conv, parsed, intent);
    case 'image_confirm_sighted': return handleImageConfirm(conv, parsed, intent);
    case 'volunteer.name': return vName(conv, parsed);
    case 'volunteer.zone': return vZone(conv, parsed);
    case 'volunteer.has_pets': return vHasPets(conv, parsed);
    case 'volunteer.alerts_optin': return vAlertsOptin(conv, parsed);
    case 'volunteer.phone': return vPhone(conv, parsed);
    case 'volunteer.confirm': return vConfirm(conv, parsed, intent);
    case 'human.motive': return hMotive(conv, parsed);
    case 'human.name': return hName(conv, parsed);
    case 'human.message': return hMessage(conv, parsed);
    case 'human.confirm': return hConfirm(conv, parsed, intent);
    case 'donate.method': return dMethod(conv, parsed);
    case 'chapita.pet_name': return chapitaPetName(conv, parsed);
    case 'chapita.species': return chapitaSpecies(conv, parsed);
    case 'chapita.requester_name': return chapitaRequesterName(conv, parsed);
    case 'chapita.confirm': return chapitaConfirm(conv, parsed, intent);
    case 'adopt.species': return adoptSpecies(conv, parsed);
    case 'register.name': return registerName(conv, parsed);
    case 'register.confirm': return registerConfirm(conv, parsed, intent);
    case 'adopt_post.species': return apSpecies(conv, parsed);
    case 'adopt_post.photo': return apPhoto(conv, parsed);
    case 'adopt_post.location': return apLocation(conv, parsed);
    case 'adopt_post.contact_check': return apContactCheck(conv, parsed);
    case 'adopt_post.contact_ask': return apContactAsk(conv, parsed);
    case 'adopt_post.name': return apName(conv, parsed);
    case 'adopt_post.description': return apDescription(conv, parsed);
    case 'adopt_post.confirm': return apConfirm(conv, parsed, intent);
    case 'info_qr': return showInfoQr(conv);
    case 'report_from_fb.ask_url': return fbAskUrl(conv, parsed);
    case 'report_from_fb.lookup': return fbLookup(conv, parsed);
    case 'report_from_fb.ask_status': return fbAskStatus(conv, parsed);
    case 'report_from_fb.ask_species': return fbAskSpecies(conv, parsed);
    case 'report_from_fb.ask_location': return fbAskLocation(conv, parsed);
    case 'report_from_fb.ask_all': return fbAskAll(conv, parsed);
    case 'report_from_fb.confirm': return fbConfirm(conv, parsed, intent);
    case 'pending_human': return handlePendingHuman(conv);
    case 'end_flow': return handleEndFlow(conv, parsed, intent);
    case 'closed': return showWelcome(conv);
    default: return showMenu(conv);
  }
}

const stepNames = {
  'report_lost.species': 'decir la especie',
  'report_lost.photo': 'enviar una foto',
  'report_lost.location': 'decir la ubicación',
  'report_lost.contact': 'dar un contacto',
  'report_lost.name': 'decir el nombre',
  'report_lost.description': 'dar una descripción',
  'report_lost.confirm': 'confirmar los datos',
  'report_sighted.photo': 'enviar una foto',
  'report_sighted.species': 'decir qué especie viste',
  'report_sighted.location': 'decir dónde lo viste',
  'report_sighted.details': 'dar más detalles',
  'report_sighted.contact': 'dar un contacto',
  'report_sighted.confirm': 'confirmar los datos',
  'report_found.photo': 'enviar una foto',
  'report_found.location': 'decir dónde lo encontraste',
  'report_found.contact': 'dar un contacto',
  'report_found.confirm': 'confirmar los datos',
  'volunteer.name': 'decir tu nombre',
  'volunteer.zone': 'decir tu zona',
  'volunteer.has_pets': 'decir si tenés mascotas',
  'volunteer.alerts_optin': 'decir si querés recibir alertas',
  'volunteer.phone': 'decir tu teléfono',
  'volunteer.confirm': 'confirmar tus datos',
  'human.motive': 'elegir un motivo',
  'human.name': 'decir tu nombre',
  'human.message': 'escribir tu mensaje',
  'human.confirm': 'confirmar los datos',
  'donate.method': 'elegir un método de donación',
  'chapita.pet_name': 'decir el nombre de la mascota',
  'chapita.species': 'decir la especie',
  'chapita.requester_name': 'decir tu nombre',
  'chapita.confirm': 'confirmar los datos',
  'adopt.species': 'decir qué especie querés adoptar',
  'register.name': 'decir tu nombre',
  'register.confirm': 'confirmar el registro',
  'adopt_post.species': 'decir la especie',
  'adopt_post.photo': 'enviar una foto',
  'adopt_post.location': 'decir la ubicación',
  'adopt_post.contact_check': 'confirmar el contacto',
  'adopt_post.contact_ask': 'dar un teléfono de contacto',
  'adopt_post.name': 'decir el nombre',
  'adopt_post.description': 'dar una descripción',
  'adopt_post.confirm': 'confirmar los datos',
  'report_from_fb.ask_url': 'pegar el link de Facebook',
  'report_from_fb.lookup': 'confirmar la publicación',
  'report_from_fb.ask_status': 'indicar el estado',
  'report_from_fb.ask_species': 'decir la especie',
  'report_from_fb.ask_location': 'decir la ubicación',
  'report_from_fb.ask_all': 'completar los datos',
  'report_from_fb.confirm': 'confirmar los datos',
};

async function handleFlowInterrupted(conv, parsed) {
  if (parsed.buttonId === 'interrupt_continue') {
    const prevFlow = conv.context?.previous_flow || 'menu';
    const prevCtx = conv.context?.previous_context || {};
    await setFlow(conv, prevFlow, prevCtx);
    const stepName = stepNames[prevFlow] || 'continuar';
    await sendMessage(conv.wa_from, `👍 *${conv.bot_name}:* Dale, seguimos con el proceso. Estabas por ${stepName}.`);
    return;
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: OK, te llevo al menú principal.`);
  return showMenu(conv);
}

// ─── Welcome (solo primera vez) ───

async function showWelcome(conv) {
  const isRecurring = conv.context?.is_new === false || conv.context?.return_count > 0;
  const nameFromCtx = conv.context?.name || '';

  const greeting = isRecurring
    ? nameFromCtx
      ? `🐾 *${conv.bot_name}:* ¡Hola de nuevo, ${nameFromCtx}! ¿En qué puedo ayudarte hoy?`
      : `🐾 *${conv.bot_name}:* ¡Hola de nuevo! ¿En qué puedo ayudarte hoy?`
    : `🐾 ¡Hola! Soy *${conv.bot_name}*, el asistente virtual de *Sigo Tu Huella*. ¿En qué podemos ayudarte? Tocá "Ver opciones" abajo 👇`;

  await sendMessage(conv.wa_from, greeting);

  const rc = (conv.context?.return_count || 0) + 1;
  await setFlow(conv, 'menu', { is_new: false, return_count: rc });
  return showMenu(conv);
}

// ─── Menu ───

export async function showMenu(conv) {
  try {
    const rows = [
      { id: 'report_lost', title: '📷 Perdí mi mascota' },
      { id: 'report_sighted', title: '👀 Vi una mascota' },
      { id: 'report_found', title: '✅ Encontré una mascota' },
      { id: 'adopt', title: '🙋 Quiero adoptar' },
      { id: 'adopt_post', title: '🐾 Publicar en adopción' },
      { id: 'info_qr', title: 'ℹ️ Chapita QR' },
      { id: 'donate', title: '💰 Donar' },
      { id: 'volunteer', title: '🙌 Ser voluntario' },
      { id: 'report_from_fb', title: '📱 Link Facebook' },
      { id: 'human', title: '🗣 Contactar equipo' },
    ];
    try {
      await sendListMessage(conv.wa_from, '¿En qué podemos ayudarte?', rows, {
        headerText: '🐾 Sigo Tu Huella',
        footerText: 'Red Vecinal de Mascotas',
      });
    } catch (err) {
      console.error('List menu send error, falling back to text instructions:', err.message);
      await setFlow(conv, 'menu');
      await sendMessage(conv.wa_from,
        `📱 ${conv.bot_name}: No pude mostrar el menú interactivo. Escribí lo que necesitás, por ejemplo:\n\n` +
        `• "Perdí mi mascota"\n` +
        `• "Vi una mascota"\n` +
        `• "Encontré una mascota"\n` +
        `• "Quiero adoptar"\n` +
        `• "Publicar en adopción"\n` +
        `• "Chapita QR"\n` +
        `• "Donar"\n` +
        `• "Link Facebook"\n` +
        `• "Contactar equipo"`
      );
    }
  } catch (err) {
    console.error('Menu send error:', err.message);
  }
  await setFlow(conv, 'menu');
}

async function handleMenu(conv, parsed, intent) {
  // Facebook URL detection at menu level
  if (!intent && parsed.messageType === 'text') {
    const fbUrlMatch = (parsed.textBody || '').match(/https?:\/\/(www\.)?(facebook\.com|fb\.com)\/[^\s]+/i);
    if (fbUrlMatch) {
      await setFlow(conv, 'report_from_fb.lookup', { fbUrl: fbUrlMatch[0] });
      return fbLookup(conv, parsed);
    }
  }

  switch (intent) {
    case 'report_lost': return startReportLost(conv);
    case 'report_sighted': return startReportSighted(conv);
    case 'report_found': return startReportFound(conv);
    case 'info_qr': return showInfoQr(conv);
    case 'volunteer': return startVolunteer(conv);
    case 'adopt': return startAdoptFlow(conv);
    case 'adopt_post': return startAdoptPost(conv);
    case 'donate': return startDonateFlow(conv);
    case 'report_from_fb': return startReportFromFb(conv);
    case 'human': return startHumanRequest(conv);
    case 'image_received': return handleImageFromMenu(conv, parsed);
    default:
      return handleUnrecognizedText(conv, parsed);
  }
}

async function handleUnrecognizedText(conv, parsed) {
  const text = (parsed.textBody || '').trim();
  if (!text) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: No entendí tu mensaje. Usá el menú de abajo 👇`);
    return showMenu(conv);
  }

  try {
    const { classifyTextIntent } = await import('./geminiMatching.js');
    const classification = await classifyTextIntent(text);
    if (classification && classification !== 'other' && classification !== 'greeting') {
      const intentMap = {
        lost: 'report_lost', found: 'report_found', sighted: 'report_sighted',
        adopt: 'adopt', volunteer: 'volunteer', donate: 'donate',
        info_qr: 'info_qr', report_from_fb: 'report_from_fb', human: 'human',
      };
      const mappedIntent = intentMap[classification];
      if (mappedIntent) {
        return handleMenu(conv, parsed, mappedIntent);
      }
    }
  } catch (err) {
    console.error('Gemini classification error:', err);
  }

  await sendMessage(conv.wa_from, `${conv.bot_name}: No entendí tu mensaje. Usá el menú interactivo 👇`);
  return showMenu(conv);
}

// ─── Image from Menu ───

async function handleImageFromMenu(conv, parsed) {
  const caption = parsed.textBody || '';
  if (caption || parsed.imageData) {
    const { processImageCaption } = await import('./geminiMatching.js');
    const result = await processImageCaption(caption, parsed.imageData, parsed.imageMime);
    if (result.intent && result.intent !== 'unclear') {
      const labels = { found: 'encontraste', lost: 'se te perdió', sighted: 'viste' };
      await setFlow(conv, `image_confirm_${result.intent}`, {
        photo_data: parsed.imageData,
        photo_mime: parsed.imageMime,
        caption,
        _intent: result.intent,
        _extracted: {
          location: result.location, phone: result.phone, description: result.description,
          species: result.species, gender: result.gender, breed: result.breed,
          color: result.color, name: result.name,
        },
      });
      await sendMessage(conv.wa_from, `${conv.bot_name}: Según tu mensaje, ¿*${labels[result.intent]}* esta mascota?`);
      if (result.intent === 'found') {
        await sendInteractiveButtons(conv.wa_from, '¿La retuviste?', [
          { id: 'confirm_retained', title: '🐾 La retuve' },
          { id: 'confirm_sighted', title: '👀 Solo la vi' },
        ]);
      } else {
        await sendInteractiveButtons(conv.wa_from, 'Confirmar:', [
          { id: 'confirm_yes', title: '✅ Sí' },
          { id: 'confirm_no', title: '❌ No' },
        ]);
      }
      return;
    }
    await sendMessage(conv.wa_from, `${conv.bot_name}: No pude procesar automáticamente tu mensaje.`);
  }
  return showImageTypeChoice(conv, parsed);
}

async function showImageTypeChoice(conv, parsed) {
  await setFlow(conv, 'image_choice', {
    photo_data: parsed.imageData,
    photo_mime: parsed.imageMime,
    caption: parsed.textBody || '',
  });
  await sendMessage(conv.wa_from, `${conv.bot_name}: Recibí tu foto 📸 ¿Qué querés reportar?`);
  await sendInteractiveButtons(conv.wa_from, 'Tipo:', [
    { id: 'report_found', title: '🐾 La encontré' },
    { id: 'report_lost', title: '🐾 Se perdió' },
    { id: 'report_sighted', title: '👀 La vi' },
  ]);
}

async function handleImageChoice(conv, parsed, intent) {
  if (intent === 'report_found') return startReportFound(conv);
  if (intent === 'report_lost') return startReportLost(conv);
  if (intent === 'report_sighted') return startReportSighted(conv);
  return showMenu(conv);
}

async function handleImageConfirm(conv, parsed, intent) {
  const type = conv.flow.replace('image_confirm_', '');
  if (intent === 'confirm') {
    if (type === 'found') {
      if (parsed.buttonId === 'confirm_retained') return startReportFound(conv);
      return startReportSighted(conv);
    }
    const startFn = type === 'lost' ? startReportLost : startReportSighted;
    return startFn(conv);
  }
  return showImageTypeChoice(conv, parsed);
}

// ─── Human / Representante ───

async function startHumanRequest(conv) {
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Sobre qué necesitás hablar con un representante?`);
  await sendInteractiveButtons(conv.wa_from, 'Motivo:', [
    { id: 'h_motive_question', title: '📋 Consulta general' },
    { id: 'h_motive_suggestion', title: '💡 Sugerencia' },
    { id: 'h_motive_problem', title: '⚙️ Problema técnico' },
  ]);
  await setFlow(conv, 'human.motive');
}

async function hMotive(conv, parsed) {
  const motives = {
    h_motive_question: 'Consulta general', h_motive_suggestion: 'Sugerencia',
    h_motive_problem: 'Problema técnico', h_motive_collab: 'Quiero colaborar',
    h_motive_other: 'Otro',
  };
  const motive = motives[parsed.buttonId] || (parsed.textBody || 'Otro');
  await sendMessage(conv.wa_from, `${conv.bot_name}: Decime tu *nombre*:`);
  await setFlow(conv, 'human.name', { motive });
}

async function hName(conv, parsed) {
  const name = (parsed.textBody || '').trim();
  if (!name || name.length < 3) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí tu nombre completo`);
    return;
  }
  await sendMessage(conv.wa_from, `✅ Gracias, ${name.split(' ')[0]}.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: Escribí tu *mensaje* y lo vamos a derivar al equipo:`);
  await setFlow(conv, 'human.message', { ...conv.context, full_name: name });
}

async function hMessage(conv, parsed) {
  const message = (parsed.textBody || '').trim();
  if (!message || message.length < 5) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí un mensaje de al menos 5 caracteres`);
    return;
  }
  await setFlow(conv, 'human.confirm', { ...conv.context, message });
  const ctx = conv.context;
  await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmá tu consulta:
📋 *Motivo:* ${ctx.motive}
👤 *Nombre:* ${ctx.full_name}
💬 *Mensaje:* ${message}

¿Está todo correcto?`);
  await sendInteractiveButtons(conv.wa_from, 'Confirmar:', [
    { id: 'confirm_yes', title: '✅ Sí' },
    { id: 'confirm_no', title: '❌ Cancelar' },
  ]);
}

async function hConfirm(conv, parsed, intent) {
  if (intent === 'confirm') {
    const ctx = conv.context;
    const { sendPushToAdmins } = await import('./notificationService.js');
    sendPushToAdmins({
      title: '🗣 Nuevo mensaje desde WhatsApp',
      body: `${ctx.full_name} · ${ctx.motive}: ${(ctx.message || '').substring(0, 100)}`,
      tag: `whatsapp-contact-${Date.now()}`,
    }).catch(() => {});
    await sendMessage(conv.wa_from,
      `✅ *${conv.bot_name}:* Recibimos tu mensaje. Te vamos a responder a la brevedad.\n\n` +
      `Mientras tanto, si necesitás ayuda urgente con una mascota, usá las opciones del menú principal.`);
    return endFlow(conv);
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
  return endFlow(conv);
}

// ─── Report Lost ───

async function startReportLost(conv) {
  await sendMessage(conv.wa_from, `${conv.bot_name}: Contame, ¿de qué *especie* es la mascota que se perdió?`);
  await sendInteractiveButtons(conv.wa_from, 'Especie:', [
    { id: 'species_dog', title: '🐕 Perro' },
    { id: 'species_cat', title: '🐈 Gato' },
    { id: 'species_other', title: '🐾 Otro' },
  ]);
  await setFlow(conv, 'report_lost.species');
}

async function rlSpecies(conv, parsed) {
  let species;
  if (parsed.buttonId) {
    species = parsed.buttonId === 'species_cat' ? 'cat'
      : parsed.buttonId === 'species_other' ? 'other' : 'dog';
  } else {
    const text = (parsed.textBody || '').toLowerCase();
    species = text.includes('gato') || text.includes('🐈') ? 'cat'
      : text.includes('otro') || text.includes('🐾') ? 'other' : 'dog';
  }
  await sendMessage(conv.wa_from, `✅ Anotado.`);
  if (conv.context?.photo_data) {
    return rlPhoto(conv, {
      messageType: 'image',
      imageData: conv.context.photo_data,
      imageMime: conv.context.photo_mime,
      textBody: conv.context.caption || '',
    });
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: Ahora enviá una *foto* de la mascota 📸`);
  await setFlow(conv, 'report_lost.photo', { species });
}

async function rlPhoto(conv, parsed) {
  const photoData = parsed.imageData || conv.context?.photo_data;
  const photoMime = parsed.imageMime || conv.context?.photo_mime;
  if (!photoData) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor enviá una *foto* de la mascota 📸`);
    return;
  }
  const extracted = conv.context?._extracted;
  if (extracted?.location || extracted?.phone) {
    const ctx = {
      ...conv.context, species: extracted?.species || conv.context?.species || 'dog',
      photo_data: photoData, photo_mime: photoMime || 'image/jpeg',
    };
    if (extracted.gender) ctx.gender = extracted.gender;
    if (extracted.breed) ctx.breed = extracted.breed;
    if (extracted.color) ctx.color = extracted.color;
    if (extracted.name) ctx.pet_name = extracted.name;
    if (extracted.location) {
      ctx.location = extracted.location;
      const coords = await geocodeAddress(extracted.location).catch(() => null);
      if (coords) { ctx.latitude = coords.lat; ctx.longitude = coords.lng; }
      else { ctx.latitude = null; ctx.longitude = null; }
    }
    if (extracted.phone) ctx.contact = extracted.phone;
    if (extracted.phone2) ctx.contact2 = extracted.phone2;
    await sendMessage(conv.wa_from, `✅ Foto recibida.`);
    if (ctx.latitude != null && ctx.longitude != null && ctx.contact) {
      await setFlow(conv, 'report_lost.confirm', ctx);
      const speciesLabel = { dog: 'Perro 🐕', cat: 'Gato 🐈', other: 'Otro 🐾' };
      await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmá los datos:\n\n🐾 *Especie:* ${speciesLabel[ctx.species] || ctx.species}\n📍 *Ubicación:* ${ctx.location}\n📞 *Contacto:* ${ctx.contact}\n\n¿Está todo correcto?`);
      await sendInteractiveButtons(conv.wa_from, 'Confirmar:', [
        { id: 'confirm_yes', title: '✅ Sí, reportar' },
        { id: 'confirm_no', title: '❌ Cancelar' },
      ]);
      return;
    }
    if (!ctx.location) {
      await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde se perdió? Podés escribir la dirección o compartir tu *ubicación* 📍`);
      await setFlow(conv, 'report_lost.location', ctx);
    } else if (ctx.contact && ctx.latitude == null) {
      await sendMessage(conv.wa_from, `📍 Encontré la ubicación: *${ctx.location}*.\n${conv.bot_name}: No pude determinar las coordenadas exactas. ¿Podés compartir tu *ubicación actual* o escribir una dirección más específica? 📍`);
      delete ctx.contact; delete ctx.contact2;
      await setFlow(conv, 'report_lost.location', ctx);
    } else {
      await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Un *teléfono de contacto* para que los dueños puedan comunicarse? 📞`);
      await setFlow(conv, 'report_lost.contact', ctx);
    }
    return;
  }
  await sendMessage(conv.wa_from, `✅ Foto recibida.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde se perdió? Podés escribir la dirección o compartir tu *ubicación* 📍`);
  await setFlow(conv, 'report_lost.location', {
    ...conv.context,
    photo_data: photoData,
    photo_mime: photoMime || 'image/jpeg',
  });
}

async function rlLocation(conv, parsed) {
  const location = parsed.textBody || '';
  let lat = parsed.locationLat || null;
  let lng = parsed.locationLng || null;
  if (!location && !lat) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Decime dónde se perdió o compartí tu ubicación 📍`);
    return;
  }
  if (!lat && location) {
    const coords = await geocodeAddress(location);
    if (coords) { lat = coords.lat; lng = coords.lng; }
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Un *teléfono de contacto* para que los dueños puedan comunicarse? 📞`);
  await setFlow(conv, 'report_lost.contact', { ...conv.context, location, latitude: lat, longitude: lng });
}

async function rlContact(conv, parsed) {
  const phone = parsed.textBody || '';
  if (!phone || phone.length < 5) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí un número de teléfono válido 📞`);
    return;
  }
  await sendMessage(conv.wa_from, `✅ Teléfono registrado.`);
  await sendInteractiveButtons(conv.wa_from, `${conv.bot_name}: ¿Cómo se llama la mascota? (opcional)`, [
    { id: 'skip', title: '⏭ Saltar' },
  ]);
  await setFlow(conv, 'report_lost.name', { ...conv.context, contact: phone });
}

async function rlName(conv, parsed) {
  const text = (parsed.textBody || '').toLowerCase().trim();
  const name = (parsed.buttonId === 'skip' || text === 'saltar' || text === 'no' || text === 'skip') ? '' : parsed.textBody || '';
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Alguna descripción adicional? (color, tamaño, collares, señas — opcional)`);
  await sendInteractiveButtons(conv.wa_from, 'Descripción:', [
    { id: 'skip', title: '⏭ Saltar' },
  ]);
  await setFlow(conv, 'report_lost.description', { ...conv.context, pet_name: name });
}

async function rlDescription(conv, parsed) {
  const text = (parsed.textBody || '').toLowerCase().trim();
  const description = (parsed.buttonId === 'skip' || text === 'saltar' || text === 'no' || text === 'skip') ? '' : parsed.textBody || '';
  await setFlow(conv, 'report_lost.confirm', { ...conv.context, description });
  const ctx = conv.context;
  const speciesLabels = { dog: 'Perro 🐕', cat: 'Gato 🐈', other: 'Otro 🐾' };
  await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmá los datos:

🐾 *Especie:* ${speciesLabels[ctx.species] || ctx.species}
📍 *Ubicación:* ${ctx.location || 'Compartida'}
📞 *Contacto:* ${ctx.contact}
${ctx.pet_name ? `🏷️ *Nombre:* ${ctx.pet_name}` : ''}
${description ? `📝 *Descripción:* ${description}` : ''}

¿Está todo correcto?`);
  await sendInteractiveButtons(conv.wa_from, 'Confirmar:', [
    { id: 'confirm_yes', title: '✅ Sí, reportar' },
    { id: 'confirm_no', title: '❌ Cancelar' },
  ]);
}

async function rlConfirm(conv, parsed, intent) {
  if (intent === 'confirm') {
    const ctx = conv.context;
    const petResult = await pool.query(
      `INSERT INTO pets (name, species, status, location, latitude, longitude, contact_info, contact_info_2, description, gender, breed, color)
       VALUES ($1, $2, 'lost', $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [ctx.pet_name || null, ctx.species || 'dog', ctx.location || '', ctx.latitude, ctx.longitude, ctx.contact || '', ctx.contact2 || null, ctx.description || 'Reportado por WhatsApp como perdida', ctx.gender || null, ctx.breed || null, ctx.color || null]
    );
    const petId = petResult.rows[0].id;
    if (ctx.photo_data) {
      let imageData = ctx.photo_data;
      let originalImageData = null;
      try {
        const { detectAndCropPetFace } = await import('./geminiMatching.js');
        const cropped = await detectAndCropPetFace(ctx.photo_data, ctx.photo_mime);
        if (cropped) { imageData = cropped.cropped; originalImageData = cropped.original; }
      } catch (e) { console.error('Face crop error:', e); }
      await pool.query(`INSERT INTO pet_images (pet_id, image_data, mime_type, original_image_data) VALUES ($1, $2, $3, $4)`, [petId, imageData, ctx.photo_mime || 'image/jpeg', originalImageData]);
    }
    await pool.query(`UPDATE whatsapp_messages SET pet_id = $1, status = 'processed' WHERE conversation_id = $2`, [petId, conv.id]);
    matchWhatsAppToPets(petId).catch(e => console.error('Matching error:', e));
    broadcastPetToGroups(petId).catch(e => console.error('Broadcast error:', e));
    await sendMessage(conv.wa_from, `✅ *${conv.bot_name}:* ¡Reporte creado con éxito! Ya lo publicamos en nuestra red.`);
    await sendMessage(conv.wa_from, `📌 Recordá que también podés pedir una *chapita QR* para tu mascota en:\nhttps://sigotuhuella.online/solicitar-chapita`);
    await endFlow(conv);
  } else {
    await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
    await endFlow(conv);
  }
}

// ─── Report Sighted ───

async function startReportSighted(conv) {
  if (conv.context?.photo_data) {
    return rsPhoto(conv, {
      messageType: 'image',
      imageData: conv.context.photo_data,
      imageMime: conv.context.photo_mime,
      textBody: conv.context.caption || '',
    });
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: Enviá una *foto* de la mascota que viste 📸`);
  await setFlow(conv, 'report_sighted.photo');
}

async function rsPhoto(conv, parsed) {
  const photoData = parsed.imageData || conv.context?.photo_data;
  const photoMime = parsed.imageMime || conv.context?.photo_mime;
  if (!photoData) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor enviá una *foto* de la mascota 📸`);
    return;
  }
  await sendMessage(conv.wa_from, `✅ Foto recibida.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿De qué especie es?`);
  await sendInteractiveButtons(conv.wa_from, 'Especie:', [
    { id: 'rs_species_dog', title: '🐕 Perro' },
    { id: 'rs_species_cat', title: '🐈 Gato' },
    { id: 'rs_species_other', title: '🐾 Otro' },
  ]);
  await setFlow(conv, 'report_sighted.species', {
    ...conv.context,
    photo_data: photoData,
    photo_mime: photoMime || 'image/jpeg',
  });
}

async function rsSpecies(conv, parsed) {
  let species;
  if (parsed.buttonId) {
    species = parsed.buttonId === 'rs_species_cat' ? 'cat'
      : parsed.buttonId === 'rs_species_other' ? 'other' : 'dog';
  } else {
    const text = (parsed.textBody || '').toLowerCase();
    species = text.includes('gato') ? 'cat'
      : text.includes('otro') ? 'other' : 'dog';
  }
  await sendMessage(conv.wa_from, `✅ Anotado.`);
  const extracted = conv.context?._extracted;
  if (extracted?.location) {
    const ctx = { ...conv.context, species, location: extracted.location };
    if (extracted.species) ctx.species = extracted.species;
    if (extracted.gender) ctx.gender = extracted.gender;
    if (extracted.breed) ctx.breed = extracted.breed;
    if (extracted.color) ctx.color = extracted.color;
    if (extracted.name) ctx.pet_name = extracted.name;
    const coords = await geocodeAddress(extracted.location).catch(() => null);
    if (coords) { ctx.latitude = coords.lat; ctx.longitude = coords.lng; }
    else { ctx.latitude = null; ctx.longitude = null; }
    if (extracted.description) ctx.details = extracted.description;
    if (extracted.phone) ctx.contact = extracted.phone;
    if (extracted.phone2) ctx.contact2 = extracted.phone2;
    if (ctx.latitude != null && ctx.longitude != null && ctx.contact) {
      await setFlow(conv, 'report_sighted.confirm', ctx);
      const speciesLabel = { dog: '🐕 Perro', cat: '🐈 Gato', other: '🐾 Otro', unknown: '?' };
      await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmás el reporte de avistaje?\n  🐾 *Especie:* ${speciesLabel[species] || '?'}\n  📍 *Ubicación:* ${ctx.location}\n  ${ctx.details ? `📝 *Detalles:* ${ctx.details}\n  ` : ''}${ctx.contact ? `📞 *Contacto:* ${ctx.contact}` : ''}`);
      await sendInteractiveButtons(conv.wa_from, 'Confirmar:', [
        { id: 'confirm_yes', title: '✅ Sí, reportar' },
        { id: 'confirm_no', title: '❌ Cancelar' },
      ]);
      return;
    }
    if (ctx.contact && ctx.latitude == null) {
      await sendMessage(conv.wa_from, `📍 Encontré la ubicación: *${ctx.location}*.\n${conv.bot_name}: No pude determinar las coordenadas exactas. ¿Podés compartir tu *ubicación actual* o escribir una dirección más específica? 📍`);
      delete ctx.contact; delete ctx.contact2;
      await setFlow(conv, 'report_sighted.location', { ...ctx, species });
      return;
    }
    await sendInteractiveButtons(conv.wa_from, `${conv.bot_name}: ¿Un *teléfono de contacto* por si alguien quiere aportar información? (opcional)`, [
      { id: 'skip', title: '⏭ Saltar' },
    ]);
    await setFlow(conv, 'report_sighted.contact', ctx);
    return;
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde la viste? Podés escribir la dirección o compartir tu *ubicación* 📍`);
  await setFlow(conv, 'report_sighted.location', { ...conv.context, species });
}

async function rsLocation(conv, parsed) {
  const location = parsed.textBody || '';
  let lat = parsed.locationLat || null;
  let lng = parsed.locationLng || null;
  if (!location && !lat) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Decime dónde la viste o compartí tu ubicación 📍`);
    return;
  }
  if (!lat && location) {
    const coords = await geocodeAddress(location);
    if (coords) { lat = coords.lat; lng = coords.lng; }
  }
  await sendInteractiveButtons(conv.wa_from, `${conv.bot_name}: ¿Algún detalle adicional? (color, tamaño, estado físico — opcional)`, [
    { id: 'skip', title: '⏭ Saltar' },
  ]);
  await setFlow(conv, 'report_sighted.details', { ...conv.context, location, latitude: lat, longitude: lng });
}

async function rsDetails(conv, parsed) {
  const text = (parsed.textBody || '').toLowerCase().trim();
  const details = (parsed.buttonId === 'skip' || text === 'saltar' || text === 'no' || text === 'skip') ? '' : parsed.textBody || '';
  await sendInteractiveButtons(conv.wa_from, `${conv.bot_name}: ¿Un *teléfono de contacto* por si alguien quiere aportar información? (opcional)`, [
    { id: 'skip', title: '⏭ Saltar' },
  ]);
  await setFlow(conv, 'report_sighted.contact', { ...conv.context, details });
}

async function rsContact(conv, parsed) {
  const phone = (parsed.textBody || '').toLowerCase().trim();
  const contact = (parsed.buttonId === 'skip' || phone === 'saltar' || phone === 'no' || phone === 'skip') ? '' : parsed.textBody || '';
  await setFlow(conv, 'report_sighted.confirm', { ...conv.context, contact });
  const speciesLabel = { dog: '🐕 Perro', cat: '🐈 Gato', other: '🐾 Otro', unknown: '?' }[conv.context.species || 'unknown'];
  await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmás el reporte de avistaje?
  🐾 *Especie:* ${speciesLabel}
  📍 *Ubicación:* ${conv.context.location || 'Compartida'}
  ${conv.context.details ? `📝 *Detalles:* ${conv.context.details}` : ''}
  ${contact ? `📞 *Contacto:* ${contact}` : ''}`);
  await sendInteractiveButtons(conv.wa_from, 'Confirmar:', [
    { id: 'confirm_yes', title: '✅ Sí, reportar' },
    { id: 'confirm_no', title: '❌ Cancelar' },
  ]);
}

async function rsConfirm(conv, parsed, intent) {
  if (intent === 'confirm') {
    const ctx = conv.context;
    const petResult = await pool.query(
      `INSERT INTO pets (species, status, location, latitude, longitude, contact_info, contact_info_2, description, gender, breed, color)
       VALUES ($1, 'sighted', $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [ctx.species || 'unknown', ctx.location || '', ctx.latitude, ctx.longitude, ctx.contact || '', ctx.contact2 || null, ctx.details ? `Avistaje: ${ctx.details}` : 'Reportado por WhatsApp como avistaje', ctx.gender || null, ctx.breed || null, ctx.color || null]
    );
    const petId = petResult.rows[0].id;
    if (ctx.photo_data) {
      let imageData = ctx.photo_data;
      let originalImageData = null;
      try {
        const { detectAndCropPetFace } = await import('./geminiMatching.js');
        const cropped = await detectAndCropPetFace(ctx.photo_data, ctx.photo_mime);
        if (cropped) { imageData = cropped.cropped; originalImageData = cropped.original; }
      } catch (e) { console.error('Face crop error:', e); }
      await pool.query(`INSERT INTO pet_images (pet_id, image_data, mime_type, original_image_data) VALUES ($1, $2, $3, $4)`, [petId, imageData, ctx.photo_mime || 'image/jpeg', originalImageData]);
    }
    await pool.query(`UPDATE whatsapp_messages SET pet_id = $1, status = 'processed' WHERE conversation_id = $2`, [petId, conv.id]);
    matchWhatsAppToPets(petId).catch(e => console.error('Matching error:', e));
    broadcastPetToGroups(petId).catch(e => console.error('Broadcast error:', e));
    await sendMessage(conv.wa_from, `✅ *${conv.bot_name}:* ¡Reporte de avistaje registrado! Gracias por ayudar.`);
    await endFlow(conv);
  } else {
    await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
    await endFlow(conv);
  }
}

// ─── Report Found ───

async function startReportFound(conv) {
  if (conv.context?.photo_data) {
    return rfPhoto(conv, {
      messageType: 'image',
      imageData: conv.context.photo_data,
      imageMime: conv.context.photo_mime,
      textBody: conv.context.caption || '',
    });
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: Enviá una *foto* de la mascota que encontraste 📸`);
  await setFlow(conv, 'report_found.photo');
}

async function rfPhoto(conv, parsed) {
  const photoData = parsed.imageData || conv.context?.photo_data;
  const photoMime = parsed.imageMime || conv.context?.photo_mime;
  if (!photoData) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor enviá una *foto* de la mascota 📸`);
    return;
  }

  // Use cached extracted data from handleImageFromMenu (UNA sola llamada Gemini)
  const extracted = conv.context?._extracted;
  if (extracted) {
    const ctx = { photo_data: photoData, photo_mime: photoMime || 'image/jpeg' };
    if (extracted.species) ctx.species = extracted.species;
    if (extracted.gender) ctx.gender = extracted.gender;
    if (extracted.breed) ctx.breed = extracted.breed;
    if (extracted.color) ctx.color = extracted.color;
    if (extracted.name) ctx.pet_name = extracted.name;
    if (extracted.location) {
      ctx.location = extracted.location;
      const coords = await geocodeAddress(extracted.location).catch(() => null);
      if (coords) { ctx.latitude = coords.lat; ctx.longitude = coords.lng; }
      else { ctx.latitude = null; ctx.longitude = null; }
    }
    if (extracted.phone) ctx.contact = extracted.phone;
    if (extracted.phone2) ctx.contact2 = extracted.phone2;
    if (extracted.description) ctx.description = extracted.description;

    if (ctx.latitude != null && ctx.longitude != null && ctx.contact) {
      await setFlow(conv, 'report_found.confirm', ctx);
      return rfShowConfirm(conv);
    }
    await setFlow(conv, 'report_found.location', ctx);
    if (!ctx.location) {
      await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde está ahora la mascota? 📍`);
    } else if (ctx.contact && ctx.latitude == null) {
      await sendMessage(conv.wa_from, `📍 Encontré la ubicación: *${ctx.location}*.\n${conv.bot_name}: No pude determinar las coordenadas exactas. ¿Podés compartir tu *ubicación actual* o escribir una dirección más específica? 📍`);
      delete ctx.contact; delete ctx.contact2;
      await setFlow(conv, 'report_found.location', ctx);
    } else {
      await sendMessage(conv.wa_from, `✅ Encontré la ubicación: ${ctx.location}.\n${conv.bot_name}: Dejame un *teléfono de contacto* 📞`);
      await setFlow(conv, 'report_found.contact', ctx);
    }
    return;
  }

  // No cached data: try Gemini if there's a caption (e.g., user chose "found" from buttons with caption)
  const caption = parsed.textBody || conv.context?.caption || '';
  if (caption) {
    await sendMessage(conv.wa_from, `📸 Foto recibida. Estoy leyendo la descripción... 🔍`);
    try {
      const { processImageCaption } = await import('./geminiMatching.js');
      const result = await processImageCaption(caption);
      const ctx = { photo_data: photoData, photo_mime: photoMime || 'image/jpeg' };
      if (result.species) ctx.species = result.species;
      if (result.gender) ctx.gender = result.gender;
      if (result.breed) ctx.breed = result.breed;
      if (result.color) ctx.color = result.color;
      if (result.name) ctx.pet_name = result.name;
      if (result.location) {
        ctx.location = result.location;
        const coords = await geocodeAddress(result.location).catch(() => null);
        if (coords) { ctx.latitude = coords.lat; ctx.longitude = coords.lng; }
        else { ctx.latitude = null; ctx.longitude = null; }
      }
      if (result.phone) ctx.contact = result.phone;
      if (result.phone2) ctx.contact2 = result.phone2;
      if (result.description) ctx.description = result.description;

      if (ctx.latitude != null && ctx.longitude != null && ctx.contact) {
        await setFlow(conv, 'report_found.confirm', ctx);
        return rfShowConfirm(conv);
      }
      if (!ctx.location && !ctx.contact) {
        await setFlow(conv, 'report_found.location', ctx);
        await sendMessage(conv.wa_from, `${conv.bot_name}: No encontré ni ubicación ni teléfono en tu mensaje. Vamos paso a paso:`);
        await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde está ahora la mascota? 📍`);
      } else if (!ctx.contact) {
        await setFlow(conv, 'report_found.contact', ctx);
        await sendMessage(conv.wa_from, `✅ Encontré la ubicación: ${ctx.location}.`);
        await sendMessage(conv.wa_from, `${conv.bot_name}: Dejame un *teléfono de contacto* 📞`);
      } else if (ctx.latitude == null) {
        delete ctx.contact; delete ctx.contact2;
        await setFlow(conv, 'report_found.location', ctx);
        await sendMessage(conv.wa_from, `📍 Encontré la ubicación: *${ctx.location}*.\n${conv.bot_name}: No pude determinar las coordenadas exactas. ¿Podés compartir tu *ubicación actual* o escribir una dirección más específica? 📍`);
      } else {
        await setFlow(conv, 'report_found.location', ctx);
        await sendMessage(conv.wa_from, `✅ Encontré el teléfono: ${ctx.contact}.`);
        await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde está ahora la mascota? 📍`);
      }
      return;
    } catch (err) {
      console.error('Extraction error:', err);
    }
  }

  await sendMessage(conv.wa_from, `✅ Foto recibida.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde está ahora la mascota? 📍`);
  await setFlow(conv, 'report_found.location', {
    photo_data: photoData,
    photo_mime: photoMime || 'image/jpeg',
  });
}

async function rfLocation(conv, parsed) {
  const location = parsed.textBody || '';
  let lat = parsed.locationLat || null;
  let lng = parsed.locationLng || null;
  if (!location && !lat) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Decime dónde está la mascota o compartí tu ubicación 📍`);
    return;
  }
  if (!lat && location) {
    const coords = await geocodeAddress(location);
    if (coords) { lat = coords.lat; lng = coords.lng; }
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: Dejame un *teléfono de contacto* para que el dueño pueda comunicarse 📞`);
  await setFlow(conv, 'report_found.contact', { ...conv.context, location, latitude: lat, longitude: lng });
}

async function rfContact(conv, parsed) {
  const phone = parsed.textBody || '';
  if (!phone || phone.length < 5) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí un número de teléfono válido 📞`);
    return;
  }
  await setFlow(conv, 'report_found.confirm', { ...conv.context, contact: phone });
  return rfShowConfirm(conv);
}

async function rfShowConfirm(conv) {
  const ctx = conv.context;
  await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmás que encontraste esta mascota?
📍 *Ubicación:* ${ctx.location || 'Compartida'}
📞 *Contacto:* ${ctx.contact || 'No especificado'}${ctx.description ? `\n📝 *Notas:* ${ctx.description}` : ''}`);
  await sendInteractiveButtons(conv.wa_from, 'Confirmar:', [
    { id: 'confirm_yes', title: '✅ Sí, publicar' },
    { id: 'confirm_edit', title: '✏️ Corregir' },
    { id: 'confirm_no', title: '❌ Cancelar' },
  ]);
}

async function rfConfirm(conv, parsed, intent) {
  if (intent === 'confirm') {
    const ctx = conv.context;
    const description = ctx.description || 'Reportado por WhatsApp como encontrada';
    const petResult = await pool.query(
      `INSERT INTO pets (species, status, location, latitude, longitude, contact_info, contact_info_2, description, gender, breed, color)
       VALUES ($1, 'retained', $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [ctx.species || 'unknown', ctx.location || '', ctx.latitude, ctx.longitude, ctx.contact || '', ctx.contact2 || null, description, ctx.gender || null, ctx.breed || null, ctx.color || null]
    );
    const petId = petResult.rows[0].id;
    if (ctx.photo_data) {
      let imageData = ctx.photo_data;
      let originalImageData = null;
      try {
        const { detectAndCropPetFace } = await import('./geminiMatching.js');
        const cropped = await detectAndCropPetFace(ctx.photo_data, ctx.photo_mime);
        if (cropped) { imageData = cropped.cropped; originalImageData = cropped.original; }
      } catch (e) { console.error('Face crop error:', e); }
      await pool.query(`INSERT INTO pet_images (pet_id, image_data, mime_type, original_image_data) VALUES ($1, $2, $3, $4)`, [petId, imageData, ctx.photo_mime || 'image/jpeg', originalImageData]);
    }
    await pool.query(`UPDATE whatsapp_messages SET pet_id = $1, status = 'processed' WHERE conversation_id = $2`, [petId, conv.id]);
    matchWhatsAppToPets(petId).catch(e => console.error('Matching error:', e));
    broadcastPetToGroups(petId).catch(e => console.error('Broadcast error:', e));
    await sendMessage(conv.wa_from, `✅ *${conv.bot_name}:* ¡Reporte de mascota encontrada registrado! Ya visibilizamos la info para encontrar a su dueño.`);
    await sendMessage(conv.wa_from, `🙏 ¡Gracias por tu ayuda!`);
    await endFlow(conv);
  } else if (intent === 'edit') {
    await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Qué querés corregir?`);
    await sendInteractiveButtons(conv.wa_from, 'Corregir:', [
      { id: 'edit_location', title: '📍 Ubicación' },
      { id: 'edit_contact', title: '📞 Contacto' },
      { id: 'edit_description', title: '📝 Notas' },
    ]);
    await setFlow(conv, 'report_found.edit');
  } else {
    await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
    await endFlow(conv);
  }
}

async function rfEdit(conv, parsed) {
  if (parsed.buttonId === 'edit_location') {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Decime la *ubicación* correcta 📍`);
    await setFlow(conv, 'report_found.edit_location');
  } else if (parsed.buttonId === 'edit_contact') {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Decime el *teléfono* correcto 📞`);
    await setFlow(conv, 'report_found.edit_contact');
  } else if (parsed.buttonId === 'edit_description') {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Decime las *notas* adicionales 📝`);
    await setFlow(conv, 'report_found.edit_description');
  } else {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Elegí una opción de los botones 👇`);
    await setFlow(conv, 'report_found.edit');
    await sendInteractiveButtons(conv.wa_from, 'Corregir:', [
      { id: 'edit_location', title: '📍 Ubicación' },
      { id: 'edit_contact', title: '📞 Contacto' },
      { id: 'edit_description', title: '📝 Notas' },
    ]);
  }
}

async function rfEditLocation(conv, parsed) {
  const location = parsed.textBody || '';
  if (!location) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí la ubicación 📍`);
    return;
  }
  const coords = await geocodeAddress(location).catch(() => null);
  await setFlow(conv, 'report_found.confirm', {
    ...conv.context,
    location,
    latitude: coords?.lat || null,
    longitude: coords?.lng || null,
  });
  return rfShowConfirm(conv);
}

async function rfEditContact(conv, parsed) {
  const phone = parsed.textBody || '';
  if (!phone || phone.length < 5) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí un número de teléfono válido 📞`);
    return;
  }
  await setFlow(conv, 'report_found.confirm', { ...conv.context, contact: phone });
  return rfShowConfirm(conv);
}

async function rfEditDescription(conv, parsed) {
  const desc = parsed.textBody || '';
  await setFlow(conv, 'report_found.confirm', { ...conv.context, description: desc });
  return rfShowConfirm(conv);
}

// ─── Info QR ───

async function showInfoQr(conv) {
  await sendMessage(conv.wa_from, `${conv.bot_name}: La *chapita QR* de Sigo Tu Huella es una identificación digital para tu mascota.

🔹 *¿Cómo funciona?*
1. Pedís la chapita en nuestra web
2. La adherís al collar de tu mascota
3. Si alguien la encuentra, escanea el QR y ve tus datos de contacto

🔹 *Ventajas:*
• Sin números grabados (seguro para tu mascota)
• Podés actualizar tus datos en cualquier momento
• Sin cuotas ni renovaciones`);
  await sendInteractiveButtons(conv.wa_from, '¿Querés solicitar una chapita QR?', [
    { id: 'chapita_yes', title: '✅ Sí, quiero pedirla' },
    { id: 'chapita_no', title: '❌ No, volver al menú' },
  ]);
  await setFlow(conv, 'chapita.pet_name');
}

async function chapitaPetName(conv, parsed) {
  if (parsed.buttonId === 'chapita_no') {
    return showMenu(conv);
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Cómo se llama tu mascota?`);
  await setFlow(conv, 'chapita.species');
}

async function chapitaSpecies(conv, parsed) {
  const petName = (parsed.textBody || '').trim();
  if (!petName) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor decime el nombre de tu mascota`);
    return;
  }
  await sendInteractiveButtons(conv.wa_from, `${conv.bot_name}: ¿Qué especie es?`, [
    { id: 'species_dog', title: '🐕 Perro' },
    { id: 'species_cat', title: '🐈 Gato' },
    { id: 'species_other', title: '🐾 Otro' },
  ]);
  await setFlow(conv, 'chapita.requester_name', { pet_name: petName });
}

async function chapitaRequesterName(conv, parsed) {
  let species;
  if (parsed.buttonId) {
    species = parsed.buttonId === 'species_cat' ? 'cat' : parsed.buttonId === 'species_other' ? 'other' : 'dog';
  } else {
    const text = (parsed.textBody || '').toLowerCase();
    species = text.includes('gato') ? 'cat' : text.includes('otro') ? 'other' : 'dog';
  }
  await sendMessage(conv.wa_from, `✅ Anotado.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Tu *nombre* para el pedido?`);
  await setFlow(conv, 'chapita.confirm', { ...conv.context, species });
}

async function chapitaConfirm(conv, parsed, intent) {
  const requesterName = (parsed.textBody || '').trim();
  if (!requesterName || requesterName.length < 3) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí tu nombre completo`);
    return;
  }
  const ctx = conv.context;
  await pool.query(
    `INSERT INTO whatsapp_chapita_requests (wa_from, pet_name, species, requester_name) VALUES ($1, $2, $3, $4)`,
    [conv.wa_from, ctx.pet_name, ctx.species, requesterName]
  );
  const speciesLabel = { dog: 'perro 🐕', cat: 'gato 🐈', other: 'otro 🐾' }[ctx.species] || ctx.species;
  await sendMessage(conv.wa_from,
    `✅ *${conv.bot_name}:* ¡Solicitud recibida!\n\n` +
    `Te pedimos una chapita QR para *${ctx.pet_name}* (${speciesLabel}).\n` +
    `Te vamos a notificar por este chat cuando esté lista para retirar. 🐾`);
  await endFlow(conv);
}

// ─── Volunteer ───

async function startVolunteer(conv) {
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¡Gracias por querer sumarte! 🙌`);
  await sendInteractiveButtons(conv.wa_from, '¿Vivís en la zona?', [
    { id: 'v_zone_sicardi', title: '📍 Sicardi' },
    { id: 'v_zone_garibaldi', title: '📍 Garibaldi' },
    { id: 'v_zone_other', title: '📍 Otra' },
  ]);
  await setFlow(conv, 'volunteer.zone');
}

async function vZone(conv, parsed) {
  const zones = {
    v_zone_sicardi: 'Sicardi', v_zone_garibaldi: 'Garibaldi',
    v_zone_correas: 'Correas', v_zone_near: 'Zonas cercanas', v_zone_other: 'Otra',
  };
  let zone;
  if (parsed.buttonId && zones[parsed.buttonId]) {
    zone = zones[parsed.buttonId];
  } else {
    zone = (parsed.textBody || '').trim() || 'Otra';
  }
  await sendMessage(conv.wa_from, `✅ Zona registrada.`);
  await sendInteractiveButtons(conv.wa_from, `${conv.bot_name}: ¿Tenés mascotas?`, [
    { id: 'v_pets_dog', title: '🐕 Perro/s' },
    { id: 'v_pets_cat', title: '🐱 Gato/s' },
    { id: 'v_pets_both', title: '🐾 Ambos' },
  ]);
  await setFlow(conv, 'volunteer.has_pets', { zone });
}

async function vHasPets(conv, parsed) {
  const hasPetsMap = {
    v_pets_dog: 'dog', v_pets_cat: 'cat', v_pets_both: 'both', v_pets_none: 'none',
  };
  let hasPets;
  if (parsed.buttonId && hasPetsMap[parsed.buttonId]) {
    hasPets = hasPetsMap[parsed.buttonId];
  } else {
    const text = (parsed.textBody || '').toLowerCase();
    hasPets = text.includes('perro') && text.includes('gato') ? 'both'
      : text.includes('gato') ? 'cat'
      : text.includes('perro') ? 'dog' : 'none';
  }
  await sendMessage(conv.wa_from, `✅ Anotado.`);
  await sendInteractiveButtons(conv.wa_from, `${conv.bot_name}: ¿Querés recibir *alertas* de mascotas perdidas en tu zona?`, [
    { id: 'v_alerts_yes', title: '✅ Sí' },
    { id: 'v_alerts_no', title: '❌ No' },
  ]);
  await setFlow(conv, 'volunteer.alerts_optin', { ...conv.context, has_pets: hasPets });
}

async function vAlertsOptin(conv, parsed) {
  const alertsOptin = parsed.buttonId === 'v_alerts_yes' || (parsed.textBody || '').toLowerCase().includes('sí');
  await sendMessage(conv.wa_from, `✅ Preferencia guardada.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: Decime tu *nombre completo*:`);
  await setFlow(conv, 'volunteer.name', { ...conv.context, alerts_optin: alertsOptin });
}

async function vName(conv, parsed) {
  const name = (parsed.textBody || '').trim();
  if (!name || name.length < 3) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí tu nombre completo`);
    return;
  }
  await sendMessage(conv.wa_from, `✅ Gracias ${name.split(' ')[0]}.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Tu *número de WhatsApp* para que podamos contactarte? 📞`);
  await setFlow(conv, 'volunteer.phone', { ...conv.context, full_name: name });
}

async function vPhone(conv, parsed) {
  const phone = (parsed.textBody || '').trim();
  if (!phone || phone.length < 5) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí un número de teléfono válido 📞`);
    return;
  }
  await setFlow(conv, 'volunteer.confirm', { ...conv.context, phone });
  const ctx = conv.context;
  const hasPetsLabel = { dog: 'Perro/s 🐕', cat: 'Gato/s 🐱', both: 'Perro y gato 🐾', none: 'No tengo' };
  await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmá tus datos:
👤 *Nombre:* ${ctx.full_name}
📍 *Zona:* ${ctx.zone}
🐾 *Mascotas:* ${hasPetsLabel[ctx.has_pets] || ctx.has_pets}
🔔 *Alertas:* ${ctx.alerts_optin ? '✅ Sí' : '❌ No'}
📞 *WhatsApp:* ${phone}

¿Está todo correcto?`);
  await sendInteractiveButtons(conv.wa_from, 'Confirmar:', [
    { id: 'confirm_yes', title: '✅ Sí' },
    { id: 'confirm_no', title: '❌ Cancelar' },
  ]);
}

async function vConfirm(conv, parsed, intent) {
  if (intent === 'confirm') {
    const ctx = conv.context;
    await pool.query(
      `INSERT INTO volunteer_requests (whatsapp, full_name, residence_zone, status) VALUES ($1, $2, $3, 'pending')`,
      [ctx.phone, ctx.full_name, ctx.zone]
    );
    if (ctx.alerts_optin) {
      await pool.query(
        `INSERT INTO whatsapp_groups (name, group_id, is_active) VALUES ($1, $2, TRUE) ON CONFLICT (group_id) DO NOTHING`,
        [`Voluntario ${conv.wa_from}`, conv.wa_from]
      );
    }
    await sendMessage(conv.wa_from, `✅ *${conv.bot_name}:* ¡Gracias por sumarte! Ya recibimos tu solicitud. El equipo de Sigo Tu Huella se va a comunicar con vos. 🐾`);
    await endFlow(conv);
  } else {
    await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
    await endFlow(conv);
  }
}

// ─── Adopt ───

async function startAdoptFlow(conv) {
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¡Qué lindo que quieras adoptar! 🐾`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Qué especie estás buscando?`);
  await sendInteractiveButtons(conv.wa_from, 'Especie:', [
    { id: 'species_dog', title: '🐕 Perro' },
    { id: 'species_cat', title: '🐈 Gato' },
    { id: 'species_other', title: '🐾 Otros' },
  ]);
  await setFlow(conv, 'adopt.species');
}

async function adoptSpecies(conv, parsed) {
  let species;
  if (parsed.buttonId) {
    species = parsed.buttonId === 'species_cat' ? 'cat'
      : parsed.buttonId === 'species_other' ? 'other' : 'dog';
  } else {
    const text = (parsed.textBody || '').toLowerCase();
    species = text.includes('gato') || text.includes('🐈') ? 'cat'
      : text.includes('otro') || text.includes('🐾') ? 'other' : 'dog';
  }

  const pets = (await pool.query(
    `SELECT p.id, p.name, p.description, p.species, pi.image_data, pi.mime_type
     FROM pets p
     LEFT JOIN LATERAL (SELECT image_data, mime_type FROM pet_images WHERE pet_id = p.id LIMIT 1) pi ON true
     WHERE p.status = 'for_adoption' AND p.species = $1
     ORDER BY p.created_at DESC
     LIMIT 3`,
    [species]
  )).rows;

  if (pets.length === 0) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: No tenemos mascotas en adopción de esa especie en este momento.`);
    return endFlow(conv);
  }

  await sendMessage(conv.wa_from, `${conv.bot_name}: Estas son las mascotas disponibles:`);

  for (const pet of pets) {
    let info = `🐾 *${pet.name || 'Sin nombre'}*`;
    if (pet.description) info += `\n📝 ${pet.description}`;
    info += `\n🔗 Ver más: https://sigotuhuella.online/pet/${pet.id}`;

    if (pet.image_data) {
      try {
        const mediaId = await uploadMedia(pet.image_data, pet.mime_type || 'image/jpeg');
        await sendImage(conv.wa_from, mediaId, pet.name || 'Mascota en adopción');
      } catch (e) {
        console.error('Upload media error:', e);
      }
    }
    await sendMessage(conv.wa_from, info);
  }

  const more = (await pool.query(
    `SELECT COUNT(*) FROM pets WHERE status = 'for_adoption' AND species = $1`,
    [species]
  )).rows[0].count;

  if (Number(more) > 3) {
    await sendMessage(conv.wa_from, `Hay más mascotas disponibles. Visitá nuestra web para verlas todas: https://sigotuhuella.online`);
  }

  await sendMessage(conv.wa_from, `${conv.bot_name}: Si te interesa alguna, pedila desde la web o hablá con nuestro equipo. 🐾`);
  return endFlow(conv);
}

// ─── Donate ───

async function startDonateFlow(conv) {
  await sendMessage(conv.wa_from,
    `${conv.bot_name}: ¡Gracias por querer ayudar! 🙌\n\n` +
    `Cada donación se destina a:\n` +
    `🐾 Atención veterinaria\n` +
    `🍖 Alimento para rescatados\n` +
    `🏠 Refugio transitorio`);
  await sendInteractiveButtons(conv.wa_from, '¿Cómo querés donar?', [
    { id: 'd_method_transfer', title: '🏦 Transferencia' },
    { id: 'd_method_mp', title: '💳 Mercado Pago' },
    { id: 'd_method_share', title: '📲 Compartir' },
  ]);
  await setFlow(conv, 'donate.method');
}

async function dMethod(conv, parsed) {
  const method = parsed.buttonId || '';
  if (method === 'd_method_share') {
    const shareText = encodeURIComponent(
      '🐾 Ayudame a ayudar a Sigo Tu Huella!\nCualquier donación ayuda para alimentos, atención veterinaria y refugio.\n\nhttps://sigotuhuella.online/donar'
    );
    await sendMessage(conv.wa_from,
      `${conv.bot_name}: Compartí este mensaje con tus contactos 📲\n\nhttps://wa.me/?text=${shareText}`);
    return endFlow(conv);
  }

  const accounts = (await pool.query('SELECT * FROM collaboration_accounts ORDER BY display_order ASC, bank_name ASC')).rows;

  if (method === 'd_method_mp' || method === 'd_method_transfer') {
    if (method === 'd_method_transfer') {
      const transferAccounts = accounts.filter(a => a.cbu || a.alias);
      if (transferAccounts.length > 0) {
        await sendMessage(conv.wa_from,
          `${conv.bot_name}: Podés hacer tu *transferencia* a:\n\n` +
          transferAccounts.map(a =>
            `🏦 *${a.bank_name}*\nAlias: ${a.alias || '-'}\nCBU: ${a.cbu || '-'}${a.cvu ? '\nCVU: ' + a.cvu : ''}`
          ).join('\n\n'));
      } else {
        await sendMessage(conv.wa_from, `${conv.bot_name}: No hay cuentas bancarias registradas. Consultanos por Mercado Pago.`);
      }
    } else {
      const mpAccount = accounts.find(a => a.mercadopago_link);
      if (mpAccount) {
        await sendMessage(conv.wa_from, `${conv.bot_name}: Podés donar por *Mercado Pago*:\n\n💳 ${mpAccount.mercadopago_link}`);
      } else {
        await sendMessage(conv.wa_from, `${conv.bot_name}: No hay link de Mercado Pago registrado. Consultanos por transferencia bancaria.`);
      }
    }
  }

  await sendMessage(conv.wa_from,
    `🙌 *${conv.bot_name}:* ¡Gracias por tu generosidad!\n\n` +
    `Cada aporte, por pequeño que sea, ayuda a mantener la red activa.`);
  return endFlow(conv);
}

// ─── Facebook URL Report ───

async function tryDownload(url) {
  try {
    const { data, headers } = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.facebook.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 15000,
      maxRedirects: 5,
    });
    const ct = headers['content-type'] || '';
    if (ct.startsWith('image/')) {
      const buf = Buffer.from(data);
      return { data: buf.toString('base64'), mimeType: ct };
    }
    console.log(`downloadImage: non-image (${ct}) for ${url.slice(0, 80)}`);
    return null;
  } catch (e) {
    console.log(`downloadImage: axios error ${e.message} for ${url.slice(0, 80)}`);
    return null;
  }
}

async function downloadImage(url, fbPostId) {
  if (url) {
    console.log(`downloadImage: trying URL ${url.slice(0, 80)}`);
    const result = await tryDownload(url);
    if (result) return { ...result, externalUrl: null };
  }

  if (url && url.includes('facebook.com/photo')) {
    try {
      const photoId = new URL(url).searchParams.get('fbid');
      if (photoId) {
        console.log(`downloadImage: trying public CDN for photo ${photoId}`);
        const cdnResult = await tryDownload(`https://graph.facebook.com/${photoId}/picture?type=normal`);
        if (cdnResult) return { ...cdnResult, externalUrl: null };
      }
    } catch (e) {
      console.log(`downloadImage: public CDN error: ${e.message}`);
    }
  }

  if (fbPostId) {
    console.log(`downloadImage: trying Graph API for post ${fbPostId}`);
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (appId && appSecret) {
      const appToken = `${appId}|${appSecret}`;
      try {
        const postResp = await axios.get(
          `https://graph.facebook.com/v22.0/${fbPostId}?fields=full_picture&access_token=${appToken}`,
          { timeout: 10000 }
        );
        if (postResp.data?.full_picture) {
          console.log(`downloadImage: Graph API full_picture ${postResp.data.full_picture.slice(0, 80)}`);
          const result = await tryDownload(postResp.data.full_picture);
          if (result) return { ...result, externalUrl: null };
        }
      } catch (e) {
        console.log('downloadImage: Graph API full_picture error:', e.message);
      }
    }
  }

  if (url && url.includes('facebook.com/photo')) {
    console.log(`downloadImage: extracting photo ID from URL`);
    try {
      const photoId = new URL(url).searchParams.get('fbid');
      if (photoId && process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
        const appToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
        const photoResp = await axios.get(
          `https://graph.facebook.com/v22.0/${photoId}?fields=images&access_token=${appToken}`,
          { timeout: 10000 }
        );
        if (photoResp.data?.images) {
          const sources = photoResp.data.images.map(i => i.source).filter(Boolean);
          for (const src of sources) {
            const result = await tryDownload(src);
            if (result) return { ...result, externalUrl: null };
          }
        }
      }
    } catch (e) {
      console.log('downloadImage: photo page error:', e.message);
    }
  }

  if (url) {
    console.log(`downloadImage: all download attempts failed, storing external URL`);
    return { data: null, mimeType: null, externalUrl: url };
  }

  console.log(`downloadImage: ALL FAILED (no URL to fallback to)`);
  return null;
}

async function fbContinue(conv) {
  const ctx = conv.context;
  const post = ctx.fbPost;
  if (!post) return showMenu(conv);

  const statusKnown = post.classification && post.classification !== 'unclassified';
  const speciesKnown = post.species;
  const locationKnown = post.location_hint;

  console.log('fbContinue state:', JSON.stringify({ statusKnown, speciesKnown, locationKnown, classification: post.classification, species: post.species, id: post.id }));

  // Try Gemini whenever any field is missing
  if (!statusKnown || !speciesKnown || !locationKnown) {
    const hasTriedGemini = post._geminiTried;
    if (!hasTriedGemini) {
      post._geminiTried = true;

      try {
        const gemini = await classifyPost(post.content, [], [], []);
        console.log('fbContinue: Gemini returned', JSON.stringify({ classification: gemini?.classification, species: gemini?.species, location: gemini?.location_hint, confidence: gemini?.confidence }));
        if (gemini && gemini.confidence >= 50 && gemini.classification !== 'other' && gemini.classification !== 'unclassified' && gemini.classification !== 'unknown') {
          const petStatus = gemini.classification === 'found' ? 'retained'
            : gemini.classification === 'sighting' ? 'sighted'
            : gemini.classification === 'reunion' ? 'retained'
            : gemini.classification;
          if (!statusKnown) post.classification = petStatus;
          if (!post.species && gemini.species) post.species = gemini.species;
          if (!post.location_hint && gemini.location_hint) post.location_hint = gemini.location_hint;
          if (!post.name && gemini.name) post.name = gemini.name;
          if (!post.breed && gemini.breed) post.breed = gemini.breed;
          if (!post.gender && gemini.gender) post.gender = gemini.gender;
          if (!post.color && gemini.color) post.color = gemini.color;
          if (!post.phone && gemini.phone) post.phone = gemini.phone;
          if (post.id) {
            await pool.query(
              `UPDATE facebook_posts SET classification = COALESCE(NULLIF(classification, 'unclassified'), $1), species = COALESCE(NULLIF(species, ''), $2), location_hint = COALESCE(NULLIF(location_hint, ''), $3), color = COALESCE(NULLIF(color, ''), $4), phone = COALESCE(NULLIF(phone, ''), $5) WHERE id = $6`,
              [petStatus, gemini.species || '', gemini.location_hint || '', gemini.color || '', gemini.phone || '', post.id]
            ).catch(e => console.error('fbContinue: DB update error:', e.message));
          }
        }
        // Si no se detectó especie pero hay fotos, marcar como no especificado
        if (!post.species && post.image_urls && post.image_urls.length > 0) {
          post.species = 'unknown';
        }
      } catch (err) {
        console.error('fbContinue: Gemini error:', err.message);
      }
    }
  }

  // Re-evaluate after Gemini
  const nowKnown = {
    status: post.classification && post.classification !== 'unclassified',
    species: !!post.species,
    location: !!post.location_hint,
  };

  if (nowKnown.status && nowKnown.species && nowKnown.location) {
    return fbShowConfirm(conv);
  }

  // If ALL 3 are unknown, ask all at once
  if (!nowKnown.status && !nowKnown.species && !nowKnown.location) {
    await sendMessage(conv.wa_from,
      `${conv.bot_name}: No pude clasificar la publicación automáticamente. ` +
      `Decime: ¿qué especie es? ¿está perdida, avistada o encontrada? ¿ubicación?\n\n` +
      `Ej: "perro perdido en Plaza Libertad 13 y 670"`);
    await setFlow(conv, 'report_from_fb.ask_all');
    return;
  }

  if (!nowKnown.status) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Qué tipo de reporte querés crear?`);
    await sendInteractiveButtons(conv.wa_from, 'Tipo:', [
      { id: 'fb_status_lost', title: '🐕 Perdida' },
      { id: 'fb_status_sighted', title: '👀 Avistada' },
      { id: 'fb_status_found', title: '✅ Encontrada' },
    ]);
    await setFlow(conv, 'report_from_fb.ask_status');
    return;
  }
  if (!nowKnown.species) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: ¿De qué especie es?`);
    await sendInteractiveButtons(conv.wa_from, 'Especie:', [
      { id: 'species_dog', title: '🐕 Perro' },
      { id: 'species_cat', title: '🐈 Gato' },
      { id: 'species_other', title: '🐾 Otro' },
    ]);
    await setFlow(conv, 'report_from_fb.ask_species');
    return;
  }
  if (!nowKnown.location) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde fue? Podés escribir la dirección o compartir tu ubicación 📍`);
    await setFlow(conv, 'report_from_fb.ask_location');
    return;
  }
  return fbShowConfirm(conv);
}

async function startReportFromFb(conv) {
  await sendMessage(conv.wa_from, `${conv.bot_name}: Enviamé el link de la publicación de Facebook 📱`);
  await setFlow(conv, 'report_from_fb.ask_url');
}

async function fbAskUrl(conv, parsed) {
  const text = (parsed.textBody || '').trim();
  const match = text.match(/https?:\/\/(www\.)?(facebook\.com|fb\.com)\/[^\s]+/i);
  if (!match) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Eso no parece un link de Facebook. Pegá el link completo 📱`);
    return;
  }
  await setFlow(conv, 'report_from_fb.lookup', { ...conv.context, fbUrl: match[0] });
  return fbLookup(conv, parsed);
}

async function fbLookup(conv, parsed) {
  const fbUrl = conv.context.fbUrl || '';
  const segments = fbUrl.replace(/\/+$/, '').split('/');
  const urlId = segments[segments.length - 1];

  const result = await pool.query(
    `SELECT * FROM facebook_posts
     WHERE fb_post_url ILIKE $1 OR fb_post_id ILIKE $1
     LIMIT 1`,
    [`%${urlId}%`]
  );

  if (result.rows.length === 0) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: No encontré la publicación en nuestro sistema. Voy a buscarla directamente a Facebook... 🔍`);

    let fbPostData;
    try {
      fbPostData = await fetchFbPost(fbUrl);
    } catch (err) {
      await sendMessage(conv.wa_from,
        `${conv.bot_name}: No pude acceder a la publicación. ` +
        `Podés reportarla manualmente desde el menú. 🐾`);
      return showMenu(conv);
    }

    if (!fbPostData || !fbPostData.fb_post_id) {
      await sendMessage(conv.wa_from,
        `${conv.bot_name}: No pude obtener los datos de la publicación. ` +
        `Podés reportarla manualmente desde el menú. 🐾`);
      return showMenu(conv);
    }

    // Insert fetched post into facebook_posts
    const insertResult = await pool.query(
      `INSERT INTO facebook_posts
         (fb_post_id, fb_post_url, author_name, content, image_urls, posted_at, classification, embed_html)
       VALUES ($1, $2, $3, $4, $5, $6, 'unclassified', $7)
       ON CONFLICT (fb_post_id) DO UPDATE SET
         content = EXCLUDED.content,
         image_urls = EXCLUDED.image_urls,
         author_name = EXCLUDED.author_name,
         embed_html = COALESCE(facebook_posts.embed_html, EXCLUDED.embed_html),
         scraped_at = NOW()
       RETURNING id`,
      [fbPostData.fb_post_id, fbPostData.fb_post_url || fbUrl, fbPostData.author_name || '',
       fbPostData.content || '', fbPostData.image_urls || [],
       fbPostData.posted_at ? new Date(fbPostData.posted_at) : null,
       fbPostData.embed_html || null]
    );

    const newPost = {
      ...fbPostData,
      id: insertResult.rows[0].id,
    };

    await setFlow(conv, 'report_from_fb.lookup', { ...conv.context, fbPost: newPost });
    return fbContinue(conv);
  }

  const existingPost = result.rows[0];

  // Always try to refresh data from FB (OG scraper + fallbacks)
  if (!existingPost.embed_html || !existingPost.content) {
    try {
      const fbPostData = await fetchFbPost(fbUrl);
      const hasNewData = fbPostData.embed_html || fbPostData.content || fbPostData.image_urls?.length;
      if (hasNewData) {
        if (fbPostData.content) existingPost.content = fbPostData.content;
        if (fbPostData.image_urls?.length) existingPost.image_urls = fbPostData.image_urls;
        if (fbPostData.embed_html) existingPost.embed_html = fbPostData.embed_html;
        if (fbPostData.author_name) existingPost.author_name = fbPostData.author_name;
        await pool.query(
          `UPDATE facebook_posts SET content = $1, image_urls = $2, author_name = $3, embed_html = $4 WHERE id = $5`,
          [existingPost.content, existingPost.image_urls, existingPost.author_name, existingPost.embed_html, existingPost.id]
        ).catch(e => console.error('fbLookup: failed to save refreshed data:', e.message));
        console.log(`fbLookup: post ${existingPost.id} refreshed - content_length=${existingPost.content?.length}, images=${existingPost.image_urls?.length}, embed=${!!existingPost.embed_html}`);
      }
    } catch (err) {
      console.error('fbLookup: failed to refresh post:', err.message);
    }
  }

  await setFlow(conv, 'report_from_fb.lookup', { ...conv.context, fbPost: existingPost });
  return fbContinue(conv);
}

async function fbAskStatus(conv, parsed) {
  const statusMap = {
    fb_status_lost: 'lost',
    fb_status_sighted: 'sighted',
    fb_status_found: 'retained',
  };
  let classification;
  if (parsed.buttonId) {
    classification = statusMap[parsed.buttonId] || 'lost';
  } else {
    const text = (parsed.textBody || '').toLowerCase();
    classification = text.includes('avist') ? 'sighted'
      : text.includes('encontr') ? 'retained'
      : (text.includes('adopt') || text.includes('adopc')) ? 'for_adoption'
      : 'lost';
  }
  console.log('fbAskStatus: buttonId=%s text=%s -> classification=%s', parsed.buttonId, parsed.textBody, classification);
  const newPost = { ...conv.context.fbPost, classification };
  console.log('fbAskStatus: fbPost after update:', JSON.stringify(newPost));
  await setFlow(conv, 'report_from_fb.lookup', {
    ...conv.context,
    fbPost: newPost,
  });
  return fbContinue(conv);
}

async function fbAskSpecies(conv, parsed) {
  let species;
  if (parsed.buttonId) {
    species = parsed.buttonId === 'species_cat' ? 'cat'
      : parsed.buttonId === 'species_other' ? 'other' : 'dog';
  } else {
    const text = (parsed.textBody || '').toLowerCase();
    species = text.includes('gato') ? 'cat'
      : text.includes('otro') ? 'other' : 'dog';
  }
  await setFlow(conv, 'report_from_fb.lookup', {
    ...conv.context,
    fbPost: { ...conv.context.fbPost, species },
  });
  return fbContinue(conv);
}

async function fbAskLocation(conv, parsed) {
  const location = parsed.textBody || '';
  let lat = parsed.locationLat || null;
  let lng = parsed.locationLng || null;
  if (!location && !lat) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Decime la dirección o compartí tu ubicación 📍`);
    return;
  }
  if (!lat && location) {
    const coords = await geocodeAddress(location);
    if (coords) { lat = coords.lat; lng = coords.lng; }
  }
  await setFlow(conv, 'report_from_fb.lookup', {
    ...conv.context,
    fbPost: { ...conv.context.fbPost, location_hint: location },
    fbLatitude: lat,
    fbLongitude: lng,
  });
  return fbContinue(conv);
}

async function fbAskAll(conv, parsed) {
  const text = (parsed.textBody || '').toLowerCase();

  // Extract species
  let species;
  if (/perr|can|cachorr/.test(text)) species = 'dog';
  else if (/gat|felino|mich/.test(text)) species = 'cat';
  else species = 'other';

  // Extract classification
  let classification;
  if (/perdi|escap|busco|desapareci|no aparece|se nos fue|fug|extravi/.test(text)) classification = 'lost';
  else if (/encontr|apareci|rescata|recog|hall/.test(text)) classification = 'retained';
  else if (/avist/.test(text)) classification = 'sighted';
  else if (/adopt/.test(text)) classification = 'for_adoption';

  // Extract location - after "en", "cerca de", "por", "zona"
  let location = null;
  const locMatch = text.match(/(?:en|cerca de|por|zona)\s+(.+)/i);
  if (locMatch) location = locMatch[1].trim();

  // Geocode location to get coordinates
  let lat = null, lng = null;
  if (location) {
    const coords = await geocodeAddress(location);
    if (coords) { lat = coords.lat; lng = coords.lng; }
  }

  const ctx = conv.context;
  ctx.fbPost = { ...ctx.fbPost };
  if (classification) ctx.fbPost.classification = classification;
  ctx.fbPost.species = species;
  if (location) ctx.fbPost.location_hint = location;

  await setFlow(conv, 'report_from_fb.lookup', { ...ctx, fbLatitude: lat, fbLongitude: lng });
  return fbContinue(conv);
}

async function fbShowConfirm(conv) {
  const ctx = conv.context;
  const post = ctx.fbPost;
  const statusLabels = { lost: 'Perdida 🐕', sighted: 'Avistada 👀', retained: 'Encontrada ✅', for_adoption: 'Adopción 🏠' };
  const speciesLabels = { dog: 'Perro 🐕', cat: 'Gato 🐈', other: 'Otro 🐾' };

  const msg =
    `${conv.bot_name}: Confirmá los datos:\n\n` +
    `📋 *Especie:* ${speciesLabels[post.species] || post.species || 'Sin especificar'}\n` +
    `📍 *Ubicación:* ${post.location_hint || ctx.fbLatitude ? 'Compartida' : '(sin ubicación)'}\n` +
    `📌 *Tipo:* ${statusLabels[post.classification] || post.classification}\n` +
    `👤 *Contacto:* ${post.author_name || 'Anónimo'} vía Facebook\n\n` +
    `¿Está todo correcto?`;

  await sendMessage(conv.wa_from, msg);
  await sendInteractiveButtons(conv.wa_from, 'Confirmar:', [
    { id: 'confirm_yes', title: '✅ Sí, reportar' },
    { id: 'confirm_no', title: '❌ Cancelar' },
  ]);
  await setFlow(conv, 'report_from_fb.confirm');
}

async function fbConfirm(conv, parsed, intent) {
  if (intent !== 'confirm') {
    await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
    return endFlow(conv);
  }

  const ctx = conv.context;
  const post = ctx.fbPost;

  const status = post.classification || 'lost';
  const species = post.species || 'unknown';
  const location = post.location_hint || 'Sin ubicación';
  const description = (post.content ? post.content.substring(0, 500) : 'Reportado desde Facebook')
    + (post.fb_post_url ? `\n\n🔗 Publicación original: ${post.fb_post_url}` : '');
  const contactInfo = post.author_name
    ? `Contactar vía Facebook: ${post.author_name}`
    : 'Contactar vía Facebook';

  const petResult = await pool.query(
    `INSERT INTO pets (species, status, location, latitude, longitude, contact_info, description, source_type, source_url, source_facebook_post_id, name, color, gender, breed, facebook_embed_html)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'facebook', $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [species, status, location, ctx.fbLatitude || null, ctx.fbLongitude || null,
     contactInfo, description, post.fb_post_url || '', post.id,
     post.name || null, post.color || null, post.gender || null, post.breed || null,
     post.embed_html || null]
  );

  const petId = petResult.rows[0].id;

  // Download and save image from Facebook post
  let imgSaved = false;
  if (post.image_urls && post.image_urls.length > 0) {
    const cdnUrls = post.image_urls.filter(u => u.includes('scontent'));
    const photoUrls = post.image_urls.filter(u => u.includes('facebook.com/photo'));
    const otherUrls = post.image_urls.filter(u => !u.includes('scontent') && !u.includes('facebook.com/photo'));
    const orderedUrls = [...cdnUrls, ...photoUrls, ...otherUrls];
    console.log(`fbConfirm: image URLs - cdn=${cdnUrls.length}, photo=${photoUrls.length}, first=${orderedUrls[0]?.slice(0, 80)}`);
    for (const imgUrl of orderedUrls) {
      console.log(`fbConfirm: downloading image from ${imgUrl?.slice(0, 80)}`);
      const img = await downloadImage(imgUrl, post.fb_post_id);
      if (img && img.data) {
        console.log(`fbConfirm: image saved, mime=${img.mimeType}, size=${img.data.length}`);
        await pool.query(
          `INSERT INTO pet_images (pet_id, image_data, mime_type) VALUES ($1, $2, $3)`,
          [petId, img.data, img.mimeType]
        );
        imgSaved = true;
        break;
      } else if (img && img.externalUrl) {
        console.log(`fbConfirm: storing external URL as fallback`);
        await pool.query(
          `INSERT INTO pet_images (pet_id, external_url) VALUES ($1, $2)`,
          [petId, img.externalUrl]
        );
        imgSaved = true;
        break;
      }
    }
    if (!imgSaved) console.log(`fbConfirm: all image downloads failed for ${post.image_urls.length} URLs`);
  } else {
    console.log(`fbConfirm: no image_urls available`);
  }

  // Fallback: try to extract image from post URL directly when no image_urls or all downloads failed
  if (!imgSaved && post.fb_post_url) {
    console.log(`fbConfirm: trying direct image extraction from post URL`);
    try {
      const resp = await fetch(post.fb_post_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
        redirect: 'follow',
      });
      if (resp.ok) {
        const html = await resp.text();
        const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1]
          || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i)?.[1]
          || html.match(/<meta\s+property="og:image:secure_url"\s+content="([^"]+)"/i)?.[1]
          || html.match(/<meta\s+name="twitter:image"\s+content="([^"]+)"/i)?.[1]
          || html.match(/<meta\s+content="([^"]+)"\s+name="twitter:image"/i)?.[1];
        if (ogImage) {
          console.log(`fbConfirm: found image via direct fetch: ${ogImage.slice(0, 80)}`);
          const img = await downloadImage(ogImage, post.fb_post_id);
          if (img && img.data) {
            await pool.query(
              `INSERT INTO pet_images (pet_id, image_data, mime_type) VALUES ($1, $2, $3)`,
              [petId, img.data, img.mimeType]
            );
            imgSaved = true;
          } else if (img && img.externalUrl) {
            await pool.query(
              `INSERT INTO pet_images (pet_id, external_url) VALUES ($1, $2)`,
              [petId, img.externalUrl]
            );
            imgSaved = true;
          }
        }
      }
    } catch (e) {
      console.log(`fbConfirm: direct image extraction failed: ${e.message}`);
    }
  }

  await pool.query(
    `UPDATE whatsapp_messages SET pet_id = $1, status = 'processed' WHERE conversation_id = $2`,
    [petId, conv.id]
  );

  matchWhatsAppToPets(petId).catch(e => console.error('Matching error:', e));
  broadcastPetToGroups(petId).catch(e => console.error('Broadcast error:', e));

  await sendMessage(conv.wa_from,
    `✅ *${conv.bot_name}:* ¡Reporte creado con éxito desde Facebook!\n` +
    (post.author_name ? `👤 Contacto: ${post.author_name} vía Facebook` : '') +
    (post.fb_post_url ? `\n🔗 Publicación original: ${post.fb_post_url}` : '')
  );

  return endFlow(conv);
}

// ─── Register + Adopt Post ───

async function startAdoptPost(conv) {
  const waFrom = conv.wa_from;
  const user = (await pool.query(
    `SELECT id, display_name FROM users WHERE phone LIKE $1 OR phone LIKE $2 LIMIT 1`,
    [`%${waFrom.slice(-8)}`, `%${waFrom.slice(-10)}`]
  )).rows[0];

  if (user) {
    conv.context = { ...conv.context, user_id: user.id, user_name: user.display_name };
    return apAskSpecies(conv);
  }

  await sendMessage(conv.wa_from,
    `${conv.bot_name}: Para publicar una mascota en adopción necesitás registrarte primero. ¿Cómo te llamás?`
  );
  await setFlow(conv, 'register.name', { _redirect: 'adopt_post.species' });
}

async function registerName(conv, parsed) {
  const name = (parsed.textBody || '').trim();
  if (!name || name.length < 2) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor decime tu nombre para registrarte.`);
    return;
  }
  await sendMessage(conv.wa_from, `✅ Gracias, ${name}. Ahora te registramos con tu número de WhatsApp.`);
  await setFlow(conv, 'register.confirm', { ...conv.context, reg_name: name });
  await sendInteractiveButtons(conv.wa_from, `${conv.bot_name}: ¿Confirmás tu registro?`, [
    { id: 'confirm_yes', title: '✅ Sí, registrarme' },
    { id: 'confirm_no', title: '❌ Cancelar' },
  ]);
}

async function registerConfirm(conv, parsed, intent) {
  if (intent !== 'confirm') {
    await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
    return endFlow(conv);
  }
  const name = conv.context.reg_name;
  const waFrom = conv.wa_from;
  const syntheticEmail = `wa_${waFrom}@placeholder.sigotuhuella`;
  const randomPass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  const userResult = await pool.query(
    `INSERT INTO users (email, password_hash, display_name, phone, email_verified)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (phone) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING id`,
    [syntheticEmail, randomPass, name, waFrom]
  );
  const userId = userResult.rows[0].id;
  conv.context = { ...conv.context, user_id: userId, user_name: name };

  await sendMessage(conv.wa_from, `✅ *${conv.bot_name}:* ¡Registro completado! Ahora vamos a publicar la adopción.`);

  const redirect = conv.context._redirect || 'adopt_post.species';
  await setFlow(conv, redirect, { ...conv.context });
  if (redirect === 'adopt_post.species') {
    await apAskSpecies(conv);
  }
}

async function apAskSpecies(conv) {
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿De qué *especie* es la mascota que querés dar en adopción?`);
  await sendInteractiveButtons(conv.wa_from, 'Especie:', [
    { id: 'species_dog', title: '🐕 Perro' },
    { id: 'species_cat', title: '🐈 Gato' },
    { id: 'species_other', title: '🐾 Otro' },
  ]);
  await setFlow(conv, 'adopt_post.species');
}

async function apSpecies(conv, parsed) {
  let species;
  if (parsed.buttonId) {
    species = parsed.buttonId === 'species_cat' ? 'cat'
      : parsed.buttonId === 'species_other' ? 'other' : 'dog';
  } else {
    const text = (parsed.textBody || '').toLowerCase();
    species = text.includes('gato') || text.includes('🐈') ? 'cat'
      : text.includes('otro') || text.includes('🐾') ? 'other' : 'dog';
  }
  await sendMessage(conv.wa_from, `✅ Anotado.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: Ahora enviá una *foto* de la mascota 📸`);
  await setFlow(conv, 'adopt_post.photo', { ...conv.context, species });
}

async function apPhoto(conv, parsed) {
  const photoData = parsed.imageData || conv.context?.photo_data;
  const photoMime = parsed.imageMime || conv.context?.photo_mime;
  if (!photoData) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor enviá una *foto* de la mascota 📸`);
    return;
  }
  await sendMessage(conv.wa_from, `✅ Foto recibida.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde está la mascota? Podés escribir la dirección o compartir tu *ubicación* 📍`);
  await setFlow(conv, 'adopt_post.location', {
    ...conv.context,
    photo_data: photoData,
    photo_mime: photoMime || 'image/jpeg',
  });
}

async function apLocation(conv, parsed) {
  const location = parsed.textBody || '';
  let lat = parsed.locationLat || null;
  let lng = parsed.locationLng || null;
  if (!location && !lat) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Decime dónde está la mascota o compartí tu ubicación 📍`);
    return;
  }
  if (!lat && location) {
    const coords = await geocodeAddress(location).catch(() => null);
    if (coords) { lat = coords.lat; lng = coords.lng; }
  }

  const waFrom = conv.wa_from;
  const formattedPhone = `${waFrom.slice(0, 3)} ${waFrom.slice(3, 5)} ${waFrom.slice(5, 8)} ${waFrom.slice(8)}`;
  await sendMessage(conv.wa_from, `✅ Ubicación registrada.`);
  await sendInteractiveButtons(conv.wa_from,
    `${conv.bot_name}: ¿El número de contacto para esta adopción es tu número de WhatsApp (+${formattedPhone})?`, [
    { id: 'confirm_yes', title: '✅ Sí' },
    { id: 'confirm_no', title: '❌ No' },
  ]);
  await setFlow(conv, 'adopt_post.contact_check', { ...conv.context, location, latitude: lat, longitude: lng });
}

async function apContactCheck(conv, parsed) {
  const text = (parsed.textBody || '').toLowerCase().trim();
  if (parsed.buttonId === 'confirm_yes' || text === 'sí' || text === 'si' || text === 'yes' || text === 'dale') {
    await sendMessage(conv.wa_from, `✅ Usamos tu número de WhatsApp como contacto.`);
    await setFlow(conv, 'adopt_post.name', { ...conv.context, contact: conv.wa_from });
    return apAskName(conv);
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: Decime el número de teléfono para la publicación 📞`);
  await setFlow(conv, 'adopt_post.contact_ask', conv.context);
}

async function apContactAsk(conv, parsed) {
  const phone = parsed.textBody || '';
  if (!phone || phone.length < 5) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí un número de teléfono válido 📞`);
    return;
  }
  await sendMessage(conv.wa_from, `✅ Teléfono registrado.`);
  await setFlow(conv, 'adopt_post.name', { ...conv.context, contact: phone });
  await apAskName(conv);
}

async function apAskName(conv) {
  await sendInteractiveButtons(conv.wa_from, `${conv.bot_name}: ¿Cómo se llama la mascota? (opcional)`, [
    { id: 'skip', title: '⏭ Saltar' },
  ]);
  await setFlow(conv, 'adopt_post.name', conv.context);
}

async function apName(conv, parsed) {
  const text = (parsed.textBody || '').toLowerCase().trim();
  const name = (parsed.buttonId === 'skip' || text === 'saltar' || text === 'no' || text === 'skip') ? '' : parsed.textBody || '';
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Alguna descripción adicional? (edad, tamaño, color, personalidad — opcional)`);
  await sendInteractiveButtons(conv.wa_from, 'Descripción:', [
    { id: 'skip', title: '⏭ Saltar' },
  ]);
  await setFlow(conv, 'adopt_post.description', { ...conv.context, pet_name: name });
}

async function apDescription(conv, parsed) {
  const text = (parsed.textBody || '').toLowerCase().trim();
  const description = (parsed.buttonId === 'skip' || text === 'saltar' || text === 'no' || text === 'skip') ? '' : parsed.textBody || '';
  const ctx = { ...conv.context, description };
  await setFlow(conv, 'adopt_post.confirm', ctx);

  const speciesLabels = { dog: 'Perro 🐕', cat: 'Gato 🐈', other: 'Otro 🐾' };
  const contactDisplay = ctx.contact === conv.wa_from ? '(+54) mismo WhatsApp' : ctx.contact;
  await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmá los datos de la adopción:\n\n` +
    `🐾 *Especie:* ${speciesLabels[ctx.species] || ctx.species}\n` +
    `📍 *Ubicación:* ${ctx.location || 'Compartida'}\n` +
    `📞 *Contacto:* ${contactDisplay}\n` +
    `${ctx.pet_name ? `🏷️ *Nombre:* ${ctx.pet_name}\n` : ''}` +
    `${description ? `📝 *Descripción:* ${description}\n` : ''}\n` +
    `⚠️ Recordá: Sigo Tu Huella solo difunde. La gestión de la adopción queda a cargo tuyo.`);
  await sendInteractiveButtons(conv.wa_from, '¿Publicamos?', [
    { id: 'confirm_yes', title: '✅ Sí, publicar' },
    { id: 'confirm_no', title: '❌ Cancelar' },
  ]);
}

async function apConfirm(conv, parsed, intent) {
  if (intent === 'confirm') {
    const ctx = conv.context;
    const petResult = await pool.query(
      `INSERT INTO pets (name, species, status, location, latitude, longitude, contact_info, description, source_type, created_by)
       VALUES ($1, $2, 'for_adoption', $3, $4, $5, $6, $7, 'whatsapp_owner', $8)
       RETURNING id`,
      [ctx.pet_name || null, ctx.species || 'dog', ctx.location || '', ctx.latitude, ctx.longitude, ctx.contact || '', ctx.description || 'En adopción — difusión particular', ctx.user_id || null]
    );
    const petId = petResult.rows[0].id;

    if (ctx.photo_data) {
      let imageData = ctx.photo_data;
      let originalImageData = null;
      try {
        const { detectAndCropPetFace } = await import('./geminiMatching.js');
        const cropped = await detectAndCropPetFace(ctx.photo_data, ctx.photo_mime);
        if (cropped) { imageData = cropped.cropped; originalImageData = cropped.original; }
      } catch (e) { console.error('Face crop error:', e); }
      await pool.query(
        `INSERT INTO pet_images (pet_id, image_data, mime_type, original_image_data) VALUES ($1, $2, $3, $4)`,
        [petId, imageData, ctx.photo_mime || 'image/jpeg', originalImageData]
      );
    }

    await pool.query(
      `UPDATE whatsapp_messages SET pet_id = $1, status = 'processed' WHERE conversation_id = $2`,
      [petId, conv.id]
    );

    broadcastPetToGroups(petId).catch(e => console.error('Broadcast error:', e));
    await sendMessage(conv.wa_from,
      `✅ *${conv.bot_name}:* ¡Publicación creada con éxito! Ya la difundimos en nuestra red.\n\n` +
      `📌 *Importante:* esta publicación figura como *difusión particular*. Sigo Tu Huella solo la difunde, no gestiona la adopción. Cualquier consulta la respondés vos directamente.`
    );
    return endFlow(conv);
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
  return endFlow(conv);
}

// ─── End Flow ───

async function endFlow(conv) {
  await sendInteractiveButtons(conv.wa_from,
    `${conv.bot_name}: ¿Te puedo ayudar en algo más?`, [
    { id: 'end_yes', title: '✅ Sí' },
    { id: 'end_no', title: '❌ No' },
  ]);
  await setFlow(conv, 'end_flow');
}

async function handleEndFlow(conv, parsed, intent) {
  if (intent === 'confirm') {
    await setFlow(conv, 'menu');
    return showMenu(conv);
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¡Gracias por comunicarte! Estaremos atentos para cuando necesites algo. 🐾`);
  await setFlow(conv, 'closed');
  await pool.query(
    `UPDATE whatsapp_conversations SET status = 'closed' WHERE id = $1`,
    [conv.id]
  );
}

// ─── Pending Human ───

async function handlePendingHuman(conv) {
  const ctx = conv.context || {};
  if (ctx.motive) {
    await sendMessage(conv.wa_from,
      `🗣 ${conv.bot_name}: Tu consulta sobre "${ctx.motive}" ya fue derivada a nuestro equipo. Te van a responder a la brevedad.`);
  } else {
    await sendMessage(conv.wa_from,
      `🗣 ${conv.bot_name}: Tu consulta ya fue derivada a nuestro equipo. Te van a responder a la brevedad.`);
  }
}
