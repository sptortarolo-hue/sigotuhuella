import pool from '../db.js';
import { extractColors, extractSpecies, haversineDistance, classifyAndExtract } from './fbClassifier.js';
import { sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins, sendPushToUser } from './pushService.js';
import sharp from 'sharp';

const SPECIES_KEYWORDS = {
  dog: ['perro', 'perra', 'cachorro', 'cachorra', 'canino', 'dog', 'perrito', 'perrita', 'can', 'sabueso'],
  cat: ['gato', 'gata', 'gatito', 'gatita', 'felino', 'cat', 'minino', 'michi', 'misha', 'felix'],
};

const COMMON_COLORS = [
  'negro', 'blanco', 'marron', 'marrón', 'gris', 'dorado', 'crema',
  'atigrado', 'carey', 'bicolor', 'tricolor', 'overo', 'pardo',
  'albaricoque', 'cafe', 'café', 'canela', 'rojizo', 'rubio',
  'chocolate', 'beige', 'ceniza', 'atigrada',
];

function extractColorsFromText(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const c of COMMON_COLORS) {
    if (lower.includes(c)) found.push(c);
  }
  return found;
}

function extractSpeciesFromText(text) {
  const lower = text.toLowerCase();
  for (const [species, keywords] of Object.entries(SPECIES_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return species;
  }
  return null;
}

async function extractColorSignature(imageBuffer) {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(32, 32, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const buckets = {};
    for (let i = 0; i < data.length; i += 3) {
      const r = Math.round(data[i] / 64) * 64;
      const g = Math.round(data[i + 1] / 64) * 64;
      const b = Math.round(data[i + 2] / 64) * 64;
      const key = `${r},${g},${b}`;
      buckets[key] = (buckets[key] || 0) + 1;
    }

    const totalPixels = (data.length / 3);
    const signature = Object.entries(buckets)
      .map(([color, count]) => ({ color: color.split(',').map(Number), ratio: count / totalPixels }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 8);

    return signature;
  } catch (err) {
    return null;
  }
}

function compareColorSignatures(sigA, sigB) {
  if (!sigA || !sigB || sigA.length === 0 || sigB.length === 0) return 0;

  let score = 0;
  for (const a of sigA) {
    for (const b of sigB) {
      const dist = Math.sqrt(
        (a.color[0] - b.color[0]) ** 2 +
        (a.color[1] - b.color[1]) ** 2 +
        (a.color[2] - b.color[2]) ** 2
      );
      if (dist < 100) {
        score += Math.max(0, 1 - dist / 100) * Math.min(a.ratio, b.ratio) * 100;
      }
    }
  }
  return Math.min(score, 100);
}

async function getPetImages(petId) {
  try {
    const result = await pool.query(
      'SELECT image_data, mime_type FROM pet_images WHERE pet_id = $1 ORDER BY created_at LIMIT 3',
      [petId]
    );
    return result.rows.map(r => Buffer.from(r.image_data, 'base64'));
  } catch {
    return [];
  }
}

async function getFbPostImages(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return [];

  try {
    const buffers = [];
    for (const url of imageUrls.slice(0, 3)) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          const arrayBuf = await resp.arrayBuffer();
          buffers.push(Buffer.from(arrayBuf));
        }
      } catch {
        /* skip failed fetches */
      }
    }
    return buffers;
  } catch {
    return [];
  }
}

async function calculateImageMatchScore(sourceImages, targetImages) {
  if (!sourceImages.length || !targetImages.length) return 0;

  try {
    const sourceSignatures = (await Promise.all(sourceImages.map(extractColorSignature))).filter(Boolean);
    const targetSignatures = (await Promise.all(targetImages.map(extractColorSignature))).filter(Boolean);

    if (sourceSignatures.length === 0 || targetSignatures.length === 0) return 0;

    let bestScore = 0;
    for (const s of sourceSignatures) {
      for (const t of targetSignatures) {
        const score = compareColorSignatures(s, t);
        if (score > bestScore) bestScore = score;
      }
    }
    return Math.round(bestScore);
  } catch {
    return 0;
  }
}

function calculateTextMatchScore(source, target) {
  let score = 0;
  const reasons = [];

  const sourceSpecies = source.species || extractSpeciesFromText(source.content || '');
  const targetSpecies = target.species || extractSpeciesFromText(target.content || '');

  if (sourceSpecies && targetSpecies && sourceSpecies === targetSpecies) {
    score += 30;
    reasons.push('misma especie');
  }

  const sourceColors = source.colors || extractColorsFromText(source.content || '');
  const targetColors = target.colors || extractColorsFromText(target.content || '');

  if (sourceColors.length > 0 && targetColors.length > 0) {
    const matchCount = sourceColors.filter(c =>
      targetColors.some(tc => tc.includes(c) || c.includes(tc))
    ).length;
    if (matchCount > 0) {
      score += Math.min(matchCount * 15, 45);
      reasons.push(`${matchCount} color(es) coincidente(s)`);
    }
  }

  const sourceLoc = source.location_hint || source.location || '';
  const targetLoc = target.location_hint || target.location || '';
  if (sourceLoc && targetLoc) {
    const srcWords = new Set(sourceLoc.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2));
    const tgtWords = targetLoc.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
    let overlap = 0;
    for (const w of srcWords) if (tgtWords.includes(w)) overlap++;
    if (overlap > 0) {
      score += Math.min(overlap * 10, 20);
      reasons.push(`${overlap} términno(s) de ubicación en común`);
    }
  }

  const sourceDesc = source.description || source.content || '';
  const targetDesc = target.description || target.content || '';
  if (sourceDesc && targetDesc) {
    const sw = new Set(sourceDesc.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const tw = new Set(targetDesc.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    let overlap = 0;
    for (const w of sw) if (tw.has(w)) overlap++;
    if (overlap > 0) {
      score += Math.min(overlap * 2, 15);
      if (!reasons.some(r => r.includes('descripción'))) reasons.push('descripción similar');
    }
  }

  return { score: Math.min(score, 100), reasons };
}

function calculateGeoScore(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
  const km = haversineDistance(lat1, lng1, lat2, lng2);
  if (km <= 1) return 100;
  if (km >= 20) return 0;
  return Math.round(100 * (1 - km / 20));
}

async function getSettings() {
  const result = await pool.query(
    "SELECT key, value FROM settings WHERE key IN ('fb_matching_enabled', 'fb_matching_min_score', 'fb_image_matching_enabled', 'fb_image_matching_weight')"
  );
  const s = {};
  result.rows.forEach(r => (s[r.key] = r.value));
  return {
    enabled: s.fb_matching_enabled === 'true',
    minScore: parseFloat(s.fb_matching_min_score) || 50,
    imageEnabled: s.fb_image_matching_enabled === 'true',
    imageWeight: parseFloat(s.fb_image_matching_weight) || 20,
  };
}

async function createMatch(sourceType, sourceId, targetType, targetId, score, reasons, method) {
  await pool.query(
    `INSERT INTO facebook_matches (source_type, source_id, target_type, target_id, score, reasons, method)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING`,
    [sourceType, sourceId, targetType, targetId, score, reasons, method]
  );
}

function getOppositeClassification(classification) {
  if (classification === 'lost') return 'found';
  if (classification === 'found') return 'lost';
  return null;
}

export async function findMatchesForPost(postId) {
  const cfg = await getSettings();
  if (!cfg.enabled) return [];

  const postRes = await pool.query('SELECT * FROM facebook_posts WHERE id = $1', [postId]);
  if (postRes.rows.length === 0) return [];
  const post = postRes.rows[0];
  const matches = [];

  const postColors = extractColorsFromText(post.content || '');

  let fbImages = [];
  if (cfg.imageEnabled) {
    fbImages = await getFbPostImages(post.image_urls);
  }

  if (post.classification === 'found') {
    const petsRes = await pool.query(
      "SELECT p.*, u.email as owner_email, u.display_name as owner_name FROM pets p LEFT JOIN users u ON p.created_by = u.id WHERE p.status = 'lost'"
    );
    for (const pet of petsRes.rows) {
      const target = {
        species: pet.species,
        colors: extractColorsFromText((pet.color || '') + ' ' + (pet.description || '')),
        location: pet.location,
        description: pet.description,
      };
      const { score: textScore, reasons } = calculateTextMatchScore(
        { species: post.species, colors: postColors, location_hint: post.location_hint, content: post.content },
        target
      );
      const geoScore = calculateGeoScore(post.latitude, post.longitude, pet.latitude, pet.longitude);

      const textGeoScore = textScore * 0.7 + geoScore * 0.3;
      let totalScore = textGeoScore;
      let method = 'text';
      let allReasons = reasons.concat(geoScore > 0 ? [`geográfico: ${geoScore}%`] : []);

      if (cfg.imageEnabled && textGeoScore >= cfg.minScore * 0.5) {
        const petImages = await getPetImages(pet.id);
        const imageScore = await calculateImageMatchScore(fbImages, petImages);
        if (imageScore > 0) {
          const imageW = cfg.imageWeight / 100;
          const textW = 1 - imageW;
          totalScore = textGeoScore * textW + imageScore * imageW;
          method = 'hybrid';
          allReasons.push(`imagen: ${imageScore}%`);
        }
      }

      totalScore = Math.round(totalScore);

      if (totalScore >= cfg.minScore) {
        matches.push({
          targetType: 'app_pet',
          targetId: pet.id,
          targetName: pet.name || 'Mascota sin nombre',
          targetOwner: pet.owner_name || null,
          targetOwnerEmail: pet.owner_email || null,
          score: totalScore,
          reasons: allReasons,
          method,
        });
      }
    }
  }

  if (post.classification === 'lost') {
    const fbFoundRes = await pool.query(
      "SELECT * FROM facebook_posts WHERE classification = 'found' AND id != $1 AND is_matched = false",
      [postId]
    );
    for (const fbPost of fbFoundRes.rows) {
      const { score: textScore, reasons } = calculateTextMatchScore(
        { species: post.species, colors: postColors, location_hint: post.location_hint, content: post.content },
        { species: fbPost.species, colors: extractColorsFromText(fbPost.content || ''), location_hint: fbPost.location_hint, content: fbPost.content }
      );
      const geoScore = calculateGeoScore(post.latitude, post.longitude, fbPost.latitude, fbPost.longitude);

      const textGeoScore = textScore * 0.7 + geoScore * 0.3;
      let totalScore = textGeoScore;
      let method = 'text';
      let allReasons = reasons.concat(geoScore > 0 ? [`geográfico: ${geoScore}%`] : []);

      if (cfg.imageEnabled && textGeoScore >= cfg.minScore * 0.5) {
        const targetImages = await getFbPostImages(fbPost.image_urls);
        const imageScore = await calculateImageMatchScore(fbImages, targetImages);
        if (imageScore > 0) {
          const imageW = cfg.imageWeight / 100;
          const textW = 1 - imageW;
          totalScore = textGeoScore * textW + imageScore * imageW;
          method = 'hybrid';
          allReasons.push(`imagen: ${imageScore}%`);
        }
      }

      totalScore = Math.round(totalScore);

      if (totalScore >= cfg.minScore) {
        matches.push({
          targetType: 'fb_post',
          targetId: fbPost.id,
          targetName: `Post en grupo (${fbPost.author_name || 'anónimo'})`,
          targetOwner: null,
          targetOwnerEmail: null,
          score: totalScore,
          reasons: allReasons,
          method,
        });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);

  for (const m of matches.slice(0, 5)) {
    try {
      await createMatch('fb_post', postId, m.targetType, m.targetId, m.score, m.reasons, m.method);
    } catch (err) {
      if (!err.message.includes('duplicate')) console.error('Error creating match:', err);
    }
  }

  if (matches.length > 0) {
    const top = matches[0];
    await sendAdminNotificationEmail(
      '🎯 Match Facebook detectado',
      buildMatchEmailHtml(post, top)
    );
    sendPushToAdmins({
      title: '🎯 Match Facebook',
      body: `${post.classification === 'found' ? 'Encontraron' : 'Perdieron'} ${post.species || 'mascota'} — score ${top.score}%`,
      url: '/admin?tab=facebook',
    }).catch(() => {});
  }

  if (matches.length > 0) {
    await pool.query('UPDATE facebook_posts SET is_matched = true WHERE id = $1', [postId]);
  }

  return matches;
}

export async function findMatchesForPet(petId) {
  const cfg = await getSettings();
  if (!cfg.enabled) return [];

  const petRes = await pool.query('SELECT * FROM pets WHERE id = $1', [petId]);
  if (petRes.rows.length === 0) return [];
  const pet = petRes.rows[0];
  const matches = [];

  let petImages = [];
  if (cfg.imageEnabled) {
    petImages = await getPetImages(petId);
  }

  const foundPostsRes = await pool.query(
    "SELECT * FROM facebook_posts WHERE classification = 'found' AND is_matched = false"
  );

  for (const post of foundPostsRes.rows) {
    const { score: textScore, reasons } = calculateTextMatchScore(
      { species: pet.species, colors: extractColorsFromText((pet.color || '') + ' ' + (pet.description || '')), location_hint: pet.location, description: pet.description },
      { species: post.species, colors: extractColorsFromText(post.content || ''), location_hint: post.location_hint, content: post.content }
    );
    const geoScore = calculateGeoScore(pet.latitude, pet.longitude, post.latitude, post.longitude);

    const textGeoScore = textScore * 0.7 + geoScore * 0.3;
    let totalScore = textGeoScore;
    let method = 'text';
    let allReasons = reasons.concat(geoScore > 0 ? [`geográfico: ${geoScore}%`] : []);

    if (cfg.imageEnabled && textGeoScore >= cfg.minScore * 0.5) {
      const fbImages = await getFbPostImages(post.image_urls);
      const imageScore = await calculateImageMatchScore(petImages, fbImages);
      if (imageScore > 0) {
        const imageW = cfg.imageWeight / 100;
        const textW = 1 - imageW;
        totalScore = textGeoScore * textW + imageScore * imageW;
        method = 'hybrid';
        allReasons.push(`imagen: ${imageScore}%`);
      }
    }

    totalScore = Math.round(totalScore);

    if (totalScore >= cfg.minScore) {
      matches.push({
        targetType: 'fb_post',
        targetId: post.id,
        targetName: `Publicación en Facebook`,
        score: totalScore,
        reasons: allReasons,
        method,
        fbPost: post,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  for (const m of matches.slice(0, 5)) {
    try {
      await createMatch('app_pet', petId, 'fb_post', m.targetId, m.score, m.reasons, 'text');
    } catch (err) {
      if (!err.message.includes('duplicate')) console.error('Error creating match:', err);
    }
  }

  if (pet.created_by && matches.length > 0) {
    const top = matches[0];
    sendPushToUser(pet.created_by, {
      title: '🐾 Posible match en Facebook',
      body: `Encontraron un ${top.fbPost.species || 'animal'} en ${top.fbPost.location_hint || 'tu zona'} (${top.score}% coincidencia)`,
      url: `/facebook-posts/${top.fbPost.id}`,
    }).catch(() => {});
  }

  return matches;
}

export async function runFullMatching() {
  const cfg = await getSettings();
  if (!cfg.enabled) return { skipped: true, message: 'Matching deshabilitado' };

  const unclassifiedPosts = await pool.query(
    "SELECT id FROM facebook_posts WHERE is_matched = false AND classification IN ('lost', 'found')"
  );

  let totalMatches = 0;
  for (const row of unclassifiedPosts.rows) {
    const matches = await findMatchesForPost(row.id);
    totalMatches += matches.length;
  }

  return { processed: unclassifiedPosts.rows.length, matches: totalMatches };
}

function buildMatchEmailHtml(post, match) {
  return `<p style="font-size:16px;margin-bottom:16px;">Se detectó un posible match entre un post de Facebook y un reporte existente.</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Post Facebook</td>
    <td style="padding:8px;border:1px solid #e2e8f0;">${post.content ? post.content.substring(0, 200) : 'Sin contenido'}</td></tr>
<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Clasificación</td>
    <td style="padding:8px;border:1px solid #e2e8f0;">${post.classification}</td></tr>
<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Especie</td>
    <td style="padding:8px;border:1px solid #e2e8f0;">${post.species || 'No detectada'}</td></tr>
<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Match con</td>
    <td style="padding:8px;border:1px solid #e2e8f0;">${match.targetName}</td></tr>
<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Score</td>
    <td style="padding:8px;border:1px solid #e2e8f0;">${match.score}%</td></tr>
<tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold;">Razones</td>
    <td style="padding:8px;border:1px solid #e2e8f0;">${match.reasons.join(', ')}</td></tr>
</table>`;
}
