import axios from 'axios';
import pool from '../db.js';

const GRAPH_API = 'https://graph.facebook.com/v22.0';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

const statusLabels = {
  lost: '🐾 PERDIDO',
  retained: '🔄 RETENIDO',
  sighted: '👀 AVISTADO',
  for_adoption: '❤️ EN ADOPCIÓN',
  adopted: '✅ ADOPTADO',
  reunited: '🎉 REENCUENTRO',
  accidented: '🚑 ACCIDENTADO',
  needs_attention: '⚠️ NECESITA ATENCIÓN',
};

const speciesLabel = { dog: 'Perro', cat: 'Gato', other: 'Otra mascota' };
const genderLabel = { male: 'Macho', female: 'Hembra', unknown: '' };

async function getSetting(key) {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
  return result.rows[0]?.value || '';
}

async function getPageToken() {
  const token = await getSetting('instagram_access_token');
  return token;
}

async function getPageId() {
  let pageId = await getSetting('facebook_page_id');
  if (pageId) return pageId;
  const token = await getPageToken();
  if (!token) return null;
  try {
    const { data } = await axios.get(`${GRAPH_API}/me`, {
      params: { fields: 'id,name', access_token: token },
      timeout: 10000,
    });
    if (data?.id) {
      pageId = data.id;
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ('facebook_page_id', $1) ON CONFLICT (key) DO UPDATE SET value = $1`,
        [pageId]
      );
      console.log(`[FB Publisher] Auto-detected Page ID: ${pageId} (${data.name || ''})`);
      return pageId;
    }
  } catch (err) {
    console.error('[FB Publisher] Error detecting Page ID:', err.response?.data || err.message);
  }
  return null;
}

function buildPetMessage(pet, hashtags) {
  const statusTag = statusLabels[pet.status] || '🐾 MASCOTA';
  const species = speciesLabel[pet.species] || 'Mascota';
  const gender = genderLabel[pet.gender] || '';
  const ageGender = [gender, pet.age].filter(Boolean).join(' · ');

  return [
    `${statusTag}`,
    `${pet.name ? 'Nombre: ' + pet.name : ''}`,
    `${species}${pet.breed ? ' - ' + pet.breed : ''}`,
    `${ageGender ? ageGender : ''}`,
    `${pet.color ? '🎨 ' + pet.color : ''}`,
    `📍 ${pet.location || ''}`,
    pet.contact_info ? `📞 ${pet.contact_info}` : '',
    '',
    pet.description ? pet.description.substring(0, 500) : '',
    '',
    `🔗 ${FRONTEND_URL}/pet/${pet.id}`,
    '',
    hashtags || '#SigoTuHuella #MascotasPerdidas #AdoptaNoCompres',
  ].filter(Boolean).join('\n');
}

function buildImageUrls(petId, imagesData) {
  if (imagesData && imagesData.length > 0) {
    return imagesData.map((_, i) => `${FRONTEND_URL}/api/images/pet/${petId}/${i}`);
  }
  return [`${FRONTEND_URL}/api/images/pet/${petId}/cover`];
}

export async function publishToPage(petId) {
  const token = await getPageToken();
  if (!token) return { error: 'Facebook Page no conectada' };

  const pageId = await getPageId();
  if (!pageId) return { error: 'No se encontró la Page ID' };

  const petResult = await pool.query(`
    SELECT p.*,
      (SELECT array_agg(pi.image_data ORDER BY pi.created_at) FROM pet_images pi WHERE pi.pet_id = p.id) as images_data
    FROM pets p WHERE p.id = $1
  `, [petId]);

  if (petResult.rows.length === 0) return { error: 'Mascota no encontrada' };
  const pet = petResult.rows[0];

  const hashtags = await getSetting('instagram_default_hashtags') || '#SigoTuHuella';
  const message = buildPetMessage(pet, hashtags);
  const imageUrls = buildImageUrls(pet.id, pet.images_data);

  try {
    if (imageUrls.length === 1) {
      const { data } = await axios.post(`${GRAPH_API}/${pageId}/photos`, null, {
        params: {
          url: imageUrls[0],
          message,
          access_token: token,
        },
        timeout: 30000,
      });
      const postId = data.id;
      return { success: true, pagePostId: postId, type: 'photo' };
    }

    const { data } = await axios.post(`${GRAPH_API}/${pageId}/feed`, {
      message,
      access_token: token,
    }, {
      params: { access_token: token },
      timeout: 30000,
    });
    const postId = data.id;
    if (postId && imageUrls.length > 1) {
      for (const url of imageUrls) {
        try {
          await axios.post(`${GRAPH_API}/${pageId}/photos`, null, {
            params: { url, access_token: token },
            timeout: 15000,
          });
        } catch { }
      }
    }
    return { success: true, pagePostId: postId, type: 'feed' };
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    return { error: `Error al publicar en Page: ${detail}` };
  }
}

export async function publishToGroup(groupFbId, message, link) {
  const token = await getPageToken();
  if (!token) return { error: 'Facebook Page no conectada' };

  try {
    const params = {
      message,
      access_token: token,
    };
    if (link) params.link = link;

    const { data } = await axios.post(`${GRAPH_API}/${groupFbId}/feed`, null, {
      params,
      timeout: 30000,
    });
    return { success: true, groupPostId: data.id };
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    return { error: `Error al publicar en grupo: ${detail}` };
  }
}

export async function replicateInstagramToFacebook(instagramPostId) {
  const postResult = await pool.query(
    `SELECT ip.*, p.name as pet_name, p.species, p.status, p.location,
            p.contact_info, p.description, p.color, p.gender, p.age, p.breed,
            p.neighborhoods, p.id as pet_id
     FROM instagram_posts ip
     LEFT JOIN pets p ON p.id = ip.pet_id
     WHERE ip.id = $1`,
    [instagramPostId]
  );

  if (postResult.rows.length === 0) return { error: 'Post de Instagram no encontrado' };
  const post = postResult.rows[0];
  if (!post.pet_id) return { error: 'El post no tiene mascota asociada' };

  const hashtags = await getSetting('instagram_default_hashtags') || '#SigoTuHuella';
  const message = buildPetMessage(post, hashtags);
  const link = `${FRONTEND_URL}/pet/${post.pet_id}`;

  const results = { page: null, groups: [], pagePostId: null };

  const pageResult = await publishToPage(post.pet_id);
  const pagePostId = pageResult.success ? pageResult.pagePostId : null;
  results.page = pageResult;
  results.pagePostId = pagePostId;

  const groupsResult = await pool.query(
    `SELECT id, name, fb_group_id FROM facebook_groups
     WHERE is_active = true AND fb_group_id IS NOT NULL AND fb_group_id != ''
     ORDER BY name`
  );

  for (const group of groupsResult.rows) {
    let shouldPost = true;

    if (post.neighborhoods) {
      try {
        const neighborhoods = typeof post.neighborhoods === 'string'
          ? JSON.parse(post.neighborhoods)
          : post.neighborhoods;
        if (Array.isArray(neighborhoods) && neighborhoods.length > 0) {
          const groupMatch = await pool.query(
            `SELECT 1 FROM facebook_groups
             WHERE id = $1 AND (
               name ILIKE ANY($2::text[])
               OR EXISTS (SELECT 1 FROM unnest($3::text[]) AS nb WHERE name ILIKE '%' || nb || '%')
             )`,
            [group.id, neighborhoods.map(n => `%${n}%`), neighborhoods]
          );
          if (groupMatch.rows.length === 0) shouldPost = false;
        }
      } catch { }
    }

    if (!shouldPost) {
      results.groups.push({ groupId: group.id, name: group.name, skipped: true, reason: 'no coincide barrio' });
      continue;
    }

    const groupResult = await publishToGroup(group.fb_group_id, message, link);
    results.groups.push({
      groupId: group.id,
      name: group.name,
      success: groupResult.success,
      error: groupResult.error,
      groupPostId: groupResult.groupPostId,
    });
  }

  const groupPostIds = results.groups
    .filter(g => g.success && g.groupPostId)
    .map(g => g.groupPostId);

  const status = pageResult.success ? 'published' : pageResult.error ? 'failed' : 'published';
  const errorMsg = pageResult.error || results.groups.find(g => g.error)?.error || null;

  await pool.query(
    `INSERT INTO facebook_page_posts (instagram_post_id, pet_id, page_post_id, group_post_ids, message, status, error_message, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [instagramPostId, post.pet_id, pagePostId, groupPostIds, message, status, errorMsg]
  );

  if (status === 'published') {
    await pool.query(`UPDATE instagram_posts SET fb_replicated = true WHERE id = $1`, [instagramPostId]);
  }

  return results;
}

export async function replicateLatestInstagramPosts(limit = 5) {
  const posts = await pool.query(
    `SELECT ip.id FROM instagram_posts ip
     WHERE ip.status = 'published'
       AND NOT EXISTS (
         SELECT 1 FROM facebook_page_posts fpp
         WHERE fpp.instagram_post_id = ip.id AND fpp.status = 'published'
       )
     ORDER BY ip.published_at DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );

  const results = [];
  for (const post of posts.rows) {
    try {
      const result = await replicateInstagramToFacebook(post.id);
      results.push({ instagramPostId: post.id, result });
    } catch (err) {
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`[FB Publisher] Error replicating post ${post.id}:`, errMsg);
      results.push({ instagramPostId: post.id, result: { error: errMsg } });
      try {
        await pool.query(
          `INSERT INTO facebook_page_posts (instagram_post_id, status, error_message)
           VALUES ($1, 'failed', $2)`,
          [post.id, errMsg]
        );
      } catch { }
    }
  }
  return results;
}

export async function retryFailedFacebookPosts(limit = 10) {
  const posts = await pool.query(
    `SELECT fpp.id, fpp.instagram_post_id
     FROM facebook_page_posts fpp
     WHERE fpp.status = 'failed'
       AND fpp.instagram_post_id IS NOT NULL
     ORDER BY fpp.created_at DESC
     LIMIT $1`,
    [limit]
  );

  const results = [];
  for (const row of posts.rows) {
    try {
      const result = await replicateInstagramToFacebook(row.instagram_post_id);
      results.push({ postId: row.instagram_post_id, result });
    } catch (err) {
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`[FB Publisher] Error retrying post ${row.instagram_post_id}:`, errMsg);
      results.push({ postId: row.instagram_post_id, result: { error: errMsg } });
    }
  }
  return results;
}

export async function publishPetToGroups(petId) {
  const petResult = await pool.query(
    `SELECT p.*,
       (SELECT array_agg(pi.image_data ORDER BY pi.created_at) FROM pet_images pi WHERE pi.pet_id = p.id) as images_data
     FROM pets p WHERE p.id = $1`,
    [petId]
  );

  if (petResult.rows.length === 0) return { error: 'Mascota no encontrada' };
  const pet = petResult.rows[0];

  const hashtags = await getSetting('instagram_default_hashtags') || '#SigoTuHuella';
  const message = buildPetMessage(pet, hashtags);

  const results = { page: null, groups: [], petId };

  const pageResult = await publishToPage(petId);
  results.page = pageResult;

  const groupsResult = await pool.query(
    `SELECT id, name, fb_group_id FROM facebook_groups
     WHERE is_active = true AND publish_on_create = true AND page_is_member = true
       AND fb_group_id IS NOT NULL AND fb_group_id != ''
     ORDER BY name`
  );

  for (const group of groupsResult.rows) {
    const link = `${FRONTEND_URL}/pet/${petId}`;
    const groupResult = await publishToGroup(group.fb_group_id, message, link);
    results.groups.push({
      groupId: group.id,
      name: group.name,
      success: groupResult.success,
      error: groupResult.error,
      groupPostId: groupResult.groupPostId,
    });
  }

  const groupPostIds = results.groups
    .filter(g => g.success && g.groupPostId)
    .map(g => g.groupPostId);

  const status = pageResult.success ? 'published' : pageResult.error ? 'failed' : 'published';
  const errorMsg = pageResult.error || results.groups.find(g => g.error)?.error || null;

  await pool.query(
    `INSERT INTO facebook_page_posts (pet_id, page_post_id, group_post_ids, message, status, error_message, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [petId, pageResult.pagePostId || null, groupPostIds, message, status, errorMsg]
  );

  return results;
}
