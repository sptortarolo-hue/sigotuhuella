import axios from 'axios';
import pool from '../db.js';

const GRAPH_API = 'https://graph.facebook.com/v22.0';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
const VPS_HOST = process.env.VPS_HOST || 'http://138.36.236.69:3001';

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

function buildPetMessage(pet, hashtags, originalUrl, authorName) {
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
    originalUrl ? `🔗 Publicación original: ${originalUrl}` : '',
    authorName ? `👤 Publicado por: ${authorName}` : '',
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
  const existing = await pool.query(
    `SELECT page_post_id FROM facebook_page_posts
     WHERE pet_id = $1 AND status = 'published' AND page_post_id IS NOT NULL
     ORDER BY published_at DESC LIMIT 1`,
    [petId]
  );
  if (existing.rows.length > 0) {
    return { success: true, pagePostId: existing.rows[0].page_post_id, skipped: true };
  }

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

export async function checkPageMembershipInGroup(groupFbId) {
  const token = await getPageToken();
  if (!token) return { isMember: null, error: 'Facebook Page no conectada' };

  const pageId = await getPageId();
  if (!pageId) return { isMember: null, error: 'Page ID no disponible' };

  console.log(`[FB Publisher] Checking membership. Page ID: ${pageId}, Group ID: ${groupFbId}`);

  try {
    const { data } = await axios.get(
      `${GRAPH_API}/${groupFbId}/members`,
      {
        params: {
          access_token: token,
          fields: 'id,name',
          limit: 1000,
        },
        timeout: 15000,
      }
    );

    const members = data?.data || [];
    console.log(`[FB Publisher] Fetched ${members.length} members from group ${groupFbId}`);

    if (members.length > 0) {
      console.log(`[FB Publisher] First 3 members:`, JSON.stringify(members.slice(0, 3)));
    }

    const isMember = members.some(m => m.id === pageId || m.name === pageId);
    console.log(`[FB Publisher] Page ${pageId} is member: ${isMember}`);

    return { isMember, members: members.length, pageId };
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    const errData = err.response?.data?.error || {};
    const errorCode = errData.code;

    console.error(`[FB Publisher] Error checking membership:`, detail);

    if (err.response?.status === 403 || errorCode === 200 || errorCode === 10 || errData.type === 'OAuthException') {
      return { isMember: null, error: 'Token sin permisos para leer miembros del grupo. Verificá manualmente.', pageId, permissionError: true };
    }

    return { isMember: null, error: detail, pageId };
  }
}

export async function verifyAllGroupMemberships() {
  const token = await getPageToken();
  if (!token) return { error: 'Facebook Page no conectada', updated: 0, results: [] };

  const pageId = await getPageId();
  if (!pageId) return { error: 'Page ID no disponible', updated: 0, results: [] };

  const groupsResult = await pool.query(
    "SELECT id, name, fb_group_id FROM facebook_groups WHERE is_active = true AND fb_group_id IS NOT NULL AND fb_group_id != ''"
  );

  const results = [];
  let updated = 0;

  for (const group of groupsResult.rows) {
    try {
      const { data } = await axios.get(
        `${GRAPH_API}/${group.fb_group_id}/members`,
        {
          params: {
            access_token: token,
            fields: 'id',
            limit: 1000,
          },
          timeout: 15000,
        }
      );

      const members = data?.data || [];
      const isMember = members.some(m => m.id === pageId);

      if (isMember !== group.page_is_member) {
        await pool.query(
          'UPDATE facebook_groups SET page_is_member = $1, updated_at = NOW() WHERE id = $2',
          [isMember, group.id]
        );
        updated++;
      }

      results.push({
        groupId: group.id,
        name: group.name,
        fbGroupId: group.fb_group_id,
        isMember,
        membersCount: members.length,
        changed: isMember !== group.page_is_member,
      });
    } catch (err) {
      const errData = err.response?.data?.error || {};
      const errorCode = errData.code;
      const isPermissionError = err.response?.status === 403 || errorCode === 200 || errorCode === 10 || errData.type === 'OAuthException';
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      results.push({
        groupId: group.id,
        name: group.name,
        fbGroupId: group.fb_group_id,
        isMember: null,
        error: isPermissionError ? 'Sin permisos para verificar' : detail,
        permissionError: isPermissionError,
      });
    }
  }

  return { updated, results };
}

export async function publishToGroupsViaScraper(groups, message, imageUrls, petId) {
  try {
    const { data } = await axios.post(`${VPS_HOST}/publish-to-groups`, {
      groups,
      message,
      image_urls: imageUrls,
    }, { timeout: 300000 });

    const results = data.results || [];

    for (const r of results) {
      if (!r.success && r.error && r.error !== 'session expired') {
        const groupResult = await pool.query(
          'SELECT id FROM facebook_groups WHERE fb_group_id = $1 OR id = $2',
          [r.group_id, r.group_id]
        );
        if (groupResult.rows.length > 0 && groupResult.rows[0].page_is_member) {
          await pool.query(
            'UPDATE facebook_groups SET page_is_member = false, updated_at = NOW() WHERE id = $1',
            [groupResult.rows[0].id]
          );
        }
      }
    }

    return { success: true, results };
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    return { error: `Error llamando al scraper VPS: ${detail}`, results: [] };
  }
}

export async function replicateInstagramToFacebook(instagramPostId) {
  const postResult = await pool.query(
    `SELECT ip.*, p.name as pet_name, p.species, p.status, p.location,
            p.contact_info, p.description, p.color, p.gender, p.age, p.breed,
            p.neighborhoods, p.id as pet_id,
            (SELECT array_agg(pi.image_data ORDER BY pi.created_at) FROM pet_images pi WHERE pi.pet_id = p.id) as images_data
     FROM instagram_posts ip
     LEFT JOIN pets p ON p.id = ip.pet_id
     WHERE ip.id = $1`,
    [instagramPostId]
  );

  if (postResult.rows.length === 0) return { error: 'Post de Instagram no encontrado' };
  const post = postResult.rows[0];
  if (!post.pet_id) return { error: 'El post no tiene mascota asociada' };

  const hashtags = await getSetting('instagram_default_hashtags') || '#SigoTuHuella';
  const message = buildPetMessage(post, hashtags, post.ig_permalink);
  const link = `${FRONTEND_URL}/pet/${post.pet_id}`;
  const imageUrls = buildImageUrls(post.pet_id, post.images_data);

  const results = { page: null, groups: [], pagePostId: null };

  const pageResult = await publishToPage(post.pet_id);
  const pagePostId = pageResult.success ? pageResult.pagePostId : null;
  results.page = pageResult;
  results.pagePostId = pagePostId;

  const groupsResult = await pool.query(
    `SELECT id, name, fb_group_id, page_is_member FROM facebook_groups
     WHERE is_active = true AND fb_group_id IS NOT NULL AND fb_group_id != ''
     ORDER BY name`
  );

  const eligibleGroups = [];

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

    eligibleGroups.push({ id: group.id, fb_group_id: group.fb_group_id, name: group.name });
  }

  if (eligibleGroups.length > 0) {
    const scraperResult = await publishToGroupsViaScraper(eligibleGroups, message, imageUrls, post.pet_id);
    if (scraperResult.success) {
      for (const r of scraperResult.results) {
        results.groups.push({
          groupId: r.group_id,
          name: r.group_name || eligibleGroups.find(g => g.fb_group_id === r.group_id || g.id === r.group_id)?.name || r.group_id,
          success: r.success,
          error: r.error,
          groupPostId: r.post_id || r.group_post_id,
        });
      }
    } else {
      for (const g of eligibleGroups) {
        results.groups.push({
          groupId: g.id,
          name: g.name,
          success: false,
          error: scraperResult.error,
        });
      }
    }
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
    `SELECT fpp.id, fpp.instagram_post_id, fpp.pet_id, fpp.message, fpp.page_post_id
     FROM facebook_page_posts fpp
     WHERE fpp.status = 'failed'
       AND fpp.page_post_id IS NOT NULL
     ORDER BY fpp.created_at DESC
     LIMIT $1`,
    [limit]
  );

  const results = [];
  for (const row of posts.rows) {
    try {
      const groupsResult = await pool.query(
        `SELECT id, name, fb_group_id FROM facebook_groups
         WHERE is_active = true AND fb_group_id IS NOT NULL AND fb_group_id != ''
         ORDER BY name`
      );

      const eligibleGroups = groupsResult.rows.map(g => ({
        id: g.id, fb_group_id: g.fb_group_id, name: g.name,
      }));

      const scraperResult = await publishToGroupsViaScraper(eligibleGroups, row.message, [], row.pet_id);
      const anySuccess = scraperResult.success && scraperResult.results.some(r => r.success);

      if (anySuccess) {
        const groupPostIds = scraperResult.results.filter(r => r.success).map(r => r.post_id || r.group_post_id);
        await pool.query(
          `UPDATE facebook_page_posts
           SET status = 'published', group_post_ids = $1, error_message = NULL, updated_at = NOW()
           WHERE id = $2`,
          [groupPostIds, row.id]
        );
        results.push({ postId: row.instagram_post_id, result: { success: true } });
      } else {
        const errorMsg = scraperResult.error || 'Group posting failed on retry';
        await pool.query(
          `UPDATE facebook_page_posts
           SET error_message = $1, updated_at = NOW()
           WHERE id = $2`,
          [errorMsg, row.id]
        );
        results.push({ postId: row.instagram_post_id, result: { error: errorMsg } });
      }
    } catch (err) {
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      results.push({ postId: row.instagram_post_id, result: { error: errMsg } });
    }
  }
  return results;
}

export async function publishPetToGroups(petId) {
  const dupCheck = await pool.query(
    'SELECT 1 FROM facebook_page_posts WHERE pet_id = $1 AND status = $2 AND group_post_ids IS NOT NULL AND array_length(group_post_ids, 1) > 0',
    [petId, 'published']
  );
  if (dupCheck.rows.length > 0) return { alreadyPublished: true, petId };

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
  const imageUrls = buildImageUrls(pet.id, pet.images_data);

  const results = { page: null, groups: [], petId };

  const pageResult = await publishToPage(petId);
  results.page = pageResult;

  const groupsResult = await pool.query(
    `SELECT id, name, fb_group_id FROM facebook_groups
     WHERE is_active = true AND publish_on_create = true AND page_is_member = true
       AND fb_group_id IS NOT NULL AND fb_group_id != ''
     ORDER BY name`
  );

  if (groupsResult.rows.length > 0) {
    const eligibleGroups = groupsResult.rows.map(g => ({
      id: g.id, fb_group_id: g.fb_group_id, name: g.name,
    }));

    const scraperResult = await publishToGroupsViaScraper(eligibleGroups, message, imageUrls, petId);
    if (scraperResult.success) {
      for (const r of scraperResult.results) {
        results.groups.push({
          groupId: r.group_id,
          name: r.group_name || eligibleGroups.find(g => g.fb_group_id === r.group_id || g.id === r.group_id)?.name || r.group_id,
          success: r.success,
          error: r.error,
          groupPostId: r.post_id || r.group_post_id,
        });
      }
    } else {
      for (const g of eligibleGroups) {
        results.groups.push({
          groupId: g.id, name: g.name, success: false, error: scraperResult.error,
        });
      }
    }
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
