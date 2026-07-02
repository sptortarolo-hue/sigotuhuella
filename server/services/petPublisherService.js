import pool from '../db.js';
import { applyBrandOverlay, generatePetCaption, getBrandSettings } from './brandIdentityService.js';
import { getStoredToken, isConnected, createContainer, publishContainer, waitForContainer } from './instagramService.js';
import { publishNewsToPage, publishNewsToGroups } from './facebookPublisher.js';
import { enqueue } from './phoneRelayService.js';
import { enqueueStatus } from './whatsappStatusService.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

export function buildPetTitle(pet) {
  const statusPhrases = {
    lost: { named: (n) => `${n} se perdió`, unnamed: 'Mascota perdida' },
    retained: { named: (n) => `Se retuvo a ${n}`, unnamed: 'Mascota retenida' },
    sighted: { named: (n) => `Se avistó a ${n}`, unnamed: 'Mascota avistada' },
    accidented: { named: (n) => `${n} se accidentó`, unnamed: 'Mascota accidentada' },
    needs_attention: { named: (n) => `${n} necesita atención`, unnamed: 'Mascota necesita atención' },
    for_adoption: { named: (n) => `${n} en adopción`, unnamed: 'Mascota en adopción' },
    for_adoption_simple: { named: (n) => `${n} en adopción`, unnamed: 'Mascota en adopción' },
    adopted: { named: (n) => `Se adoptó a ${n}`, unnamed: 'Mascota adoptada' },
    reunited: { named: (n) => `${n} se reencontró`, unnamed: 'Mascota reencontrada' },
  };

  const phrase = statusPhrases[pet.status] || statusPhrases.lost;
  return pet.name ? phrase.named(pet.name) : phrase.unnamed;
}

async function getPetImageBuffer(petId) {
  try {
    const { rows } = await pool.query(
      `SELECT pi.image_data FROM pet_images pi
       JOIN pets p ON p.id = pi.pet_id AND p.id = $1
       ORDER BY pi.is_primary DESC, pi.created_at ASC LIMIT 1`,
      [petId]
    );
    if (rows.length > 0 && rows[0].image_data) {
      return Buffer.from(rows[0].image_data, 'base64');
    }
    return null;
  } catch (err) {
    console.error('Error getting pet image:', err.message);
    return null;
  }
}

async function shouldPublish(petId, platform) {
  try {
    const { rows } = await pool.query(
      `SELECT status FROM pet_publications WHERE pet_id = $1 AND platform = $2`,
      [petId, platform]
    );
    if (rows.length === 0) return true;
    return rows[0].status === 'failed';
  } catch {
    return true;
  }
}

async function upsertPublication(petId, platform, status, platformPostId, errorMessage) {
  try {
    await pool.query(
      `INSERT INTO pet_publications (pet_id, platform, status, platform_post_id, error_message, published_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $3 = 'published' THEN NOW() ELSE NULL END)
       ON CONFLICT (pet_id, platform) DO UPDATE SET
         status = $3,
         platform_post_id = COALESCE($4, pet_publications.platform_post_id),
         error_message = $5,
         published_at = CASE WHEN $3 = 'published' THEN NOW() ELSE pet_publications.published_at END,
         updated_at = NOW()`,
      [petId, platform, status, platformPostId || null, errorMessage || null]
    );
  } catch (err) {
    console.error('Upsert publication error:', err.message);
  }
}

async function publishToInstagram(pet, title) {
  const connected = await isConnected();
  if (!connected) return { success: false, error: 'Instagram no conectado' };
  const token = await getStoredToken();
  if (!token) return { success: false, error: 'Instagram sin token' };

  const imageUrl = `${FRONTEND_URL}/api/pets/${pet.id}/publish-image?format=feed`;

  const caption = generatePetCaption(pet, 'instagram', pet.id);

  try {
    const containerId = await createContainer([imageUrl], caption);
    await waitForContainer(containerId, 'IMAGE');
    const result = await publishContainer(containerId);
    const permalink = result.permalink || `https://www.instagram.com/p/${result.id}/`;
    return { success: true, platformPostId: result.id, permalink };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function publishToFacebook(pet, title) {
  const brand = await getBrandSettings();
  const message = generatePetCaption(pet, 'facebook', pet.id);

  const imageBuffer = await getPetImageBuffer(pet.id);
  const brandedImage = imageBuffer ? await applyBrandOverlay(imageBuffer, {
    type: pet.status,
    title,
    created_at: pet.created_at,
    contact_info: pet.contact_info || null,
    location: pet.location || null,
  }, 'feed') : null;
  const imageBase64 = brandedImage ? brandedImage.toString('base64') : null;

  const pageResult = await publishNewsToPage(message, imageBase64);

  const groupsResult = await pool.query(
    `SELECT id, name, fb_group_id FROM facebook_groups
     WHERE is_active = true AND publish_on_create = true AND page_is_member = true
       AND fb_group_id IS NOT NULL AND fb_group_id != ''
     ORDER BY name`
  );

  let groupsOk = true;
  let groupsError = null;
  if (groupsResult.rows.length > 0) {
    const eligibleGroups = groupsResult.rows.map(g => ({
      id: g.id, fb_group_id: g.fb_group_id, name: g.name,
    }));
    const gResult = await publishNewsToGroups(eligibleGroups, message, imageBase64);
    if (!gResult.success) {
      groupsOk = false;
      groupsError = gResult.error;
    }
  }

  return {
    success: pageResult.success || false,
    pagePostId: pageResult.pagePostId || null,
    groupsOk,
    groupsError,
    error: pageResult.error || groupsError,
  };
}

async function publishToWhatsApp(pet, title) {
  const text = generatePetCaption(pet, 'whatsapp', pet.id);
  const imageBuffer = await getPetImageBuffer(pet.id);
  let imageUrl = null;

  if (imageBuffer) {
    await applyBrandOverlay(imageBuffer, {
      type: pet.status,
      title,
      created_at: pet.created_at,
      contact_info: pet.contact_info || null,
      location: pet.location || null,
    }, 'feed');
    imageUrl = `${FRONTEND_URL}/api/pets/${pet.id}/publish-image?format=feed`;
  }

  const groups = await pool.query(
    "SELECT id, group_id FROM whatsapp_groups WHERE is_active = TRUE AND auto_broadcast = TRUE"
  );

  let sent = 0;
  let lastError = null;
  for (const group of groups.rows) {
    try {
      await enqueue(group.group_id, text, imageUrl);
      sent++;
    } catch (err) {
      lastError = err.message;
    }
  }

  return { success: sent > 0, sent, error: lastError };
}

async function publishToStatus(pet, title) {
  const imageBuffer = await getPetImageBuffer(pet.id);
  if (!imageBuffer) return { success: false, error: 'Sin imagen' };

  try {
    await applyBrandOverlay(imageBuffer, {
      type: pet.status,
      title,
      created_at: pet.created_at,
      contact_info: pet.contact_info || null,
      location: pet.location || null,
    }, 'story');
    const text = generatePetCaption(pet, 'status', pet.id);
    const imageUrl = `${FRONTEND_URL}/api/pets/${pet.id}/publish-image?format=story`;

    await enqueueStatus(text, imageUrl);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function publishPetToAll(petId, platforms) {
  try {
    const { rows } = await pool.query('SELECT * FROM pets WHERE id = $1', [petId]);
    if (rows.length === 0) return { success: false, error: 'Mascota no encontrada' };
    const pet = rows[0];

    const title = buildPetTitle(pet);

    if (!platforms) {
      const { rows: settingsRows } = await pool.query(
        "SELECT value FROM settings WHERE key = 'pets_auto_publish_platforms'"
      );
      let autoPlatforms = ['instagram', 'facebook_page', 'whatsapp'];
      if (settingsRows.length > 0) {
        try { autoPlatforms = JSON.parse(settingsRows[0].value); } catch {}
      }
      platforms = autoPlatforms;
    }

    const results = {};
    const promises = [];

    if (platforms.includes('instagram')) {
      promises.push(
        (async () => {
          if (!(await shouldPublish(petId, 'instagram'))) return;
          const r = await publishToInstagram(pet, title);
          await upsertPublication(petId, 'instagram', r.success ? 'published' : 'failed', r.platformPostId, r.error);
          results.instagram = r;
        })()
      );
    }
    if (platforms.includes('facebook_page') || platforms.includes('facebook_groups')) {
      promises.push(
        (async () => {
          if (!(await shouldPublish(petId, 'facebook'))) return;
          const r = await publishToFacebook(pet, title);
          await upsertPublication(petId, 'facebook', r.success ? 'published' : 'failed', r.pagePostId, r.error);
          results.facebook = r;
        })()
      );
    }
    if (platforms.includes('whatsapp')) {
      promises.push(
        (async () => {
          if (!(await shouldPublish(petId, 'whatsapp'))) return;
          const r = await publishToWhatsApp(pet, title);
          await upsertPublication(petId, 'whatsapp', r.success ? 'published' : 'failed', null, r.error);
          results.whatsapp = r;
        })()
      );
    }
    if (platforms.includes('status')) {
      promises.push(
        (async () => {
          if (!(await shouldPublish(petId, 'status'))) return;
          const r = await publishToStatus(pet, title);
          await upsertPublication(petId, 'status', r.success ? 'published' : 'failed', null, r.error);
          results.status = r;
        })()
      );
    }

    await Promise.all(promises);

    return { success: true, results };
  } catch (err) {
    console.error('publishPetToAll error:', err);
    return { success: false, error: err.message };
  }
}

export async function getPetPublications(petId) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM pet_publications WHERE pet_id = $1 ORDER BY created_at DESC',
      [petId]
    );
    return rows;
  } catch {
    return [];
  }
}
