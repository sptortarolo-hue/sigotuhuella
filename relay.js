const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const axios = require('axios');
const QR = require('qrcode-terminal');
const QRCode = require('qrcode');

const VPS_URL = 'https://sigotuhuella.online';
const TOKEN = 'RELAY_TOKEN';
const BOT_NUMBER = '5492212025190';
const POLL_INTERVAL = 30000;
const MAX_RETRIES = 3;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const replyCooldowns = new Map();
let sock = null;
let pollTimer = null;
let reconnectCount = 0;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function normalizeNumber(num) {
  let n = num.replace(/[\s\-\(\)\+]/g, '');
  if (n.includes('@')) n = n.split('@')[0];
  if (n.startsWith('549') && n.length > 12) return n;
  if (n.startsWith('54') && n.length > 11) return n;
  if (n.startsWith('9') && n.length > 10) return '54' + n;
  if (n.length === 10) return '549' + n;
  if (n.length === 11) return '54' + n;
  return n;
}

function getReconnectDelay() {
  const delays = [10, 30, 60, 120];
  const idx = Math.min(reconnectCount, delays.length - 1);
  return delays[idx] * 1000;
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

async function sendWithRetry(jid, content, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      await sock.sendPresenceUpdate('composing', jid);
      await sleep(1500);
      await sock.sendPresenceUpdate('paused', jid);
      await sock.sendMessage(jid, content);
      return true;
    } catch (e) {
      if (e.message?.includes('463') && i < retries - 1) {
        console.log(`463 a ${jid}, reintento ${i + 1}/${retries}...`);
        await sleep(1000 * Math.pow(2, i));
        continue;
      }
      throw e;
    }
  }
}

async function start() {
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

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
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
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (msg.key.remoteJid === 'status@broadcast') continue;
      if (msg.key.remoteJid.endsWith('@g.us')) continue;

      const from = msg.key.remoteJid;

      // Admin respondió → cooldown 24h para ese número
      if (msg.key.fromMe) {
        replyCooldowns.set(from, Date.now());
        console.log(`[Cooldown] Admin respondió a ${from}, 24h sin auto-reply`);
        continue;
      }

      // Usuario escribe, pero está en cooldown → silencio
      if (replyCooldowns.has(from)) continue;

      // Usuario escribe, sin cooldown → auto-reply + activar cooldown
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      console.log(`[Entrante] ${from}: ${text.substring(0, 80)}`);

      await sock.sendMessage(from, {
        text: `🐾 ¡Gracias por contactarte con Sigo Tu Huella!\nEste número es solo para notificaciones automáticas.\nPara reportar una mascota, ver adopciones, y mucho más, escribinos a:\n\n📱 wa.me/${BOT_NUMBER}\n\n🔗 sigotuhuella.online`
      });

      replyCooldowns.set(from, Date.now());
      console.log(`[Cooldown] Auto-reply enviado a ${from}, 24h sin repetir`);
    }
  });

  // Limpiar cooldowns expirados cada hora
  setInterval(() => {
    const now = Date.now();
    for (const [jid, ts] of replyCooldowns) {
      if (now - ts > COOLDOWN_MS) replyCooldowns.delete(jid);
    }
  }, 3600000);

  pollTimer = setInterval(async () => {
    try {
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
          // Segundo intento para contactos nuevos (tctoken recovery silencioso)
          if (!isGroup) {
            await sleep(3000);
            try {
              if (msg.image_url) {
                const imgResp = await axios.get(msg.image_url, { responseType: 'arraybuffer', timeout: 15000 });
                await sock.sendMessage(jid, { image: Buffer.from(imgResp.data), caption: msg.text || '' });
              } else {
                await sock.sendMessage(jid, { text: msg.text });
              }
            } catch (_) { /* best-effort */ }
          }
        } catch (e) {
          console.error(`Error a ${msg.wa_to}:`, e.message);
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
