import pool from '../db.js';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'l0061596.ferozo.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  tls: { rejectUnauthorized: false },
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

function emailHtml(pet, userName) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://sigotuhuella.online/favicon.svg" alt="Sigo Tu Huella" width="64" height="64" style="border-radius:16px;"/>
    </div>
    <h2 style="color:#5A5A40;text-align:center;">¡Solicitud recibida! 🐾</h2>
    <p style="font-size:16px;color:#334155;">Hola <strong>${userName}</strong>,</p>
    <p style="font-size:16px;color:#334155;">Recibimos tu solicitud de chapita QR para <strong>${pet.name}</strong> (${pet.species}${pet.breed ? ' · ' + pet.breed : ''}).</p>
    <p style="font-size:16px;color:#334155;">Te vamos a notificar cuando esté lista para que pases a retirarla.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="https://sigotuhuella.online/mascota/${pet.pet_id}" style="background:#5A5A40;color:#fff;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:bold;display:inline-block;">Ver perfil de ${pet.name}</a>
    </div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
    <p style="color:#94a3b8;font-size:12px;text-align:center;">Sigo Tu Huella — Identificación Digital para Mascotas</p>
  </div>`;
}

async function main() {
  const result = await pool.query(
    `SELECT mp.id as pet_id, mp.name as pet_name, mp.species, mp.breed,
            u.id as user_id, u.email, u.display_name
     FROM my_pets mp
     JOIN users u ON u.id = mp.user_id
     WHERE mp.qr_requested = true AND mp.qr_id IS NULL
     ORDER BY mp.updated_at DESC`
  );

  const rows = result.rows;
  console.log(`Pendientes: ${rows.length} solicitudes\n`);

  let sent = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const pet = { name: row.pet_name, species: row.species, breed: row.breed, pet_id: row.pet_id };
    const userName = row.display_name || row.email?.split('@')[0] || 'Usuario';
    try {
      await transporter.sendMail({
        from: `"Sigo Tu Huella" <${process.env.SMTP_USER}>`,
        to: row.email,
        subject: `Recibimos tu solicitud de chapita QR para ${pet.name}`,
        html: emailHtml(pet, userName),
      });
      console.log(`[${i + 1}/${rows.length}] ✓ ${row.email} → ${pet.name}`);
      sent++;
    } catch (err) {
      console.log(`[${i + 1}/${rows.length}] ✗ ${row.email} → ${pet.name} (${err.message})`);
      failed++;
    }
  }

  console.log(`\nEnviados: ${sent} | Fallidos: ${failed}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });