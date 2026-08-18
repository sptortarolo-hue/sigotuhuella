import pool from '../db.js';
import { broadcastPetToGroups } from './whatsappService.js';
import { commentOnPagePost, publishPetToGroups } from './facebookPublisher.js';
import { isConnected, commentOnMedia } from './instagramService.js';
import { generateCelebrationText, generateAdoptionClosureText } from './textTemplates.js';
import sharp from 'sharp';

export async function addPetHistory({ petId, eventType, description, fromStatus, toStatus, relatedPetId, relatedUserId, changedBy }) {
  try {
    await pool.query(
      `INSERT INTO pet_history (pet_id, event_type, description, from_status, to_status, related_pet_id, related_user_id, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [petId, eventType, description || null, fromStatus || null, toStatus || null, relatedPetId || null, relatedUserId || null, changedBy || null]
    );
  } catch (err) {
    console.error('addPetHistory error:', err.message);
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

async function autoInstagramComment(pet, newsType, commentTextOverride) {
  try {
    const connected = await isConnected();
    if (!connected) return;
    const igPost = await pool.query(
      "SELECT ig_media_id, ig_permalink FROM instagram_posts WHERE pet_id = $1 AND status = 'published' ORDER BY published_at DESC LIMIT 1",
      [pet.id]
    );
    if (igPost.rows.length === 0) return;
    const commentText = commentTextOverride || generateCelebrationText(pet, newsType);
    if (!commentText) return;
    await commentOnMedia(igPost.rows[0].ig_media_id, commentText);
    console.log(`[Instagram] Auto-commented on pet ${pet.id}: ${commentText.slice(0, 60)}...`);
  } catch (err) {
    console.error('[Instagram] Auto-comment error:', err);
  }
}

async function autoFacebookPageComment(pet, newsType, commentTextOverride) {
  try {
    const pagePost = await pool.query(
      "SELECT page_post_id FROM facebook_page_posts WHERE pet_id = $1 AND page_post_id IS NOT NULL ORDER BY published_at DESC LIMIT 1",
      [pet.id]
    );
    if (pagePost.rows.length === 0) return;
    const commentText = commentTextOverride || generateCelebrationText(pet, newsType);
    if (!commentText) return;
    await commentOnPagePost(pagePost.rows[0].page_post_id, commentText);
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      ['fb_last_auto_comment_error', '']
    );
    console.log(`[Facebook Page] Auto-commented on pet ${pet.id}: ${commentText.slice(0, 60)}...`);
  } catch (err) {
    const message = err?.response?.data?.error?.message || err.message || String(err);
    console.error('[Facebook Page] Auto-comment error:', err);
    try {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        ['fb_last_auto_comment_error', JSON.stringify({ message, pet_id: pet.id, at: new Date().toISOString() })]
      );
      await addPetHistory({ petId: pet.id, eventType: 'fb_auto_comment_failed', description: message.slice(0, 500) });
    } catch (logErr) {
      console.error('[Facebook Page] Error guardando auto-comment error:', logErr.message);
    }
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
      `INSERT INTO instagram_posts (pet_id, media_type, caption, status, is_celebration, created_at)
       VALUES ($1, 'IMAGE', $2, 'queued', TRUE, NOW())`,
      [pet.id, `${caption}\n\n${htag}`]
    );
    console.log(`[Instagram] Queued celebration post for pet ${pet.id}`);
  } catch (err) {
    console.error('[Instagram] Auto-queue celebration error:', err);
  }
}

export async function awardBadgeIfMissing(userId, code) {
  if (!userId) return;
  try {
    const userRes = await pool.query('SELECT badges, volunteer_status FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return;
    const { badges, volunteer_status } = userRes.rows[0];
    if (volunteer_status === 'none' || !volunteer_status) return;
    const existing = Array.isArray(badges) ? badges : [];
    if (existing.find(b => b.code === code)) return;
    const updated = JSON.stringify([...existing, { code, awarded_at: new Date().toISOString() }]);
    await pool.query('UPDATE users SET badges = $1::jsonb WHERE id = $2', [updated, userId]);
  } catch (err) {
    console.error('awardBadgeIfMissing error:', err);
  }
}

async function enqueueFbGroupComment(pet, newsType, commentTextOverride) {
  try {
    const fbRelay = await pool.query("SELECT value FROM settings WHERE key = 'fb_relay_enabled'");
    if (fbRelay.rows[0]?.value !== 'true') return;
    const tasks = await pool.query(
      "SELECT DISTINCT ON (group_id) id, fb_group_id, fb_post_url FROM fb_relay_tasks WHERE pet_id = $1 AND status = 'completed' AND fb_post_url != '' ORDER BY group_id, completed_at DESC",
      [pet.id]
    );
    if (tasks.rows.length === 0) return;
    const commentText = commentTextOverride || generateCelebrationText(pet, newsType);
    if (!commentText) return;
    for (const task of tasks.rows) {
      await pool.query(
        `INSERT INTO fb_relay_tasks (pet_id, group_id, fb_group_id, action, target_url, message, status, created_at)
         VALUES ($1, $2, $3, 'comment', $4, $5, 'pending', NOW())`,
        [pet.id, task.group_id, task.fb_group_id, task.fb_post_url, commentText]
      );
    }
    console.log(`[FB Relay] Enqueued ${tasks.rows.length} comment task(s) for pet ${pet.id}`);
  } catch (err) {
    console.error('[FB Relay] enqueueFbGroupComment error:', err.message);
  }
}

// Ejecuta las side-effects de celebración (news, IG/FB comments, post, broadcast, badges, etc.)
// Se llama desde el admin (PUT /:id), confirmReunion y closeCase.
// Push a colaboradores solo si el caso sigue abierto (camino admin).
export async function celebrateStatusChange({ petId, userId, fromStatus, toStatus, ownerFields }) {
  if (!toStatus || toStatus === fromStatus) return;

  const isReunited = fromStatus !== 'reunited' && toStatus === 'reunited';
  const isAdopted = fromStatus !== 'adopted' && toStatus === 'adopted';
  if (!isReunited && !isAdopted) return;

  const newsType = isReunited ? 'reunited' : 'adopted';
  // Cierre administrativo: mascota retenida que el admin pasa a adoptada.
  // No genera novedad, solo posteo de actualización.
  const isRetainedToAdopted = fromStatus === 'retained' && toStatus === 'adopted';

  // 1. Detectar caso abierto ANTES de syncCaseStatus (que puede cerrarlo)
  let openCase = null;
  try {
    const openCaseRes = await pool.query(
      `SELECT pc.id, p.name AS pet_name, pc.reporter_id
       FROM pet_cases pc
       JOIN pets p ON p.id = pc.pet_id
       WHERE pc.pet_id = $1 AND pc.status <> 'closed'
       ORDER BY pc.created_at DESC LIMIT 1`,
      [petId]
    );
    openCase = openCaseRes.rows[0] || null;
  } catch (_) {}

  // 2. Pet history
  await addPetHistory({ petId, eventType: 'status_change', fromStatus, toStatus, changedBy: userId });

  // 3. Sync case status (fire-and-forget)
  const { syncCaseStatus } = await import('./caseService.js');
  syncCaseStatus(petId, toStatus, fromStatus).catch(() => {});

  // 4. reunited_at
  await pool.query('UPDATE pets SET reunited_at = COALESCE(reunited_at, NOW()) WHERE id = $1', [petId]);

  // 5. Owner: explicit fields or auto-fill from users
  const hasOwnerFields = ownerFields && (ownerFields.owner_name || ownerFields.owner_phone || ownerFields.owner_email || ownerFields.owner_address);
  if (hasOwnerFields) {
    const cols = [];
    const vals = [];
    let idx = 1;
    if (ownerFields.owner_name) { cols.push(`owner_name = $${idx++}`); vals.push(ownerFields.owner_name); }
    if (ownerFields.owner_phone) { cols.push(`owner_phone = $${idx++}`); vals.push(ownerFields.owner_phone); }
    if (ownerFields.owner_email) { cols.push(`owner_email = $${idx++}`); vals.push(ownerFields.owner_email); }
    if (ownerFields.owner_address) { cols.push(`owner_address = $${idx++}`); vals.push(ownerFields.owner_address); }
    if (cols.length > 0) {
      vals.push(petId);
      await pool.query(`UPDATE pets SET ${cols.join(', ')} WHERE id = $${idx}`, vals);
    }
  } else {
    try {
      const petRes = await pool.query('SELECT created_by FROM pets WHERE id = $1', [petId]);
      const createdBy = petRes.rows[0]?.created_by;
      if (createdBy) {
        const userRes = await pool.query('SELECT display_name, email, phone FROM users WHERE id = $1', [createdBy]);
        const user = userRes.rows[0];
        if (user) {
          const autoCols = [];
          const autoVals = [];
          let aidx = 1;
          if (user.display_name) { autoCols.push(`owner_name = $${aidx++}`); autoVals.push(user.display_name); }
          if (user.phone) { autoCols.push(`owner_phone = $${aidx++}`); autoVals.push(user.phone); }
          if (user.email) { autoCols.push(`owner_email = $${aidx++}`); autoVals.push(user.email); }
          if (autoCols.length > 0) {
            autoVals.push(petId);
            await pool.query(`UPDATE pets SET ${autoCols.join(', ')} WHERE id = $${aidx}`, autoVals);
          }
        }
      }
    } catch (_) {}
  }

  // 6. Re-fetch pet for celebration actions
  const updatedPet = await pool.query('SELECT * FROM pets WHERE id = $1', [petId]);
  const pet = updatedPet.rows[0];

  // 7. News + IG/FB comments + celebration post
  if (isRetainedToAdopted) {
    // Sin novedad (news): solo actualizar la info en los posts existentes.
    const updateText = generateAdoptionClosureText(pet);
    await autoInstagramComment(pet, newsType, updateText);
    await autoFacebookPageComment(pet, newsType, updateText);
    enqueueFbGroupComment(pet, newsType, updateText).catch(e => console.error('[FB Relay] enqueueFbGroupComment error:', e.message));
  } else {
    await autoCreateNews(pet, newsType);
    await autoInstagramComment(pet, newsType);
    await autoFacebookPageComment(pet, newsType);
    await autoQueueCelebrationPost(pet, newsType);
  }

  // 8. Broadcast + relay (fire-and-forget)
  broadcastPetToGroups(petId, isRetainedToAdopted ? generateAdoptionClosureText(pet) : null).catch(e => console.error('Broadcast reunion/adoption error:', e));
  if (!isRetainedToAdopted) {
    publishPetToGroups(petId, { isCelebration: true }).catch(e => console.error('[FB Relay] publishPetToGroups error:', e));
    enqueueFbGroupComment(pet, newsType).catch(e => console.error('[FB Relay] enqueueFbGroupComment error:', e));
  }

  // 9. Badges (solo reunited)
  if (isReunited && pet.created_by) {
    const reunitedCount = await pool.query(
      "SELECT COUNT(*) as cnt FROM pets WHERE created_by = $1 AND status = 'reunited'",
      [pet.created_by]
    );
    const rc = parseInt(reunitedCount.rows[0].cnt);
    if (rc >= 1) await awardBadgeIfMissing(pet.created_by, 'reunited_hero');
    if (rc >= 5) await awardBadgeIfMissing(pet.created_by, 'reunited_legend');
  }

  // 10. Push a colaboradores solo si el caso seguía abierto (camino admin)
  if (openCase) {
    try {
      const { sendPushToUsers } = await import('./pushService.js');
      const collabRes = await pool.query(
        `SELECT DISTINCT user_id FROM case_search_areas WHERE case_id = $1 AND user_id IS NOT NULL`,
        [openCase.id]
      );
      const collaboratorIds = collabRes.rows.map(r => r.user_id);

      const followerRes = await pool.query(
        `SELECT user_id FROM case_followers WHERE case_id = $1`,
        [openCase.id]
      );
      const followerIds = followerRes.rows.map(r => r.user_id);

      const allIds = [...new Set([...collaboratorIds, ...followerIds])].filter(id => id && id !== userId);
      const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';
      const caseUrl = `${frontendUrl}/caso/${openCase.id}`;

      if (allIds.length > 0) {
        sendPushToUsers(allIds, {
          title: '🎉 ¡Volvió a casa!',
          body: `${openCase.pet_name || 'La mascota'} se reencontró con su familia. ¡Gracias por ayudar!`,
          data: { url: caseUrl, caseId: openCase.id, type: 'reunion_announced' },
        }).catch(() => {});
      }

      await pool.query(
        `INSERT INTO case_events (case_id, user_id, event_type, payload)
         VALUES ($1, $2, 'reunion_announced', $3)`,
        [openCase.id, userId, JSON.stringify({ 
          collaborators_count: allIds.length,
          reason: isRetainedToAdopted ? 'adopted' : 'reunited'
        })]
      );
    } catch (err) {
      console.error('celebrateStatusChange notify collaborators error:', err.message);
    }
  }
}
