import pool from '../db.js';

export async function enqueue(waTo, text) {
  const result = await pool.query(
    'INSERT INTO relay_messages (wa_to, text) VALUES ($1, $2) RETURNING id',
    [waTo, text]
  );
  return result.rows[0].id;
}

export async function getPending(limit = 10) {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('relay_last_poll_at', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text"
  );
  const result = await pool.query(
    "SELECT id, wa_to, text FROM relay_messages WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1",
    [limit]
  );
  return result.rows;
}

export async function markSent(ids) {
  if (!ids || ids.length === 0) return;
  await pool.query(
    "UPDATE relay_messages SET status = 'sent', sent_at = NOW() WHERE id = ANY($1::uuid[]) AND status = 'pending'",
    [ids]
  );
}

export async function markFailed(ids) {
  if (!ids || ids.length === 0) return;
  await pool.query(
    "UPDATE relay_messages SET status = 'failed' WHERE id = ANY($1::uuid[]) AND status = 'pending'",
    [ids]
  );
}

export async function getStatus() {
  const settings = (await pool.query(
    "SELECT key, value FROM settings WHERE key IN ('relay_enabled', 'relay_last_poll_at')"
  )).rows;
  const map = Object.fromEntries(settings.map(r => [r.key, r.value]));

  const pendingCount = parseInt((await pool.query(
    "SELECT COUNT(*) FROM relay_messages WHERE status = 'pending'"
  )).rows[0].count);

  const enabled = map.relay_enabled === 'true';
  const lastPollAt = map.relay_last_poll_at || null;

  let connected = false;
  if (lastPollAt) {
    const diff = Date.now() - new Date(lastPollAt).getTime();
    connected = diff < 90000;
  }

  return { enabled, connected, lastPollAt, pendingCount };
}

export async function setEnabled(val) {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('relay_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [val ? 'true' : 'false']
  );
}

export async function getAllGroups() {
  const result = await pool.query(
    "SELECT * FROM whatsapp_groups WHERE is_active = TRUE"
  );
  return result.rows;
}
