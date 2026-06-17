import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
import pino from 'pino';
import QR from 'qrcode';
import path from 'path';
import { mkdirSync, existsSync } from 'fs';
import pool from '../db.js';

let client = null;
let status = 'disconnected';
let currentQR = null;
let connectedPhone = null;
let initPromise = null;
let reconnectTimer = null;

const SESSION_DIR = '.baileys_auth';

async function getSessionPath() {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_web_session_path'");
    return result.rows[0]?.value || SESSION_DIR;
  } catch {
    return SESSION_DIR;
  }
}

async function getEnabled() {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'whatsapp_web_enabled'");
    return result.rows[0]?.value === 'true';
  } catch {
    return false;
  }
}

export async function initBaileysClient() {
  if (initPromise) return initPromise;

  const enabled = await getEnabled();
  if (!enabled) {
    status = 'disabled';
    return;
  }

  initPromise = startClient();
  return initPromise;
}

async function startClient() {
  try {
    if (client) {
      client.end(undefined);
      client = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    status = 'connecting';
    currentQR = null;

    const sessionPath = await getSessionPath();
    const absolutePath = path.resolve(sessionPath);

    if (!existsSync(absolutePath)) {
      mkdirSync(absolutePath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(absolutePath);
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: 'fatal' });

    client = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    client.ev.on('creds.update', saveCreds);

    client.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        status = 'qr';
        currentQR = await QR.toDataURL(qr);
      }

      if (connection === 'open') {
        status = 'ready';
        currentQR = null;
        connectedPhone = client.user?.id?.split(':')[0] || null;
        console.log('[Baileys] Connected:', connectedPhone);
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        status = 'disconnected';
        connectedPhone = null;

        if (shouldReconnect) {
          reconnectTimer = setTimeout(() => {
            initPromise = null;
            startClient();
          }, 5000);
        } else {
          initPromise = null;
        }
      }
    });
  } catch (err) {
    console.error('[Baileys] Error starting client:', err.message);
    status = 'disconnected';
    initPromise = null;
  }
}

export async function sendBaileysMessage(to, text) {
  if (!client || status !== 'ready') return false;

  try {
    const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
    await client.sendMessage(jid, { text });
    return true;
  } catch (err) {
    console.error('[Baileys] Send error:', err.message);
    return false;
  }
}

export function getBaileysStatus() {
  return { status, phone: connectedPhone };
}

export function getBaileysQR() {
  return status === 'qr' ? currentQR : null;
}

export async function reconnectBaileys() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  initPromise = null;
  if (client) {
    try { client.end(undefined); } catch {}
    client = null;
  }
  status = 'disconnected';
  currentQR = null;
  connectedPhone = null;
  await initBaileysClient();
}
