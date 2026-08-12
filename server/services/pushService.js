import webpush from 'web-push';
import pool from '../db.js';

let vapidReady = false;
let admin = null;

try {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:info@sigotuhuella.com.ar',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidReady = true;
  } else {
    console.warn('VAPID keys not configured — web push notifications disabled');
  }
} catch (err) {
  console.error('VAPID setup error:', err);
}

async function getFirebaseAdmin() {
  if (admin) return admin;
  try {
    const firebaseAdmin = await import('firebase-admin');
    if (!firebaseAdmin.apps.length) {
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.applicationDefault(),
      });
    }
    admin = firebaseAdmin;
    return admin;
  } catch (err) {
    console.warn('Firebase Admin not configured — FCM push disabled:', err.message);
    return null;
  }
}

async function getSubscriptions(whereClause, params = []) {
  const result = await pool.query(
    `SELECT endpoint, p256dh, auth_key FROM push_subscriptions ${whereClause}`,
    params
  );
  return result.rows.map(row => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth_key },
  }));
}

async function getDeviceTokens(whereClause, params = []) {
  const result = await pool.query(
    `SELECT fcm_token FROM device_tokens ${whereClause}`,
    params
  );
  return result.rows.map(row => row.fcm_token);
}

async function sendToSubscriptions(subscriptions, payload) {
  if (!vapidReady || subscriptions.length === 0) return 0;
  const stringified = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(sub, stringified).catch(async err => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
        }
        throw err;
      })
    )
  );
  const sent = results.filter(r => r.status === 'fulfilled').length;
  return sent;
}

async function sendToFcmTokens(tokens, payload) {
  if (tokens.length === 0) return 0;
  const fbAdmin = await getFirebaseAdmin();
  if (!fbAdmin) return 0;

  const message = {
    notification: {
      title: payload.title || 'Sigo tu Huella',
      body: payload.body || '',
    },
    data: payload.data || {},
    tokens,
  };

  try {
    const response = await fbAdmin.messaging().sendEachForMulticast(message);
    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success && (
        resp.error?.code === 'messaging/registration-token-not-registered' ||
        resp.error?.code === 'messaging/invalid-registration-token'
      )) {
        invalidTokens.push(tokens[idx]);
      }
    });
    if (invalidTokens.length > 0) {
      await pool.query(
        'DELETE FROM device_tokens WHERE fcm_token = ANY($1)',
        [invalidTokens]
      );
    }
    return response.successCount;
  } catch (err) {
    console.error('FCM send error:', err);
    return 0;
  }
}

export async function sendPushToAll(payload) {
  try {
    const [subs, tokens] = await Promise.all([
      getSubscriptions(''),
      getDeviceTokens(''),
    ]);
    const [webCount, fcmCount] = await Promise.all([
      sendToSubscriptions(subs, payload),
      sendToFcmTokens(tokens, payload),
    ]);
    return webCount + fcmCount;
  } catch (err) {
    console.error('sendPushToAll error:', err);
    return 0;
  }
}

export async function sendPushToAdmins(payload) {
  try {
    const [subs, tokens] = await Promise.all([
      getSubscriptions(
        'WHERE user_id IN (SELECT id FROM users WHERE role = $1)',
        ['admin']
      ),
      getDeviceTokens(
        'WHERE user_id IN (SELECT id FROM users WHERE role = $1)',
        ['admin']
      ),
    ]);
    const [webCount, fcmCount] = await Promise.all([
      sendToSubscriptions(subs, payload),
      sendToFcmTokens(tokens, payload),
    ]);
    return webCount + fcmCount;
  } catch (err) {
    console.error('sendPushToAdmins error:', err);
    return 0;
  }
}

export async function sendPushToUser(userId, payload) {
  try {
    const [subs, tokens] = await Promise.all([
      getSubscriptions('WHERE user_id = $1', [userId]),
      getDeviceTokens('WHERE user_id = $1', [userId]),
    ]);
    const [webCount, fcmCount] = await Promise.all([
      sendToSubscriptions(subs, payload),
      sendToFcmTokens(tokens, payload),
    ]);
    return webCount + fcmCount;
  } catch (err) {
    console.error('sendPushToUser error:', err);
    return 0;
  }
}

// Envía push a varios usuarios. Los user_ids sin suscripciones/tokens no cuentan.
export async function sendPushToUsers(userIds, payload) {
  if (!userIds || userIds.length === 0) return 0;
  try {
    const [subs, tokens] = await Promise.all([
      getSubscriptions('WHERE user_id = ANY($1::uuid[])', [userIds]),
      getDeviceTokens('WHERE user_id = ANY($1::uuid[])', [userIds]),
    ]);
    const [webCount, fcmCount] = await Promise.all([
      sendToSubscriptions(subs, payload),
      sendToFcmTokens(tokens, payload),
    ]);
    return webCount + fcmCount;
  } catch (err) {
    console.error('sendPushToUsers error:', err);
    return 0;
  }
}
