import pool from '../db.js';
import crypto from 'crypto';

export function applySpintax(text) {
  return text.replace(/\{([^}]+)\}/g, (_, variants) => {
    const opts = variants.split('|').map(v => v.trim());
    return opts[Math.floor(Math.random() * opts.length)];
  });
}

export async function enqueuePublishTask(petId, groupId, fbGroupId, message, imageUrls, pagePostUrl) {
  if (pagePostUrl) {
    const result = await pool.query(
      `INSERT INTO fb_relay_tasks (pet_id, group_id, fb_group_id, message, action, target_url, status)
       VALUES ($1, $2, $3, $4, 'share', $5, 'pending') RETURNING id`,
      [petId, groupId, fbGroupId, message, pagePostUrl]
    );
    return { taskId: result.rows[0].id, marker: '' };
  }
  const marker = crypto.randomUUID().substring(0, 5);
  const messageWithMarker = message + '\n\n[MKR-' + marker + ']';
  const result = await pool.query(
    `INSERT INTO fb_relay_tasks (pet_id, group_id, fb_group_id, message, image_urls, marker)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [petId, groupId, fbGroupId, messageWithMarker, imageUrls || [], marker]
  );
  return { taskId: result.rows[0].id, marker };
}

export async function getPendingTasks(limit = 5, opts = {}) {
  const { action, excludeAction } = opts;
  const params = [];
  const add = (val) => { params.push(val); return `$${params.length}`; };
  const conds = ["ft.status = 'pending'"];
  if (action) {
    const values = Array.isArray(action) ? action : [action];
    conds.push(`ft.action = ANY(${add(values)}::text[])`);
  }
  if (excludeAction) {
    const values = Array.isArray(excludeAction) ? excludeAction : [excludeAction];
    conds.push(`(ft.action IS NULL OR ft.action <> ALL(${add(values)}::text[]))`);
  }
  conds.push(`ft.id IN (SELECT id FROM fb_relay_tasks WHERE status = 'pending' ORDER BY created_at ASC LIMIT ${add(limit)})`);
  const result = await pool.query(
    `SELECT ft.id, ft.pet_id, ft.group_id, ft.fb_group_id, ft.message, ft.image_urls, ft.marker, ft.action, ft.target_url, ft.comment_text, ft.created_at, fg.name as group_name
     FROM fb_relay_tasks ft
     LEFT JOIN facebook_groups fg ON fg.id = ft.group_id
     WHERE ${conds.join(' AND ')} ORDER BY ft.created_at ASC`,
    params
  );
  return result.rows;
}

export async function markCompleted(taskUpdates) {
  if (taskUpdates.length === 0) return;
  const ids = [];
  for (const u of taskUpdates) {
    ids.push(u.task_id);
    if (u.fb_post_url) {
      await pool.query(
        "UPDATE fb_relay_tasks SET fb_post_url = $2 WHERE id = $1",
        [u.task_id, u.fb_post_url]
      );
    }
  }
  await pool.query(
    "UPDATE fb_relay_tasks SET status = 'completed', completed_at = NOW() WHERE id = ANY($1::uuid[]) AND status = 'pending'",
    [ids]
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

const PROFILE_KEY = 'fb_relay_profile_data';

export async function saveProfile(base64Data) {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
    [PROFILE_KEY, base64Data]
  );
}

export async function getProfile() {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", [PROFILE_KEY]);
  return result.rows[0]?.value || null;
}

export async function clearProfile() {
  await pool.query("DELETE FROM settings WHERE key = $1", [PROFILE_KEY]);
}

const SESSION_DATA_KEY = 'fb_relay_session_data';

export async function saveSessionData(jsonData) {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
    [SESSION_DATA_KEY, jsonData]
  );
}

export async function getSessionData() {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", [SESSION_DATA_KEY]);
  return result.rows[0]?.value || null;
}
