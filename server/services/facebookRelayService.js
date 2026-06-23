import pool from '../db.js';
import crypto from 'crypto';

export async function enqueuePublishTask(petId, groupId, fbGroupId, message, imageUrls) {
  const marker = crypto.randomUUID().substring(0, 5);
  const messageWithMarker = message + '\n\n[MKR-' + marker + ']';
  const result = await pool.query(
    `INSERT INTO fb_relay_tasks (pet_id, group_id, fb_group_id, message, image_urls, marker)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [petId, groupId, fbGroupId, messageWithMarker, imageUrls || [], marker]
  );
  return { taskId: result.rows[0].id, marker };
}

export async function getPendingTasks(limit = 5) {
  const result = await pool.query(
    "SELECT id, pet_id, group_id, fb_group_id, message, image_urls, marker, created_at FROM fb_relay_tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1",
    [limit]
  );
  return result.rows;
}

export async function markCompleted(taskIds) {
  if (taskIds.length === 0) return;
  await pool.query(
    "UPDATE fb_relay_tasks SET status = 'completed', completed_at = NOW() WHERE id = ANY($1::uuid[]) AND status = 'pending'",
    [taskIds]
  );
}

export async function markFailed(taskId, errorMessage) {
  await pool.query(
    "UPDATE fb_relay_tasks SET status = 'failed', error_message = $2, completed_at = NOW() WHERE id = $1",
    [taskId, errorMessage]
  );
}

export async function isEnabled() {
  const result = await pool.query("SELECT value FROM settings WHERE key = 'fb_relay_enabled'");
  return result.rows[0]?.value === 'true';
}

export async function setEnabled(val) {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('fb_relay_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [val ? 'true' : 'false']
  );
}

export async function getStats() {
  const counts = await pool.query(
    `SELECT status, COUNT(*)::int as count FROM fb_relay_tasks GROUP BY status`
  );
  const recent = await pool.query(
    `SELECT ft.*, p.name as pet_name, fg.name as group_name
     FROM fb_relay_tasks ft
     LEFT JOIN pets p ON p.id = ft.pet_id
     LEFT JOIN facebook_groups fg ON fg.id = ft.group_id
     ORDER BY ft.created_at DESC LIMIT 20`
  );
  const map = {};
  for (const r of counts.rows) map[r.status] = r.count;
  return {
    pending: map.pending || 0,
    completed: map.completed || 0,
    failed: map.failed || 0,
    recent: recent.rows,
  };
}

export async function getFailedTasks(limit = 20) {
  const result = await pool.query(
    `SELECT ft.*, p.name as pet_name, fg.name as group_name
     FROM fb_relay_tasks ft
     LEFT JOIN pets p ON p.id = ft.pet_id
     LEFT JOIN facebook_groups fg ON fg.id = ft.group_id
     WHERE ft.status = 'failed'
     ORDER BY ft.completed_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

const SESSION_KEY = 'fb_relay_storage_state';

export async function saveSessionFile(base64Data) {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
    [SESSION_KEY, base64Data]
  );
}

export async function getSessionFile() {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", [SESSION_KEY]);
  return result.rows[0]?.value || null;
}

export async function clearSessionFile() {
  await pool.query("DELETE FROM settings WHERE key = $1", [SESSION_KEY]);
}
