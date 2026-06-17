import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.resolve(__dirname, '..', '.baileys_auth');

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Generador de sesión WhatsApp Web (Baileys)    ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log('1. Abrí WhatsApp en tu celular');
  console.log('2. Andá a Dispositivos vinculados');
  console.log('3. Escaneá el QR que aparece abajo');
  console.log('');
  console.log(`Sesión se guardará en: ${SESSION_DIR}`);
  console.log('');

  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

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

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log('');
      console.log('✅  SESIÓN VINCULADA EXITOSAMENTE');
      console.log('');
      console.log('Ya podés cerrar este programa (Ctrl+C).');
      console.log('');
      console.log('Copiá la carpeta .baileys_auth/ al VPS:');
      console.log('');
      console.log('  rsync -avz .baileys_auth/ user@vps:/var/www/sigotuhuella/.baileys_auth/');
      console.log('');
      process.exit(0);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log('Reconectando...');
      } else {
        console.log('Sesión cerrada. Escaneá el QR de nuevo.');
      }
    }
  });
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
