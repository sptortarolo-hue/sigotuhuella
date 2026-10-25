// Transfiere una mascota al adoptante REASIGNANDO el my_pet original
// (conserva todo el perfil: fotos, eventos, registros, bio, QR, chip, etc.)
// No crea una copia nueva: el adoptante pasa a ser user_id del mismo my_pet.

export async function transferToAdopter(client, assignment, adopterUserId) {
  let myPet = null;

  // El my_pet original (con todo el perfil) se reasigna al adoptante
  if (assignment.my_pet_id) {
    const updRes = await client.query(
      `UPDATE my_pets SET user_id = $1, pet_type = 'own', lost_report_id = NULL,
         transferred_at = NULL, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [adopterUserId, assignment.my_pet_id]
    );
    myPet = updRes.rows[0];
    if (!myPet) {
      // El perfil vinculado ya no existe (borrado): se crea uno mínimo abajo.
      console.warn(`[adoptionTransfer] my_pet ${assignment.my_pet_id} no encontrado para assignment ${assignment.id}: se crea perfil mínimo`);
    }
  }

  if (myPet) {
    // Cortar accesos de co-cuidadores/voluntarios anteriores
    await client.query('DELETE FROM my_pet_shares WHERE pet_id = $1', [assignment.my_pet_id]);
  } else {
    // Fallback defensivo: sin my_pet vinculado, crear una mínima
    const myPetResult = await client.query(
      `INSERT INTO my_pets (user_id, name, species, breed, color, gender, qr_requested)
       VALUES ($1, $2, $3, $4, $5, 'unknown', $6)
       RETURNING *`,
      [adopterUserId, assignment.pet_name, assignment.species, assignment.breed || null, assignment.color || null, false]
    );
    myPet = myPetResult.rows[0];
  }

  // Coherencia QR: el QR (si lo hay) ahora apunta a la my_pet del adoptante
  if (assignment.qr_id) {
    await client.query('UPDATE my_pets SET qr_id = NULL WHERE qr_id = $1', [assignment.qr_id]);
    await client.query(
      'UPDATE qr_identifiers SET my_pet_id = $1, assigned_at = NOW() WHERE id = $2',
      [myPet.id, assignment.qr_id]
    );
    await client.query('UPDATE my_pets SET qr_id = $1 WHERE id = $2', [assignment.qr_id, myPet.id]);
  }

  return myPet;
}