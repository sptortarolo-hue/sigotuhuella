const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const axios = require('axios');
const QR = require('qrcode-terminal');

const VPS_URL = 'https://sigotuhuella.online';
const TOKEN = 'RELAY_TOKEN';
const POLL_INTERVAL = 30000;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({
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

  setInterval(async () => {
    try {
      const { data } = await axios.get(`${VPS_URL}/api/relay/pending`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        timeout: 20000,
      });
      if (!data.messages?.length) return;
      const sentIds = [];
      const failedIds = [];
      for (const msg of data.messages) {
        try {
          const jid = msg.wa_to.includes('@') ? msg.wa_to : `${msg.wa_to}@s.whatsapp.net`;
          await sock.sendMessage(jid, { text: msg.text });
          sentIds.push(msg.id);
        } catch (e) {
          console.error(`Error a ${msg.wa_to}:`, e.message);
          failedIds.push(msg.id);
        }
      }
      if (sentIds.length) await axios.post(`${VPS_URL}/api/relay/sent`, { ids: sentIds }, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        timeout: 10000,
      });
      if (failedIds.length) await axios.post(`${VPS_URL}/api/relay/failed`, { ids: failedIds }, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        timeout: 10000,
      });
    } catch (e) { /* ignorar */ }
  }, POLL_INTERVAL);
}

start();
