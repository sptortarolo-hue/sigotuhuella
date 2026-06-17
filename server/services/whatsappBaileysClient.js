const baileysUrl = import.meta.resolve('@whiskeysockets/baileys');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = await import(baileysUrl);
import pino from 'pino';
import QR from 'qrcode';
import path from 'path';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import pool from '../db.js';

const baileysPkgUrl = import.meta.resolve('@whiskeysockets/baileys/package.json');
const BAILEYS_VERSION = JSON.parse(readFileSync(new URL(baileysPkgUrl), 'utf-8')).version;

let client = null;
let status = 'disconnected';
let currentQR = null;
let connectedPhone = null;
let initPromise = null;
let reconnectTimer = null;
let connecting = false;

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
    console.log('[Baileys] getEnabled query result:', result.rows);
    return result.rows[0]?.value === 'true';
  } catch (err) {
    console.error('[Baileys] getEnabled query error:', err.message);
    return false;
  }
}

export async function initBaileysClient() {
  console.log('[Baileys] initBaileysClient called, connecting:', connecting);
  if (connecting || initPromise) {
    console.log('[Baileys] Already connecting, skipping');
    return initPromise;
  }

  const enabled = await getEnabled();
  if (!enabled) {
    status = 'disabled';
    console.log('[Baileys] Disabled by setting');
    return;
  }

  console.log('[Baileys] Starting client...');
  initPromise = startClient();
  return initPromise;
}

async function startClient() {
  if (connecting) return;
  connecting = true;

  const timeout = setTimeout(() => {
    connecting = false;
    initPromise = null;
    console.error('[Baileys] Timeout starting client (20s)');
    status = 'disconnected';
  }, 20000);

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

    console.log('[Baileys] Loading auth state from', absolutePath);
    const { state, saveCreds } = await useMultiFileAuthState(absolutePath);
    const version = BAILEYS_VERSION;
    console.log('[Baileys] Auth loaded, creating socket (v' + version + ')');

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
        console.log('[Baileys] QR received, status=qr');
      }

      if (connection === 'open') {
        status = 'ready';
        currentQR = null;
        connectedPhone = client.user?.id?.split(':')[0] || null;
        console.log('[Baileys] Connected:', connectedPhone);
        clearTimeout(timeout);
        connecting = false;
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        status = 'disconnected';
        connectedPhone = null;
        console.log('[Baileys] Connection closed, will reconnect:', shouldReconnect);
        connecting = false;

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

    clearTimeout(timeout);
    connecting = false;
    console.log('[Baileys] Socket created, waiting for events...');
  } catch (err) {
    clearTimeout(timeout);
    connecting = false;
    console.error('[Baileys] Error starting client:', err.message, err.stack?.split('\n')[1]);
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
