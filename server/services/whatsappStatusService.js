import pool from '../db.js';

function getStatusLabel(pet) {
  const labels = {
    lost: '🐾 SE PERDIÓ',
    retained: '🔄 RETENIDO',
    sighted: '👀 AVISTADO',
    for_adoption: '❤️ EN ADOPCIÓN',
    for_adoption_simple: '📢 EN ADOPCIÓN',
    adopted: '✅ ADOPTADO',
    reunited: '🎉 REENCUENTRO',
    accidented: '🚑 ACCIDENTADO',
    needs_attention: '⚠️ NECESITA ATENCIÓN',
  };
  return labels[pet.status] || '🐾 MASCOTA';
}

function generateStatusText(pet) {
  const label = getStatusLabel(pet);
  const speciesLabel = pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species || 'Mascota';
  const genderLabel = pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : '';
  const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

  const isCelebration = pet.status === 'reunited' || pet.status === 'adopted';

  if (isCelebration) {
    return [
      label,
      pet.name ? `${pet.name}` : '',
      '',
      `🐾 ${frontendUrl}/pet/${pet.id}`,
    ].filter(Boolean).join('\n');
  }

  return [
    label,
    pet.name ? `${pet.name}` : '',
    `${speciesLabel}${pet.breed ? ' · ' + pet.breed : ''}`,
    genderLabel && pet.age ? `${genderLabel} · ${pet.age}` : genderLabel || pet.age || '',
    `📍 ${pet.location || 'Sin ubicación'}`,
    pet.contact_info ? `📞 ${pet.contact_info}` : '',
    '',
    `🔗 ${frontendUrl}/pet/${pet.id}`,
  ].filter(Boolean).join('\n');
}

export async function enqueueStatus(text, imageUrl) {
  const result = await pool.query(
    `INSERT INTO relay_messages (wa_to, text, image_url, type, status)
     VALUES (NULL, $1, $2, 'status', 'pending') RETURNING id`,
    [text, imageUrl || null]
  );
  return result.rows[0].id;
}

export async function publishPetAsStatus(pet, caption) {
  const enabled = await pool.query("SELECT value FROM settings WHERE key = 'wa_status_enabled'");
  if (enabled.rows[0]?.value !== 'true') {
    console.log('[Status] wa_status_enabled no activado, saltando status');
    return null;
  }

  const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
  const statusText = caption || generateStatusText(pet);
  const coverUrl = pet.image_data
    ? `${frontendUrl}/api/images/pet/${pet.id}/cover`
    : null;

  const id = await enqueueStatus(statusText, coverUrl);
  console.log(`[Status] Estado encolado para "${pet.name}" (${pet.id}): ${id}`);
  return id;
}

export async function getPendingStatuses(limit = 5) {
  const result = await pool.query(
    "SELECT id, text, image_url, created_at FROM relay_messages WHERE type = 'status' AND status = 'pending' ORDER BY created_at ASC LIMIT $1",
    [limit]
  );
  return result.rows;
}

export async function getStatusHistory(limit = 10) {
  const result = await pool.query(
    "SELECT id, text, image_url, created_at, sent_at, status FROM relay_messages WHERE type = 'status' ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
  return result.rows;
}
