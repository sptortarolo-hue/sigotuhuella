import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { reserveTickets, confirmPayment, cancelExpiredReservations, confirmManualPayment, rejectManualPayment } from '../services/mpService.js';
import { enqueue } from '../services/phoneRelayService.js';

const router = Router();

function formatPhone(phone) {
  return phone.replace(/[^0-9]/g, '');
}

// Public: list active raffles
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*,
        (SELECT COUNT(*) FROM raffle_tickets t WHERE t.raffle_id = r.id AND t.status = 'paid') AS sold_count,
        (SELECT COUNT(*) FROM raffle_prizes p WHERE p.raffle_id = r.id) AS prize_count
       FROM raffles r
       WHERE r.status IN ('active', 'paused')
       ORDER BY r.created_at DESC`
    );
    const raffles = result.rows;
    for (const r of raffles) {
      const prizes = await pool.query(
        'SELECT * FROM raffle_prizes WHERE raffle_id = $1 ORDER BY position',
        [r.id]
      );
      r.prizes = prizes.rows;
    }
    res.json({ raffles });
  } catch (err) {
    console.error('GET /raffles error:', err);
    res.status(500).json({ error: 'Error al listar rifas' });
  }
});

// Public: get raffle detail + grid
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const raffleRes = await pool.query('SELECT * FROM raffles WHERE id = $1', [id]);
    if (raffleRes.rows.length === 0) return res.status(404).json({ error: 'Rifa no encontrada' });
    const raffle = raffleRes.rows[0];

    const prizes = await pool.query(
      'SELECT * FROM raffle_prizes WHERE raffle_id = $1 ORDER BY position',
      [id]
    );
    raffle.prizes = prizes.rows;

    const tickets = await pool.query(
      `SELECT t.id, t.number, t.status, t.buyer_name, t.buyer_phone, t.payment_method, t.payment_status, t.mp_external_reference,
              r.id AS receipt_id, r.status AS receipt_status, r.image_data AS receipt_image_data, r.image_mime AS receipt_image_mime
       FROM raffle_tickets t
       LEFT JOIN LATERAL (
         SELECT id, status, image_data, image_mime FROM raffle_receipts
         WHERE ticket_group_id = t.mp_external_reference AND raffle_id = $1
         ORDER BY created_at DESC LIMIT 1
       ) r ON true
       WHERE t.raffle_id = $1 AND t.status NOT IN ('cancelled')
       ORDER BY t.number`,
      [id]
    );
    raffle.tickets = tickets.rows;

    const stats = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'paid') AS sold,
        COUNT(*) FILTER (WHERE status = 'reserved') AS reserved_mp,
        COUNT(*) FILTER (WHERE status = 'pending_transfer') AS pending_transfer,
        COUNT(*) FILTER (WHERE status = 'pending_manual') AS pending_manual,
        COUNT(*) AS total
       FROM raffle_tickets WHERE raffle_id = $1`,
      [id]
    );
    raffle.stats = {
      sold: parseInt(stats.rows[0].sold),
      reservedMp: parseInt(stats.rows[0].reserved_mp),
      pendingTransfer: parseInt(stats.rows[0].pending_transfer),
      pendingManual: parseInt(stats.rows[0].pending_manual),
      available: raffle.total_numbers - parseInt(stats.rows[0].total),
    };

    const receipts = await pool.query(
      `SELECT r.*,
              COALESCE(
                (SELECT array_agg(rt2.number ORDER BY rt2.number)
                 FROM raffle_tickets rt2
                 WHERE rt2.mp_external_reference = r.ticket_group_id AND rt2.status NOT IN ('cancelled')),
                '{}'
              ) AS ticket_numbers
       FROM raffle_receipts r
       WHERE r.raffle_id = $1
       ORDER BY r.created_at DESC`,
      [id]
    );
    raffle.receipts = receipts.rows;

    res.json({ raffle });
  } catch (err) {
    console.error('GET /raffles/:id error:', err);
    res.status(500).json({ error: 'Error al obtener rifa' });
  }
});

// Admin: create raffle
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { title, description, modality, total_numbers, price_per_number, draw_date, prizes } = req.body;
    if (!title || !total_numbers || !price_per_number) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: título, cantidad de números, precio' });
    }
    if (!prizes || prizes.length === 0) {
      return res.status(400).json({ error: 'Debe agregar al menos un premio' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const raffleRes = await client.query(
        `INSERT INTO raffles (title, description, modality, total_numbers, price_per_number, draw_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [title, description || null, modality || 'raffle', total_numbers, price_per_number, draw_date || null]
      );
      const raffle = raffleRes.rows[0];
      for (const prize of prizes) {
        await client.query(
          `INSERT INTO raffle_prizes (raffle_id, position, title, description, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [raffle.id, prize.position, prize.title, prize.description || null, prize.amount || null]
        );
      }
      await client.query('COMMIT');
      res.json({ raffle });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('POST /raffles error:', err);
    res.status(500).json({ error: 'Error al crear rifa' });
  }
});

// Admin: update raffle
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, modality, total_numbers, price_per_number, draw_date, status, prizes } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fields = [];
      const values = [];
      let idx = 1;
      if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
      if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
      if (modality !== undefined) { fields.push(`modality = $${idx++}`); values.push(modality); }
      if (total_numbers !== undefined) { fields.push(`total_numbers = $${idx++}`); values.push(total_numbers); }
      if (price_per_number !== undefined) { fields.push(`price_per_number = $${idx++}`); values.push(price_per_number); }
      if (draw_date !== undefined) { fields.push(`draw_date = $${idx++}`); values.push(draw_date); }
      if (status !== undefined) { fields.push(`status = $${idx++}`); values.push(status); }
      if (fields.length > 0) {
        fields.push(`updated_at = NOW()`);
        values.push(id);
        await client.query(`UPDATE raffles SET ${fields.join(', ')} WHERE id = $${idx}`, values);
      }
      if (prizes) {
        await client.query('DELETE FROM raffle_prizes WHERE raffle_id = $1', [id]);
        for (const prize of prizes) {
          await client.query(
            `INSERT INTO raffle_prizes (raffle_id, position, title, description, amount)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, prize.position, prize.title, prize.description || null, prize.amount || null]
          );
        }
      }
      await client.query('COMMIT');
      const raffleRes = await client.query('SELECT * FROM raffles WHERE id = $1', [id]);
      const prizesRes = await client.query('SELECT * FROM raffle_prizes WHERE raffle_id = $1 ORDER BY position', [id]);
      res.json({ raffle: { ...raffleRes.rows[0], prizes: prizesRes.rows } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('PUT /raffles/:id error:', err);
    res.status(500).json({ error: 'Error al actualizar rifa' });
  }
});

// Admin: delete raffle
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM raffle_tickets WHERE raffle_id = $1', [req.params.id]);
    await pool.query('DELETE FROM raffle_receipts WHERE raffle_id = $1', [req.params.id]);
    await pool.query('DELETE FROM raffle_prizes WHERE raffle_id = $1', [req.params.id]);
    await pool.query('DELETE FROM raffle_payments WHERE raffle_id = $1', [req.params.id]);
    await pool.query('DELETE FROM raffles WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /raffles/:id error:', err);
    res.status(500).json({ error: 'Error al eliminar rifa' });
  }
});

// Public: reserve numbers with payment method selection
router.post('/:id/reserve', async (req, res) => {
  try {
    let { numbers, count, name, phone, paymentMethod } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Nombre y WhatsApp son obligatorios' });
    }
    if (!['mp', 'transfer', 'manual'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Método de pago inválido' });
    }

    // If count is provided (admin manual), auto-select available numbers
    if ((!numbers || !Array.isArray(numbers) || numbers.length === 0) && count) {
      const availRes = await pool.query(
        `SELECT number FROM raffle_tickets
         WHERE raffle_id = $1 AND status NOT IN ('cancelled')
         ORDER BY number`,
        [req.params.id]
      );
      const taken = new Set(availRes.rows.map(r => r.number));
      const allNumbers = [];
      const raffleRes = await pool.query('SELECT total_numbers FROM raffles WHERE id = $1', [req.params.id]);
      const total = raffleRes.rows[0]?.total_numbers || 0;
      for (let n = 1; n <= total && allNumbers.length < count; n++) {
        if (!taken.has(n)) allNumbers.push(n);
      }
      if (allNumbers.length < count) {
        return res.status(400).json({ error: `Solo hay ${allNumbers.length} números disponibles de ${count} solicitados` });
      }
      numbers = allNumbers;
    }

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'Seleccioná al menos un número' });
    }

    const result = await reserveTickets(req.params.id, numbers, { name, phone }, paymentMethod);

    if (paymentMethod === 'transfer') {
      const accountRes = await pool.query('SELECT * FROM collaboration_accounts ORDER BY display_order ASC LIMIT 1');
      const account = accountRes.rows[0] || null;

      if (account) {
        const raffleRes = await pool.query('SELECT title FROM raffles WHERE id = $1', [req.params.id]);
        const raffleTitle = raffleRes.rows[0]?.title || 'Rifa';
        const nums = numbers.sort((a, b) => a - b).join(', ');
        const total = numbers.length * parseFloat((await pool.query('SELECT price_per_number FROM raffles WHERE id = $1', [req.params.id])).rows[0]?.price_per_number || 0);

        const waMsg = `Hola ${name}, reservaste los números ${nums} de la rifa "${raffleTitle}".\n\nImporte: $${total.toLocaleString('es-AR')}\n\n🏦 Transferí a:\n${account.bank_name}\nAlias: ${account.alias || '-'}\nCBU: ${account.cbu || '-'}${account.cvu ? '\nCVU: ' + account.cvu : ''}\n\nEnviá el comprobante de la transferencia por este chat.`;

        try {
          await enqueue(phone, waMsg, null);
        } catch (e) {
          console.error('Error sending WA raffle message:', e.message);
        }
      }

      res.json({ ...result, account });
    } else {
      res.json(result);
    }
  } catch (err) {
    console.error('POST /raffles/:id/reserve error:', err);
    res.status(400).json({ error: err.message || 'Error al reservar números' });
  }
});

// Public: check ticket status after payment
router.get('/:id/ticket-status/:ticketGroupId', async (req, res) => {
  try {
    const { id, ticketGroupId } = req.params;
    const tickets = await pool.query(
      `SELECT id, number, status, buyer_name, buyer_phone, payment_method, payment_status, paid_at
       FROM raffle_tickets
       WHERE raffle_id = $1 AND mp_external_reference = $2
       ORDER BY number`,
      [id, ticketGroupId]
    );
    if (tickets.rows.length === 0) {
      return res.status(404).json({ error: 'Tickets no encontrados' });
    }
    const allPaid = tickets.rows.every(t => t.status === 'paid');
    const anyCancelled = tickets.rows.some(t => t.status === 'cancelled');
    res.json({
      tickets: tickets.rows,
      status: allPaid ? 'paid' : anyCancelled ? 'cancelled' : 'pending',
    });
  } catch (err) {
    console.error('GET ticket-status error:', err);
    res.status(500).json({ error: 'Error al verificar estado' });
  }
});

// Admin: upload manual receipt for a raffle
router.post('/:id/receipt', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { ticketGroupId, buyerName, buyerPhone, imageData, imageMime, amountExpected } = req.body;
    if (!ticketGroupId || !buyerName || !buyerPhone || !imageData) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const raffleRes = await pool.query('SELECT * FROM raffles WHERE id = $1', [id]);
    if (raffleRes.rows.length === 0) return res.status(404).json({ error: 'Rifa no encontrada' });
    const raffle = raffleRes.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const receiptRes = await client.query(
        `INSERT INTO raffle_receipts (raffle_id, ticket_group_id, image_data, image_mime, buyer_name, buyer_phone, amount_expected, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         RETURNING *`,
        [id, ticketGroupId, imageData, imageMime, buyerName, buyerPhone, amountExpected]
      );

      const receipt = receiptRes.rows[0];

      await client.query('COMMIT');
      res.json({ receipt });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('POST /raffles/:id/receipt error:', err);
    res.status(500).json({ error: 'Error al subir comprobante' });
  }
});

// Admin: confirm manual payment from receipt
router.post('/:id/receipt/:receiptId/confirm', requireAdmin, async (req, res) => {
  try {
    const { id, receiptId } = req.params;
    const { adminNote } = req.body;
    const result = await confirmManualPayment(receiptId, adminNote || '');
    if (!result) return res.status(404).json({ error: 'Comprobante no encontrado' });
    res.json(result);
  } catch (err) {
    console.error('POST /raffles/:id/receipt/:receiptId/confirm error:', err);
    res.status(500).json({ error: 'Error al confirmar pago' });
  }
});

// Admin: reject manual payment from receipt
router.post('/:id/receipt/:receiptId/reject', requireAdmin, async (req, res) => {
  try {
    const { id, receiptId } = req.params;
    const { adminNote } = req.body;
    const result = await rejectManualPayment(receiptId, adminNote || '');
    if (!result) return res.status(404).json({ error: 'Comprobante no encontrado' });
    res.json(result);
  } catch (err) {
    console.error('POST /raffles/:id/receipt/:receiptId/reject error:', err);
    res.status(500).json({ error: 'Error al rechazar comprobante' });
  }
});

// MP Webhook
router.post('/webhook', async (req, res) => {
  try {
    if (req.body.type === 'payment') {
      const paymentId = req.body.data?.id;
      if (paymentId) {
        setTimeout(async () => {
          try { await confirmPayment(String(paymentId)); }
          catch (err) { console.error('Webhook confirm error:', err.message); }
        }, 0);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(200);
  }
});

// Admin: draw winners
router.post('/:id/draw', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const raffleRes = await pool.query('SELECT * FROM raffles WHERE id = $1', [id]);
    if (raffleRes.rows.length === 0) return res.status(404).json({ error: 'Rifa no encontrada' });
    const raffle = raffleRes.rows[0];

    const paidTickets = await pool.query(
      `SELECT * FROM raffle_tickets
       WHERE raffle_id = $1 AND status = 'paid'
       ORDER BY RANDOM()`,
      [id]
    );
    if (paidTickets.rows.length === 0) {
      return res.status(400).json({ error: 'No hay tickets pagados para sortear' });
    }

    const prizes = await pool.query(
      'SELECT * FROM raffle_prizes WHERE raffle_id = $1 ORDER BY position',
      [id]
    );

    const winners = [];
    const usedTickets = new Set();
    for (const prize of prizes.rows) {
      const available = paidTickets.rows.filter(t => !usedTickets.has(t.id));
      if (available.length === 0) break;
      const winner = available[0];
      usedTickets.add(winner.id);
      winners.push({
        prize: prize.title,
        prizeDescription: prize.description,
        prizeAmount: prize.amount,
        ticketNumber: winner.number,
        buyerName: winner.buyer_name,
        buyerPhone: winner.buyer_phone,
        ticketId: winner.id,
      });
    }

    await pool.query(
      `UPDATE raffles SET status = 'drawn', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    res.json({ winners, totalPaidTickets: paidTickets.rows.length });
  } catch (err) {
    console.error('POST /raffles/:id/draw error:', err);
    res.status(500).json({ error: 'Error al sortear' });
  }
});

// Admin: cleanup expired reservations
router.post('/cleanup', requireAdmin, async (_req, res) => {
  try {
    const cancelled = await cancelExpiredReservations();
    res.json({ cancelled });
  } catch (err) {
    console.error('POST /raffles/cleanup error:', err);
    res.status(500).json({ error: 'Error al limpiar reservas' });
  }
});

// Admin: get unmatched raffle receipts (no raffle_id)
router.get('/unmatched-receipts', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM raffle_receipts WHERE raffle_id IS NULL ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ receipts: result.rows });
  } catch (err) {
    console.error('GET /raffles/unmatched-receipts error:', err);
    res.status(500).json({ error: 'Error al obtener recibos sin asignar' });
  }
});

// Admin: assign unmatched receipt to a raffle
router.post('/receipts/:id/assign', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { raffleId, ticketGroupId, buyerName, buyerPhone, amountExpected } = req.body;
    if (!raffleId) return res.status(400).json({ error: 'raffleId requerido' });

    // If no ticketGroupId, create a pending_transfer reservation automatically
    let finalTgId = ticketGroupId;
    if (!finalTgId) {
      const receipt = (await pool.query('SELECT * FROM raffle_receipts WHERE id = $1', [id])).rows[0];
      if (!receipt) return res.status(404).json({ error: 'Recibo no encontrado' });

      const name = buyerName || receipt.push_name || receipt.buyer_name || 'Desconocido';
      const phone = buyerPhone || receipt.lid_jid || receipt.buyer_phone || '';
      const raffle = (await pool.query('SELECT * FROM raffles WHERE id = $1', [raffleId])).rows[0];
      if (!raffle) return res.status(404).json({ error: 'Rifa no encontrada' });

      // Find next available number via ON CONFLICT loop (race-condition safe)
      finalTgId = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let inserted = false;
      for (let n = 1; n <= raffle.total_numbers; n++) {
        const res = await pool.query(
          `INSERT INTO raffle_tickets (raffle_id, number, buyer_name, buyer_phone, mp_external_reference, status, payment_method, payment_status)
           VALUES ($1, $2, $3, $4, $5, 'pending_transfer', 'transfer', 'pending_transfer')
           ON CONFLICT (raffle_id, number) DO NOTHING
           RETURNING id`,
          [raffleId, n, name, phone, finalTgId]
        );
        if (res.rows.length > 0) { inserted = true; break; }
      }
      if (!inserted) return res.status(400).json({ error: 'No hay números disponibles' });
    }

    await pool.query(
      `UPDATE raffle_receipts SET raffle_id = $1, ticket_group_id = $2, buyer_name = COALESCE($3, buyer_name), buyer_phone = COALESCE($4, buyer_phone), amount_expected = $5 WHERE id = $6`,
      [raffleId, finalTgId, buyerName || null, buyerPhone || null, amountExpected || null, id]
    );
    res.json({ success: true, ticketGroupId: finalTgId });
  } catch (err) {
    console.error('POST /raffles/receipts/:id/assign error:', err);
    res.status(500).json({ error: 'Error al asignar recibo' });
  }
});

// Admin: release tickets (cancel + free numbers) by ticket group
router.post('/tickets/release', requireAdmin, async (req, res) => {
  try {
    const { ticketGroupId } = req.body;
    if (!ticketGroupId) return res.status(400).json({ error: 'ticketGroupId requerido' });

    const result = await pool.query(
      `UPDATE raffle_tickets SET status = 'cancelled', payment_status = 'cancelled'
       WHERE mp_external_reference = $1 AND status IN ('pending_transfer', 'pending_manual')
       RETURNING id, number, raffle_id`,
      [ticketGroupId]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'No se encontraron tickets pendientes para liberar' });

    // Also cancel any pending receipts for this group
    await pool.query(
      `UPDATE raffle_receipts SET status = 'cancelled'
       WHERE ticket_group_id = $1 AND status = 'pending'`,
      [ticketGroupId]
    );

    res.json({ success: true, released: result.rows.length, tickets: result.rows });
  } catch (err) {
    console.error('POST /raffles/tickets/release error:', err);
    res.status(500).json({ error: 'Error al liberar números' });
  }
});

// Admin: resend bank details for a pending receipt
router.post('/:id/receipt/:receiptId/resend-bank', requireAdmin, async (req, res) => {
  try {
    const { id, receiptId } = req.params;
    const receipt = (await pool.query('SELECT * FROM raffle_receipts WHERE id = $1 AND raffle_id = $2', [receiptId, id])).rows[0];
    if (!receipt) return res.status(404).json({ error: 'Comprobante no encontrado' });

    const tgId = receipt.ticket_group_id;
    if (!tgId) return res.status(400).json({ error: 'Este recibo no tiene ticket group asignado' });

    const tickets = await pool.query(
      `SELECT buyer_phone, buyer_name, number FROM raffle_tickets
       WHERE mp_external_reference = $1 AND status IN ('pending_transfer', 'pending_manual')`,
      [tgId]
    );
    if (tickets.rows.length === 0) return res.status(404).json({ error: 'No hay tickets pendientes para este grupo' });

    const t = tickets.rows[0];
    const nums = tickets.rows.map(r => r.number).sort((a, b) => a - b).join(', ');
    const raffle = (await pool.query('SELECT title, price_per_number FROM raffles WHERE id = $1', [id])).rows[0];
    if (!raffle) return res.status(404).json({ error: 'Rifa no encontrada' });

    const account = (await pool.query('SELECT * FROM collaboration_accounts ORDER BY display_order ASC LIMIT 1')).rows[0];
    if (!account) return res.status(400).json({ error: 'No hay cuentas bancarias configuradas' });

    const total = tickets.rows.length * parseFloat(raffle.price_per_number);
    const waMsg = `Hola ${t.buyer_name}, recordatorio de tu reserva de los números ${nums} de la rifa "${raffle.title}".\n\nImporte: $${total.toLocaleString('es-AR')}\n\n🏦 Transferí a:\n${account.bank_name}\nAlias: ${account.alias || '-'}\nCBU: ${account.cbu || '-'}${account.cvu ? '\nCVU: ' + account.cvu : ''}\n\nEnviá el comprobante de la transferencia por este chat.`;

    const msgId = await enqueue(t.buyer_phone, waMsg, null);
    res.json({ success: true, messageId: msgId, buyerPhone: t.buyer_phone });
  } catch (err) {
    console.error('POST /raffles/:id/receipt/:receiptId/resend-bank error:', err);
    res.status(500).json({ error: 'Error al reenviar datos bancarios' });
  }
});

export default router;
