const axios = require('axios');

const VPS_URL = process.env.VPS_URL || 'https://sigotuhuella.online';
const TOKEN = process.env.RELAY_TOKEN || 'RELAY_TOKEN';
const OPENWA_URL = process.env.OPENWA_URL || 'http://localhost:2785';
const OPENWA_API_KEY = process.env.OPENWA_API_KEY || '';
const SESSION_ID = process.env.OPENWA_SESSION || 'default';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '30000');
const MAX_RETRIES = 1;

async function sendViaOpenWA(jid, text, imageUrl) {
  const headers = { 'X-API-Key': OPENWA_API_KEY, 'Content-Type': 'application/json' };
  if (imageUrl) {
    await axios.post(`${OPENWA_URL}/api/sessions/${SESSION_ID}/messages/send-image`, {
      chatId: jid, url: imageUrl, caption: text || '',
    }, { headers, timeout: 30000 });
  } else {
    await axios.post(`${OPENWA_URL}/api/sessions/${SESSION_ID}/messages/send-text`, {
      chatId: jid, text: text,
    }, { headers, timeout: 15000 });
  }
}

async function poll() {
  try {
    const { data } = await axios.get(`${VPS_URL}/api/relay/pending`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 20000,
    });
    if (!data.messages?.length) return;
    const sentIds = [];
    for (const msg of data.messages) {
      try {
        const jid = msg.wa_to;
        if (msg.image_url) {
          await sendViaOpenWA(jid, msg.text || '', msg.image_url);
        } else {
          await sendViaOpenWA(jid, msg.text || '', null);
        }
        sentIds.push(msg.id);
      } catch (e) {
        console.error(`[Poller] Error a ${msg.wa_to}:`, e.message);
        await axios.post(`${VPS_URL}/api/relay/failed`, { ids: [msg.id] }, {
          headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 10000,
        }).catch(() => {});
      }
    }
    if (sentIds.length) {
      await axios.post(`${VPS_URL}/api/relay/sent`, { ids: sentIds }, {
        headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 10000,
      });
    }
  } catch (e) {
    console.error('[Poller]', e.message);
  }
}

console.log(`[Poller] Iniciado - VPS: ${VPS_URL}, OpenWA: ${OPENWA_URL}, Intervalo: ${POLL_INTERVAL}ms`);
setInterval(poll, POLL_INTERVAL);
poll();
