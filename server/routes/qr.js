import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin, sendAdminNotificationEmail } from '../auth.js';
import { sendPushToAdmins, sendPushToUser } from '../services/pushService.js';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = Router();

function nextPrefix(prefix) {
  const chars = prefix.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] < 'Z') { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); return chars.join(''); }
    chars[i] = 'A';
    i--;
  }
  return chars.join('');
}

async function getNextCodes(count) {
  const last = await pool.query("SELECT code FROM qr_identifiers ORDER BY code DESC LIMIT 1");
  let prefix = 'AAA';
  let num = 0;
  if (last.rows.length > 0) {
    const parts = last.rows[0].code.split('-');
    prefix = parts[0];
    num = parseInt(parts[1]);
  }
  const codes = [];
  for (let i = 0; i < count; i++) {
    num++;
    if (num > 9999) { num = 1; prefix = nextPrefix(prefix); }
    codes.push(`${prefix}-${String(num).padStart(4, '0')}`);
  }
  return codes;
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sigotuhuella.online';

router.post('/batch', requireAdmin, async (req, res) => {
  try {
    const { count = 12 } = req.body;
    if (count < 1 || count > 500) return res.status(400).json({ error: 'Cantidad debe ser entre 1 y 500' });

    const codes = await getNextCodes(count);
    const batchId = `batch-${Date.now()}`;
    const values = [];
    const params = [];
    let idx = 1;

    for (const code of codes) {
      const token = uuidv4();
      values.push(`($${idx},$${idx+1},$${idx+2},$${idx+3})`);
      params.push(code, token, batchId, null);
      idx += 4;
    }

    const result = await pool.query(
      `INSERT INTO qr_identifiers (code, share_token, batch_id, my_pet_id) VALUES ${values.join(',')} RETURNING id, code, share_token, batch_id`,
      params
    );

    res.status(201).json({ batch_id: batchId, identifiers: result.rows });
  } catch (err) {
    console.error('qr batch error:', err.message, err.stack);
    res.status(500).json({ error: `Error al generar QRs: ${err.message}` });
  }
});

router.get('/unassigned', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT qi.id, qi.code, qi.share_token, qi.batch_id, qi.created_at
       FROM qr_identifiers qi WHERE qi.my_pet_id IS NULL ORDER BY qi.code ASC`
    );
    res.json({ identifiers: result.rows });
  } catch (err) {
    console.error('qr unassigned error:', err);
    res.status(500).json({ error: 'Error al obtener QRs' });
  }
});

router.get('/requests', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mp.id, mp.name, mp.species, mp.breed, u.display_name, u.email, u.phone
       FROM my_pets mp JOIN users u ON u.id = mp.user_id
       WHERE mp.qr_requested = true AND mp.qr_id IS NULL ORDER BY mp.updated_at DESC`
    );
    res.json({ requests: result.rows });
  } catch (err) {
    console.error('qr requests error:', err);
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

router.post('/assign', requireAdmin, async (req, res) => {
  try {
    const { qr_id, my_pet_id } = req.body;
    if (!qr_id || !my_pet_id) return res.status(400).json({ error: 'qr_id y my_pet_id son requeridos' });

    const qrResult = await pool.query('SELECT * FROM qr_identifiers WHERE id = $1', [qr_id]);
    if (qrResult.rows.length === 0) return res.status(404).json({ error: 'QR no encontrado' });
    if (qrResult.rows[0].my_pet_id) return res.status(400).json({ error: 'QR ya asignado' });

    const petResult = await pool.query('SELECT * FROM my_pets WHERE id = $1', [my_pet_id]);
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    if (petResult.rows[0].qr_id) return res.status(400).json({ error: 'Mascota ya tiene QR asignado' });

    await pool.query(
      'UPDATE qr_identifiers SET my_pet_id = $1, assigned_at = NOW() WHERE id = $2',
      [my_pet_id, qr_id]
    );
    await pool.query(
      'UPDATE my_pets SET qr_id = $1, qr_requested = false WHERE id = $2',
      [qr_id, my_pet_id]
    );

    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [petResult.rows[0].user_id]);
    if (userResult.rows.length > 0) {
      sendPushToUser(userResult.rows[0].id, {
        title: `Identificación para ${petResult.rows[0].name}`,
        body: `Tu mascota ahora tiene el identificador ${qrResult.rows[0].code}`,
        tag: `qr-assigned-${my_pet_id}`,
      }).catch(() => {});
    }

    res.json({ success: true, code: qrResult.rows[0].code });
  } catch (err) {
    console.error('qr assign error:', err);
    res.status(500).json({ error: 'Error al asignar QR' });
  }
});

router.post('/claim', requireAuth, async (req, res) => {
  try {
    const { code, my_pet_id } = req.body;
    if (!code || !my_pet_id) return res.status(400).json({ error: 'Código y mascota son requeridos' });

    const qrResult = await pool.query(
      'SELECT * FROM qr_identifiers WHERE code = $1',
      [code.toUpperCase()]
    );
    if (qrResult.rows.length === 0) return res.status(404).json({ error: 'Código no encontrado' });
    if (qrResult.rows[0].my_pet_id) return res.status(400).json({ error: 'Este QR ya está asignado a otra mascota' });

    const petResult = await pool.query(
      'SELECT * FROM my_pets WHERE id = $1 AND user_id = $2',
      [my_pet_id, req.user.id]
    );
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    if (petResult.rows[0].qr_id) return res.status(400).json({ error: 'Esta mascota ya tiene un QR asignado' });

    await pool.query(
      'UPDATE qr_identifiers SET my_pet_id = $1, assigned_at = NOW() WHERE id = $2',
      [my_pet_id, qrResult.rows[0].id]
    );
    await pool.query(
      'UPDATE my_pets SET qr_id = $1 WHERE id = $2',
      [qrResult.rows[0].id, my_pet_id]
    );

    res.json({ success: true, code: qrResult.rows[0].code, share_token: qrResult.rows[0].share_token });
  } catch (err) {
    console.error('qr claim error:', err);
    res.status(500).json({ error: 'Error al asociar QR' });
  }
});

router.post('/assign-by-token', requireAuth, async (req, res) => {
  try {
    const { share_token, my_pet_id } = req.body;
    if (!share_token || !my_pet_id) return res.status(400).json({ error: 'Token y mascota son requeridos' });

    const qrResult = await pool.query(
      'SELECT * FROM qr_identifiers WHERE share_token = $1',
      [share_token]
    );
    if (qrResult.rows.length === 0) return res.status(404).json({ error: 'QR no encontrado' });
    if (qrResult.rows[0].my_pet_id) return res.status(400).json({ error: 'Este QR ya está asignado a otra mascota' });

    const petResult = await pool.query(
      'SELECT * FROM my_pets WHERE id = $1 AND user_id = $2',
      [my_pet_id, req.user.id]
    );
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'Mascota no encontrada' });
    if (petResult.rows[0].qr_id) return res.status(400).json({ error: 'Esta mascota ya tiene un QR asignado' });

    await pool.query(
      'UPDATE qr_identifiers SET my_pet_id = $1, assigned_at = NOW() WHERE id = $2',
      [my_pet_id, qrResult.rows[0].id]
    );
    await pool.query(
      'UPDATE my_pets SET qr_id = $1 WHERE id = $2',
      [qrResult.rows[0].id, my_pet_id]
    );

    res.json({ success: true, code: qrResult.rows[0].code, share_token: qrResult.rows[0].share_token });
  } catch (err) {
    console.error('qr assign-by-token error:', err);
    res.status(500).json({ error: 'Error al asociar QR' });
  }
});

router.get('/public/:shareToken', async (req, res) => {
  try {
    const qrResult = await pool.query(
      `SELECT qi.*, mp.id as pet_id, mp.name, mp.species, mp.breed, mp.color,
              mp.gender, mp.chip_id, mp.weight_kg, mp.birth_date,
              mp.bio, mp.personality_tags,
              mp.is_vaccinated, mp.is_sterilized, mp.is_dewormed,
              mp.behavior_notes, mp.medical_notes, mp.emergency_phone,
              mp.avatar_image IS NOT NULL as has_avatar,
              u.display_name as owner_name,
              u.phone as owner_phone
       FROM qr_identifiers qi
       JOIN my_pets mp ON mp.id = qi.my_pet_id
       JOIN users u ON u.id = mp.user_id
       WHERE qi.share_token = $1`,
      [req.params.shareToken]
    );
    if (qrResult.rows.length === 0) {
      const existsResult = await pool.query(
        'SELECT id FROM qr_identifiers WHERE share_token = $1',
        [req.params.shareToken]
      );
      if (existsResult.rows.length > 0) {
        return res.json({ found: false, exists: true, share_token: req.params.shareToken });
      }
      return res.json({ found: false, exists: false });
    }

    const row = qrResult.rows[0];
    const photosResult = await pool.query(
      'SELECT id, caption, taken_at FROM my_pet_photos WHERE my_pet_id = $1 ORDER BY COALESCE(taken_at, created_at) DESC',
      [row.pet_id]
    );

    const age = row.birth_date ? calcAge(row.birth_date) : null;

    res.json({
      found: true,
      pet: {
        id: row.pet_id,
        name: row.name,
        species: row.species,
        breed: row.breed,
        color: row.color,
        gender: row.gender,
        chip_id: row.chip_id,
        weight_kg: row.weight_kg,
        birth_date: row.birth_date,
        age,
        bio: row.bio,
        personality_tags: row.personality_tags,
        is_vaccinated: row.is_vaccinated,
        is_sterilized: row.is_sterilized,
        is_dewormed: row.is_dewormed,
        behavior_notes: row.behavior_notes,
        medical_notes: row.medical_notes,
        emergency_phone: row.emergency_phone,
        has_avatar: row.has_avatar,
        owner_name: row.owner_name,
        owner_phone: row.owner_phone,
        photos: photosResult.rows,
        code: row.code,
      },
    });
  } catch (err) {
    console.error('qr public error:', err);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

function calcAge(birthDate) {
  const now = new Date();
  const born = new Date(birthDate);
  let years = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) years--;
  if (years > 0) return `${years} año${years !== 1 ? 's' : ''}`;
  const months = (now.getMonth() - born.getMonth() + 12) % 12 || 12;
  return `${months} mes${months !== 1 ? 'es' : ''}`;
}

router.post('/public/:shareToken/scan', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    const petResult = await pool.query(
      `SELECT mp.name as pet_name, mp.user_id, u.display_name as owner_name, u.email as owner_email
       FROM qr_identifiers qi
       JOIN my_pets mp ON mp.id = qi.my_pet_id
       JOIN users u ON u.id = mp.user_id
       WHERE qi.share_token = $1`,
      [req.params.shareToken]
    );
    if (petResult.rows.length === 0) return res.status(404).json({ error: 'QR no encontrado' });

    const row = petResult.rows[0];

    await pool.query(
      `INSERT INTO qr_scans (share_token, latitude, longitude, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.shareToken, latitude || null, longitude || null, req.ip, req.headers['user-agent'] || null]
    );

    sendPushToUser(row.user_id, {
      title: `📍 Escanearon el QR de ${row.pet_name}`,
      body: latitude && longitude
        ? `Alguien vio el perfil de ${row.pet_name} cerca de ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
        : `Alguien vio el perfil digital de ${row.pet_name}`,
      tag: `qr-scan-${req.params.shareToken}`,
    }).catch(() => {});

    if (row.owner_email) {
      try {
        const { default: nodemailer } = await import('nodemailer');
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'l0061596.ferozo.com',
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: false,
          tls: { rejectUnauthorized: false },
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        await transporter.sendMail({
          from: `"Sigo Tu Huella" <${process.env.SMTP_USER}>`,
          to: row.owner_email,
          subject: `📍 Escanearon el QR de ${row.pet_name}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;">
            <h2 style="color:#5A5A40;">Escaneo de QR detectado</h2>
            <p style="font-size:16px;">Alguien escaneó el código QR de <strong>${row.pet_name}</strong> y vio su perfil digital.</p>
            ${latitude && longitude ? `<p><strong>Ubicación aproximada:</strong><br/><a href="https://www.google.com/maps?q=${latitude},${longitude}" style="color:#5A5A40;font-weight:bold;">📍 Ver en Google Maps</a></p>` : ''}
            <p style="color:#94a3b8;font-size:12px;margin-top:20px;">Sigo Tu Huella — Identificación Digital</p>
          </div>`,
        });
      } catch (emailErr) {
        console.error('Scan alert email error:', emailErr);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('qr scan error:', err);
    res.status(500).json({ error: 'Error al registrar escaneo' });
  }
});

router.post('/public/:shareToken/found', async (req, res) => {
  try {
    const { finder_name, finder_phone, finder_location, finder_notes } = req.body;
    if (!finder_phone) return res.status(400).json({ error: 'Teléfono de contacto es requerido' });

    const qrResult = await pool.query(
      `SELECT qi.code, mp.name as pet_name, mp.user_id, u.display_name as owner_name, u.email as owner_email, u.phone as owner_phone
       FROM qr_identifiers qi
       JOIN my_pets mp ON mp.id = qi.my_pet_id
       JOIN users u ON u.id = mp.user_id
       WHERE qi.share_token = $1`,
      [req.params.shareToken]
    );
    if (qrResult.rows.length === 0) return res.status(404).json({ error: 'QR no encontrado' });

    const row = qrResult.rows[0];

    sendPushToUser(row.user_id, {
      title: `¡Encontraron a ${row.pet_name}!`,
      body: `${finder_name || 'Alguien'} reportó haberla encontrado. Tel: ${finder_phone}`,
      tag: `pet-found-${row.code}`,
    }).catch(() => {});

    if (row.owner_email) {
      const { sendPasswordResetEmail: _unused, ...rest } = await import('../auth.js');
    }
    try {
      const { default: nodemailer } = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'l0061596.ferozo.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        tls: { rejectUnauthorized: false },
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: `"Sigo Tu Huella" <${process.env.SMTP_USER}>`,
        to: row.owner_email,
        subject: `¡Encontraron a ${row.pet_name}!`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:30px;">
          <h2 style="color:#5A5A40;">¡Encontraron a ${row.pet_name}!</h2>
          <p style="font-size:16px;">Alguien reportó haber encontrado a tu mascota (${row.code}).</p>
          <div style="background:#f5f5f0;border-radius:12px;padding:20px;margin:20px 0;">
            <p><strong>Contacto:</strong> ${finder_name || 'No especificado'}</p>
            <p><strong>Teléfono:</strong> ${finder_phone}</p>
            ${finder_location ? `<p><strong>Ubicación:</strong> ${finder_location}</p>` : ''}
            ${finder_notes ? `<p><strong>Notas:</strong> ${finder_notes}</p>` : ''}
          </div>
          <p style="color:#94a3b8;font-size:12px;">Sigo Tu Huella — Identificación Digital</p>
        </div>`,
      });
    } catch (emailErr) {
      console.error('Found pet email error:', emailErr);
    }

    res.json({ success: true, message: 'Se notificó al dueño exitosamente' });
  } catch (err) {
    console.error('qr found error:', err);
    res.status(500).json({ error: 'Error al reportar mascota encontrada' });
  }
});

router.get('/assigned', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT qi.code, qi.share_token, qi.assigned_at, mp.id as pet_id, mp.name as pet_name, mp.species, mp.breed,
              u.display_name as owner_name, u.email as owner_email, u.phone as owner_phone
       FROM qr_identifiers qi
       JOIN my_pets mp ON mp.id = qi.my_pet_id
       JOIN users u ON u.id = mp.user_id
       WHERE qi.my_pet_id IS NOT NULL
       ORDER BY qi.assigned_at DESC`
    );
    res.json({ assigned: result.rows });
  } catch (err) {
    console.error('qr assigned error:', err);
    res.status(500).json({ error: 'Error al obtener QRs asignados' });
  }
});

router.delete('/cleanup', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM qr_identifiers WHERE my_pet_id IS NULL');
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    console.error('qr cleanup error:', err);
    res.status(500).json({ error: 'Error al limpiar QRs' });
  }
});

router.post('/reactivate', requireAdmin, async (req, res) => {
  try {
    let { share_token, code } = req.body;
    if (!share_token) return res.status(400).json({ error: 'share_token requerido' });

    // Extract UUID from URL if full URL was pasted
    const urlMatch = share_token.match(/\/mascota\/([a-f0-9-]+)/i);
    if (urlMatch) share_token = urlMatch[1];

    // Validate UUID format
    const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (!uuidRegex.test(share_token)) return res.status(400).json({ error: 'Token no válido' });

    // Check if already exists
    const existing = await pool.query(
      'SELECT qi.code, qi.my_pet_id, mp.name as pet_name FROM qr_identifiers qi LEFT JOIN my_pets mp ON mp.id = qi.my_pet_id WHERE qi.share_token = $1',
      [share_token]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return res.json({
        success: true,
        reactivated: false,
        already_active: true,
        code: row.code,
        share_token,
        assigned: !!row.my_pet_id,
        pet_name: row.pet_name || null,
        url: `/mascota/${share_token}`,
      });
    }

    // If code provided, validate it's not already taken
    if (code) {
      const codeExists = await pool.query(
        'SELECT id FROM qr_identifiers WHERE code = $1',
        [code]
      );
      if (codeExists.rows.length > 0) {
        return res.status(400).json({ error: `El código ${code} ya está en uso` });
      }
    } else {
      // Generate new code
      [code] = await getNextCodes(1);
    }

    const batchId = `reactivated-${Date.now()}`;

    const insertResult = await pool.query(
      `INSERT INTO qr_identifiers (code, share_token, batch_id, my_pet_id) VALUES ($1, $2, $3, NULL) RETURNING id, code, share_token`,
      [code, share_token, batchId]
    );

    res.json({
      success: true,
      reactivated: true,
      already_active: false,
      code: insertResult.rows[0].code,
      share_token: insertResult.rows[0].share_token,
      assigned: false,
      pet_name: null,
      url: `/mascota/${share_token}`,
    });
  } catch (err) {
    console.error('qr reactivate error:', err);
    res.status(500).json({ error: 'Error al reactivar QR' });
  }
});

// Constants (tag size is always 37mm)
const TAG_SIZE_MM = 37;
const GAP_MM = 1;
const TAG_SIZE_PX = Math.round(TAG_SIZE_MM * 300 / 25.4); // ~437px

function calculateLayout(pageW_MM, pageH_MM) {
  const pairW = TAG_SIZE_MM * 2 + GAP_MM;
  const pairsPerRow = Math.floor((pageW_MM + GAP_MM) / (pairW + GAP_MM));
  const rowsPerPage = Math.floor((pageH_MM + GAP_MM) / (TAG_SIZE_MM + GAP_MM));
  if (pairsPerRow < 1 || rowsPerPage < 1) {
    throw new Error(`Página muy chica: no entra ni un par (${pageW_MM}×${pageH_MM}mm)`);
  }
  const cols = pairsPerRow * 2;
  const usedW = cols * TAG_SIZE_MM + (cols - 1) * GAP_MM;
  const usedH = rowsPerPage * TAG_SIZE_MM + (rowsPerPage - 1) * GAP_MM;
  const MM_TO_PT = 72 / 25.4;
  return {
    MM_TO_PT,
    PAGE_W_PT: pageW_MM * MM_TO_PT,
    PAGE_H_PT: pageH_MM * MM_TO_PT,
    TAG_SIZE_PT: TAG_SIZE_MM * MM_TO_PT,
    GAP_PT: GAP_MM * MM_TO_PT,
    PAIRS_PER_ROW: pairsPerRow,
    ROWS_PER_PAGE: rowsPerPage,
    COLS: cols,
    MARGIN_X_MM: (pageW_MM - usedW) / 2,
    MARGIN_Y_MM: (pageH_MM - usedH) / 2,
    PER_PAGE: pairsPerRow * rowsPerPage,
    pairsPerRow,
    rowsPerPage,
    totalPerPage: pairsPerRow * rowsPerPage,
  };
}

async function getLayout(pageWq, pageHq) {
  let pageW = 570, pageH = 300;
  if (pageWq && pageHq) {
    pageW = parseFloat(pageWq);
    pageH = parseFloat(pageHq);
  } else {
    try {
      const res = await pool.query(
        "SELECT key, value FROM settings WHERE key IN ('pdf_page_width','pdf_page_height')"
      );
      res.rows.forEach(r => {
        if (r.key === 'pdf_page_width') pageW = parseFloat(r.value) || 570;
        if (r.key === 'pdf_page_height') pageH = parseFloat(r.value) || 300;
      });
    } catch {}
  }
  return calculateLayout(pageW, pageH);
}

router.get('/last-code', requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query('SELECT code FROM qr_identifiers ORDER BY code DESC LIMIT 1');
    res.json({ code: result.rows.length > 0 ? result.rows[0].code : null });
  } catch (err) {
    console.error('qr last-code error:', err);
    res.status(500).json({ error: 'Error al obtener último código' });
  }
});

router.get('/layout', requireAdmin, async (req, res) => {
  try {
    const layout = await getLayout(req.query.page_w, req.query.page_h);
    res.json(layout);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function drawArcTextSvg(text, cx, cy, r, startDeg, endDeg, fontSize, color) {
  const sr = (startDeg * Math.PI) / 180;
  const er = (endDeg * Math.PI) / 180;
  let span = er - sr;
  if (span < 0) span += 2 * Math.PI;
  const arcLen = r * span * 0.85;
  let fs = fontSize;
  if (text.length * fs * 0.6 > arcLen) {
    fs = Math.round(fontSize * arcLen / (text.length * fs * 0.6));
  }
  const arcUsed = span * 0.85;
  const arcStart = sr + (span - arcUsed) / 2;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ratio = (i + 0.5) / text.length;
    const a = arcStart + ratio * arcUsed;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    const rot = Math.atan2(r * Math.cos(a), -r * Math.sin(a)) * 180 / Math.PI;
    out += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" transform="rotate(${rot.toFixed(1)},${x.toFixed(1)},${y.toFixed(1)})" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="${fs}" font-weight="bold" fill="${color}">${text[i]}</text>\n`;
  }
  return out;
}

let logoPngPromise = null;

async function processLogoPng() {
  const imgPath = join(__dirname, '..', '..', 'public', 'sigotuhuella.jpg');
  const img = readFileSync(imgPath);
  const logoSize = Math.round(TAG_SIZE_PX * 0.55);

  const { data, info } = await sharp(img)
    .resize(logoSize, logoSize)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const total = width * height;
  const TH = 248;

  // Step 1: alpha mask (non-white = contour, pure white = transparent)
  const mask = Buffer.alloc(total, 0);
  for (let i = 0; i < total; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    if (r <= TH || g <= TH || b <= TH) mask[i] = 255;
  }

  // Step 2: 2-pass 8-neighbor dilation to fill gaps inside contour
  for (let iter = 0; iter < 2; iter++) {
    const prev = Buffer.from(mask);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (prev[i] !== 0) continue;
        let opaque = false;
        for (let dy = -1; dy <= 1 && !opaque; dy++)
          for (let dx = -1; dx <= 1 && !opaque; dx++)
            if (dy !== 0 || dx !== 0) opaque = prev[(y + dy) * width + (x + dx)] === 255;
        if (opaque) mask[i] = 255;
      }
    }
  }

  // Step 3: white fill RGBA (white pixels + mask as alpha)
  const whiteFill = Buffer.alloc(total * 4);
  for (let i = 0; i < total; i++) {
    whiteFill[i * 4] = 255;
    whiteFill[i * 4 + 1] = 255;
    whiteFill[i * 4 + 2] = 255;
    whiteFill[i * 4 + 3] = mask[i];
  }

  // Step 4: original RGBA (original colors + mask as alpha)
  const origAlpha = Buffer.alloc(total * 4);
  for (let i = 0; i < total; i++) {
    origAlpha[i * 4] = data[i * 3];
    origAlpha[i * 4 + 1] = data[i * 3 + 1];
    origAlpha[i * 4 + 2] = data[i * 3 + 2];
    origAlpha[i * 4 + 3] = mask[i];
  }

  const rawOpts = { raw: { width, height, channels: 4 } };
  const whitePng = await sharp(whiteFill, rawOpts).png().toBuffer();
  const origPng = await sharp(origAlpha, rawOpts).png().toBuffer();

  return sharp(whitePng).composite([{ input: origPng, top: 0, left: 0 }]).png().toBuffer();
}

async function generateLogoPng() {
  if (!logoPngPromise) {
    logoPngPromise = (async () => {
      const processedLogo = await processLogoPng();
      const logoB64 = processedLogo.toString('base64');
      const cx = TAG_SIZE_PX / 2;
      const arcR = Math.round(TAG_SIZE_PX * 0.38);
      const arcSize = Math.round(TAG_SIZE_PX * 0.065);
      const logoSize = Math.round(TAG_SIZE_PX * 0.55);
      const logoX = Math.round((TAG_SIZE_PX - logoSize) / 2);
      const logoY = Math.round(cx - logoSize / 2 + TAG_SIZE_PX * 0.03);
      const bottomSize = Math.round(TAG_SIZE_PX * 0.06);
      const bottomY = Math.round(TAG_SIZE_PX * 0.92);

      const svg = `<svg width="${TAG_SIZE_PX}" height="${TAG_SIZE_PX}" xmlns="http://www.w3.org/2000/svg">
${drawArcTextSvg('SI ME VES PERDIDO', cx, cx, arcR, 200, 340, arcSize, '#5A5A40')}
<image href="data:image/png;base64,${logoB64}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}"/>
<text x="${cx}" y="${bottomY}" text-anchor="middle" font-family="sans-serif" font-size="${bottomSize}" font-weight="bold" fill="#5A5A40">ESCANEÁ EL QR</text>
</svg>`;
      return sharp(Buffer.from(svg)).png().toBuffer();
    })();
  }
  return logoPngPromise;
}

async function generateQrPng(code, shareToken) {
  const qrSvg = await QRCode.toString(`${FRONTEND_URL}/mascota/${shareToken}`, {
    type: 'svg',
    margin: 1,
    color: { dark: '#5A5A40', light: '#ffffff' },
  });
  const cx = TAG_SIZE_PX / 2;
  const qrSize = Math.round(TAG_SIZE_PX * 0.82);
  const qrX = Math.round((TAG_SIZE_PX - qrSize) / 2);
  const qrY = Math.round(TAG_SIZE_PX * 0.04);
  const fontSize = Math.round(TAG_SIZE_PX * 0.06);
  const textY = Math.round(TAG_SIZE_PX * 0.94);

  const vb = qrSvg.match(/viewBox="([^"]*)"/);
  const vbStr = (vb && vb[1]) || '0 0 33 33';
  const parts = vbStr.split(' ').map(Number);
  const scaleX = qrSize / parts[2];
  const scaleY = qrSize / parts[3];
  const inner = qrSvg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '');

  const svg = `<svg width="${TAG_SIZE_PX}" height="${TAG_SIZE_PX}" xmlns="http://www.w3.org/2000/svg">
<g transform="translate(${qrX}, ${qrY}) scale(${scaleX}, ${scaleY})">
${inner}
</g>
<text x="${cx}" y="${textY}" text-anchor="middle" font-family="monospace" font-size="${fontSize}" font-weight="bold" fill="#5A5A40">${code}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

router.get('/batch/:batchId/pdf', requireAdmin, async (req, res) => {
  try {
    const { page_w, page_h, from, to } = req.query;
    const layout = await getLayout(page_w, page_h);

    let query = 'SELECT code, share_token FROM qr_identifiers WHERE batch_id = $1';
    const params = [req.params.batchId];
    let idx = 2;
    if (from) { query += ` AND code >= $${idx++}`; params.push(from.toUpperCase()); }
    if (to) { query += ` AND code <= $${idx++}`; params.push(to.toUpperCase()); }
    query += ' ORDER BY code ASC';

    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No hay QRs en el rango seleccionado' });

    const identifiers = result.rows;
    const { MM_TO_PT, PAGE_W_PT, PAGE_H_PT, TAG_SIZE_PT, PAIRS_PER_ROW, ROWS_PER_PAGE, PER_PAGE, MARGIN_X_MM, MARGIN_Y_MM } = layout;

    const doc = new PDFDocument({ size: [PAGE_W_PT, PAGE_H_PT], margin: 0 });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="qr-${req.params.batchId}.pdf"`);
    doc.pipe(res);

    for (let pageStart = 0; pageStart < identifiers.length; pageStart += PER_PAGE) {
      if (pageStart > 0) doc.addPage();

      const pageIds = identifiers.slice(pageStart, pageStart + PER_PAGE);

      const pngs = await Promise.all(pageIds.flatMap(ident => [
        generateQrPng(ident.code, ident.share_token),
        generateLogoPng(),
      ]));

      for (let i = 0; i < pageIds.length; i++) {
        const row = Math.floor(i / PAIRS_PER_ROW);
        const col = i % PAIRS_PER_ROW;
        const qrCell = col * 2;
        const xMm = MARGIN_X_MM + qrCell * (TAG_SIZE_MM + GAP_MM);
        const yMm = MARGIN_Y_MM + row * (TAG_SIZE_MM + GAP_MM);

        doc.image(pngs[i * 2], xMm * MM_TO_PT, yMm * MM_TO_PT, { width: TAG_SIZE_PT });
        doc.image(pngs[i * 2 + 1], (xMm + (TAG_SIZE_MM + GAP_MM)) * MM_TO_PT, yMm * MM_TO_PT, { width: TAG_SIZE_PT });
      }
    }

    doc.end();
  } catch (err) {
    console.error('qr pdf error:', err);
    res.status(500).json({ error: `Error al generar PDF: ${err.message}` });
  }
});

export default router;
