import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import QR from 'qrcode';
import pino from 'pino';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.resolve(__dirname, '..', '.baileys_auth');

let qrGenerated = false;
const qrFile = path.resolve(__dirname, '..', 'qr.html');

function showInstructions() {
  console.log('');
  console.log('1. Abrí WhatsApp en tu celular');
  console.log('2. Andá a Dispositivos vinculados');
  console.log('3. Escaneá el QR');
  console.log('');
  console.log('📂 Abrí este archivo en tu navegador:', qrFile);
  console.log('   (hacé doble clic en el archivo)');
  console.log('');
}

async function createSocket() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Generador de sesión WhatsApp Web (Baileys)    ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Sesión se guardará en: ${SESSION_DIR}`);
  console.log('');

  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  qrGenerated = false;

  const sock = makeWASocket({
    version: [2, 3000, 1040656236],
    browser: Browsers.macOS('Desktop'),
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !qrGenerated) {
      qrGenerated = true;
      const qrDataUrl = await QR.toDataURL(qr);
      const html = `<!DOCTYPE html><html><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f5f5f5"><div style="text-align:center"><h2>Escanéá este QR con WhatsApp</h2><img src="${qrDataUrl}" style="width:300px;height:300px"/></div></body></html>`;
      writeFileSync(qrFile, html);
      console.log('📱 QR generado');
      showInstructions();
    }

    if (connection === 'open') {
      console.log('');
      console.log('✅  SESIÓN VINCULADA EXITOSAMENTE');
      console.log('');
      console.log('Ya podés cerrar este programa (Ctrl+C).');
      console.log('');
      console.log('Copiá la carpeta .baileys_auth/ al VPS:');
      console.log('');
      console.log('  rsync -avz .baileys_auth/ root@IP_DEL_VPS:/var/www/sigotuhuella/.baileys_auth/');
      console.log('');
      process.exit(0);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`🔌 Conexión cerrada (código: ${statusCode})`);

      if (statusCode === DisconnectReason.restartRequired) {
        console.log('🔄 QR escaneado, reconectando con sesión...');
        sock.ev.removeAllListeners();
        setTimeout(() => createSocket(), 2000);
        return;
      }

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('Sesión cerrada permanentemente.');
        process.exit(1);
        return;
      }

      console.log('🔄 Reconectando en 5s...');
    }

    if (connection === 'connecting') {
      console.log('🟡 Conectando...');
    }
  });
}

createSocket().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
