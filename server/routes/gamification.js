import { Router } from 'express';
import pool from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

const CHALLENGES = [
  { key: 'first_post', title: 'Primera Publicación', description: 'Publicá en la comunidad por primera vez', icon: '📝', target: 1, points: 10 },
  { key: 'five_posts', title: 'Cinco Publicaciones', description: 'Publicá 5 veces en la comunidad', icon: '✍️', target: 5, points: 50 },
  { key: 'first_like_received', title: 'Primer Like', description: 'Recibí tu primer like en la comunidad', icon: '❤️', target: 1, points: 5 },
  { key: 'ten_likes_received', title: '10 Likes', description: 'Acumulá 10 likes en tus publicaciones', icon: '🔥', target: 10, points: 25 },
  { key: 'first_vote', title: 'Primer Voto', description: 'Votá en un concurso de Mascota del Mes', icon: '🗳️', target: 1, points: 10 },
  { key: 'first_nominate', title: 'Participante', description: 'Nominá a tu mascota a Mascota del Mes', icon: '🏆', target: 1, points: 20 },
  { key: 'complete_profile', title: 'Perfil Completo', description: 'Completá todos los datos de tu mascota', icon: '✅', target: 1, points: 15 },
  { key: 'add_event', title: 'Primer Evento', description: 'Agregá un evento al timeline de tu mascota', icon: '📅', target: 1, points: 10 },
  { key: 'five_events', title: '5 Eventos', description: 'Agregá 5 eventos al timeline', icon: '📊', target: 5, points: 30 },
];

const LEVELS = [
  { level: 1, name: 'Nuevo Amigo', minPoints: 0 },
  { level: 2, name: 'Amigo Fiel', minPoints: 50 },
  { level: 3, name: 'Compañero', minPoints: 150 },
  { level: 4, name: 'Protector', minPoints: 300 },
  { level: 5, name: 'Héroe Animal', minPoints: 500 },
  { level: 6, name: 'Leyenda Patas', minPoints: 1000 },
];

async function awardPoints(userId, points, reason) {
  try {
    await pool.query(
      `INSERT INTO user_points (user_id, points)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET points = user_points.points + $2, updated_at = NOW()`,
      [userId, points]
    );

    const result = await pool.query('SELECT points FROM user_points WHERE user_id = $1', [userId]);
    const totalPoints = result.rows[0]?.points || 0;

    let newLevel = 1;
    for (const l of LEVELS) {
      if (totalPoints >= l.minPoints) newLevel = l.level;
    }

    await pool.query(
      'UPDATE users SET points = $1, level = $2 WHERE id = $3',
      [totalPoints, newLevel, userId]
    );

    const existing = await pool.query(
      'SELECT points, level, updated_at FROM user_points WHERE user_id = $1',
      [userId]
    );
    if (existing.rows.length > 0 && existing.rows[0].level !== newLevel) {
      await pool.query('UPDATE user_points SET level = $1 WHERE user_id = $2', [newLevel, userId]);
    }

    return { points: totalPoints, level: newLevel, awarded: points };
  } catch (err) {
    console.error('awardPoints error:', err);
    return null;
  }
}

async function checkChallenge(userId, challengeKey, progressIncrement = 1) {
  try {
    const challenge = CHALLENGES.find(c => c.key === challengeKey);
    if (!challenge) return null;

    const result = await pool.query(
      `INSERT INTO user_challenges (user_id, challenge_key, title, description, icon, target, progress)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, challenge_key) DO UPDATE SET progress = user_challenges.progress + $7
       WHERE user_challenges.completed = false
       RETURNING *`,
      [userId, challengeKey, challenge.title, challenge.description, challenge.icon, challenge.target, progressIncrement]
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      if (row.progress >= row.target && !row.completed) {
        await pool.query(
          `UPDATE user_challenges SET completed = true, completed_at = NOW() WHERE id = $1`,
          [row.id]
        );
        await awardPoints(userId, challenge.points, `Challenge: ${challenge.title}`);
        return { ...row, completed: true, just_completed: true, points_awarded: challenge.points };
      }
      return row;
    }
    return null;
  } catch (err) {
    console.error('checkChallenge error:', err);
    return null;
  }
}

router.get('/my-stats', requireAuth, async (req, res) => {
  try {
    const pointsResult = await pool.query(
      'SELECT points, level, updated_at FROM user_points WHERE user_id = $1',
      [req.user.id]
    );
    const points = pointsResult.rows[0]?.points || 0;
    const level = pointsResult.rows[0]?.level || 1;

    const challengesResult = await pool.query(
      'SELECT * FROM user_challenges WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    const allChallenges = CHALLENGES.map(c => {
      const existing = challengesResult.rows.find(uc => uc.challenge_key === c.key);
      return existing
        ? { ...c, id: existing.id, progress: existing.progress, completed: existing.completed, completed_at: existing.completed_at }
        : { ...c, progress: 0, completed: false, completed_at: null };
    });

    const currentLevel = LEVELS.find(l => l.level === level) || LEVELS[0];
    const nextLevel = LEVELS.find(l => l.level === level + 1);
    const progressToNext = nextLevel
      ? Math.min(100, Math.round(((points - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100))
      : 100;

    res.json({
      points,
      level,
      levelName: currentLevel.name,
      progressToNext,
      nextLevelName: nextLevel?.name || null,
      challenges: allChallenges,
    });
  } catch (err) {
    console.error('gamification stats error:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT up.user_id, u.display_name, u.avatar_data IS NOT NULL as has_avatar,
              u.avatar_type, u.level, up.points
       FROM user_points up
       JOIN users u ON u.id = up.user_id
       ORDER BY up.points DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('leaderboard error:', err);
    res.status(500).json({ error: 'Error al obtener leaderboard' });
  }
});

router.post('/award', requireAuth, async (req, res) => {
  try {
    const { points, reason } = req.body;
    const result = await awardPoints(req.user.id, points, reason);
    res.json(result);
  } catch (err) {
    console.error('award points error:', err);
    res.status(500).json({ error: 'Error al otorgar puntos' });
  }
});

export default router;
export { awardPoints, checkChallenge, CHALLENGES, LEVELS };
