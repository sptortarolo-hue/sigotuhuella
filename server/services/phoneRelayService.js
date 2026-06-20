import pool from '../db.js';

export async function enqueue(waTo, text, imageUrl) {
  const result = await pool.query(
    'INSERT INTO relay_messages (wa_to, text, image_url) VALUES ($1, $2, $3) RETURNING id',
    [waTo, text, imageUrl || null]
  );
  return result.rows[0].id;
}

export async function getPending(limit = 10) {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('relay_last_poll_at', NOW()::text) ON CONFLICT (key) DO UPDATE SET value = NOW()::text"
  );
  const result = await pool.query(
    "SELECT id, wa_to, text, image_url FROM relay_messages WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1",
    [limit]
  );
  return result.rows;
}

export async function markSent(ids) {
  if (!ids || ids.length === 0) return;
  await pool.query(
    "UPDATE relay_messages SET status = 'sent', sent_at = NOW() WHERE id = ANY($1::uuid[]) AND status = 'pending'",
    [ids]
  );
}

export async function markFailed(ids) {
  if (!ids || ids.length === 0) return;
  await pool.query(
    "UPDATE relay_messages SET status = 'failed' WHERE id = ANY($1::uuid[]) AND status = 'pending'",
    [ids]
  );
}

export async function saveQR(imageBase64) {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('relay_qr_image', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [imageBase64]
  );
}

export async function clearQR() {
  await pool.query(
    "DELETE FROM settings WHERE key = 'relay_qr_image'"
  );
}

export async function getQR() {
  const result = await pool.query(
    "SELECT value FROM settings WHERE key = 'relay_qr_image'"
  );
  return result.rows[0]?.value || null;
}

export async function getStatus() {
  const settings = (await pool.query(
    "SELECT key, value FROM settings WHERE key IN ('relay_enabled', 'relay_last_poll_at', 'relay_qr_image')"
  )).rows;
  const map = Object.fromEntries(settings.map(r => [r.key, r.value]));

  const pendingCount = parseInt((await pool.query(
    "SELECT COUNT(*) FROM relay_messages WHERE status = 'pending'"
  )).rows[0].count);

  const enabled = map.relay_enabled === 'true';
  const lastPollAt = map.relay_last_poll_at || null;
  const qrAvailable = !!map.relay_qr_image;

  let connected = false;
  if (lastPollAt) {
    const diff = Date.now() - new Date(lastPollAt).getTime();
    connected = diff < 90000;
  }

  return { enabled, connected, lastPollAt, pendingCount, qrAvailable };
}

export async function setEnabled(val) {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('relay_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [val ? 'true' : 'false']
  );
}

export async function getAllGroups() {
  const result = await pool.query(
    "SELECT * FROM whatsapp_groups WHERE is_active = TRUE"
  );
  return result.rows;
}

export async function getPetForBroadcast(petId) {
  const result = await pool.query(`
    SELECT p.*,
      (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as image_data
    FROM pets p WHERE p.id = $1
  `, [petId]);
  return result.rows[0] || null;
}

export async function getLatestPet() {
  const result = await pool.query(`
    SELECT p.*,
      (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as image_data
    FROM pets p ORDER BY p.created_at DESC LIMIT 1
  `);
  return result.rows[0] || null;
}

export function generateBroadcastCaption(pet) {
  const statusLabels = {
    lost: '🐾 SE PERDIÓ', retained: '🔄 RETENIDO', sighted: '👀 AVISTADO',
    for_adoption: '❤️ EN ADOPCIÓN', adopted: '✅ ADOPTADO',
    reunited: '🎉 REENCUENTRO', accidented: '🚑 ACCIDENTADO',
    needs_attention: '⚠️ NECESITA ATENCIÓN',
  };
  const label = statusLabels[pet.status] || '🐾 MASCOTA';
  const speciesLabel = pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : pet.species || 'Mascota';
  const genderLabel = pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : '';
  const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

  const coverUrl = pet.image_data
    ? `${frontendUrl}/api/images/pet/${pet.id}/cover`
    : null;

  const caption = [
    `${label}`,
    pet.name ? `Nombre: ${pet.name}` : '',
    `${speciesLabel}${pet.breed ? ' · ' + pet.breed : ''}`,
    genderLabel && pet.age ? `${genderLabel} · ${pet.age}` : genderLabel || pet.age || '',
    `📍 ${pet.location || 'Sin ubicación'}`,
    pet.contact_info ? `📞 ${pet.contact_info}` : '',
    '',
    pet.description ? pet.description.substring(0, 300) : '',
    '',
    `🔗 ${frontendUrl}/pet/${pet.id}`,
  ].filter(Boolean).join('\n');

  return { caption, coverUrl };
}
