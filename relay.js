const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { readdirSync, existsSync } = require('fs');
const path = require('path');
const axios = require('axios');
const QR = require('qrcode-terminal');
const QRCode = require('qrcode');
const { Readable } = require('stream');

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.stack || err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason?.stack || reason?.message || reason);
});

const VPS_URL = 'https://sigotuhuella.online';
const TOKEN = process.env.RELAY_TOKEN || 'RELAY_TOKEN';
const BOT_NUMBER = '5492212025190';
const POLL_INTERVAL = 30000;
const MAX_RETRIES = 3;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PREWARM_DELAY = 2000;
const TIMELOCK_CHECK_MS = 60000;

const replyCooldowns = new Map();
const knownContacts = new Set();
const recent463Jids = new Map();
const processedMessageIds = new Set();
const PROCESSED_IDS_MAX = 1000;
let isFirstConnection = true;
let sock = null;
let pollTimer = null;
let reconnectCount = 0;

const timelock = {
  active: false,
  expiresAt: 0,
  checkTimer: null,
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function normalizeNumber(num) {
  let n = num.replace(/[\s\-\(\)\+]/g, '');
  if (n.includes('@')) n = n.split('@')[0];
  if (/^549\d{7,}$/.test(n)) return n;
  if (/^54\d{7,}$/.test(n)) n = '549' + n.slice(2);
  if (n.startsWith('0')) n = n.slice(1);
  return '549' + n;
}

function getReconnectDelay() {
  const delays = [10, 30, 60, 120];
  const idx = Math.min(reconnectCount, delays.length - 1);
  return delays[idx] * 1000;
}

function loadKnownContacts() {
  const authDir = path.join(__dirname, 'auth_info');
  if (!existsSync(authDir)) return;
  try {
    const files = readdirSync(authDir);
    for (const f of files) {
      if (f.startsWith('tctoken-') && f.endsWith('.json')) {
        knownContacts.add(f.replace('tctoken-', '').replace('.json', ''));
      }
    }
    console.log(`[TC] ${knownContacts.size} contactos con TC token cargados`);
  } catch (e) {
    console.log('[TC] No se pudieron cargar TC tokens:', e.message);
  }
}

function isContactKnown(jid) {
  if (knownContacts.has(jid)) return true;
  const bare = jid.split('@')[0];
  for (const k of knownContacts) {
    if (k.includes(bare) || bare.includes(k.split('@')[0])) return true;
  }
  return false;
}

const WA_KEYWORDS = /perdido|perdida|encontré|encontre|encontrada|encontrado|perro|perra|gato|gata|mascota|apareció|aparecio|extraviado|extraviada|adopción|adopcion|callejero|abandonado|busco|busca|rescate|rescaté|rescatado|hallazgo/i;

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function trackProcessedId(id) {
  if (processedMessageIds.size >= PROCESSED_IDS_MAX) {
    const oldest = processedMessageIds.values().next().value;
    if (oldest) processedMessageIds.delete(oldest);
  }
  processedMessageIds.add(id);
}

async function recoverMissedMessages() {
  try {
    const { data } = await axios.get(`${VPS_URL}/api/relay/groups`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 10000,
    });
    const groups = data?.groups || [];
    for (const group of groups) {
      if (!group.scrape_enabled) continue;
      try {
        if (typeof sock.loadMessages !== 'function') continue;
        const msgs = await sock.loadMessages(group.group_id, 30);
        for (const msg of msgs) {
          if (msg.key.fromMe) continue;
          if (processedMessageIds.has(msg.key.id)) continue;

          const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
          if (!WA_KEYWORDS.test(text)) continue;

          trackProcessedId(msg.key.id);

          let imageData = null;
          let imageMime = null;
          if (msg.message?.imageMessage) {
            try {
              const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
              const buffer = await streamToBuffer(stream);
              imageData = buffer.toString('base64');
              imageMime = msg.message.imageMessage.mimetype || 'image/jpeg';
            } catch (e) {
              console.error(`[Recovery] Error descargando imagen: ${e.message}`);
            }
          }

          const authorName = msg.pushName || msg.participant?.split('@')[0] || null;

          axios.post(`${VPS_URL}/api/relay/scraped-message`, {
            group_id: group.id,
            wa_message_id: msg.key.id,
            author_jid: msg.key.participant || msg.key.remoteJid,
            author_name: authorName,
            content: text,
            image_data: imageData,
            image_mime: imageMime,
          }, {
            headers: { Authorization: `Bearer ${TOKEN}` },
            timeout: 30000,
          }).then(resp => {
            if (resp.data?.id) console.log(`[Recovery] Scrapeado: ${resp.data.id} (${resp.data.classification})`);
          }).catch(e => console.error(`[Recovery] Error al enviar: ${e.message}`));
        }
      } catch (e) {
        console.error(`[Recovery] Error en grupo ${group.group_id}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error('[Recovery] Error obteniendo grupos:', e.message);
  }
}

async function getGroupId(jid) {
  const groupMetadata = await sock.groupMetadata(jid).catch(() => null);
  const name = groupMetadata?.subject || jid;
  const { data } = await axios.post(`${VPS_URL}/api/relay/resolve-group`, { jid, name }, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 10000,
  });
  return data?.id || null;
}

function scheduleTimelockCheck() {
  if (timelock.checkTimer) clearTimeout(timelock.checkTimer);
  timelock.checkTimer = setTimeout(() => {
    if (Date.now() >= timelock.expiresAt) {
      timelock.active = false;
      timelock.expiresAt = 0;
      console.log('[Timelock] Expirado, reanudando envíos a todos los contactos');
      knownContacts.clear(); // force re-evaluation
      return;
    }
    scheduleTimelockCheck();
  }, TIMELOCK_CHECK_MS);
}

async function checkServerTimelock() {
  try {
    if (typeof sock.fetchAccountReachoutTimelock === 'function') {
      const result = await sock.fetchAccountReachoutTimelock();
      if (result?.isActive) {
        timelock.active = true;
        timelock.expiresAt = (result.timeEnforcementEnds || (Date.now() / 1000 + 86400)) * 1000;
        console.log(`[Timelock] Servidor: activo hasta ${new Date(timelock.expiresAt).toLocaleString('es-AR')}`);
        scheduleTimelockCheck();
        return true;
      }
      if (timelock.active) {
        timelock.active = false;
        timelock.expiresAt = 0;
        console.log('[Timelock] Servidor: ya no está activo');
      }
      return false;
    }
  } catch (e) {
    console.log('[Timelock] Error consultando servidor:', e.message);
  }
  return timelock.active;
}

function handle463Detected(fromJid) {
  recent463Jids.set(fromJid, Date.now());
  if (timelock.active) return;
  checkServerTimelock();
}

async function sendQR(qrData) {
  try {
    const buf = await QRCode.toBuffer(qrData, { type: 'png', width: 400, margin: 2 });
    const b64 = buf.toString('base64');
    await axios.post(`${VPS_URL}/api/relay/qr`, { image: b64 }, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 10000,
    });
  } catch (e) { /* QR upload failure is non-critical */ }
}

async function clearQR() {
  try {
    await axios.post(`${VPS_URL}/api/relay/qr/clear`, {}, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 10000,
    });
  } catch (e) { /* ignore */ }
}

async function sendWithRetry(jid, content) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      if (i > 0) {
        await sock.sendPresenceUpdate('composing', jid).catch(() => {});
        await sleep(2000);
      }
      await sock.sendMessage(jid, content);
      knownContacts.add(jid);
      recent463Jids.delete(jid);
      return true;
    } catch (e) {
      if (e.message?.includes('463')) {
        handle463Detected(jid);

        if (timelock.active && !isContactKnown(jid) && i === 0) {
          throw new Send463Error(jid, `463 - timelock activo, contacto no conocido`);
        }

        if (i < MAX_RETRIES - 1) {
          const delay = 5000;
          console.log(`463 a ${jid}, reintento ${i + 2}/${MAX_RETRIES} en ${delay/1000}s...`);
          await sleep(delay);
          continue;
        }
        throw new Send463Error(jid, `463 persistente a ${jid}`);
      }
      throw e;
    }
  }
}

class Send463Error extends Error {
  constructor(jid, message) {
    super(message);
    this.code = 463;
    this.jid = jid;
  }
}

async function start() {
  loadKnownContacts();

  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  if (pollTimer) clearInterval(pollTimer);

  sock = makeWASocket({
    browser: Browsers.ubuntu('Chrome'),
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr, reachoutTimeLock }) => {
    if (qr) {
      console.log('\n=== ESCANEÁ ESTE QR CON WHATSAPP ===');
      QR.generate(qr, { small: true });
      console.log('====================================\n');
      sendQR(qr);
    }
    if (connection === 'open') {
      reconnectCount = 0;
      console.log('Conectado a WhatsApp');
      clearQR();
      if (!isFirstConnection) {
        console.log('[Recovery] Reconexión detectada, recuperando mensajes perdidos en 5s...');
        setTimeout(recoverMissedMessages, 5000);
      }
      isFirstConnection = false;
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('Cerrado. Código:', code, lastDisconnect?.error?.message?.substring(0, 80));
      if (code !== DisconnectReason.loggedOut) {
        if (code === 428 || code === DisconnectReason.connectionClosed) {
          reconnectCount++;
          const delay = getReconnectDelay();
          console.log(`Reconectando en ${delay / 1000}s (intento #${reconnectCount})...`);
          setTimeout(start, delay);
        } else {
          console.log('Reconectando en 5s...');
          setTimeout(start, 5000);
        }
      }
    }

    if (reachoutTimeLock) {
      timelock.active = reachoutTimeLock.isActive;
      timelock.expiresAt = reachoutTimeLock.timeEnforcementEnds
        ? reachoutTimeLock.timeEnforcementEnds * 1000 : 0;
      if (reachoutTimeLock.isActive) {
        console.log(`[Timelock] Server push: activo hasta ${timelock.expiresAt ? new Date(timelock.expiresAt).toLocaleString('es-AR') : '?'}`);
        scheduleTimelockCheck();
      } else {
        console.log('[Timelock] Server push: inactivo');
      }
    }
  });

  sock.ev.on('messages.update', (updates) => {
    for (const { key, update } of updates) {
      if (key.remoteJid === 'status@broadcast' || key.remoteJid?.endsWith('@g.us')) continue;
      if (!key.remoteJid) continue;
      const params = update.messageStubParameters;
      if (params && (params.includes(463) || params.includes('463'))) {
        console.log(`[463] ACK error en messages.update para ${key.remoteJid}`);
        handle463Detected(key.remoteJid);
      }
    }
  });

  sock.ev.on('message-capping.update', (cap) => {
    console.log(`[Cap] Budget nuevos contactos: ${cap.remaining}/${cap.total}`);
    if (cap.remaining <= 0 && !timelock.active) {
      timelock.active = true;
      timelock.expiresAt = Date.now() + 86400000;
      console.log('[Cap] Budget agotado, activando timelock por 24h');
      scheduleTimelockCheck();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.remoteJid === 'status@broadcast') continue;
      const from = msg.key.remoteJid;
      const isGroup = from.endsWith('@g.us');

      if (!msg.key.fromMe && !isGroup) {
        knownContacts.add(from);
      }

      if (msg.key.fromMe) {
        replyCooldowns.set(from, Date.now());
        console.log(`[Cooldown] Admin respondió a ${from}, 24h sin auto-reply`);
        continue;
      }

      if (isGroup) {
        // Scrape group messages for lost/found pets
        if (replyCooldowns.has(from)) continue;

        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
        if (!WA_KEYWORDS.test(text)) continue;

        console.log(`[Grupo] ${from}: ${text.substring(0, 80)}`);

        let imageData = null;
        let imageMime = null;
        if (msg.message?.imageMessage) {
          try {
            const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
            const buffer = await streamToBuffer(stream);
            imageData = buffer.toString('base64');
            imageMime = msg.message.imageMessage.mimetype || 'image/jpeg';
          } catch (e) {
            console.error(`[Grupo] Error descargando imagen: ${e.message}`);
          }
        }

        const groupId = await getGroupId(from).catch(() => null);
        if (!groupId) continue;

        const authorName = msg.pushName || msg.participant?.split('@')[0] || null;

        trackProcessedId(msg.key.id);

        axios.post(`${VPS_URL}/api/relay/scraped-message`, {
          group_id: groupId,
          wa_message_id: msg.key.id,
          author_jid: msg.key.participant || msg.key.remoteJid,
          author_name: authorName,
          content: text,
          image_data: imageData,
          image_mime: imageMime,
        }, {
          headers: { Authorization: `Bearer ${TOKEN}` },
          timeout: 30000,
        }).then(resp => {
          if (resp.data?.id) console.log(`[Grupo] Scrapeado: ${resp.data.id} (${resp.data.classification})`);
          else if (resp.data?.skipped) console.log(`[Grupo] Saltado: ${resp.data.reason}`);
        }).catch(e => console.error(`[Grupo] Error al enviar: ${e.message}`));

        continue;
      }

      // Private message handling
      if (replyCooldowns.has(from)) continue;

      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      console.log(`[Entrante] ${from}: ${text.substring(0, 80)}`);

      await sock.sendMessage(from, {
        text: `🐾 ¡Gracias por contactarte con Sigo Tu Huella!\nEste número es solo para notificaciones automáticas.\nPara reportar una mascota, ver adopciones, y mucho más, escribinos a:\n\n📱 wa.me/${BOT_NUMBER}\n\n🔗 sigotuhuella.online`
      });

      replyCooldowns.set(from, Date.now());
      console.log(`[Cooldown] Auto-reply enviado a ${from}, 24h sin repetir`);
    }
  });

  setInterval(() => {
    const now = Date.now();
    for (const [jid, ts] of replyCooldowns) {
      if (now - ts > COOLDOWN_MS) replyCooldowns.delete(jid);
    }
  }, 3600000);

  pollTimer = setInterval(async () => {
    try {
      if (timelock.active) {
        const expiredTimelock = recent463Jids.size > 0 && Date.now() >= timelock.expiresAt;
        if (expiredTimelock) {
          timelock.active = false;
          timelock.expiresAt = 0;
          console.log('[Timelock] Expirado, reanudando envíos');
        }
      }

      const { data } = await axios.get(`${VPS_URL}/api/relay/pending`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        timeout: 20000,
      });
      if (!data.messages?.length) return;
      const sentIds = [];
      for (const msg of data.messages) {
        try {
          const isGroup = msg.wa_to.includes('@g.us');
          const isChannel = msg.wa_to.includes('@newsletter');
          const jid = (isGroup || isChannel) ? msg.wa_to : (() => {
            const normalized = normalizeNumber(msg.wa_to);
            return normalized.includes('@') ? normalized : `${normalized}@s.whatsapp.net`;
          })();

          if (!isGroup && !isChannel) {
            const normalized = jid.split('@')[0];
            const [exists] = await sock.onWhatsApp(normalized);
            if (!exists?.exists) {
              console.error(`Número no registrado en WhatsApp: ${normalized}`);
              continue;
            }
            if (!isContactKnown(jid)) {
              await sock.sendPresenceUpdate('available', jid).catch(() => {});
              await sleep(PREWARM_DELAY);
            }
          }

          if (msg.image_url) {
            const imgResp = await axios.get(msg.image_url, { responseType: 'arraybuffer', timeout: 15000 });
            await sendWithRetry(jid, {
              image: Buffer.from(imgResp.data),
              caption: msg.text || '',
            });
          } else {
            await sendWithRetry(jid, { text: msg.text });
          }
          sentIds.push(msg.id);
          knownContacts.add(jid);
        } catch (e) {
          if (e.code === 463) {
            const isUnknownContact = e.message?.includes('no conocido');
            console.error(`463 a ${msg.wa_to}: ${isUnknownContact ? 'timelock + contacto desconocido' : 'persistente'}`);
            await axios.post(`${VPS_URL}/api/relay/failed`, { ids: [msg.id] }, {
              headers: { Authorization: `Bearer ${TOKEN}` },
              timeout: 10000,
            }).catch(() => {});
          } else {
            console.error(`Error a ${msg.wa_to}:`, e.message);
          }
        }
      }
      if (sentIds.length) await axios.post(`${VPS_URL}/api/relay/sent`, { ids: sentIds }, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        timeout: 10000,
      });
    } catch (e) {
      console.error('[Poll]', e.message);
    }
  }, POLL_INTERVAL);
}

start();
