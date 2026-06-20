const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const axios = require('axios');

const VPS_URL = 'https://sigotuhuella.online';
const TOKEN = 'RELAY_TOKEN';  // <-- REEMPLAZAR con el mismo token del GitHub secret
const POLL_INTERVAL = 30000;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('Conectado a WhatsApp');
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('Reconectando...');
        start();
      } else {
        console.log('Sesión cerrada. Eliminá auth_info y escaneá el QR de nuevo.');
      }
    }
  });

  setInterval(async () => {
    try {
      const { data } = await axios.get(`${VPS_URL}/api/relay/pending`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        timeout: 15000,
      });
      if (!data.messages || data.messages.length === 0) return;

      const sentIds = [];
      const failedIds = [];
      for (const msg of data.messages) {
        try {
          const jid = msg.wa_to.includes('@') ? msg.wa_to : `${msg.wa_to}@s.whatsapp.net`;
          await sock.sendMessage(jid, { text: msg.text });
          sentIds.push(msg.id);
          console.log(`Enviado a ${msg.wa_to}: ${msg.text.substring(0, 50)}`);
        } catch (e) {
          console.error(`Error enviando a ${msg.wa_to}:`, e.message);
          failedIds.push(msg.id);
        }
      }
      if (sentIds.length > 0) {
        await axios.post(`${VPS_URL}/api/relay/sent`, { ids: sentIds }, {
          headers: { Authorization: `Bearer ${TOKEN}` },
          timeout: 10000,
        });
      }
      if (failedIds.length > 0) {
        await axios.post(`${VPS_URL}/api/relay/failed`, { ids: failedIds }, {
          headers: { Authorization: `Bearer ${TOKEN}` },
          timeout: 10000,
        });
      }
    } catch (e) {
      // Error de conexion (VPS caido, sin internet, etc.) — ignorar
    }
  }, POLL_INTERVAL);
}

start();
