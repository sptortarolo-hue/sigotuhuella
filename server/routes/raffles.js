import { Router } from 'express';
import pool from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { reserveTickets, confirmPayment, cancelExpiredReservations, confirmManualPayment, rejectManualPayment } from '../services/mpService.js';

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
      `SELECT number, status, buyer_name, buyer_phone, payment_method, payment_status
       FROM raffle_tickets
       WHERE raffle_id = $1 AND status NOT IN ('cancelled')
       ORDER BY number`,
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
      `SELECT r.*, rt.number AS ticket_number
       FROM raffle_receipts r
       LEFT JOIN raffle_tickets rt ON rt.raffle_id = r.raffle_id AND rt.mp_external_reference = r.ticket_id
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
    const { numbers, name, phone, paymentMethod } = req.body;
    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'Seleccioná al menos un número' });
    }
    if (!name || !phone) {
      return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
    }
    if (!['mp', 'transfer', 'manual'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Método de pago inválido' });
    }

    const result = await reserveTickets(req.params.id, numbers, { name, phone }, paymentMethod);
    res.json(result);
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
        `INSERT INTO raffle_receipts (raffle_id, ticket_id, image_data, image_mime, buyer_name, buyer_phone, amount_expected, status)
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

export default router;
