const baileysUrl = import.meta.resolve('@whiskeysockets/baileys');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = await import(baileysUrl);
import pino from 'pino';
import QR from 'qrcode';
import path from 'path';
import { mkdirSync, existsSync, rmSync } from 'fs';
import pool from '../db.js';

let client = null;
let status = 'disconnected';
let currentQR = null;
let connectedPhone = null;
let initPromise = null;
let reconnectTimer = null;
let connecting = false;
let watchdogTimer = null;

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

function cancelWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

async function startClient() {
  if (connecting) return;
  connecting = true;

  cancelWatchdog();

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
    console.log('[Baileys] Auth loaded, creating socket...');

    const logger = pino({ level: 'fatal' });

    client = makeWASocket({
      version: [2, 3000, 1034074495],
      browser: Browsers.macOS('Desktop'),
      auth: state,
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
    });

    client.ev.on('creds.update', saveCreds);

    watchdogTimer = setTimeout(() => {
      console.error('[Baileys] Watchdog timeout (25s) — no events received, reconnecting...');
      watchdogTimer = null;
      connecting = false;
      status = 'disconnected';
      if (client) {
        try { client.end(undefined); } catch {}
        client = null;
      }
      initPromise = null;
      reconnectTimer = setTimeout(() => startClient(), 8000);
    }, 25000);

    client.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        cancelWatchdog();
        status = 'qr';
        currentQR = await QR.toDataURL(qr);
        console.log('[Baileys] QR received, status=qr');
        connecting = false;
      }

      if (connection === 'open') {
        cancelWatchdog();
        status = 'ready';
        currentQR = null;
        connectedPhone = client.user?.id?.split(':')[0] || null;
        console.log('[Baileys] Connected:', connectedPhone);
        connecting = false;
      }

      if (connection === 'close') {
        cancelWatchdog();
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        connectedPhone = null;
        console.log('[Baileys] Connection closed, statusCode:', statusCode, 'reason:', lastDisconnect?.error?.message);
        connecting = false;

        if (status === 'pairing') {
          console.log('[Baileys] Was in pairing mode, keeping status');
        } else {
          status = 'disconnected';
          if (shouldReconnect) {
            reconnectTimer = setTimeout(() => {
              initPromise = null;
              startClient();
            }, 5000);
          } else {
            initPromise = null;
          }
        }
      }
    });

    console.log('[Baileys] Socket created, waiting for events...');
  } catch (err) {
    cancelWatchdog();
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

export async function requestPairingBaileys(phone) {
  const cleanPhone = phone.replace(/[+\- ]/g, '');
  if (!/^\d{7,15}$/.test(cleanPhone)) {
    throw new Error('Invalid phone number format');
  }

  if (status === 'disconnected') {
    console.log('[Baileys] Auto-reconnecting for pairing...');
    reconnectBaileys();
    const waitStart = Date.now();
    while (status !== 'qr' && status !== 'ready' && (Date.now() - waitStart) < 30000) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  if (!client || (status !== 'qr' && status !== 'connecting')) {
    throw new Error(`Baileys not in pairing state (status=${status})`);
  }

  console.log('[Baileys] Waiting 3s before sending pairing request...');
  await new Promise(r => setTimeout(r, 3000));

  try {
    const code = await client.requestPairingCode(cleanPhone);
    status = 'pairing';
    console.log('[Baileys] Pairing code generated');
    return code;
  } catch (err) {
    console.error('[Baileys] requestPairingCode error:', err.message);
    throw new Error('Error al solicitar código de vinculación: ' + err.message);
  }
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

export async function clearBaileysAuth() {
  cancelWatchdog();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (client) {
    try { client.end(undefined); } catch {}
    client = null;
  }
  status = 'disconnected';
  currentQR = null;
  connectedPhone = null;
  initPromise = null;
  connecting = false;

  const sessionPath = await getSessionPath();
  const absolutePath = path.resolve(sessionPath);
  if (existsSync(absolutePath)) {
    try {
      rmSync(absolutePath, { recursive: true, force: true });
      console.log('[Baileys] Auth directory cleared:', absolutePath);
    } catch (err) {
      console.error('[Baileys] Error clearing auth:', err.message);
    }
  }

  await initBaileysClient();
}
