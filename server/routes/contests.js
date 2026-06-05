import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { awardPoints, checkChallenge } from './gamification.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mc.*,
        COALESCE(nom.nominees, 0) as nominees_count,
        COALESCE(vot.votes, 0) as total_votes
      FROM monthly_contests mc
      LEFT JOIN (SELECT contest_id, COUNT(*)::int as nominees FROM contest_nominees GROUP BY contest_id) nom ON nom.contest_id = mc.id
      LEFT JOIN (SELECT cn.contest_id, COUNT(cv.id)::int as votes FROM contest_votes cv JOIN contest_nominees cn ON cn.id = cv.nominee_id GROUP BY cn.contest_id) vot ON vot.contest_id = mc.id
      ORDER BY mc.start_date DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('contests list error:', err);
    res.status(500).json({ error: 'Error al listar concursos' });
  }
});

router.get('/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mc.*,
        COALESCE(nom.nominees, 0) as nominees_count,
        COALESCE(vot.votes, 0) as total_votes
      FROM monthly_contests mc
      LEFT JOIN (SELECT contest_id, COUNT(*)::int as nominees FROM contest_nominees GROUP BY contest_id) nom ON nom.contest_id = mc.id
      LEFT JOIN (SELECT cn.contest_id, COUNT(cv.id)::int as votes FROM contest_votes cv JOIN contest_nominees cn ON cn.id = cv.nominee_id GROUP BY cn.contest_id) vot ON vot.contest_id = mc.id
      WHERE mc.is_active = true AND mc.end_date >= CURRENT_DATE
      ORDER BY mc.end_date ASC LIMIT 1`
    );
    if (result.rows.length === 0) {
      return res.json(null);
    }
    const contest = result.rows[0];

    const nominees = await pool.query(
      `SELECT cn.*, mp.name as pet_name, mp.species, mp.avatar_image IS NOT NULL as has_avatar,
              u.display_name as owner_name, u.id as owner_id,
              COALESCE(cv.user_voted, false) as user_voted
       FROM contest_nominees cn
       JOIN my_pets mp ON mp.id = cn.my_pet_id
       JOIN users u ON u.id = mp.user_id
       LEFT JOIN (SELECT 1 as user_voted FROM contest_votes WHERE nominee_id = cn.id AND user_id = $2) cv ON true
       WHERE cn.contest_id = $1
       ORDER BY cn.votes_count DESC, cn.created_at ASC`,
      [contest.id, req.user?.id || '']
    );

    res.json({ contest, nominees: nominees.rows });
  } catch (err) {
    console.error('contests active error:', err);
    res.status(500).json({ error: 'Error al obtener concurso activo' });
  }
});

router.post('/:id/nominate', requireAuth, async (req, res) => {
  try {
    const { my_pet_id } = req.body;
    if (!my_pet_id) return res.status(400).json({ error: 'my_pet_id requerido' });

    const ownerCheck = await pool.query(
      'SELECT id FROM my_pets WHERE id = $1 AND user_id = $2',
      [my_pet_id, req.user.id]
    );
    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'No te pertenece esta mascota' });
    }

    const result = await pool.query(
      `INSERT INTO contest_nominees (contest_id, my_pet_id)
       VALUES ($1, $2) ON CONFLICT (contest_id, my_pet_id) DO NOTHING RETURNING *`,
      [req.params.id, my_pet_id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Esta mascota ya está nominada' });
    }

    const nominee = await pool.query(
      `SELECT cn.*, mp.name as pet_name, mp.species, mp.avatar_image IS NOT NULL as has_avatar
       FROM contest_nominees cn JOIN my_pets mp ON mp.id = cn.my_pet_id WHERE cn.id = $1`,
      [result.rows[0].id]
    );

    awardPoints(req.user.id, 20, 'Nominó a su mascota');
    checkChallenge(req.user.id, 'first_nominate');

    res.status(201).json(nominee.rows[0]);
  } catch (err) {
    console.error('nominate error:', err);
    res.status(500).json({ error: 'Error al nominar' });
  }
});

router.post('/:nomineeId/vote', requireAuth, async (req, res) => {
  try {
    const nominee = await pool.query(
      `SELECT cn.id, cn.contest_id, mc.end_date
       FROM contest_nominees cn
       JOIN monthly_contests mc ON mc.id = cn.contest_id
       WHERE cn.id = $1 AND mc.is_active = true AND mc.end_date >= CURRENT_DATE`,
      [req.params.nomineeId]
    );
    if (nominee.rows.length === 0) {
      return res.status(400).json({ error: 'Concurso no activo o nominación no encontrada' });
    }

    const alreadyVoted = await pool.query(
      `SELECT cv.id FROM contest_votes cv
       JOIN contest_nominees cn ON cn.id = cv.nominee_id
       WHERE cn.contest_id = $1 AND cv.user_id = $2`,
      [nominee.rows[0].contest_id, req.user.id]
    );
    if (alreadyVoted.rows.length > 0) {
      return res.status(409).json({ error: 'Ya votaste en este concurso' });
    }

    await pool.query(
      'INSERT INTO contest_votes (nominee_id, user_id) VALUES ($1, $2)',
      [req.params.nomineeId, req.user.id]
    );
    await pool.query(
      'UPDATE contest_nominees SET votes_count = votes_count + 1 WHERE id = $1',
      [req.params.nomineeId]
    );

    const updated = await pool.query(
      'SELECT * FROM contest_nominees WHERE id = $1',
      [req.params.nomineeId]
    );

    awardPoints(req.user.id, 10, 'Votó en Mascota del Mes');
    checkChallenge(req.user.id, 'first_vote');

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('vote error:', err);
    res.status(500).json({ error: 'Error al votar' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, description, start_date, end_date, is_active } = req.body;
    const result = await pool.query(
      `INSERT INTO monthly_contests (title, description, start_date, end_date, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, description, start_date, end_date, is_active || false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('contest create error:', err);
    res.status(500).json({ error: 'Error al crear concurso' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { title, description, start_date, end_date, is_active } = req.body;
    const result = await pool.query(
      `UPDATE monthly_contests SET title = COALESCE($1, title), description = COALESCE($2, description),
       start_date = COALESCE($3, start_date), end_date = COALESCE($4, end_date),
       is_active = COALESCE($5, is_active) WHERE id = $6 RETURNING *`,
      [title, description, start_date, end_date, is_active, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Concurso no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('contest update error:', err);
    res.status(500).json({ error: 'Error al actualizar concurso' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM monthly_contests WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('contest delete error:', err);
    res.status(500).json({ error: 'Error al eliminar concurso' });
  }
});

export default router;
