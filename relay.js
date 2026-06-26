const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { readdirSync, existsSync } = require('fs');
const path = require('path');
const axios = require('axios');
const QR = require('qrcode-terminal');
const QRCode = require('qrcode');

const VPS_URL = 'https://sigotuhuella.online';
const TOKEN = 'RELAY_TOKEN';
const BOT_NUMBER = '5492212025190';
const POLL_INTERVAL = 30000;
const MAX_RETRIES = 3;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PREWARM_DELAY = 2000;
const TIMELOCK_CHECK_MS = 60000;

const replyCooldowns = new Map();
const knownContacts = new Set();
const recent463Jids = new Map();
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
      if (msg.key.remoteJid.endsWith('@g.us')) continue;

      const from = msg.key.remoteJid;

      if (!msg.key.fromMe) {
        knownContacts.add(from);
      }

      if (msg.key.fromMe) {
        replyCooldowns.set(from, Date.now());
        console.log(`[Cooldown] Admin respondió a ${from}, 24h sin auto-reply`);
        continue;
      }

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
          const jid = isGroup ? msg.wa_to : (() => {
            const normalized = normalizeNumber(msg.wa_to);
            return normalized.includes('@') ? normalized : `${normalized}@s.whatsapp.net`;
          })();

          if (!isGroup) {
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
