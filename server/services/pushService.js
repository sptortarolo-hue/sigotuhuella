import webpush from 'web-push';
import pool from '../db.js';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:info@sigotuhuella.online',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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

async function sendToSubscriptions(subscriptions, payload) {
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

export async function sendPushToAll(payload) {
  try {
    const subs = await getSubscriptions('');
    if (subs.length === 0) return 0;
    return await sendToSubscriptions(subs, payload);
  } catch (err) {
    console.error('sendPushToAll error:', err);
    return 0;
  }
}

export async function sendPushToAdmins(payload) {
  try {
    const subs = await getSubscriptions(
      'WHERE user_id IN (SELECT id FROM users WHERE role = $1)',
      ['admin']
    );
    if (subs.length === 0) return 0;
    return await sendToSubscriptions(subs, payload);
  } catch (err) {
    console.error('sendPushToAdmins error:', err);
    return 0;
  }
}

export async function sendPushToUser(userId, payload) {
  try {
    const subs = await getSubscriptions('WHERE user_id = $1', [userId]);
    if (subs.length === 0) return 0;
    return await sendToSubscriptions(subs, payload);
  } catch (err) {
    console.error('sendPushToUser error:', err);
    return 0;
  }
}
