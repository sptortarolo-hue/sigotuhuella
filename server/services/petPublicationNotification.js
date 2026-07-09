import pool from '../db.js';
import { enqueue } from './phoneRelayService.js';
import { normalizePhone } from './phoneUtils.js';
import { buildPetBroadcastCaption } from './whatsappService.js';

export async function notifyPetPublication(petId, phone) {
  if (!phone) return;
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 12) return;

  const pet = (await pool.query(`
    SELECT p.*,
      (SELECT pi.image_data FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as image_data,
      (SELECT pi.mime_type FROM pet_images pi WHERE pi.pet_id = p.id ORDER BY pi.created_at LIMIT 1) as mime_type
    FROM pets p WHERE p.id = $1
  `, [petId])).rows[0];
  if (!pet) return;

  const frontendUrl = process.env.FRONTEND_URL || 'https://sigotuhuella.online';
  const coverUrl = pet.image_data ? `${frontendUrl}/api/images/pet/${petId}/cover` : null;
  const caption = await buildPetBroadcastCaption(pet);

  await enqueue(normalized, caption, coverUrl);
  await enqueue(normalized, '✅ El reporte ya fue publicado en la app y se está replicando en Instagram, Facebook y grupos de WhatsApp del barrio.');
}
