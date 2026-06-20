import pool from '../db.js';

export async function enqueue(waTo, text) {
  const result = await pool.query(
    'INSERT INTO relay_messages (wa_to, text) VALUES ($1, $2) RETURNING id',
    [waTo, text]
  );
  return result.rows[0].id;
}

export async function getPending(limit = 10) {
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
