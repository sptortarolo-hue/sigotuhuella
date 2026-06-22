import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import pool from '../db.js';

const router = Router();

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  next();
}

// GET /api/families - mis familias + sugerencia de crear una si no tiene
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, fm.user_id IS NOT NULL as is_member,
              (SELECT COUNT(*) FROM family_members WHERE family_id = f.id) as member_count
       FROM families f
       LEFT JOIN family_members fm ON fm.family_id = f.id AND fm.user_id = $1
       WHERE f.created_by = $1 OR fm.user_id IS NOT NULL
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching families:', err);
    res.status(500).json({ error: 'Error al obtener familias' });
  }
});

// POST /api/families - crear familia
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nombre requerido' });

    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8);

    const result = await pool.query(
      `INSERT INTO families (name, created_by, invite_code) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), req.user.id, inviteCode]
    );

    await pool.query(
      `INSERT INTO family_members (family_id, user_id) VALUES ($1, $2)`,
      [result.rows[0].id, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating family:', err);
    res.status(500).json({ error: 'Error al crear familia' });
  }
});

// POST /api/families/join - unirse con código
router.post('/join', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código requerido' });

    const family = await pool.query(
      'SELECT id FROM families WHERE invite_code = $1',
      [code.toUpperCase().trim()]
    );
    if (family.rows.length === 0) return res.status(404).json({ error: 'Código inválido' });

    await pool.query(
      `INSERT INTO family_members (family_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [family.rows[0].id, req.user.id]
    );

    res.json({ success: true, familyId: family.rows[0].id });
  } catch (err) {
    console.error('Error joining family:', err);
    res.status(500).json({ error: 'Error al unirse a la familia' });
  }
});

// GET /api/families/:id/members - miembros de una familia
router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    const membership = await pool.query(
      `SELECT 1 FROM families f
       LEFT JOIN family_members fm ON fm.family_id = f.id AND fm.user_id = $1
       WHERE f.id = $2 AND (f.created_by = $1 OR fm.user_id IS NOT NULL)`,
      [req.user.id, req.params.id]
    );
    if (membership.rows.length === 0) return res.status(403).json({ error: 'No tienes acceso' });

    const result = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.avatar_data, u.avatar_mime_type, u.avatar_type,
              fm.joined_at,
              (f.created_by = u.id) as is_owner
       FROM family_members fm
       JOIN users u ON u.id = fm.user_id
       JOIN families f ON f.id = fm.family_id
       WHERE fm.family_id = $1
       ORDER BY is_owner DESC, fm.joined_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching members:', err);
    res.status(500).json({ error: 'Error al obtener miembros' });
  }
});

// DELETE /api/families/:id/members/:userId - expulsar miembro
router.delete('/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const family = await pool.query(
      'SELECT created_by FROM families WHERE id = $1',
      [req.params.id]
    );
    if (family.rows.length === 0) return res.status(404).json({ error: 'Familia no encontrada' });
    if (family.rows[0].created_by !== req.user.id) return res.status(403).json({ error: 'Solo el dueño puede expulsar' });

    await pool.query(
      'DELETE FROM family_members WHERE family_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing member:', err);
    res.status(500).json({ error: 'Error al eliminar miembro' });
  }
});

// DELETE /api/families/:id - eliminar familia
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const family = await pool.query(
      'SELECT created_by FROM families WHERE id = $1',
      [req.params.id]
    );
    if (family.rows.length === 0) return res.status(404).json({ error: 'Familia no encontrada' });
    if (family.rows[0].created_by !== req.user.id) return res.status(403).json({ error: 'Solo el dueño puede eliminar' });

    await pool.query('DELETE FROM families WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting family:', err);
    res.status(500).json({ error: 'Error al eliminar familia' });
  }
});

export default router;
