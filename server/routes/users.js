import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, hashPassword, comparePassword } from '../auth.js';
import sharp from 'sharp';

const router = Router();

router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, display_name, phone, role, created_at,
               avatar_data, avatar_mime_type, avatar_type, member_number, volunteer_status, badges
       FROM users ORDER BY created_at DESC`
    );
    res.json({ users: result.rows.map(u => ({ ...u, badges: u.badges || [] })) });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const { displayName, phone, role, badges } = req.body;
  const isSelf = req.user.id === req.params.id;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (displayName !== undefined) {
      fields.push(`display_name = $${idx++}`);
      values.push(displayName);
    }
    if (phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push(phone);
    }
    if (role !== undefined && isAdmin) {
      fields.push(`role = $${idx++}`);
      values.push(role);
    }
    if (badges !== undefined && isAdmin) {
      fields.push(`badges = $${idx++}::jsonb`);
      values.push(typeof badges === 'string' ? badges : JSON.stringify(badges));
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, display_name, phone, role, created_at, avatar_data, avatar_mime_type, avatar_type, member_number, volunteer_status, badges`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: { ...result.rows[0], badges: result.rows[0].badges || [] } });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.put('/:id/password', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'You can only change your own password' });
  }
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Current password and new password (min 6 chars) are required' });
  }
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const valid = await comparePassword(currentPassword, result.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const passwordHash = await hashPassword(newPassword);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.params.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.get('/:id/pets', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }
  try {
    const result = await pool.query(
      `SELECT p.*,
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.created_by = $1
      GROUP BY p.id
      ORDER BY p.created_at DESC`,
      [req.params.id]
    );
    res.json({ pets: result.rows });
  } catch (err) {
    console.error('Get user pets error:', err);
    res.status(500).json({ error: 'Failed to fetch pets' });
  }
});

router.put('/:id/avatar', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }
  const { imageData, mimeType } = req.body;
  if (!imageData || !mimeType) {
    return res.status(400).json({ error: 'Image data and mime type are required' });
  }
  let avatarData = imageData;
  let avatarMime = mimeType;
  try {
    const buffer = Buffer.from(imageData, 'base64');
    const resized = await sharp(buffer)
      .resize(200, 200, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 85 })
      .toBuffer();
    avatarData = resized.toString('base64');
    avatarMime = 'image/jpeg';
  } catch (sharpErr) {
    console.warn('Sharp resizing failed, using raw base64:', sharpErr.message);
  }

  try {
    const result = await pool.query(
      `UPDATE users SET avatar_data = $1, avatar_mime_type = $2, avatar_type = 'photo' WHERE id = $3
       RETURNING id, avatar_data, avatar_mime_type, avatar_type`,
      [avatarData, avatarMime, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ avatar: result.rows[0] });
  } catch (err) {
    console.error('Avatar upload database error:', err);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// ── Search users ──────────────────────────────────────────────────────────────
router.get('/search', requireAdmin, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ users: [] });
  try {
    const result = await pool.query(
      `SELECT id, email, display_name, phone, role, created_at,
              avatar_data, avatar_mime_type, avatar_type, member_number, volunteer_status, badges
       FROM users
       WHERE email ILIKE $1 OR display_name ILIKE $1 OR phone ILIKE $1
       ORDER BY
         CASE WHEN email ILIKE $1 THEN 0 ELSE 1 END,
         created_at DESC
       LIMIT 50`,
      [`%${q}%`]
    );
    res.json({ users: result.rows.map(u => ({ ...u, badges: u.badges || [] })) });
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// ── Admin: get user with all relations (pets + deep data) ─────────────────────
router.get('/:id/relations', requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const userRes = await pool.query(
      `SELECT id, email, display_name, phone, role, created_at, updated_at,
              avatar_data, avatar_mime_type, avatar_type, member_number,
              volunteer_status, badges, contribution_areas, points, level,
              email_verified, registration_pending, notification_preference
       FROM users WHERE id = $1`,
      [userId]
    );
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = { ...userRes.rows[0], badges: userRes.rows[0].badges || [] };

    const volRes = await pool.query(
      'SELECT * FROM volunteer_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    let conversations = [];
    if (user.phone) {
      const convRes = await pool.query(
        `SELECT wc.*,
          COALESCE(json_agg(json_build_object('id', wm.id, 'text_body', wm.text_body, 'message_type', wm.message_type, 'direction', wm.direction, 'created_at', wm.created_at, 'pet_id', wm.pet_id) ORDER BY wm.created_at DESC) FILTER (WHERE wm.id IS NOT NULL), '[]') as messages
        FROM whatsapp_conversations wc
        LEFT JOIN whatsapp_messages wm ON wm.conversation_id = wc.id
        WHERE wc.wa_from LIKE $1
        GROUP BY wc.id
        ORDER BY wc.last_message_at DESC
        LIMIT 20`,
        [`%${user.phone.slice(-8)}%`]
      );
      conversations = convRes.rows;
    }

    const petsRes = await pool.query(
      `SELECT p.*,
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL, 'sort_order', pi.sort_order) ORDER BY pi.sort_order, pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.created_by = $1
      GROUP BY p.id
      ORDER BY p.created_at DESC`,
      [userId]
    );

    const petsWithRelations = await Promise.all(petsRes.rows.map(async (pet) => {
      const [fbPosts, igPosts, waMessages, fbMatches, qrIdents] = await Promise.all([
        pool.query(
          `SELECT id, fb_post_id, fb_post_url, author_name, content, image_urls,
                  classification, species, phone, location_hint, is_matched, posted_at, notes
           FROM facebook_posts
           WHERE id IN (
             SELECT target_id FROM facebook_matches
             WHERE source_type = 'pet' AND source_id = $1 AND target_type = 'facebook_post'
           )
           ORDER BY posted_at DESC
           LIMIT 10`,
          [pet.id]
        ),
        pool.query(
          'SELECT id, media_type, caption, ig_permalink, status, published_at, created_at FROM instagram_posts WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 10',
          [pet.id]
        ),
        pool.query(
          `SELECT id, wa_from, sender_name, text_body, message_type, direction, created_at
           FROM whatsapp_messages WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [pet.id]
        ),
        pool.query(
          `SELECT fm.*, fp.fb_post_id, fp.fb_post_url, fp.content as fb_content, fp.author_name as fb_author,
                  fp.classification as fb_classification
           FROM facebook_matches fm
           LEFT JOIN facebook_posts fp ON fp.id = fm.source_id
           WHERE (fm.source_type = 'pet' AND fm.source_id = $1)
              OR (fm.target_type = 'pet' AND fm.target_id = $1)
           ORDER BY fm.created_at DESC
           LIMIT 20`,
          [pet.id]
        ),
        pool.query(
          'SELECT id, code, share_token, assigned_at, created_at FROM qr_identifiers WHERE my_pet_id IN (SELECT id FROM my_pets WHERE lost_report_id = $1) LIMIT 5',
          [pet.id]
        ),
      ]);

      return {
        ...pet,
        neighborhoods: typeof pet.neighborhoods === 'string' ? JSON.parse(pet.neighborhoods) : pet.neighborhoods,
        facebook_posts: fbPosts.rows,
        instagram_posts: igPosts.rows,
        whatsapp_messages: waMessages.rows,
        facebook_matches: fbMatches.rows,
        qr_identifiers: qrIdents.rows,
      };
    }));

    const myPetsRes = await pool.query(
      `SELECT mp.*,
        COALESCE(json_agg(json_build_object('id', mpp.id, 'image_data', mpp.image_data, 'mime_type', mpp.mime_type, 'caption', mpp.caption) ORDER BY mpp.created_at) FILTER (WHERE mpp.id IS NOT NULL), '[]') as photos
      FROM my_pets mp
      LEFT JOIN my_pet_photos mpp ON mpp.my_pet_id = mp.id
      WHERE mp.user_id = $1
      GROUP BY mp.id
      ORDER BY mp.created_at DESC`,
      [userId]
    );

    const statsRes = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE TRUE) AS total_reports,
        COUNT(*) FILTER (WHERE status = 'reunited') AS reunited_count,
        COUNT(*) FILTER (WHERE status = 'sighted') AS sighted_count,
        COUNT(*) FILTER (WHERE status = 'adopted') AS adopted_count,
        COUNT(*) FILTER (WHERE status = 'for_adoption') AS for_adoption_count
       FROM pets WHERE created_by = $1`,
      [userId]
    );

    res.json({
      user,
      volunteer_request: volRes.rows[0] || null,
      conversations,
      myPets: myPetsRes.rows,
      pets: petsWithRelations,
      stats: {
        total_reports: parseInt(statsRes.rows[0].total_reports) || 0,
        reunited_count: parseInt(statsRes.rows[0].reunited_count) || 0,
        sighted_count: parseInt(statsRes.rows[0].sighted_count) || 0,
        adopted_count: parseInt(statsRes.rows[0].adopted_count) || 0,
        for_adoption_count: parseInt(statsRes.rows[0].for_adoption_count) || 0,
      },
    });
  } catch (err) {
    console.error('Get user relations error:', err);
    res.status(500).json({ error: 'Failed to fetch user relations' });
  }
});

// ── Admin: update user member info ────────────────────────────────────────────
router.put('/:id/member', requireAdmin, async (req, res) => {
  const { memberNumber, displayName } = req.body;
  try {
    const fields = [];
    const values = [];
    let idx = 1;
    if (memberNumber !== undefined) {
      fields.push(`member_number = $${idx++}`);
      values.push(memberNumber);
    }
    if (displayName !== undefined) {
      fields.push(`display_name = $${idx++}`);
      values.push(displayName);
    }
    fields.push(`updated_at = NOW()`);
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, display_name, member_number`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ error: 'Failed to update member info' });
  }
});

// ── User Stats & Gamification Level ─────────────────────────────────────────
router.get('/:id/stats', requireAuth, async (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized' });
  }
  try {
    const statsRes = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE TRUE)                          AS total_reports,
        COUNT(*) FILTER (WHERE status = 'reunited')           AS reunited_count,
        COUNT(*) FILTER (WHERE status = 'sighted')            AS sighted_count,
        COUNT(*) FILTER (WHERE status = 'adopted')            AS adopted_count,
        COUNT(*) FILTER (WHERE status = 'for_adoption')       AS for_adoption_count
       FROM pets WHERE created_by = $1`,
      [req.params.id]
    );
    const s = statsRes.rows[0];
    const total = parseInt(s.total_reports) || 0;
    const reunited = parseInt(s.reunited_count) || 0;

    // Determine level
    let level = 'Voluntario';
    let levelCode = 'volunteer';
    let levelOrder = 1;
    if (total >= 5 || reunited >= 1) { level = 'Proteccionista'; levelCode = 'protector'; levelOrder = 2; }
    if (total >= 15 || reunited >= 3) { level = 'Héroe Local'; levelCode = 'hero'; levelOrder = 3; }
    if (total >= 30 || reunited >= 10) { level = 'Leyenda'; levelCode = 'legend'; levelOrder = 4; }

    // Next level thresholds
    const nextThresholds = [
      { order: 1, name: 'Proteccionista', reports: 5, reunited: 1 },
      { order: 2, name: 'Héroe Local', reports: 15, reunited: 3 },
      { order: 3, name: 'Leyenda', reports: 30, reunited: 10 },
    ];
    const next = nextThresholds.find(t => t.order > levelOrder) || null;

    // ── Auto badge awarding ───────────────────────────────────────────────
    const autoRules = [
      { code: 'first_report',     condition: total >= 1    },
      { code: 'reporter_5',       condition: total >= 5    },
      { code: 'reporter_15',      condition: total >= 15   },
      { code: 'reunited_hero',    condition: reunited >= 1 },
      { code: 'reunited_legend',  condition: reunited >= 10},
    ];

    const userRes = await pool.query('SELECT badges FROM users WHERE id = $1', [req.params.id]);
    let currentBadges = (userRes.rows[0]?.badges || []).filter(Boolean);
    let badgesChanged = false;

    for (const rule of autoRules) {
      if (rule.condition && !currentBadges.some((b) => b.code === rule.code)) {
        currentBadges.push({ code: rule.code, awarded_at: new Date().toISOString() });
        badgesChanged = true;
      }
    }

    if (badgesChanged) {
      await pool.query(
        'UPDATE users SET badges = $1::jsonb WHERE id = $2',
        [JSON.stringify(currentBadges), req.params.id]
      );
    }

    res.json({
      stats: {
        total_reports: total,
        reunited_count: reunited,
        sighted_count: parseInt(s.sighted_count) || 0,
        adopted_count: parseInt(s.adopted_count) || 0,
        for_adoption_count: parseInt(s.for_adoption_count) || 0,
      },
      level: { name: level, code: levelCode, order: levelOrder },
      nextLevel: next,
      badges: currentBadges,
    });
  } catch (err) {
    console.error('Get user stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;