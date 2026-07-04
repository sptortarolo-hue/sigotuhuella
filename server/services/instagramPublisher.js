import pool from '../db.js';
import {
  getStoredToken, isConnected, createContainer, publishContainer, waitForContainer,
  publishImageStory,
} from './instagramService.js';
import { enqueue } from './phoneRelayService.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

const STORY_STATUSES = ['lost', 'adopted', 'reunited'];
const RELAY_PHONE = '5492213144558';

async function getSetting(key) {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
  return result.rows[0]?.value || '';
}

const statusLabels = {
  lost: '🐾 PERDIDO', retained: '🔄 RETENIDO', sighted: '👀 AVISTADO',
  for_adoption: '❤️ EN ADOPCIÓN', for_adoption_simple: '📢 EN ADOPCIÓN (DIFUSIÓN)',
  adopted: '✅ ADOPTADO',
  reunited: '🎉 REENCUENTRO', accidented: '🚑 ACCIDENTADO',
  needs_attention: '⚠️ NECESITA ATENCIÓN',
};

const speciesLabel = { dog: 'Perro', cat: 'Gato', other: 'Otra mascota' };
const genderLabel = { male: 'Macho', female: 'Hembra', unknown: '' };

function buildPetCaption(pet, hashtags) {
  const statusTag = statusLabels[pet.status] || '🐾 MASCOTA';
  return [
    `${statusTag}`,
    `${pet.name ? 'Nombre: ' + pet.name : ''}`,
    `${speciesLabel[pet.species] || 'Mascota'}${pet.breed ? ' - ' + pet.breed : ''}`,
    `${genderLabel[pet.gender] ? genderLabel[pet.gender] + (pet.age ? ' · ' + pet.age : '') : (pet.age || '')}`,
    `${pet.color ? '🎨 ' + pet.color : ''}`,
    pet.location ? `📍 ${pet.location}${pet.contact_info ? ' · ' + pet.contact_info : ''}` : (pet.contact_info ? `📞 ${pet.contact_info}` : ''),
    ``,
    `${pet.description ? pet.description.substring(0, 400) : ''}`,
    `${pet.source_type === 'whatsapp' ? '📲 Reportado por chatbot WhatsApp' : ''}`,
    ``,
    `🔗 ${FRONTEND_URL}/pet/${pet.id}`,
    ``,
    hashtags,
  ].filter(Boolean).join('\n');
}

function buildImageUrls(petId, imagesData) {
  const count = (imagesData || []).length;
  if (count <= 1) return [`${FRONTEND_URL}/api/images/pet/${petId}/cover`];
  return [
    `${FRONTEND_URL}/api/images/pet/${petId}/cover`,
    ...Array(Math.min(count - 1, 9)).fill(null).map((_, i) =>
      `${FRONTEND_URL}/api/images/pet/${petId}/${i}/insta`),
  ];
}

async function tryPublishStory(pet, postId) {
  const storiesEnabled = await getSetting('instagram_stories_enabled');
  if (storiesEnabled !== 'true') return;
  if (!STORY_STATUSES.includes(pet.status)) return;
  try {
    const storyUrl = `${FRONTEND_URL}/api/images/pet/${pet.id}/story`;
    const storyResult = await publishImageStory(storyUrl);
    await pool.query('UPDATE instagram_posts SET ig_story_id = $1 WHERE id = $2', [storyResult.id, postId]);
    console.log(`[Instagram Publisher] Story published for pet ${pet.id}, storyId=${storyResult.id}`);
  } catch (storyErr) {
    console.error(`[Instagram Publisher] Story failed for pet ${pet.id}:`, storyErr.message);
  }
}

async function tryNotifyWhatsApp(pet, permalink) {
  try {
    const statusTag = statusLabels[pet.status] || '🐾 MASCOTA';
    await enqueue(RELAY_PHONE, `📸 *Publicación en Instagram*\n\n${statusTag} — ${pet.name || 'Sin nombre'}`);
    await enqueue(RELAY_PHONE, permalink);
  } catch (waErr) {
    console.error(`[Instagram Publisher] WhatsApp notification failed for pet ${pet.id}:`, waErr.message);
  }
}

export async function publishSinglePost(petId) {
  const connected = await isConnected();
  if (!connected) return { error: 'Instagram desconectado' };
  const enabled = await getSetting('instagram_publisher_enabled');
  if (enabled !== 'true') return { error: 'Publisher deshabilitado' };
  const petResult = await pool.query(`
    SELECT p.*, 
      (SELECT array_agg(pi.image_data ORDER BY pi.created_at) FROM pet_images pi WHERE pi.pet_id = p.id) as images_data,
      (SELECT array_agg(pi.mime_type ORDER BY pi.created_at) FROM pet_images pi WHERE pi.pet_id = p.id) as images_mime
    FROM pets p WHERE p.id = $1
  `, [petId]);
  if (petResult.rows.length === 0) return { error: 'Mascota no encontrada' };
  const pet = petResult.rows[0];
  if (!pet.images_data || pet.images_data.length === 0) return { error: 'Mascota sin imágenes' };
  const hashtags = await getSetting('instagram_default_hashtags') || '#SigoTuHuella';
  const caption = buildPetCaption(pet, hashtags);
  const imageUrls = buildImageUrls(pet.id, pet.images_data);
  try {
    const containerId = await createContainer(imageUrls, caption);
    await waitForContainer(containerId, 'IMAGE');
    const result = await publishContainer(containerId);
    const permalink = result.permalink || `https://www.instagram.com/p/${result.id}/`;
    await pool.query(
      `UPDATE instagram_posts SET ig_media_id = $1, ig_permalink = $2, image_urls = $3, status = 'published', published_at = NOW()
       WHERE pet_id = $4 AND status = 'queued'`,
      [result.id, permalink, imageUrls, petId]
    );
    const updatedPost = await pool.query('SELECT id FROM instagram_posts WHERE pet_id = $1 ORDER BY created_at DESC LIMIT 1', [petId]);
    if (updatedPost.rows.length > 0) await tryPublishStory(pet, updatedPost.rows[0].id);
    await tryNotifyWhatsApp(pet, permalink);
    return { success: true, permalink, mediaId: result.id };
  } catch (err) {
    await pool.query(
      `UPDATE instagram_posts SET status = 'failed', error_message = $1, image_urls = $2
       WHERE pet_id = $3 AND status = 'queued'`,
      [err.message, imageUrls, petId]
    );
    return { error: err.message };
  }
}

export async function processQueue() {
  const connected = await isConnected();
  if (!connected) return { error: 'Instagram desconectado' };
  const enabled = await getSetting('instagram_publisher_enabled');
  if (enabled !== 'true') return { error: 'Publisher deshabilitado' };
  const pendingPosts = await pool.query(
    `SELECT id, pet_id, caption, image_urls, media_type
     FROM instagram_posts WHERE status = 'queued'
     ORDER BY created_at ASC LIMIT 5`
  );
  const results = [];
  for (const post of pendingPosts.rows) {
    try {
      const petResult = await pool.query(`
        SELECT p.*,
          (SELECT array_agg(pi.image_data ORDER BY pi.created_at) FROM pet_images pi WHERE pi.pet_id = p.id) as images_data,
          (SELECT array_agg(pi.mime_type ORDER BY pi.created_at) FROM pet_images pi WHERE pi.pet_id = p.id) as images_mime
        FROM pets p WHERE p.id = $1
      `, [post.pet_id]);
      if (petResult.rows.length === 0) {
        await pool.query("UPDATE instagram_posts SET status = 'failed', error_message = 'Mascota no encontrada' WHERE id = $1", [post.id]);
        continue;
      }
      const pet = petResult.rows[0];
      const imageUrls = buildImageUrls(post.pet_id, pet.images_data);
      if (imageUrls.length === 0) {
        await pool.query("UPDATE instagram_posts SET status = 'failed', error_message = 'Sin imágenes' WHERE id = $1", [post.id]);
        continue;
      }
      const hashtags = await getSetting('instagram_default_hashtags') || '#SigoTuHuella';
      const caption = post.caption || buildPetCaption(pet, hashtags);
      const mt = post.media_type || 'IMAGE';
      const containerId = await createContainer(imageUrls, caption, mt);
      await waitForContainer(containerId, mt);
      const result = await publishContainer(containerId);
      const permalink = result.permalink || `https://www.instagram.com/p/${result.id}/`;
      await pool.query(
        `UPDATE instagram_posts SET ig_media_id = $1, ig_permalink = $2, status = 'published', published_at = NOW(), image_urls = $3
         WHERE id = $4`,
        [result.id, permalink, imageUrls, post.id]
      );
      await tryPublishStory(pet, post.id);
      await tryNotifyWhatsApp(pet, permalink);
      results.push({ postId: post.id, success: true, permalink });
    } catch (err) {
      await pool.query(
        "UPDATE instagram_posts SET status = 'failed', error_message = $1 WHERE id = $2",
        [err.message, post.id]
      );
      results.push({ postId: post.id, error: err.message });
    }
  }
  return results;
}

export async function autoQueueForAdoption() {
  const connected = await isConnected();
  if (!connected) return;
  const enabled = await getSetting('instagram_publisher_enabled');
  if (enabled !== 'true') return;
  const newPets = await pool.query(`
    SELECT p.id FROM pets p
    WHERE p.status IN ('for_adoption', 'lost', 'sighted', 'retained', 'adopted', 'reunited', 'accidented', 'needs_attention')
    AND p.instagram IS NULL
    AND EXISTS (SELECT 1 FROM pet_images pi WHERE pi.pet_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM instagram_posts ip WHERE ip.pet_id = p.id)
    ORDER BY p.created_at DESC
    LIMIT 10
  `);
  for (const pet of newPets.rows) {
    await pool.query(
      `INSERT INTO instagram_posts (pet_id, media_type, status, created_at)
       VALUES ($1, 'IMAGE', 'queued', NOW())
       ON CONFLICT DO NOTHING`,
      [pet.id]
    );
  }
  if (newPets.rows.length > 0) {
    console.log(`[Instagram Publisher] Auto-queued ${newPets.rows.length} pets`);
  }
}
