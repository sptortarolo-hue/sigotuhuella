import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, verifyToken, sendAdminNotificationEmail, sendLostPetConfirmationEmail } from '../auth.js';
import { matchPetToPosts } from '../services/geminiMatching.js';
import { broadcastPetToGroups } from '../services/whatsappService.js';
import { normalizePhone } from '../services/phoneUtils.js';
import { enqueuePublishTask } from '../services/facebookRelayService.js';
import { sendPushToAdmins } from '../services/pushService.js';
import sharp from 'sharp';
import { isConnected, replyToComment } from '../services/instagramService.js';
import PDFDocument from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

async function canEditPet(userId, petId) {
  const result = await pool.query(
    `SELECT p.created_by, ps.user_id IS NOT NULL as is_shared
     FROM pets p
     LEFT JOIN pet_shares ps ON ps.pet_id = p.id AND ps.user_id = $1
     WHERE p.id = $2`,
    [userId, petId]
  );
  if (result.rows.length === 0) return false;
  const row = result.rows[0];
  return row.created_by === userId || row.is_shared;
}

async function processImage(imageData, mimeType, size = 800) {
  try {
    const buffer = Buffer.from(imageData, 'base64');
    const processed = await sharp(buffer)
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return {
      data: processed.toString('base64'),
      mimeType: 'image/jpeg',
    };
  } catch (err) {
    console.error('Image processing failed:', err.message);
    throw err;
  }
}

async function createCollage(images) {
  const imgs = images.slice(0, 3);
  const buffers = imgs.map(img => Buffer.from(img.image_data, 'base64'));

  if (imgs.length === 2) {
    const resized = await Promise.all(
      buffers.map(buf => sharp(buf).resize(400, 400, { fit: 'cover', position: 'attention' }).toBuffer())
    );
    const collage = await sharp({
      create: { width: 800, height: 400, channels: 3, background: { r: 240, g: 240, b: 240 } }
    })
    .composite([
      { input: resized[0], top: 0, left: 0 },
      { input: resized[1], top: 0, left: 400 },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
    return { data: collage.toString('base64'), mimeType: 'image/jpeg' };
  }

  if (imgs.length >= 3) {
    const resized = await Promise.all(
      buffers.map(buf => sharp(buf).resize(300, 300, { fit: 'cover', position: 'attention' }).toBuffer())
    );
    const collage = await sharp({
      create: { width: 600, height: 600, channels: 3, background: { r: 240, g: 240, b: 240 } }
    })
    .composite([
      { input: resized[0], top: 0, left: 0 },
      { input: resized[1], top: 0, left: 300 },
      { input: resized[2], top: 300, left: 150 },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
    return { data: collage.toString('base64'), mimeType: 'image/jpeg' };
  }

  if (imgs.length === 1) {
    return { data: imgs[0].image_data, mimeType: imgs[0].mime_type };
  }

  return { data: null, mimeType: null };
}

function generateCelebrationText(pet, type) {
  const name = pet.name || 'una mascota';
  const species = pet.species === 'dog' ? 'perro' : pet.species === 'cat' ? 'gato' : 'mascota';
  const location = pet.location || 'nuestra zona';
  const isFemale = pet.gender === 'female';

  if (type === 'reunited') {
    const action = isFemale ? 'reencontrada' : 'reencontrado';
    const lostAction = isFemale ? 'perdida' : 'perdido';
    const messages = [
      `¡Qué alegría! 🎉 ${name} ya está de vuelta en casa. Este ${species} que buscábamos en ${location} fue ${action} con su familia. ¡Gracias a toda la comunidad que difundió y ayudó! Juntos hacemos la diferencia. 🐾💚`,
      `¡Final feliz! 🥳 ${name}, el ${species} que estaba ${lostAction} en ${location}, ya se reencontró con su familia. Gracias a la red de vecinos que compartieron su publicación. ¡Sigo Tu Huella sigue sumando reencuentros! 🐾❤️`,
      `¡Buenas noticias! ✨ ¡${name} apareció! Este ${species} que buscábamos en ${location} ya está con los suyos. La comunidad de Sicardi/Garibaldi una vez más demostró su solidaridad. 🙌🐾`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  if (type === 'adopted') {
    const action = isFemale ? 'adoptada' : 'adoptado';
    const messages = [
      `¡Nuevo hogar! 🏡 ${name} encontró una familia. Este ${species} fue ${action} y ahora tiene un hogar lleno de amor. ¡Gracias a todos los que compartieron y ayudaron a difundir! 🐾💚`,
      `¡Feliz adopción! 🎊 ${name} ya tiene familia. Después de esperar, este ${species} fue ${action}. Deseamos que sea muy feliz en su nuevo hogar. ¡Sigo Tu Huella celebra! 🐾❤️`,
      `¡Un final feliz más! 🌟 ${name} fue ${action}. Este ${species} encontró un hogar lleno de amor. Gracias a la red de adopción por hacer esto posible. 🐾💕`,
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  return '';
}

async function autoCreateNews(pet, newsType) {
  try {
    let title = '';
    const isFemale = pet.gender === 'female';
    if (newsType === 'reunited') {
      if (pet.name) {
        const action = isFemale ? 'reencontrada' : 'reencontrado';
        title = `¡${pet.name} fue ${action}! 🎉`;
      } else {
        title = `¡Una mascota fue reencontrada! 🎉`;
      }
    } else { // adopted
      if (pet.name) {
        const action = isFemale ? 'adoptada' : 'adoptado';
        title = `¡${pet.name} fue ${action}! 🏡`;
      } else {
        title = `¡Una mascota fue adoptada! 🏡`;
      }
    }
    const content = generateCelebrationText(pet, newsType);
    // Fetch pet images for news image
    const imagesResult = await pool.query(
      'SELECT image_data, mime_type FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 3',
      [pet.id]
    );
    const { data: imageData, mimeType } = await createCollage(imagesResult.rows);
    if (imageData && mimeType) {
      await pool.query(
        `INSERT INTO news (title, content, image_data, mime_type, type, related_pet_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [title, content, imageData, mimeType, newsType, pet.id, pet.created_by]
      );
    } else {
      await pool.query(
        `INSERT INTO news (title, content, type, related_pet_id, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [title, content, newsType, pet.id, pet.created_by]
      );
    }
  } catch (err) {
    console.error('Auto-create news error:', err);
  }
}

async function autoInstagramComment(pet, newsType) {
  try {
    const connected = await isConnected();
    if (!connected) return;
    const igPost = await pool.query(
      "SELECT ig_media_id, ig_permalink FROM instagram_posts WHERE pet_id = $1 AND status = 'published' ORDER BY published_at DESC LIMIT 1",
      [pet.id]
    );
    if (igPost.rows.length === 0) return;
    const commentText = generateCelebrationText(pet, newsType);
    if (!commentText) return;
    await replyToComment(igPost.rows[0].ig_media_id, commentText);
    console.log(`[Instagram] Auto-commented on pet ${pet.id}: ${commentText.slice(0, 60)}...`);
  } catch (err) {
    console.error('[Instagram] Auto-comment error:', err);
  }
}

async function autoQueueCelebrationPost(pet, newsType) {
  try {
    const connected = await isConnected();
    if (!connected) return;
    const imagesResult = await pool.query(
      'SELECT COUNT(*) as cnt FROM pet_images WHERE pet_id = $1', [pet.id]
    );
    if (parseInt(imagesResult.rows[0].cnt) === 0) return;
    const hashtags = await pool.query("SELECT value FROM settings WHERE key = 'instagram_default_hashtags'");
    const htag = hashtags.rows[0]?.value || '#SigoTuHuella';
    const caption = generateCelebrationText(pet, newsType);
    if (!caption) return;
    await pool.query(
      `INSERT INTO instagram_posts (pet_id, media_type, caption, status, created_at)
       VALUES ($1, 'IMAGE', $2, 'queued', NOW())`,
      [pet.id, `${caption}\n\n${htag}`]
    );
    console.log(`[Instagram] Queued celebration post for pet ${pet.id}`);
  } catch (err) {
    console.error('[Instagram] Auto-queue celebration error:', err);
  }
}

// ── Gamification helper ──────────────────────────────────────────────────────
async function awardBadgeIfMissing(userId, code) {
  if (!userId) return;
  try {
    const userRes = await pool.query('SELECT badges, volunteer_status FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return;
    const { badges, volunteer_status } = userRes.rows[0];
    if (volunteer_status === 'none' || !volunteer_status) return; // only members earn auto-badges
    const existing = Array.isArray(badges) ? badges : [];
    if (existing.find(b => b.code === code)) return;
    const updated = JSON.stringify([...existing, { code, awarded_at: new Date().toISOString() }]);
    await pool.query('UPDATE users SET badges = $1::jsonb WHERE id = $2', [updated, userId]);
  } catch (err) {
    console.error('awardBadgeIfMissing error:', err);
  }
}

const statusLabels = {
  lost: '🐾 PERDIDO', retained: '🔄 RETENIDO', sighted: '👀 AVISTADO',
  for_adoption: '❤️ EN ADOPCIÓN', adopted: '✅ ADOPTADO',
  reunited: '🎉 REENCUENTRO', accidented: '🚑 ACCIDENTADO',
  needs_attention: '⚠️ NECESITA ATENCIÓN',
};
const speciesLabel = { dog: 'Perro', cat: 'Gato', other: 'Otra mascota' };
const genderLabel = { male: 'Macho', female: 'Hembra', unknown: '' };

async function enqueueFbGroupPublish(pet) {
  try {
    const fbRelay = await pool.query("SELECT value FROM settings WHERE key = 'fb_relay_enabled'");
    if (fbRelay.rows[0]?.value !== 'true') return;
    const groups = await pool.query(
      `SELECT id, name, fb_group_id, strip_links FROM facebook_groups
       WHERE is_active = true AND publish_on_create = true AND fb_group_id IS NOT NULL AND fb_group_id != ''
       ORDER BY name`
    );
    if (groups.rows.length === 0) return;
    const [commentResult] = await Promise.all([
      pool.query("SELECT value FROM settings WHERE key = 'fb_relay_comment_text'"),
    ]);
    const commentText = commentResult.rows[0]?.value || '';
    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
    const tag = statusLabels[pet.status] || '🐾 MASCOTA';
    const species = speciesLabel[pet.species] || 'Mascota';
    const gender = genderLabel[pet.gender] || '';
    const ageGender = [gender, pet.age].filter(Boolean).join(' · ');
    const hashtags = '#SigoTuHuella #MascotasPerdidas #AdoptaNoCompres';
    let message = [
      `${tag}`,
      `${pet.name ? 'Nombre: ' + pet.name : ''}`,
      `${species}${pet.breed ? ' - ' + pet.breed : ''}`,
      `${ageGender ? ageGender : ''}`,
      `${pet.color ? '🎨 ' + pet.color : ''}`,
      `${pet.location ? '📍 ' + pet.location : ''}`,
      pet.contact_info ? `📞 ${pet.contact_info}` : '',
      '',
      pet.description ? pet.description.substring(0, 500) : '',
      '',
      `🔗 ${frontendUrl}/pet/${pet.id}`,
      '',
      hashtags,
    ].filter(Boolean).join('\n');
    const imagesResult = await pool.query(
      'SELECT image_data FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 5',
      [pet.id]
    );
    const imageUrls = imagesResult.rows.length > 0
      ? [`${frontendUrl}/api/images/pet/${pet.id}/cover`, ...imagesResult.rows.slice(1).map((_, i) => `${frontendUrl}/api/images/pet/${pet.id}/${i + 1}`)]
      : [`${frontendUrl}/api/images/pet/${pet.id}/cover`];
    for (const group of groups.rows) {
      let groupMessage = message;
      if (group.strip_links) {
        groupMessage = message.replace(/https?:\/\/\S+/g, '').replace(/#\w+/g, '').replace(/\n{4,}/g, '\n\n\n').trim();
      }
      const task = await enqueuePublishTask(pet.id, group.id, group.fb_group_id, groupMessage, imageUrls, commentText);
    }
  } catch (err) {
    console.error('[FB Relay] enqueueFbGroupPublish error:', err.message);
  }
}

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { status, isPublic, limit } = req.query;
    let query = `
      SELECT p.*, 
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
    `;
    const conditions = [];
    const params = [];
    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (isPublic === 'true') {
      conditions.push(`p.created_by IS NULL`);
    }
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ` GROUP BY p.id ORDER BY p.created_at DESC`;
    if (limit) {
      params.push(parseInt(limit));
      query += ` LIMIT $${params.length}`;
    }
    const result = await pool.query(query, params);
    res.json({ pets: result.rows });
  } catch (err) {
    console.error('Get pets error:', err);
    res.status(500).json({ error: 'Failed to fetch pets' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, 
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pet not found' });
    }
    res.json({ pet: result.rows[0] });
  } catch (err) {
    console.error('Get pet error:', err);
    res.status(500).json({ error: 'Failed to fetch pet' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { name, species, breed, color, status, gender, age, size, isVaccinated, isSterilized, description, location, latitude, longitude, contactInfo, images, neighborhoods } = req.body;
  if (!species || !status || !location) {
    return res.status(400).json({ error: 'Species, status, and location are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const petResult = await client.query(
      `INSERT INTO pets (name, species, breed, color, status, gender, age, size, is_vaccinated, is_sterilized, is_dewormed, description, location, latitude, longitude, contact_info, created_by, is_admin_verified, neighborhoods)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [name || null, species, breed || null, color || null, status, gender || 'unknown',
       age || null, size || null, isVaccinated || false, isSterilized || false, req.body.isDewormed || false,
       description || null, location, latitude || null, longitude || null,
       contactInfo || null, req.user.id, false, JSON.stringify(neighborhoods || [])]
    );
    const pet = petResult.rows[0];
    if (images && images.length > 0) {
      for (const img of images) {
        const processed = await processImage(img.data, img.mimeType || 'image/jpeg', 800);
        await client.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type, crop_x, crop_y, original_image_data) VALUES ($1, $2, $3, $4, $5, $6)',
          [pet.id, processed.data, processed.mimeType, img.crop_x ?? 0.5, img.crop_y ?? 0.5, null]
        );
      }
    }
    const imagesResult = await client.query(
      `SELECT json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) as images
      FROM pet_images pi WHERE pi.pet_id = $1`,
      [pet.id]
    );
    await client.query('COMMIT');
    pet.images = imagesResult.rows[0]?.images || [];

    // Auto-badge: first_report (first pet ever reported by this user)
    const reportCountRes = await pool.query('SELECT COUNT(*) as cnt FROM pets WHERE created_by = $1', [req.user.id]);
    if (parseInt(reportCountRes.rows[0].cnt) === 1) {
      await awardBadgeIfMissing(req.user.id, 'first_report');
    }
    // Auto-badge: reporter_5 and reporter_15 milestones
    const cnt = parseInt(reportCountRes.rows[0].cnt);
    if (cnt === 5) await awardBadgeIfMissing(req.user.id, 'reporter_5');
    if (cnt === 15) await awardBadgeIfMissing(req.user.id, 'reporter_15');

    res.status(201).json({ pet });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create pet error:', err);
    res.status(500).json({ error: 'Failed to create pet' });
  } finally {
    client.release();
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const petId = req.params.id;
  try {
    const existing = await pool.query('SELECT * FROM pets WHERE id = $1', [petId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Pet not found' });
    }
    const pet = existing.rows[0];
    if (req.user.role !== 'admin' && !(await canEditPet(req.user.id, petId))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const fields = ['name', 'species', 'breed', 'color', 'status', 'gender', 'age', 'size', 'is_vaccinated', 'is_sterilized', 'is_dewormed', 'description', 'location', 'contact_info'];
    const updates = [];
    const values = [];
    let idx = 1;
    for (const field of fields) {
      const key = field === 'contact_info' ? 'contactInfo' : field === 'is_vaccinated' ? 'isVaccinated' : field === 'is_sterilized' ? 'isSterilized' : field === 'is_dewormed' ? 'isDewormed' : field;
      if (req.body[key] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        values.push(req.body[key]);
      }
    }
    if (req.body.latitude !== undefined && req.body.longitude !== undefined) {
      updates.push(`latitude = $${idx++}`);
      values.push(req.body.latitude);
      updates.push(`longitude = $${idx++}`);
      values.push(req.body.longitude);
    }
    if (req.body.neighborhoods !== undefined) {
      updates.push(`neighborhoods = $${idx++}`);
      values.push(JSON.stringify(req.body.neighborhoods));
    }
    if (updates.length === 0 && !req.body.images && !req.body.newImages && req.body.imagesToKeep === undefined) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(petId);
      await pool.query(
        `UPDATE pets SET ${updates.join(', ')} WHERE id = $${idx}`,
        values
      );
    }
    // Handle images explicitly
    if (req.body.imagesToKeep !== undefined) {
      if (req.body.imagesToKeep.length > 0) {
        await pool.query('DELETE FROM pet_images WHERE pet_id = $1 AND id != ALL($2::uuid[])', [petId, req.body.imagesToKeep]);
      } else {
        await pool.query('DELETE FROM pet_images WHERE pet_id = $1', [petId]);
      }
    }
    if (req.body.newImages && req.body.newImages.length > 0) {
      for (const img of req.body.newImages) {
        const processed = await processImage(img.data, img.mimeType, 800);
        await pool.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type, crop_x, crop_y, original_image_data) VALUES ($1, $2, $3, $4, $5, $6)',
          [petId, processed.data, processed.mimeType, img.crop_x ?? 0.5, img.crop_y ?? 0.5, null]
        );
      }
    } else if (req.body.images && req.body.images.length > 0) {
      // Fallback for legacy behavior
      await pool.query('DELETE FROM pet_images WHERE pet_id = $1', [petId]);
      for (const img of req.body.images) {
        const processed = await processImage(img.data, img.mimeType, 800);
        await pool.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type, crop_x, crop_y, original_image_data) VALUES ($1, $2, $3, $4, $5, $6)',
          [petId, processed.data, processed.mimeType, img.crop_x ?? 0.5, img.crop_y ?? 0.5, null]
        );
      }
    }
    // Auto-generate news on status change to REUNITED or ADOPTED
    const isReunited = pet.status !== 'reunited' && req.body.status === 'reunited';
    const isAdopted = pet.status !== 'adopted' && req.body.status === 'adopted';
    // Re-fetch pet with updated data for news generation
    if (isReunited || isAdopted) {
      const updatedPet = await pool.query('SELECT * FROM pets WHERE id = $1', [petId]);
      const newsType = isReunited ? 'reunited' : 'adopted';
      await autoCreateNews(updatedPet.rows[0], newsType);
      await autoInstagramComment(updatedPet.rows[0], newsType);
      await autoQueueCelebrationPost(updatedPet.rows[0], newsType);
      broadcastPetToGroups(petId).catch(e => console.error('Broadcast reunion/adoption error:', e));
    }
    // Auto-badge: reunited_hero (first reunion)
    if (isReunited && pet.created_by) {
      const reunitedCount = await pool.query(
        "SELECT COUNT(*) as cnt FROM pets WHERE created_by = $1 AND status = 'reunited'",
        [pet.created_by]
      );
      const rc = parseInt(reunitedCount.rows[0].cnt);
      if (rc >= 1) await awardBadgeIfMissing(pet.created_by, 'reunited_hero');
      if (rc >= 5) await awardBadgeIfMissing(pet.created_by, 'reunited_legend');
    }
    // Return pet with images
    const updated = await pool.query(
      `SELECT p.*, 
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`,
      [petId]
    );
    res.json({ pet: updated.rows[0] });
  } catch (err) {
    console.error('Update pet error:', err);
    res.status(500).json({ error: 'Failed to update pet' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const petId = req.params.id;
  try {
    const existing = await pool.query('SELECT * FROM pets WHERE id = $1', [petId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Pet not found' });
    }
    const pet = existing.rows[0];
    if (req.user.role !== 'admin' && pet.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await pool.query('DELETE FROM pets WHERE id = $1', [petId]);
    res.json({ message: 'Pet deleted' });
  } catch (err) {
    console.error('Delete pet error:', err);
    res.status(500).json({ error: 'Failed to delete pet' });
  }
});

// ── Admin: get pet with all relations ──────────────────────────────────────────
router.get('/:id/relations', requireAdmin, async (req, res) => {
  try {
    const petId = req.params.id;

    const petRes = await pool.query(
      `SELECT p.*,
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL, 'sort_order', pi.sort_order) ORDER BY pi.sort_order, pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`,
      [petId]
    );
    if (petRes.rows.length === 0) return res.status(404).json({ error: 'Pet not found' });
    const pet = petRes.rows[0];
    pet.neighborhoods = typeof pet.neighborhoods === 'string' ? JSON.parse(pet.neighborhoods) : pet.neighborhoods;

    let createdBy = null;
    if (pet.created_by) {
      const userRes = await pool.query(
        'SELECT id, email, display_name, phone, role FROM users WHERE id = $1',
        [pet.created_by]
      );
      createdBy = userRes.rows[0] || null;
    }

    const fbPostsRes = await pool.query(
      `SELECT fp.*, fm.id as match_id, fm.score as match_score, fm.status as match_status, fm.reasons as match_reasons
       FROM facebook_posts fp
       JOIN facebook_matches fm ON (
         (fm.source_type = 'facebook_post' AND fm.source_id = fp.id AND fm.target_type = 'pet' AND fm.target_id = $1)
         OR
         (fm.target_type = 'facebook_post' AND fm.target_id = fp.id AND fm.source_type = 'pet' AND fm.source_id = $1)
       )
       ORDER BY fp.posted_at DESC
       LIMIT 20`,
      [petId]
    );

    const igPostsRes = await pool.query(
      'SELECT id, media_type, caption, image_urls, status, ig_media_id, ig_permalink, error_message, scheduled_publish_time, published_at, created_at FROM instagram_posts WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 20',
      [petId]
    );

    const waMessagesRes = await pool.query(
      `SELECT id, wa_from, sender_name, text_body, message_type, direction, created_at
       FROM whatsapp_messages WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [petId]
    );

    const matchesRes = await pool.query(
      `SELECT fm.*,
        CASE
          WHEN fm.target_type = 'facebook_post' THEN (SELECT fb_post_id FROM facebook_posts WHERE id = fm.target_id)
          WHEN fm.source_type = 'facebook_post' THEN (SELECT fb_post_id FROM facebook_posts WHERE id = fm.source_id)
        END as related_fb_post_id,
        CASE
          WHEN fm.target_type = 'facebook_post' THEN (SELECT content FROM facebook_posts WHERE id = fm.target_id)
          WHEN fm.source_type = 'facebook_post' THEN (SELECT content FROM facebook_posts WHERE id = fm.source_id)
        END as related_fb_content,
        CASE
          WHEN fm.target_type = 'facebook_post' THEN (SELECT author_name FROM facebook_posts WHERE id = fm.target_id)
          WHEN fm.source_type = 'facebook_post' THEN (SELECT author_name FROM facebook_posts WHERE id = fm.source_id)
        END as related_fb_author
       FROM facebook_matches fm
       WHERE (fm.source_type = 'pet' AND fm.source_id = $1)
          OR (fm.target_type = 'pet' AND fm.target_id = $1)
       ORDER BY fm.created_at DESC
       LIMIT 20`,
      [petId]
    );

    const qrRes = await pool.query(
      `SELECT qi.id, qi.code, qi.share_token, qi.assigned_at, qi.created_at
       FROM qr_identifiers qi
       JOIN my_pets mp ON mp.qr_id = qi.id
       WHERE mp.lost_report_id = $1
       LIMIT 5`,
      [petId]
    );

    res.json({
      pet,
      created_by_user: createdBy,
      facebook_posts: fbPostsRes.rows,
      instagram_posts: igPostsRes.rows,
      whatsapp_messages: waMessagesRes.rows,
      facebook_matches: matchesRes.rows,
      qr_identifiers: qrRes.rows,
    });
  } catch (err) {
    console.error('Get pet relations error:', err);
    res.status(500).json({ error: 'Failed to fetch pet relations' });
  }
});

// ── Admin: reorder pet images ─────────────────────────────────────────────────
router.put('/:id/images/reorder', requireAdmin, async (req, res) => {
  const { imageIds } = req.body;
  if (!Array.isArray(imageIds)) return res.status(400).json({ error: 'imageIds array is required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < imageIds.length; i++) {
      await client.query('UPDATE pet_images SET sort_order = $1 WHERE id = $2 AND pet_id = $3',
        [i, imageIds[i], req.params.id]);
    }
    await client.query('COMMIT');
    res.json({ message: 'Images reordered' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reorder images error:', err);
    res.status(500).json({ error: 'Failed to reorder images' });
  } finally {
    client.release();
  }
});

// ── Admin: delete single pet image ────────────────────────────────────────────
router.delete('/:petId/images/:imageId', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM pet_images WHERE id = $1 AND pet_id = $2 RETURNING id',
      [req.params.imageId, req.params.petId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Image not found' });
    res.json({ message: 'Image deleted' });
  } catch (err) {
    console.error('Delete image error:', err);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

router.put('/:id/verify', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE pets SET is_admin_verified = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [req.body.verified, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pet not found' });
    }
    res.json({ pet: result.rows[0] });
  } catch (err) {
    console.error('Verify pet error:', err);
    res.status(500).json({ error: 'Failed to verify pet' });
  }
});

// ====== PET RECORDS (Seguimiento) ======

router.get('/:petId/records', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM pet_records WHERE pet_id = $1 ORDER BY record_date DESC, created_at DESC',
      [req.params.petId]
    );
    res.json({ records: result.rows });
  } catch (err) {
    console.error('Get records error:', err);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

router.get('/:petId/records/summary', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int as total, COALESCE(SUM(amount), 0) as total_expenses,
        (SELECT record_date FROM pet_records WHERE pet_id = $1 AND next_date IS NOT NULL AND next_date >= CURRENT_DATE ORDER BY next_date ASC LIMIT 1) as next_date,
        (SELECT MAX(record_date) FROM pet_records WHERE pet_id = $1) as last_date
      FROM pet_records WHERE pet_id = $1`,
      [req.params.petId]
    );
    res.json({ summary: result.rows[0] });
  } catch (err) {
    console.error('Get summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

router.post('/:petId/records', requireAuth, async (req, res) => {
  const { recordType, title, description, amount, recordDate, nextDate, vetName, clinicName, medicationName, dosage, attachmentData, attachmentType, attachmentName } = req.body;
  if (!recordType || !title) {
    return res.status(400).json({ error: 'Record type and title are required' });
  }
  try {
    const pet = await pool.query('SELECT created_by FROM pets WHERE id = $1', [req.params.petId]);
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Pet not found' });
    if (req.user.role !== 'admin' && !(await canEditPet(req.user.id, req.params.petId))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const result = await pool.query(
      `INSERT INTO pet_records (pet_id, record_type, title, description, amount, record_date, next_date, vet_name, clinic_name, medication_name, dosage, attachment_data, attachment_type, attachment_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [req.params.petId, recordType, title, description || null, amount || null, recordDate || new Date(),
       nextDate || null, vetName || null, clinicName || null, medicationName || null, dosage || null,
       attachmentData || null, attachmentType || null, attachmentName || null, req.user.id]
    );
    res.status(201).json({ record: result.rows[0] });
  } catch (err) {
    console.error('Create record error:', err);
    res.status(500).json({ error: 'Failed to create record' });
  }
});

router.put('/:petId/records/:recordId', requireAuth, async (req, res) => {
  const fields = ['record_type', 'title', 'description', 'amount', 'record_date', 'next_date', 'vet_name', 'clinic_name', 'medication_name', 'dosage', 'attachment_data', 'attachment_type', 'attachment_name'];
  const updates = [];
  const values = [];
  let idx = 1;
  for (const field of fields) {
    const mapping = {
      record_type: 'recordType', title: 'title', description: 'description',
      amount: 'amount', record_date: 'recordDate', next_date: 'nextDate',
      vet_name: 'vetName', clinic_name: 'clinicName', medication_name: 'medicationName',
      dosage: 'dosage', attachment_data: 'attachmentData', attachment_type: 'attachmentType',
      attachment_name: 'attachmentName'
    };
    const key = mapping[field] || field;
    if (req.body[key] !== undefined) {
      updates.push(`${field} = $${idx++}`);
      values.push(req.body[key]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  updates.push('updated_at = NOW()');
  values.push(req.params.recordId);
  try {
    await pool.query(`UPDATE pet_records SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    const updated = await pool.query('SELECT * FROM pet_records WHERE id = $1', [req.params.recordId]);
    res.json({ record: updated.rows[0] });
  } catch (err) {
    console.error('Update record error:', err);
    res.status(500).json({ error: 'Failed to update record' });
  }
});

router.delete('/:petId/records/:recordId', requireAuth, async (req, res) => {
  try {
    const rec = await pool.query('SELECT pr.* FROM pet_records pr JOIN pets p ON p.id = pr.pet_id WHERE pr.id = $1', [req.params.recordId]);
    if (rec.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
    const record = rec.rows[0];
    if (req.user.role !== 'admin' && !(await canEditPet(req.user.id, record.pet_id))) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await pool.query('DELETE FROM pet_records WHERE id = $1', [req.params.recordId]);
    res.json({ message: 'Record deleted' });
  } catch (err) {
    console.error('Delete record error:', err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

router.get('/:petId/records/report', async (req, res) => {
  // Auth via Authorization header (from fetch) or query token (legacy)
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;
  if (token && token !== 'null' && token !== '') {
    try {
      const decoded = verifyToken(token);
      if (decoded.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
  }
  try {
    const petResult = await pool.query(
      `SELECT p.*, 
        COALESCE(json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) FILTER (WHERE pi.id IS NOT NULL), '[]') as images
      FROM pets p
      LEFT JOIN pet_images pi ON pi.pet_id = p.id
      WHERE p.id = $1
      GROUP BY p.id`,
      [req.params.petId]
    );
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Pet not found' });
    const pet = petResult.rows[0];

    const recordsResult = await pool.query(
      'SELECT * FROM pet_records WHERE pet_id = $1 ORDER BY record_date DESC, created_at DESC',
      [req.params.petId]
    );
    const records = recordsResult.rows;

    const summary = await pool.query(
      `SELECT COUNT(*)::int as total, COALESCE(SUM(amount), 0) as total_expenses,
        (SELECT record_date FROM pet_records WHERE pet_id = $1 AND next_date IS NOT NULL AND next_date >= CURRENT_DATE ORDER BY next_date ASC LIMIT 1) as next_date,
        (SELECT MAX(record_date) FROM pet_records WHERE pet_id = $1) as last_date
      FROM pet_records WHERE pet_id = $1`,
      [req.params.petId]
    );

    const statusLabels = { lost: 'Perdido', retained: 'Retenido', sighted: 'Avistado', accidented: 'Accidentado', needs_attention: 'Necesita Atención', for_adoption: 'En Adopción', adopted: 'Adoptado', reunited: 'Reencuentro' };
    const typeLabels = { appointment: 'Turno', study: 'Estudio', expense: 'Gasto', medication: 'Medicación', vaccine: 'Vacuna', surgery: 'Cirugía', note: 'Nota' };

    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const safeName = (pet.name || 'mascota').replace(/[^a-zA-Z0-9\u00C0-\u024F\s]/g, '').trim().replace(/\s+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="seguimiento-${safeName}-${dateStr}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('SIGO TU HUELLA', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Informe de Seguimiento', { align: 'center' });
    doc.fontSize(8).fillColor('#999').text(`Generado el ${new Date().toLocaleDateString('es-AR')}`, { align: 'center' });
    doc.fillColor('#000').moveDown(0.5);

    // Separator
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd').moveDown(0.8);

    // Pet info
    doc.fontSize(12).font('Helvetica-Bold').text(`${pet.name || 'Mascota'}`, { underline: true }).moveDown(0.3);
    doc.fontSize(9).font('Helvetica');
    doc.text('Especie: ' + (pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otra') + ' | Estado: ' + (statusLabels[pet.status] || pet.status) + ' | Sexo: ' + (pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : 'No especificado'));
    doc.text(`Ubicación: ${pet.location || '-'}`);
    doc.text(`Contacto: ${pet.contact_info || '-'}`);
    if (pet.breed) doc.text(`Raza: ${pet.breed}`);
    if (pet.color) doc.text(`Color: ${pet.color}`);
    doc.moveDown(0.5);

    // Summary
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd').moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').text('RESUMEN').moveDown(0.3);
    doc.fontSize(9).font('Helvetica');
    const s = summary.rows[0];
    doc.text(`Registros: ${s.total}  |  Gastos totales: $${parseFloat(s.total_expenses || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`);
    doc.text(`Último registro: ${s.last_date ? new Date(s.last_date).toLocaleDateString('es-AR') : '-'}  |  Próximo: ${s.next_date ? new Date(s.next_date).toLocaleDateString('es-AR') : '-'}`);
    doc.moveDown(0.5);

    // Records
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd').moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').text('REGISTROS').moveDown(0.5);

    for (const rec of records) {
      const typeLabel = typeLabels[rec.record_type] || rec.record_type;
      const date = new Date(rec.record_date).toLocaleDateString('es-AR');

      // Check page break
      if (doc.y > 680) { doc.addPage(); }

      doc.fontSize(9).font('Helvetica-Bold');
      var amountStr = rec.amount ? ' - $' + parseFloat(rec.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 }) : '';
      doc.text(date + ' - ' + typeLabel + amountStr);
      doc.fontSize(8.5).font('Helvetica');
      doc.text('   ' + rec.title);
      if (rec.description) doc.text('   ' + rec.description);
      if (rec.vet_name || rec.clinic_name) doc.text('   Veterinario: ' + [rec.vet_name, rec.clinic_name].filter(Boolean).join(' - '));
      if (rec.medication_name || rec.dosage) doc.text('   Medicacion: ' + [rec.medication_name, rec.dosage].filter(Boolean).join(' - '));
      if (rec.next_date) doc.text('   Proximo: ' + new Date(rec.next_date).toLocaleDateString('es-AR'));
      doc.moveDown(0.3);

      // Separator
      const y = doc.y;
      doc.moveTo(70, y).lineTo(525, y).stroke('#eee');
      doc.moveDown(0.3);
    }

    // Footer
    if (doc.y > 720) doc.addPage();
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ddd').moveDown(0.5);
    doc.fontSize(7).fillColor('#999').text('Sigo Tu Huella - Red Vecinal / Villa Garibaldi - Sicardi - Correas', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('PDF report error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Public endpoint (no auth) for quick anonymous reports
router.post('/public', async (req, res) => {
  const { species, description, location, latitude, longitude, contact_info, status, images, neighborhoods, name, instagram } = req.body;
  if (!species || !description || !location) {
    return res.status(400).json({ error: 'Species, description, and location are required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generate sequential case number STH00001
    const counterResult = await client.query(
      "SELECT MAX(CAST(SUBSTRING(case_number FROM 4) AS INTEGER)) as max_num FROM pets WHERE case_number LIKE 'STH%'"
    );
    const nextNum = (parseInt(counterResult.rows[0]?.max_num) || 0) + 1;
    const caseNumber = 'STH' + String(nextNum).padStart(5, '0');

    const petResult = await client.query(
      `INSERT INTO pets (species, description, location, latitude, longitude, contact_info, status, created_by, is_admin_verified, neighborhoods, name, instagram, case_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
       [species, description, location, latitude || null, longitude || null, contact_info || null, status || 'sighted', null, false, JSON.stringify(neighborhoods || []), name || null, instagram || null, caseNumber]
    );
    const pet = petResult.rows[0];
    if (images && images.length > 0) {
      for (const img of images) {
        const processed = await processImage(img.data, img.mimeType, 800);
        await client.query(
          'INSERT INTO pet_images (pet_id, image_data, mime_type, crop_x, crop_y, original_image_data) VALUES ($1, $2, $3, $4, $5, $6)',
          [pet.id, processed.data, processed.mimeType, img.crop_x ?? 0.5, img.crop_y ?? 0.5, null]
        );
      }
    }
    const imagesResult = await client.query(
      `SELECT json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) as images
       FROM pet_images pi WHERE pi.pet_id = $1`,
      [pet.id]
    );
    await client.query('COMMIT');
    pet.images = imagesResult.rows[0]?.images || [];

    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
    sendAdminNotificationEmail(
      `🐾 Nuevo reporte público (${caseNumber})`,
      `<p style="font-size:16px;margin-bottom:16px;">Se recibió un nuevo reporte a través del formulario público.</p>
       <p style="font-size:14px;margin-bottom:12px;"><strong>Caso:</strong> ${caseNumber}</p>
       <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Especie</td><td style="padding:8px;border:1px solid #e2e8f0;">${species}</td></tr>
         ${name ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Nombre</td><td style="padding:8px;border:1px solid #e2e8f0;">${name}</td></tr>` : ''}
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Descripción</td><td style="padding:8px;border:1px solid #e2e8f0;">${description}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Ubicación</td><td style="padding:8px;border:1px solid #e2e8f0;">${location}${latitude && longitude ? ` (${latitude}, ${longitude})` : ''}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Contacto</td><td style="padding:8px;border:1px solid #e2e8f0;">${contact_info || 'No informado'}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Tipo</td><td style="padding:8px;border:1px solid #e2e8f0;">${status === 'sighted' ? 'Avistado' : status === 'retained' ? 'Retenido' : status || 'Avistado'}</td></tr>
         ${instagram ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Instagram</td><td style="padding:8px;border:1px solid #e2e8f0;">${instagram}</td></tr>` : ''}
       </table>
       <p style="text-align:center;margin-top:16px;">
         <a href="${frontendUrl}/pet/${pet.id}" style="background-color:#3b82f6;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver publicación</a>
</p>`
        ).catch(err => console.error('Failed to send admin notification:', err));

        sendPushToAdmins({
          title: `🐾 ${caseNumber} — ${status === 'sighted' ? 'Avistado' : 'Retenido'}`,
          body: `${name ? name + ' — ' : ''}${species} en ${location}`,
          url: `${frontendUrl}/pet/${pet.id}`,
        }).catch(err => console.error('Push error:', err));

        // Run matching in background
        matchPetToPosts(pet).catch(err => console.error('Matching error:', err));

        // Auto-broadcast to WhatsApp groups for active statuses
        const broadcastStatuses = ['lost', 'for_adoption', 'sighted', 'retained', 'accidented', 'needs_attention'];
        if (broadcastStatuses.includes(pet.status)) {
          broadcastPetToGroups(pet.id).catch(e => console.error('Broadcast error:', e));
        }

        res.status(201).json({ pet });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create public pet error:', err);
    res.status(500).json({ error: 'Failed to create pet report' });
  } finally {
    client.release();
  }
});

// Lost pet report (no auth) for owner reporting a lost pet with full details
router.post('/lost-report', async (req, res) => {
  const { species, name, breed, color, gender, age, size, description, location, latitude, longitude, email, phone, images, neighborhoods } = req.body;
  if (!species || !description || !location || !email) {
    return res.status(400).json({ error: 'Species, description, location, and email are required' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (!images || images.length === 0) {
    return res.status(400).json({ error: 'At least one photo is required' });
  }
  if (images.length > 3) {
    return res.status(400).json({ error: 'Maximum 3 photos allowed' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find or create user by email
    let userResult = await client.query('SELECT id, email, display_name, registration_pending FROM users WHERE email = $1', [email]);
    let userId;
    let registrationToken = null;

    if (userResult.rows.length === 0) {
      registrationToken = uuidv4().replace(/-/g, '') + crypto.randomBytes(16).toString('hex');
      const displayName = name || email.split('@')[0];
      const userInsert = await client.query(
        `INSERT INTO users (email, password_hash, display_name, role, registration_pending, registration_token)
         VALUES ($1, '', $2, 'user', TRUE, $3)
         RETURNING id`,
        [email, displayName, registrationToken]
      );
      userId = userInsert.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
      if (userResult.rows[0].registration_pending) {
        registrationToken = uuidv4().replace(/-/g, '') + crypto.randomBytes(16).toString('hex');
        await client.query('UPDATE users SET registration_token = $1 WHERE id = $2', [registrationToken, userId]);
      }
    }

    const petResult = await client.query(
      `INSERT INTO pets (species, name, breed, color, gender, age, size, description, location, latitude, longitude, contact_info, status, created_by, is_admin_verified, neighborhoods)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [species, name || null, breed || null, color || null, gender || 'unknown', age || null, size || null, description, location, latitude || null, longitude || null, email, 'lost', userId, false, JSON.stringify(neighborhoods || [])]
    );
    const pet = petResult.rows[0];

    // Process images
    for (const img of images) {
      const processed = await processImage(img.data, img.mimeType, 800);
      await client.query(
        'INSERT INTO pet_images (pet_id, image_data, mime_type, crop_x, crop_y, original_image_data) VALUES ($1, $2, $3, $4, $5, $6)',
        [pet.id, processed.data, processed.mimeType, img.crop_x ?? 0.5, img.crop_y ?? 0.5, null]
      );
    }

    const imagesResult = await client.query(
      `SELECT json_agg(json_build_object('id', pi.id, 'image_data', pi.image_data, 'mime_type', pi.mime_type, 'external_url', pi.external_url, 'has_original', pi.original_image_data IS NOT NULL) ORDER BY pi.created_at) as images
       FROM pet_images pi WHERE pi.pet_id = $1`,
      [pet.id]
    );
    await client.query('COMMIT');
    pet.images = imagesResult.rows[0]?.images || [];

    // Send confirmation email to reporter
    sendLostPetConfirmationEmail(email, { species, name, breed, color, description, location, phone }, registrationToken)
      .catch(err => console.error('Failed to send lost pet confirmation email:', err));

    // Notify admin
    const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
    sendAdminNotificationEmail(
      '😢 Reporte de mascota perdida (dueño)',
      `<p style="font-size:16px;margin-bottom:16px;">Una persona reportó su propia mascota como perdida.</p>
       <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Especie</td><td style="padding:8px;border:1px solid #e2e8f0;">${species}</td></tr>
         ${name ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Nombre</td><td style="padding:8px;border:1px solid #e2e8f0;">${name}</td></tr>` : ''}
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Descripción</td><td style="padding:8px;border:1px solid #e2e8f0;">${description}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Ubicación</td><td style="padding:8px;border:1px solid #e2e8f0;">${location}${latitude && longitude ? ` (${latitude}, ${longitude})` : ''}</td></tr>
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #e2e8f0;">${email}</td></tr>
         ${phone ? `<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Teléfono</td><td style="padding:8px;border:1px solid #e2e8f0;">${phone}</td></tr>` : ''}
         <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Registro</td><td style="padding:8px;border:1px solid #e2e8f0;">${registrationToken ? 'Pendiente (sin contraseña aún)' : 'Usuario existente'}</td></tr>
       </table>
       <p style="text-align:center;margin-top:16px;">
         <a href="${frontendUrl}/pet/${pet.id}" style="background-color:#3b82f6;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Ver publicación</a>
</p>`
        ).catch(err => console.error('Failed to send admin notification:', err));

        sendPushToAdmins({
          title: '😢 Mascota perdida',
          body: `${name || species} perdid${species === 'gato' ? 'a' : 'o'} en ${location}`,
          url: `${frontendUrl}/pet/${pet.id}`,
        }).catch(err => console.error('Push error:', err));

        // Run matching in background
        matchPetToPosts(pet).catch(err => console.error('Matching error:', err));

        // Auto-broadcast to WhatsApp groups for active statuses
        const broadcastStatuses = ['lost', 'for_adoption', 'sighted', 'retained', 'accidented', 'needs_attention'];
        if (broadcastStatuses.includes(pet.status)) {
          broadcastPetToGroups(pet.id).catch(e => console.error('Broadcast error:', e));
        }

        res.status(201).json({ pet, registrationPending: !!registrationToken });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create lost pet report error:', err);
    res.status(500).json({ error: 'Failed to create lost pet report' });
  } finally {
    client.release();
  }
});

// Link an anonymous pet case to a registered user (after registration)
router.put('/link-case', requireAuth, async (req, res) => {
  const { caseNumber } = req.body;
  if (!caseNumber) return res.status(400).json({ error: 'caseNumber is required' });

  try {
    const result = await pool.query(
      'UPDATE pets SET created_by = $1 WHERE case_number = $2 AND created_by IS NULL RETURNING id, case_number',
      [req.user.id, caseNumber]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Case not found or already linked' });
    }
    res.json({ pet: result.rows[0] });
  } catch (err) {
    console.error('Link case error:', err);
    res.status(500).json({ error: 'Failed to link case' });
  }
});

// PUT /:id/share - share pet with user (by userId, email, or phone)
router.put('/:id/share', requireAuth, async (req, res) => {
  const petId = req.params.id;
  const { userId, email, phone } = req.body;
  if (!userId && !email && !phone) return res.status(400).json({ error: 'Se requiere userId, email o teléfono' });

  try {
    const pet = await pool.query('SELECT id, name, species FROM pets WHERE id = $1', [petId]);
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    if (req.user.role !== 'admin' && pet.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Solo el dueño puede compartir' });
    }

    // Si ya tenemos userId, compartir directo
    if (userId) {
      await pool.query(
        `INSERT INTO pet_shares (pet_id, user_id, role) VALUES ($1, $2, 'editor') ON CONFLICT DO NOTHING`,
        [petId, userId]
      );
      return res.json({ shared: true });
    }

    // Buscar usuario por email o teléfono
    let targetUser = null;
    if (email) {
      const r = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      targetUser = r.rows[0];
    } else if (phone) {
      const normalized = normalizePhone(phone);
      const r = await pool.query(
        "SELECT id FROM users WHERE phone = $1",
        [normalized]
      );
      targetUser = r.rows[0];
    }

    if (targetUser) {
      await pool.query(
        `INSERT INTO pet_shares (pet_id, user_id, role) VALUES ($1, $2, 'editor') ON CONFLICT DO NOTHING`,
        [petId, targetUser.id]
      );
      const { sendPushToUser } = await import('../services/pushService.js');
      const inviter = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
      const inviterName = inviter.rows[0]?.display_name || 'Alguien';
      sendPushToUser(targetUser.id, {
        title: '🐾 Nuevo acceso compartido',
        body: `${inviterName} te compartió el perfil de ${pet.rows[0].name || 'una mascota'} en Sigo Tu Huella. Ya tenés acceso para ver y editar su ficha.`,
        url: `/pet/${petId}`,
      }).catch(() => {});
      return res.json({ shared: true, userExists: true });
    }

    // No existe — crear invitación
    const crypto = await import('crypto');
    const token = crypto.default.randomBytes(32).toString('hex');
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
    const inviteLink = `${FRONTEND_URL}/login?invite=${token}`;
    const petName = pet.rows[0].name || (pet.rows[0].species === 'dog' ? 'perro' : pet.rows[0].species === 'cat' ? 'gato' : 'mascota');
    const inviter = await pool.query('SELECT display_name FROM users WHERE id = $1', [req.user.id]);
    const inviterName = inviter.rows[0]?.display_name || 'Alguien';

    await pool.query(
      `INSERT INTO share_invites (pet_id, invited_email, invited_phone, token, message, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [petId, email || null, phone || null, token, req.body.message || null, req.user.id]
    );

    const textMsg = `🐾 *${inviterName}* te compartió el perfil de *${petName}* en Sigo Tu Huella, una red de vecinos que cuidamos las mascotas de la comunidad.\n\nRegistrate gratis para sumarte: ${inviteLink}`;

    if (email) {
      const { default: nodemailer } = await import('nodemailer');
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'l0061596.ferozo.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        tls: { rejectUnauthorized: false },
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      t.sendMail({
        from: `"Sigo Tu Huella" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `${inviterName} te compartió una mascota en Sigo Tu Huella`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;">
            <div style="text-align:center;margin-bottom:20px;">
              <div style="background:#3b82f6;color:white;width:60px;height:60px;line-height:60px;font-size:30px;border-radius:20px;display:inline-block;">🐾</div>
            </div>
            <h2 style="color:#1e293b;text-align:center;font-size:20px;margin-bottom:16px;">${inviterName} te compartió el perfil de ${petName}</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6;text-align:center;">
              En Sigo Tu Huella, una red de vecinos que cuidamos las mascotas de la comunidad.
            </p>
            ${req.body.message ? `<p style="color:#64748b;font-size:14px;text-align:center;font-style:italic;">"${req.body.message}"</p>` : ''}
            <div style="text-align:center;margin:24px 0;">
              <a href="${inviteLink}" style="background:#5A5A40;color:#fff;padding:12px 32px;border-radius:12px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block;">
                Registrate gratis
              </a>
            </div>
            <p style="color:#94a3b8;font-size:12px;text-align:center;">
              Ya tenés acceso para ver y editar su ficha al registrarte.
            </p>
          </div>
        `,
      }).catch(e => console.error('Failed to send invite email:', e));
    }

    if (phone) {
      try {
        const { sendMessage } = await import('../services/whatsappService.js');
        await sendMessage(normalizePhone(phone), textMsg);
      } catch (e) { console.error('Failed to send invite WhatsApp:', e); }
    }

    res.status(201).json({ invited: true, inviteLink });
  } catch (err) {
    console.error('Share pet error:', err);
    res.status(500).json({ error: 'Error al compartir' });
  }
});

// DELETE /:id/share/:userId - remove share access
router.delete('/:id/share/:userId', requireAuth, async (req, res) => {
  const { id: petId, userId } = req.params;

  try {
    const pet = await pool.query('SELECT created_by FROM pets WHERE id = $1', [petId]);
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    if (req.user.role !== 'admin' && pet.rows[0].created_by !== req.user.id) {
      return res.status(403).json({ error: 'Solo el dueño puede dejar de compartir' });
    }

    await pool.query('DELETE FROM pet_shares WHERE pet_id = $1 AND user_id = $2', [petId, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Unshare pet error:', err);
    res.status(500).json({ error: 'Error al dejar de compartir' });
  }
});

// GET /:id/shares - list users this pet is shared with
router.get('/:id/shares', requireAuth, async (req, res) => {
  const petId = req.params.id;

  try {
    const pet = await pool.query('SELECT created_by FROM pets WHERE id = $1', [petId]);
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    if (req.user.role !== 'admin' && !(await canEditPet(req.user.id, petId))) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const result = await pool.query(
      `SELECT ps.user_id, ps.role, ps.created_at as shared_at,
              u.email, u.display_name, u.avatar_data, u.avatar_mime_type, u.avatar_type
       FROM pet_shares ps
       JOIN users u ON u.id = ps.user_id
       WHERE ps.pet_id = $1
       ORDER BY ps.created_at ASC`,
      [petId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get shares error:', err);
    res.status(500).json({ error: 'Error al obtener usuarios compartidos' });
  }
});

// POST /:id/follow - follow a pet (follower role)
router.post('/:id/follow', requireAuth, async (req, res) => {
  const petId = req.params.id;

  try {
    const pet = await pool.query('SELECT id FROM pets WHERE id = $1', [petId]);
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    await pool.query(
      `INSERT INTO pet_shares (pet_id, user_id, role) VALUES ($1, $2, 'follower') ON CONFLICT (pet_id, user_id) DO NOTHING`,
      [petId, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Follow pet error:', err);
    res.status(500).json({ error: 'Error al seguir' });
  }
});

// POST /:id/claim - upgrade follower to editor
router.post('/:id/claim', requireAuth, async (req, res) => {
  const petId = req.params.id;

  try {
    const pet = await pool.query('SELECT id FROM pets WHERE id = $1', [petId]);
    if (pet.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });

    const result = await pool.query(
      `UPDATE pet_shares SET role = 'editor' WHERE pet_id = $1 AND user_id = $2 AND role = 'follower' RETURNING *`,
      [petId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No hay solicitud de seguimiento pendiente' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Claim pet error:', err);
    res.status(500).json({ error: 'Error al reclamar' });
  }
});

// GET /shared/with-me — pets compartidas conmigo
router.get('/shared/with-me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, ps.role, ps.created_at as shared_since,
              u.display_name as owner_name
       FROM pet_shares ps
       JOIN pets p ON p.id = ps.pet_id
       JOIN users u ON u.id = p.created_by
       WHERE ps.user_id = $1
       ORDER BY ps.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get shared pets error:', err);
    res.status(500).json({ error: 'Error al obtener mascotas compartidas' });
  }
});

export default router;
