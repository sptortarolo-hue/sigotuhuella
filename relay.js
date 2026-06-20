const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const axios = require('axios');
const QR = require('qrcode-terminal');

const VPS_URL = 'https://sigotuhuella.online';
const TOKEN = 'RELAY_TOKEN';
const POLL_INTERVAL = 30000;
const MAX_RETRIES = 3;

let sock = null;
let pollTimer = null;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
    }
    if (connection === 'open') console.log('Conectado a WhatsApp');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('Cerrado. Código:', code, lastDisconnect?.error?.message?.substring(0, 80));
      if (code !== DisconnectReason.loggedOut) {
        console.log('Reconectando en 5s...');
        setTimeout(start, 5000);
      }
    }
  });

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
          const jid = msg.wa_to.includes('@') ? msg.wa_to : `${msg.wa_to}@s.whatsapp.net`;

          const [exists] = await sock.onWhatsApp(jid);
          if (!exists?.exists) {
            console.error(`Número no registrado en WhatsApp: ${msg.wa_to}`);
            continue;
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
