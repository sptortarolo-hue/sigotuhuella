import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins } from '../services/pushService.js';

const router = Router();

const VALID_TARGETS = new Set(['post', 'comment', 'pet']);
const VALID_STATUSES = new Set(['pending', 'resolved', 'dismissed']);
const VALID_REASONS = new Set(['spam', 'abuso', 'info_falsa', 'maltrato', 'otro']);

const TARGET_LOOKUP = {
  post: 'SELECT id, title FROM feed_posts WHERE id = $1',
  comment: 'SELECT id, content FROM feed_comments WHERE id = $1',
  pet: 'SELECT id, name FROM pets WHERE id = $1',
};

async function targetExists(targetType, targetId) {
  const lookup = TARGET_LOOKUP[targetType];
  if (!lookup) return null;
  const result = await pool.query(lookup, [targetId]);
  return result.rows[0] || null;
}

// POST /api/reports  -> report a post, comment or pet (logged-in user)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { targetType, targetId, reason, description } = req.body;
    if (!VALID_TARGETS.has(targetType)) {
      return res.status(400).json({ error: 'Tipo de contenido inválido' });
    }
    if (!VALID_REASONS.has(reason)) {
      return res.status(400).json({ error: 'Motivo inválido' });
    }
    const target = await targetExists(targetType, targetId);
    if (!target) {
      return res.status(404).json({ error: 'Contenido no encontrado' });
    }

    const existing = await pool.query(
      `SELECT id FROM content_reports
       WHERE target_type = $1 AND target_id = $2 AND reporter_id = $3 AND status = 'pending'`,
      [targetType, targetId, req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(200).json({ ok: true, already: true });
    }

    const result = await pool.query(
      `INSERT INTO content_reports (target_type, target_id, reporter_id, reason, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [targetType, targetId, req.user.id, reason, description || null]
    );

    const label = targetType === 'pet'
      ? `Aviso "${target.name || 'Sin nombre'}"`
      : targetType === 'post'
      ? `Publicación "${target.title || ''}"`
      : 'Comentario en el feed';
    sendPushToAdmins({
      title: '🚩 Nuevo reporte',
      body: `${req.user.email || 'Alguien'} reportó: ${label} (${reason})`,
      tag: `report-${result.rows[0].id}`,
    }).catch(() => {});
    sendAdminNotificationEmail(
      '🚩 Nuevo reporte de contenido',
      `<p>Un usuario reportó contenido:</p><ul><li><b>Tipo:</b> ${targetType}</li><li><b>Contenido:</b> ${label}</li><li><b>Motivo:</b> ${reason}</li><li><b>Detalle:</b> ${description || '—'}</li></ul><p>Revisá la solapa <b>Moderación</b> del panel.</p>`
    ).catch(err => console.error('Failed to send report notification email:', err));

    res.status(201).json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error('report create error:', err);
    res.status(500).json({ error: 'Error al reportar contenido' });
  }
});

// GET /api/reports?status=pending  -> admin moderation queue
router.get('/', requireAdmin, async (req, res) => {
  try {
    const status = VALID_STATUSES.has(req.query.status) ? req.query.status : null;
    const result = await pool.query(
      `SELECT cr.*, u.display_name AS reporter_name, u.email AS reporter_email,
              fp.title AS post_title, fp.user_id AS post_author_id, pu.display_name AS post_author_name,
              fc.content AS comment_content, fc.user_id AS comment_author_id, cu.display_name AS comment_author_name,
              p.name AS pet_name, p.species AS pet_species, p.location AS pet_location,
              p.created_by AS pet_author_id, p.is_hidden AS pet_is_hidden
       FROM content_reports cr
       LEFT JOIN users u ON u.id = cr.reporter_id
       LEFT JOIN feed_posts fp ON cr.target_type = 'post' AND fp.id = cr.target_id
       LEFT JOIN users pu ON pu.id = fp.user_id
       LEFT JOIN feed_comments fc ON cr.target_type = 'comment' AND fc.id = cr.target_id
       LEFT JOIN users cu ON cu.id = fc.user_id
       LEFT JOIN pets p ON cr.target_type = 'pet' AND p.id = cr.target_id
       WHERE ($1::text IS NULL OR cr.status = $1)
       ORDER BY cr.created_at DESC
       LIMIT 500`,
      [status]
    );
    res.json({ reports: result.rows });
  } catch (err) {
    console.error('reports list error:', err);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

// PATCH /api/reports/:id  { status: 'resolved' | 'dismissed' }  -> admin
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    const result = await pool.query(
      `UPDATE content_reports SET status = $1 WHERE id = $2 RETURNING id`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reporte no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('report update error:', err);
    res.status(500).json({ error: 'Error al actualizar reporte' });
  }
});

// POST /api/reports/:id/hide  -> admin: remove/hide reported content and resolve queue
router.post('/:id/hide', requireAdmin, async (req, res) => {
  try {
    const report = await pool.query(
      'SELECT target_type, target_id FROM content_reports WHERE id = $1',
      [req.params.id]
    );
    if (report.rows.length === 0) return res.status(404).json({ error: 'Reporte no encontrado' });
    const { target_type, target_id } = report.rows[0];

    if (target_type === 'post') {
      await pool.query('DELETE FROM feed_posts WHERE id = $1', [target_id]);
    } else if (target_type === 'comment') {
      await pool.query('DELETE FROM feed_comments WHERE id = $1', [target_id]);
    } else if (target_type === 'pet') {
      await pool.query('UPDATE pets SET is_hidden = true WHERE id = $1', [target_id]);
    }

    await pool.query(
      `UPDATE content_reports SET status = 'resolved'
       WHERE target_type = $1 AND target_id = $2 AND status = 'pending'`,
      [target_type, target_id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('report hide error:', err);
    res.status(500).json({ error: 'Error al moderar contenido' });
  }
});

export default router;
