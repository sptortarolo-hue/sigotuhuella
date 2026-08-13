import pool from '../db.js';
import { createCaseEvent } from './caseService.js';

const STH_REGEX = /\b(STH\d{5})\b/;

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
const escapedHost = FRONTEND_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PET_URL_REGEX = new RegExp(
  `${escapedHost}/pet/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`,
  'i'
);

async function isEnabled() {
  const res = await pool.query("SELECT value FROM settings WHERE key = 'replica_detection_enabled'");
  return res.rows[0]?.value === 'true';
}

async function findCaseForPet(petId) {
  const res = await pool.query('SELECT id FROM pet_cases WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 1', [petId]);
  return res.rows[0]?.id || null;
}

async function resolveGroup(groupId, groupName) {
  if (groupName) return groupName;
  if (!groupId) return null;
  const res = await pool.query('SELECT name FROM facebook_groups WHERE id = $1', [groupId]);
  return res.rows[0]?.name || null;
}

export async function recordReplica({ fbPostId, petId, caseId, method, groupId, groupName, fbPostUrl }) {
  if (!fbPostId || !petId || !caseId) return null;

  const resolvedName = await resolveGroup(groupId, groupName);
  try {
    await pool.query(
      `INSERT INTO facebook_replicas (fb_post_id, pet_id, case_id, method, group_id, group_name, fb_post_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (fb_post_id, case_id) DO NOTHING`,
      [fbPostId, petId, caseId, method, groupId || null, resolvedName, fbPostUrl || null]
    );
  } catch (err) {
    console.error('[Replica] insert error:', err.message);
    return null;
  }

  // Evento de timeline solo la primera vez por grupo y caso (evita saturar)
  const groupKey = groupId ? String(groupId) : '__unknown__';
  try {
    const exists = await pool.query(
      `SELECT 1 FROM case_events
       WHERE case_id = $1 AND event_type = 'facebook_replica' AND payload->>'group_id' = $2
       LIMIT 1`,
      [caseId, groupKey]
    );
    if (exists.rows.length === 0) {
      await createCaseEvent(caseId, 'facebook_replica', {
        fb_post_id: fbPostId,
        group_id: groupKey,
        group_name: resolvedName || null,
        fb_post_url: fbPostUrl || null,
        method,
      });
    }
  } catch (err) {
    console.error('[Replica] event error:', err.message);
  }
  return true;
}

export async function detectReplicaByTask(post) {
  if (!post?.id) return null;
  try {
    if (!(await isEnabled())) return null;

    const { content, fb_post_url, group_id, group_name } = post;

    // 1) Número de caso STH##### en el contenido (publicaciones nuevas que lo incluyen)
    const sthMatch = content?.match(STH_REGEX);
    if (sthMatch) {
      const petRes = await pool.query('SELECT id FROM pets WHERE case_number = $1 LIMIT 1', [sthMatch[1]]);
      if (petRes.rows.length > 0) {
        const petId = petRes.rows[0].id;
        const caseId = await findCaseForPet(petId);
        if (caseId) {
          await recordReplica({ fbPostId: post.id, petId, caseId, method: 'sth', groupId: group_id, groupName: group_name, fbPostUrl: fb_post_url });
          return 'sth';
        }
      }
    }

    // 2) Link del pet (https://sigotuhuella.com.ar/pet/{uuid}) en el contenido
    const petUrlMatch = content?.match(PET_URL_REGEX);
    if (petUrlMatch) {
      const petRes = await pool.query('SELECT id FROM pets WHERE id = $1 LIMIT 1', [petUrlMatch[1]]);
      if (petRes.rows.length > 0) {
        const petId = petRes.rows[0].id;
        const caseId = await findCaseForPet(petId);
        if (caseId) {
          await recordReplica({ fbPostId: post.id, petId, caseId, method: 'pet_url', groupId: group_id, groupName: group_name, fbPostUrl: fb_post_url });
          return 'pet_url';
        }
      }
    }

    return null;
  } catch (err) {
    console.error('[Replica] detect error:', err.message);
    return null;
  }
}

export async function runReplicaDetection({ days = 7, limit = 500 } = {}) {
  if (!(await isEnabled())) return { processed: 0, detected: 0 };

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const result = await pool.query(
    `SELECT fp.id, fp.fb_post_url, fp.content, fp.group_id, fg.name AS group_name
     FROM facebook_posts fp
     LEFT JOIN facebook_groups fg ON fg.id = fp.group_id
     WHERE fp.scraped_at >= $1
       AND fp.classification IN ('lost', 'found')
       AND NOT EXISTS (SELECT 1 FROM facebook_replicas fr WHERE fr.fb_post_id = fp.id)
     ORDER BY fp.scraped_at DESC
     LIMIT $2`,
    [since, limit]
  );

  let detected = 0;
  for (const post of result.rows) {
    const res = await detectReplicaByTask(post);
    if (res) detected++;
  }
  console.log(`[Replica] runReplicaDetection: ${result.rows.length} revisados, ${detected} réplicas detectadas`);
  return { processed: result.rows.length, detected };
}
