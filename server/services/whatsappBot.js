import pool from '../db.js';
import { sendMessage, sendInteractiveButtons, sendImage, downloadMedia, uploadMedia } from './whatsappService.js';
import { matchWhatsAppToPets } from './geminiMatching.js';

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
  const text = (parsed.textBody || '').toLowerCase().trim();
  if (parsed.messageType === 'interactive') {
    if (/perdida/i.test(text)) return 'report_lost';
    if (/avistaje/i.test(text)) return 'report_sighted';
    if (/encontrada/i.test(text)) return 'report_found';
    if (/info|qr/i.test(text)) return 'info_qr';
    if (/voluntario/i.test(text)) return 'volunteer';
    if (/adoptar|adopt/i.test(text)) return 'adopt';
    if (/donar|donación|don/i.test(text)) return 'donate';
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
  if (/donar|donación|don/.test(text)) return 'donate';
  if (/humano|persona|hablar/.test(text)) return 'human';
  if (/s[ií]|confirmar|dale|end_yes/.test(text)) return 'confirm';
  if (/^no$|no |cancelar|end_no/.test(text)) return 'cancel';
  if (/saltar|omitir/.test(text)) return 'skip';
  return null;
}

export async function processMessage(parsed) {
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
  const intent = detectIntent(parsed);

  if (flow !== 'menu' && intent === 'human') {
    await setFlow(conv, 'pending_human');
    await sendMessage(conv.wa_from, `🗣 ${conv.bot_name}: Enseguida te conectamos con una persona. Alguien del equipo te va a responder a la brevedad. Gracias por tu paciencia.`);
    return;
  }

  if (flow !== 'menu' && intent === 'cancel') {
    await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
    return endFlow(conv);
  }

  switch (flow) {
    case 'welcome': return showWelcome(conv);
    case 'menu': return handleMenu(conv, parsed, intent);
    case 'report_lost.species': return rlSpecies(conv, parsed);
    case 'report_lost.photo': return rlPhoto(conv, parsed);
    case 'report_lost.location': return rlLocation(conv, parsed);
    case 'report_lost.contact': return rlContact(conv, parsed);
    case 'report_lost.name': return rlName(conv, parsed);
    case 'report_lost.confirm': return rlConfirm(conv, parsed, intent);
    case 'report_sighted.photo': return rsPhoto(conv, parsed);
    case 'report_sighted.location': return rsLocation(conv, parsed);
    case 'report_sighted.details': return rsDetails(conv, parsed);
    case 'report_sighted.confirm': return rsConfirm(conv, parsed, intent);
    case 'report_found.photo': return rfPhoto(conv, parsed);
    case 'report_found.location': return rfLocation(conv, parsed);
    case 'report_found.contact': return rfContact(conv, parsed);
    case 'report_found.confirm': return rfConfirm(conv, parsed, intent);
    case 'volunteer.name': return vName(conv, parsed);
    case 'volunteer.zone': return vZone(conv, parsed);
    case 'volunteer.phone': return vPhone(conv, parsed);
    case 'volunteer.confirm': return vConfirm(conv, parsed, intent);
    case 'human.motive': return hMotive(conv, parsed);
    case 'adopt.species': return adoptSpecies(conv, parsed);
    case 'info_qr': return showInfoQr(conv);
    case 'pending_human': return handlePendingHuman(conv);
    case 'end_flow': return handleEndFlow(conv, parsed, intent);
    default: return showMenu(conv);
  }
}

// ─── Welcome (solo primera vez) ───

async function showWelcome(conv) {
  await sendMessage(conv.wa_from,
    `🐾 ¡Hola! Soy *${conv.bot_name}*, el asistente virtual de *Sigo Tu Huella* 🐾\n\n` +
    `Estoy acá para ayudarte a reportar mascotas perdidas, avistajes y conectar con nuestra red de ayuda.`);
  const greeting = await getSetting('whatsapp_greeting');
  if (greeting) {
    await sendMessage(conv.wa_from, greeting);
  }
  await setFlow(conv, 'menu', { is_new: false });
  return showMenu(conv);
}

// ─── Menu ───

export async function showMenu(conv) {
  await sendInteractiveButtons(conv.wa_from, '📌 ¿Qué querés hacer?', [
    { id: 'report_lost', title: '📷 Mascota perdida' },
    { id: 'report_sighted', title: '👀 Mascota avistada' },
    { id: 'report_found', title: '✅ Mascota encontrada' },
  ]);
  await sendInteractiveButtons(conv.wa_from, '📌 Más opciones', [
    { id: 'adopt', title: '🙋 Adoptar mascota' },
    { id: 'info_qr', title: 'ℹ️ Chapita QR' },
    { id: 'donate', title: '💰 Donar' },
  ]);
  await sendInteractiveButtons(conv.wa_from, '📌', [
    { id: 'human', title: '🗣 Contactar al equipo' },
  ]);
  await setFlow(conv, 'menu');
}

async function handleMenu(conv, parsed, intent) {
  switch (intent) {
    case 'report_lost': return startReportLost(conv);
    case 'report_sighted': return startReportSighted(conv);
    case 'report_found': return startReportFound(conv);
    case 'info_qr': return showInfoQr(conv);
    case 'volunteer': return startVolunteer(conv);
    case 'adopt': return startAdoptFlow(conv);
    case 'donate': return startDonateFlow(conv);
    case 'human': return startHumanRequest(conv);
    default:
      await sendMessage(conv.wa_from, `${conv.bot_name}: No entendí tu mensaje. Usá los botones de abajo 👇`);
      return showMenu(conv);
  }
}

// ─── Human / Representante ───

async function startHumanRequest(conv) {
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Sobre qué necesitás hablar con un representante?`);
  await sendInteractiveButtons(conv.wa_from, 'Motivo:', [
    { id: 'motive_report', title: '📋 Consulta reporte' },
    { id: 'motive_technical', title: '⚙️ Problema técnico' },
    { id: 'motive_collab', title: '🙌 Quiero colaborar' },
    { id: 'motive_other', title: 'Otro' },
  ]);
  await setFlow(conv, 'human.motive');
}

async function hMotive(conv, parsed) {
  const text = (parsed.textBody || '').toLowerCase();
  const motives = {
    motive_report: 'Consulta sobre un reporte',
    motive_technical: 'Problema técnico',
    motive_collab: 'Quiero colaborar',
  };
  const motive = motives[parsed.textBody] || (text || 'Otro');
  await setFlow(conv, 'pending_human', { motive });
  await sendMessage(conv.wa_from,
    `🗣 *${conv.bot_name}:* Gracias. Tu consulta fue derivada a nuestro equipo. Te van a responder a la brevedad.`);
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
  const text = (parsed.textBody || '').toLowerCase();
  const species = text.includes('gato') || text.includes('🐈') ? 'cat'
    : text.includes('otro') || text.includes('🐾') ? 'other' : 'dog';
  await sendMessage(conv.wa_from, `✅ Anotado.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: Ahora enviá una *foto* de la mascota 📸`);
  await setFlow(conv, 'report_lost.photo', { species });
}

async function rlPhoto(conv, parsed) {
  if (parsed.messageType !== 'image' || !parsed.imageData) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor enviá una *foto* de la mascota 📸`);
    return;
  }
  await sendMessage(conv.wa_from, `✅ Foto recibida.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde se perdió? Podés escribir la dirección o compartir tu *ubicación* 📍`);
  await setFlow(conv, 'report_lost.location', {
    ...conv.context,
    photo_data: parsed.imageData,
    photo_mime: parsed.imageMime,
  });
}

async function rlLocation(conv, parsed) {
  const location = parsed.textBody || '';
  const lat = parsed.locationLat || null;
  const lng = parsed.locationLng || null;
  if (!location && !lat) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Decime dónde se perdió o compartí tu ubicación 📍`);
    return;
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
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Cómo se llama la mascota? (opcional — escribí el nombre o "saltar")`);
  await setFlow(conv, 'report_lost.name', { ...conv.context, contact: phone });
}

async function rlName(conv, parsed) {
  const text = (parsed.textBody || '').toLowerCase().trim();
  const name = (text === 'saltar' || text === 'no' || text === 'skip') ? '' : parsed.textBody || '';
  await setFlow(conv, 'report_lost.confirm', { ...conv.context, pet_name: name });
  const ctx = conv.context;
  const speciesLabels = { dog: 'Perro 🐕', cat: 'Gato 🐈', other: 'Otro 🐾' };
  await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmá los datos:

🐾 *Especie:* ${speciesLabels[ctx.species] || ctx.species}
📍 *Ubicación:* ${ctx.location || 'Compartida'}
📞 *Contacto:* ${ctx.contact}
${ctx.pet_name ? `🏷️ *Nombre:* ${ctx.pet_name}` : ''}

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
      `INSERT INTO pets (name, species, status, location, latitude, longitude, contact_info, description)
       VALUES ($1, $2, 'lost', $3, $4, $5, $6, $7)
       RETURNING id`,
      [ctx.pet_name || null, ctx.species || 'dog', ctx.location || '', ctx.latitude, ctx.longitude, ctx.contact || '', `Reportado por WhatsApp como perdida`]
    );
    const petId = petResult.rows[0].id;
    if (ctx.photo_data) {
      await pool.query(`INSERT INTO pet_images (pet_id, image_data, mime_type) VALUES ($1, $2, $3)`, [petId, ctx.photo_data, ctx.photo_mime || 'image/jpeg']);
    }
    await pool.query(`UPDATE whatsapp_messages SET pet_id = $1, status = 'processed' WHERE conversation_id = $2`, [petId, conv.id]);
    matchWhatsAppToPets(petId).catch(e => console.error('Matching error:', e));
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
  await sendMessage(conv.wa_from, `${conv.bot_name}: Enviá una *foto* de la mascota que viste 📸`);
  await setFlow(conv, 'report_sighted.photo');
}

async function rsPhoto(conv, parsed) {
  if (parsed.messageType !== 'image' || !parsed.imageData) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor enviá una *foto* de la mascota 📸`);
    return;
  }
  await sendMessage(conv.wa_from, `✅ Foto recibida.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde la viste? Podés escribir la dirección o compartir tu *ubicación* 📍`);
  await setFlow(conv, 'report_sighted.location', {
    photo_data: parsed.imageData,
    photo_mime: parsed.imageMime,
  });
}

async function rsLocation(conv, parsed) {
  const location = parsed.textBody || '';
  const lat = parsed.locationLat || null;
  const lng = parsed.locationLng || null;
  if (!location && !lat) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Decime dónde la viste o compartí tu ubicación 📍`);
    return;
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Algún detalle adicional? (color, tamaño, estado físico — opcional, escribí "saltar" para omitir)`);
  await setFlow(conv, 'report_sighted.details', { ...conv.context, location, latitude: lat, longitude: lng });
}

async function rsDetails(conv, parsed) {
  const text = (parsed.textBody || '').toLowerCase().trim();
  const details = (text === 'saltar' || text === 'no' || text === 'skip') ? '' : parsed.textBody || '';
  await setFlow(conv, 'report_sighted.confirm', { ...conv.context, details });
  await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmás el reporte de avistaje?
📍 *Ubicación:* ${conv.context.location || 'Compartida'}
${details ? `📝 *Detalles:* ${details}` : ''}`);
  await sendInteractiveButtons(conv.wa_from, 'Confirmar:', [
    { id: 'confirm_yes', title: '✅ Sí, reportar' },
    { id: 'confirm_no', title: '❌ Cancelar' },
  ]);
}

async function rsConfirm(conv, parsed, intent) {
  if (intent === 'confirm') {
    const ctx = conv.context;
    const petResult = await pool.query(
      `INSERT INTO pets (species, status, location, latitude, longitude, description)
       VALUES ($1, 'sighted', $2, $3, $4, $5) RETURNING id`,
      ['unknown', ctx.location || '', ctx.latitude, ctx.longitude, ctx.details ? `Avistaje: ${ctx.details}` : 'Reportado por WhatsApp como avistaje']
    );
    const petId = petResult.rows[0].id;
    if (ctx.photo_data) {
      await pool.query(`INSERT INTO pet_images (pet_id, image_data, mime_type) VALUES ($1, $2, $3)`, [petId, ctx.photo_data, ctx.photo_mime || 'image/jpeg']);
    }
    await pool.query(`UPDATE whatsapp_messages SET pet_id = $1, status = 'processed' WHERE conversation_id = $2`, [petId, conv.id]);
    matchWhatsAppToPets(petId).catch(e => console.error('Matching error:', e));
    await sendMessage(conv.wa_from, `✅ *${conv.bot_name}:* ¡Reporte de avistaje registrado! Gracias por ayudar.`);
    await endFlow(conv);
  } else {
    await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
    await endFlow(conv);
  }
}

// ─── Report Found ───

async function startReportFound(conv) {
  await sendMessage(conv.wa_from, `${conv.bot_name}: Enviá una *foto* de la mascota que encontraste 📸`);
  await setFlow(conv, 'report_found.photo');
}

async function rfPhoto(conv, parsed) {
  if (parsed.messageType !== 'image' || !parsed.imageData) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor enviá una *foto* de la mascota 📸`);
    return;
  }
  await sendMessage(conv.wa_from, `✅ Foto recibida.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Dónde está ahora la mascota? 📍`);
  await setFlow(conv, 'report_found.location', {
    photo_data: parsed.imageData,
    photo_mime: parsed.imageMime,
  });
}

async function rfLocation(conv, parsed) {
  const location = parsed.textBody || '';
  const lat = parsed.locationLat || null;
  const lng = parsed.locationLng || null;
  if (!location && !lat) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Decime dónde está la mascota o compartí tu ubicación 📍`);
    return;
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
  await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmás que encontraste esta mascota?
📍 *Ubicación:* ${conv.context.location || 'Compartida'}
📞 *Contacto:* ${phone}`);
  await sendInteractiveButtons(conv.wa_from, 'Confirmar:', [
    { id: 'confirm_yes', title: '✅ Sí, reportar' },
    { id: 'confirm_no', title: '❌ Cancelar' },
  ]);
}

async function rfConfirm(conv, parsed, intent) {
  if (intent === 'confirm') {
    const ctx = conv.context;
    const petResult = await pool.query(
      `INSERT INTO pets (species, status, location, latitude, longitude, contact_info, description)
       VALUES ($1, 'retained', $2, $3, $4, $5, $6) RETURNING id`,
      ['unknown', ctx.location || '', ctx.latitude, ctx.longitude, ctx.contact || '', 'Reportado por WhatsApp como encontrada']
    );
    const petId = petResult.rows[0].id;
    if (ctx.photo_data) {
      await pool.query(`INSERT INTO pet_images (pet_id, image_data, mime_type) VALUES ($1, $2, $3)`, [petId, ctx.photo_data, ctx.photo_mime || 'image/jpeg']);
    }
    await pool.query(`UPDATE whatsapp_messages SET pet_id = $1, status = 'processed' WHERE conversation_id = $2`, [petId, conv.id]);
    matchWhatsAppToPets(petId).catch(e => console.error('Matching error:', e));
    await sendMessage(conv.wa_from, `✅ *${conv.bot_name}:* ¡Reporte de mascota encontrada registrado! Ya visibilizamos la info para encontrar a su dueño.`);
    await sendMessage(conv.wa_from, `🙏 ¡Gracias por tu ayuda!`);
    await endFlow(conv);
  } else {
    await sendMessage(conv.wa_from, `${conv.bot_name}: OK, cancelado.`);
    await endFlow(conv);
  }
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
• Sin cuotas ni renovaciones

📲 Pedila acá: https://sigotuhuella.online/solicitar-chapita

¿Querés hacer otra cosa?`);
  return endFlow(conv);
}

// ─── Volunteer ───

async function startVolunteer(conv) {
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¡Gracias por querer sumarte! 🙌`);
  await sendMessage(conv.wa_from, `Decime tu *nombre completo*:`);
  await setFlow(conv, 'volunteer.name');
}

async function vName(conv, parsed) {
  const name = (parsed.textBody || '').trim();
  if (!name || name.length < 3) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí tu nombre completo`);
    return;
  }
  await sendMessage(conv.wa_from, `✅ Gracias ${name.split(' ')[0]}.`);
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿En qué *zona/residencia* estás? (barrio, ciudad)`);
  await setFlow(conv, 'volunteer.zone', { full_name: name });
}

async function vZone(conv, parsed) {
  const zone = (parsed.textBody || '').trim();
  if (!zone || zone.length < 3) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor decime tu barrio o ciudad`);
    return;
  }
  await sendMessage(conv.wa_from, `${conv.bot_name}: ¿Tu *número de WhatsApp* para que podamos contactarte? 📞`);
  await setFlow(conv, 'volunteer.phone', { ...conv.context, zone });
}

async function vPhone(conv, parsed) {
  const phone = (parsed.textBody || '').trim();
  if (!phone || phone.length < 5) {
    await sendMessage(conv.wa_from, `${conv.bot_name}: Por favor escribí un número de teléfono válido 📞`);
    return;
  }
  await setFlow(conv, 'volunteer.confirm', { ...conv.context, phone });
  const ctx = conv.context;
  await sendMessage(conv.wa_from, `${conv.bot_name}: Confirmá tus datos:
👤 *Nombre:* ${ctx.full_name}
📍 *Zona:* ${ctx.zone}
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
  const text = (parsed.textBody || '').toLowerCase();
  const species = text.includes('gato') || text.includes('🐈') ? 'cat'
    : text.includes('otro') || text.includes('🐾') ? 'other' : 'dog';

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
    `Podés hacer tu donación a través de los siguientes medios:\n\n` +
    `🏦 *Transferencia bancaria*\n` +
    `Alias: sigotuhuella.mp\n` +
    `CBU: 0000003100065412345678\n\n` +
    `💳 *Mercado Pago*\n` +
    `https://sigotuhuella.online/donar\n\n` +
    `Tu ayuda nos permite seguir rescatando y cuidando animales. 🐾`);
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
