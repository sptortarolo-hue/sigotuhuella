import pool from '../db.js';
import { normalizePhone } from './phoneUtils.js';

// Reporta un teléfono a la lista negra comunitaria (queda pending hasta verificación admin).
// Retorna { entry } o { error }.
export async function reportPhoneBlacklist(phone, userId, { contextType = null, contextId = null, reason = null } = {}) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { error: 'Teléfono inválido' };
  const existing = await pool.query(
    `SELECT * FROM phone_blacklist WHERE phone = $1 AND reporter_id = $2 AND status = 'pending'`,
    [normalized, userId]
  );
  if (existing.rows.length > 0) return { entry: existing.rows[0], duplicate: true };
  const res = await pool.query(
    `INSERT INTO phone_blacklist (phone, reporter_id, context_type, context_id, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [normalized, userId, contextType, contextId, reason || null]
  );
  return { entry: res.rows[0] };
}

// Lista la lista negra (solo admin). Filtros: status ('pending'|'approved'|'dismissed') 
export async function listPhoneBlacklist(status = null) {
  const result = await pool.query(
    `SELECT pb.*, u.display_name AS reporter_name
     FROM phone_blacklist pb
     LEFT JOIN users u ON u.id = pb.reporter_id
     ${status ? 'WHERE pb.status = $1' : ''}
     ORDER BY pb.created_at DESC`,
    status ? [status] : []
  );
  return result.rows;
}

// Admin aprueba/descarta una entrada.
export async function reviewPhoneBlacklist(entryId, status) {
  if (!['approved', 'dismissed'].includes(status)) return { error: 'Estado inválido' };
  const res = await pool.query(
    `UPDATE phone_blacklist SET status = $1 WHERE id = $2 RETURNING *`,
    [status, entryId]
  );
  if (res.rows.length === 0) return { error: 'Entrada no encontrada' };
  return { entry: res.rows[0] };
}

// true si el teléfono está aprobado en la lista negra.
export async function isPhoneBlacklisted(phone) {
  if (!phone) return false;
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  const res = await pool.query(
    `SELECT 1 FROM phone_blacklist WHERE phone = $1 AND status = 'approved' LIMIT 1`,
    [normalized]
  );
  return res.rows.length > 0;
}