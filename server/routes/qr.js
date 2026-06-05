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

router.get('/public/:shareToken', async (req, res) => {
  try {
    const qrResult = await pool.query(
      `SELECT qi.*, mp.id as pet_id, mp.name, mp.species, mp.breed, mp.color,
              mp.bio, mp.personality_tags, mp.is_vaccinated, mp.is_sterilized, mp.is_dewormed,
              u.display_name as owner_name
       FROM qr_identifiers qi
       JOIN my_pets mp ON mp.id = qi.my_pet_id
       JOIN users u ON u.id = mp.user_id
       WHERE qi.share_token = $1`,
      [req.params.shareToken]
    );
    if (qrResult.rows.length === 0) {
      return res.json({ found: false });
    }

    const row = qrResult.rows[0];
    const photosResult = await pool.query(
      'SELECT id, caption, taken_at FROM my_pet_photos WHERE my_pet_id = $1 ORDER BY COALESCE(taken_at, created_at) DESC',
      [row.pet_id]
    );

    res.json({
      found: true,
      pet: {
        id: row.pet_id,
        name: row.name,
        species: row.species,
        breed: row.breed,
        color: row.color,
        bio: row.bio,
        personality_tags: row.personality_tags,
        is_vaccinated: row.is_vaccinated,
        is_sterilized: row.is_sterilized,
        is_dewormed: row.is_dewormed,
        owner_name: row.owner_name,
        photos: photosResult.rows,
        code: row.code,
      },
    });
  } catch (err) {
    console.error('qr public error:', err);
    res.status(500).json({ error: 'Error al obtener perfil' });
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

function drawArcText(doc, text, cx, cy, radius, startDeg, endDeg, color, reverse) {
  const startRad = startDeg * Math.PI / 180;
  const endRad = endDeg * Math.PI / 180;
  let span = endRad - startRad;
  if (span < 0) span += 2 * Math.PI;
  const arcLen = radius * span * 0.85;
  let fs = 14;
  doc.fontSize(fs).font('Helvetica-Bold');
  let tw = doc.widthOfString(text);
  if (tw > arcLen) { fs *= arcLen / tw; doc.fontSize(fs).font('Helvetica-Bold'); }
  const step = span / (text.length + 1);
  for (let i = 0; i < text.length; i++) {
    const a = startRad + step * (i + 0.5);
    const x = cx + radius * Math.cos(a);
    const y = cy + radius * Math.sin(a);
    const rot = (Math.atan2(radius * Math.cos(a), -radius * Math.sin(a)) * 180 / Math.PI) + (reverse ? 180 : 0);
    const cw = doc.fontSize(fs).widthOfString(text[i]);
    doc.save();
    doc.translate(x, y);
    doc.rotate(rot);
    doc.fontSize(fs).fillColor(color).text(text[i], -cw / 2, 0);
    doc.restore();
  }
}

router.delete('/cleanup', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM qr_identifiers WHERE my_pet_id IS NULL');
    res.json({ success: true, deleted: result.rowCount });
  } catch (err) {
    console.error('qr cleanup error:', err);
    res.status(500).json({ error: 'Error al limpiar QRs' });
  }
});

router.get('/batch/:batchId/pdf', requireAdmin, async (req, res) => {
  try {
    const mirror = req.query.mirror === '1';
    const result = await pool.query(
      'SELECT code, share_token FROM qr_identifiers WHERE batch_id = $1 ORDER BY code ASC',
      [req.params.batchId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Batch no encontrado' });

    const identifiers = result.rows;
    const PER_PAGE = 10;
    const MARGIN_X = 35;
    const MARGIN_Y = 45;
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const CIRCLE_R = 55;
    const CIRCLE_D = CIRCLE_R * 2;
    const QR_SIZE = Math.round(CIRCLE_D * 0.70);
    const QR_Y_OFFSET = -8;
    const COLORS = { olive: '#5A5A40', terracotta: '#D48C70' };
    const COL_W = (PAGE_W - MARGIN_X * 2) / 2;
    const ROW_H = (PAGE_H - MARGIN_Y - 25) / 5;
    const logoPng = readFileSync(join(__dirname, '..', '..', 'public', 'qr-logo.png'));

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="qr-${req.params.batchId}${mirror ? '-sublimar' : ''}.pdf"`);
    doc.pipe(res);

    for (let page = 0; page < identifiers.length; page += PER_PAGE) {
      if (page > 0) doc.addPage();

      if (mirror) { doc.save(); doc.translate(PAGE_W, 0).scale(-1, 1); }

      doc.fontSize(11).fillColor('#5A5A40')
        .text('Sigo Tu Huella — Identificación Digital', MARGIN_X, 18, { width: PAGE_W - MARGIN_X * 2, align: 'center' });

      for (let i = 0; i < PER_PAGE && (page + i) < identifiers.length; i++) {
        const row = Math.floor(i / 2);
        const isLeft = i % 2 === 0;
        const cx = isLeft ? MARGIN_X + COL_W / 2 : MARGIN_X + COL_W + COL_W / 2;
        const cy = MARGIN_Y + row * ROW_H + ROW_H / 2;
        const ident = identifiers[page + i];

        if (isLeft) {
          const qrDataUrl = await QRCode.toDataURL(`${FRONTEND_URL}/mascota/${ident.share_token}`, {
            width: QR_SIZE,
            margin: 0,
            color: { dark: '#5A5A40', light: '#ffffff' },
          });
          const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

          doc.circle(cx, cy + QR_Y_OFFSET, CIRCLE_R).fill('#ffffff');
          doc.image(qrBuffer, cx - QR_SIZE / 2, cy + QR_Y_OFFSET - QR_SIZE / 2, { width: QR_SIZE });
          doc.circle(cx, cy + QR_Y_OFFSET, CIRCLE_R).lineWidth(1.5).strokeColor('#5A5A40').stroke();
          doc.fontSize(8).fillColor('#5A5A40')
            .text(ident.code, cx - CIRCLE_R, cy + QR_Y_OFFSET + CIRCLE_R - 14, { width: CIRCLE_R * 2, align: 'center' });
        } else {
          doc.circle(cx, cy, CIRCLE_R).fill('#ffffff');
          doc.image(logoPng, cx - CIRCLE_R, cy - CIRCLE_R, { width: CIRCLE_R * 2 });
          doc.circle(cx, cy, CIRCLE_R).lineWidth(1.5).strokeColor('#5A5A40').stroke();
          drawArcText(doc, 'SI ME VES PERDIDO', cx, cy, 41, 190, 350, COLORS.olive, false);
        }
      }

      if (mirror) doc.restore();
    }

    doc.end();
  } catch (err) {
    console.error('qr pdf error:', err);
    res.status(500).json({ error: 'Error al generar PDF' });
  }
});

export default router;
