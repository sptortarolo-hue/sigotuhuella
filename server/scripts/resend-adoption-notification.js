import pool from '../db.js';
import nodemailer from 'nodemailer';
import { enqueue } from '../services/phoneRelayService.js';
import { normalizePhone } from '../services/phoneUtils.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'l0061596.ferozo.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  tls: { rejectUnauthorized: false },
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.com.ar';

async function findAssignment(search) {
  if (search.startsWith('token:')) {
    const token = search.slice('token:'.length);
    const res = await pool.query(
      `SELECT aa.*, p.name as pet_name, p.species, p.breed, p.color, p.status as pet_status
       FROM adoption_assignments aa
       JOIN pets p ON p.id = aa.pet_id
       WHERE aa.token = $1 LIMIT 1`,
      [token]
    );
    return res.rows[0];
  }
  if (search.startsWith('phone:')) {
    const phone = search.slice('phone:'.length);
    const res = await pool.query(
      `SELECT aa.*, p.name as pet_name, p.species, p.breed, p.color
       FROM adoption_assignments aa
       LEFT JOIN pets p ON p.id = aa.pet_id
       WHERE regexp_replace(aa.adopter_phone, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
         AND aa.status <> 'returned'
       ORDER BY aa.created_at DESC LIMIT 1`,
      [phone]
    );
    return res.rows[0];
  }
  return null;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log('Uso:');
    console.log('  node server/scripts/resend-adoption-notification.js token:8c4a2fcc41d14423969fdba409460525ms93fcln');
    console.log('  node server/scripts/resend-adoption-notification.js phone:5492215596442');
    process.exit(1);
  }

  const assignment = await findAssignment(arg);
  if (!assignment) {
    console.error('No se encontró ninguna adopción que reenviar para:', arg);
    process.exit(1);
  }

  const claimLink = `${FRONTEND_URL}/adopcion/reclamar/${assignment.token}`;
  const inviterRes = await pool.query(
    'SELECT display_name, email FROM users WHERE id = $1',
    [assignment.inviter_id]
  );
  const inviter = inviterRes.rows[0] || {};
  const inviterName = inviter.display_name || inviter.email?.split('@')[0] || 'Un usuario';
  const speciesLabel = assignment.species === 'dog' ? 'Perro' : assignment.species === 'cat' ? 'Gato' : (assignment.species || 'Mascota');

  const waText = `🐾 Hola ${assignment.adopter_name}!

${inviterName} te eligió para darle un hogar a ${assignment.pet_name} a través de Sigo Tu Huella.

¿Qué significa?
✅ ${assignment.pet_name} va a ser oficialmente tuyo/a
✅ Su chapita QR quedará asociada a tu nombre
✅ Vas a poder gestionar su perfil, fotos y salud
✅ El dueño anterior ya no podrá modificar sus datos

Para ver los detalles y confirmar, hacé clic acá:
${claimLink}`;

  const results = { whatsapp: 'no aplica', email: 'no aplica' };

  const phone = normalizePhone(assignment.adopter_phone);
  if (phone) {
    await enqueue(phone, waText);
    results.whatsapp = `encolado -> ${phone}`;
  }

  if (assignment.adopter_email) {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="background:#f43f5e;color:white;width:60px;height:60px;line-height:60px;font-size:30px;border-radius:20px;display:inline-block;">🐾</div>
        </div>
        <h2 style="color:#1e293b;text-align:center;font-size:20px;margin-bottom:8px;">${inviterName} te dio en adopción a ${assignment.pet_name}</h2>
        <p style="color:#475569;text-align:center;font-size:15px;margin-bottom:20px;">A través de Sigo Tu Huella, la red de vecinos que cuidamos las mascotas.</p>
        <table style="width:100%;background:white;border-radius:12px;padding:16px;margin-bottom:20px;border:1px solid #e2e8f0;">
          <tr><td style="padding:4px 0;color:#64748b;">Especie</td><td style="padding:4px 0;font-weight:bold;">${speciesLabel}</td></tr>
          ${assignment.breed ? `<tr><td style="padding:4px 0;color:#64748b;">Raza</td><td style="padding:4px 0;font-weight:bold;">${assignment.breed}</td></tr>` : ''}
          ${assignment.color ? `<tr><td style="padding:4px 0;color:#64748b;">Color</td><td style="padding:4px 0;font-weight:bold;">${assignment.color}</td></tr>` : ''}
        </table>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:20px;">
          <h3 style="color:#92400e;font-size:14px;margin:0 0 8px;">¿Qué significa?</h3>
          <ul style="color:#92400e;font-size:13px;padding-left:20px;margin:0;">
            <li style="margin-bottom:4px;">${assignment.pet_name} va a ser oficialmente tuyo</li>
            <li style="margin-bottom:4px;">Su chapita QR quedará asociada a tu nombre</li>
            <li style="margin-bottom:4px;">Vas a poder gestionar su perfil, fotos y salud</li>
            <li style="margin-bottom:4px;">El dueño anterior ya no podrá modificar sus datos</li>
          </ul>
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${claimLink}" style="background:#5A5A40;color:#fff;padding:14px 40px;border-radius:12px;text-decoration:none;font-size:16px;font-weight:bold;display:inline-block;">Ver y confirmar adopción</a>
        </div>
        <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:24px;">Sigo Tu Huella — Identificación Digital para Mascotas</p>
      </div>`;
    await transporter.sendMail({
      from: `"Sigo Tu Huella" <${process.env.SMTP_FROM}>`,
      to: assignment.adopter_email,
      subject: `${inviterName} te dio en adopción a ${assignment.pet_name}`,
      html,
    });
    results.email = `enviado -> ${assignment.adopter_email}`;
  }

  console.log('========================================');
  console.log(`Mascota:  ${assignment.pet_name}`);
  console.log(`Adoptante: ${assignment.adopter_name}`);
  console.log(`Status:    ${assignment.status}`);
  console.log(`Link:      ${claimLink}`);
  console.log(`WhatsApp:  ${results.whatsapp}`);
  console.log(`Email:     ${results.email}`);
  console.log('========================================');
  process.exit(0);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});