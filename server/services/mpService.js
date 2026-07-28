import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import pool from '../db.js';
import { normalizePhone } from './phoneUtils.js';
import { enqueue } from './phoneRelayService.js';

async function notifyRaffleBuyer(phone, text) {
  try {
    const convCheck = await pool.query(
      `SELECT flow FROM whatsapp_conversations
       WHERE wa_from = $1 AND status = 'active'
         AND context->>'raffleId' IS NOT NULL
       ORDER BY last_message_at DESC LIMIT 1`,
      [phone]
    );
    if (convCheck.rows.length > 0) {
      const { sendMessage } = await import('./whatsappService.js');
      await sendMessage(phone, text);
    } else {
      enqueue(phone, text, null).catch(() => {});
    }
  } catch (e) {
    console.error('notifyRaffleBuyer error, fallback to enqueue:', e.message);
    enqueue(phone, text, null).catch(() => {});
  }
}

let mpClient = null;

async function getClient() {
  if (mpClient) return mpClient;
  const res = await pool.query("SELECT value FROM settings WHERE key = 'mp_access_token'");
  const token = res.rows[0]?.value;
  if (!token) throw new Error('Mercado Pago access token no configurado');
  mpClient = new MercadoPagoConfig({ accessToken: token, options: { timeout: 10000 } });
  return mpClient;
}

export async function clearClient() { mpClient = null; }

export async function getBaseUrl() {
  const res = await pool.query("SELECT value FROM settings WHERE key = 'app_base_url'");
  return res.rows[0]?.value || process.env.APP_BASE_URL || 'https://sigotuhuella.com.ar';
}

export async function createRafflePreference({ raffle, tickets, ticketGroupId, buyerEmail }) {
  const client = await getClient();
  const baseUrl = await getBaseUrl();
  const preference = new Preference(client);

  const ticketNumbers = tickets.map(t => t.number).sort((a, b) => a - b);
  const totalAmount = tickets.length * parseFloat(raffle.price_per_number);

  const result = await preference.create({
    body: {
      items: [{
        id: `raffle_${raffle.id}`,
        title: `Rifa "${raffle.title}" - Nros ${ticketNumbers.join(', ')}`,
        quantity: 1,
        unit_price: totalAmount,
        currency_id: 'ARS',
      }],
      external_reference: ticketGroupId,
      back_urls: {
        success: `${baseUrl}/rifas/pago-exitoso`,
        failure: `${baseUrl}/rifas/pago-fallido`,
        pending: `${baseUrl}/rifas/pago-pendiente`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/raffles/webhook`,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    },
  });

  return { preferenceId: result.id, initPoint: result.init_point, sandboxInitPoint: result.sandbox_init_point };
}

export async function getPayment(paymentId) {
  const client = await getClient();
  const payment = new Payment(client);
  return await payment.get({ id: paymentId });
}

export function verifyWebhookSignature({ headers, body }) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true;

  const xSignature = headers['x-signature'] || '';
  const tsMatch = xSignature.match(/ts=(\d+)/);
  const v1Match = xSignature.match(/v1=([a-f0-9]+)/);
  if (!tsMatch || !v1Match) return true;

  return true;
}

export async function reserveTickets(raffleId, numbers, buyerInfo, paymentMethod = 'mp') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const raffleRes = await client.query(
      'SELECT * FROM raffles WHERE id = $1 AND status = $2 FOR UPDATE',
      [raffleId, 'active']
    );
    if (raffleRes.rows.length === 0) throw new Error('Rifa no encontrada o inactiva');
    const raffle = raffleRes.rows[0];

    const reservedRes = await client.query(
      `SELECT COUNT(*) FROM raffle_tickets
       WHERE raffle_id = $1 AND status NOT IN ('cancelled')`,
      [raffleId]
    );
    const totalReserved = parseInt(reservedRes.rows[0].count);
    if (totalReserved + numbers.length > raffle.total_numbers) {
      throw new Error(`Solo quedan ${raffle.total_numbers - totalReserved} números disponibles`);
    }

    const normalizedPhone = normalizePhone(buyerInfo.phone) || buyerInfo.phone;
    const ticketGroupId = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ticketStatus = paymentMethod === 'mp' ? 'reserved'
      : paymentMethod === 'transfer' ? 'pending_transfer'
      : 'pending_manual';

    const tickets = [];
    for (const num of numbers) {
      // First try to revive a cancelled ticket (UPDATE is faster than DELETE+INSERT)
      const updateRes = await client.query(
        `UPDATE raffle_tickets
         SET status = $1, buyer_name = $2, buyer_phone = $3,
             mp_external_reference = $4, payment_method = $5, payment_status = $6,
             paid_at = NULL, mp_payment_id = NULL
         WHERE raffle_id = $7 AND number = $8 AND status = 'cancelled'
         RETURNING id, number`,
        [ticketStatus, buyerInfo.name, normalizedPhone, ticketGroupId, paymentMethod, ticketStatus, raffleId, num]
      );
      if (updateRes.rows.length > 0) {
        tickets.push(updateRes.rows[0]);
      } else {
        // No cancelled ticket, try INSERT fresh
        const insertRes = await client.query(
          `INSERT INTO raffle_tickets
             (raffle_id, number, buyer_name, buyer_phone, mp_external_reference, status, payment_method, payment_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (raffle_id, number) DO NOTHING
           RETURNING id, number`,
          [raffleId, num, buyerInfo.name, normalizedPhone, ticketGroupId, ticketStatus, paymentMethod, ticketStatus]
        );
        if (insertRes.rows.length === 0) {
          throw new Error(`El número ${num} fue tomado por otro comprador. Intente de nuevo.`);
        }
        tickets.push(insertRes.rows[0]);
      }
    }

    await client.query('COMMIT');

    if (paymentMethod === 'mp') {
      const mpResult = await createRafflePreference({ raffle, tickets, ticketGroupId, buyerEmail: buyerInfo.email || `whatsapp-${buyerInfo.phone}@placeholder.com` });
      await client.query(
        `UPDATE raffle_tickets SET mp_payment_id = $1 WHERE mp_external_reference = $2`,
        [mpResult.preferenceId, ticketGroupId]
      );
      client.release();
      return { tickets, ticketGroupId, ...mpResult };
    }

    client.release();
    return { tickets, ticketGroupId, paymentMethod };
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }
}

export async function confirmManualPayment(receiptId, adminNote = '') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const receiptRes = await client.query(
      'SELECT * FROM raffle_receipts WHERE id = $1 FOR UPDATE',
      [receiptId]
    );
    if (receiptRes.rows.length === 0) { await client.query('ROLLBACK'); return null; }
    const receipt = receiptRes.rows[0];

    await client.query(
      `UPDATE raffle_receipts SET status = 'confirmed', admin_note = $1 WHERE id = $2`,
      [adminNote, receiptId]
    );

    const tgId = receipt.ticket_group_id || receipt.ticket_id;
    const ticketsRes = await client.query(
      'SELECT id, buyer_phone, buyer_name FROM raffle_tickets WHERE raffle_id = $1 AND mp_external_reference = $2 AND status IN ($3, $4)',
      [receipt.raffle_id, tgId, 'pending_transfer', 'pending_manual']
    );
    for (const t of ticketsRes.rows) {
      await client.query(
        `UPDATE raffle_tickets SET status = 'paid', payment_status = 'paid', paid_at = NOW() WHERE id = $1`,
        [t.id]
      );
    }

    // Also confirm other pending receipts for the same ticket group
    await client.query(
      `UPDATE raffle_receipts SET status = 'confirmed', admin_note = COALESCE(admin_note, $1)
       WHERE ticket_group_id = $2 AND raffle_id = $3 AND status = 'pending' AND id != $4`,
      [adminNote, tgId, receipt.raffle_id, receiptId]
    );

    await client.query('COMMIT');

    // Notify buyer
    if (ticketsRes.rows.length > 0) {
      const buyerPhone = ticketsRes.rows[0].buyer_phone;
      const buyerName = ticketsRes.rows[0].buyer_name;
      const raffleRes = await pool.query('SELECT title FROM raffles WHERE id = $1', [receipt.raffle_id]);
      const raffleTitle = raffleRes.rows[0]?.title || 'Rifa';
      if (buyerPhone) {
        notifyRaffleBuyer(buyerPhone, `✅ Hola ${buyerName || ''}, tu pago para la rifa "${raffleTitle}" fue CONFIRMADO. ¡Gracias por participar!`);
      }
    }

    return { success: true, raffleId: receipt.raffle_id, ticketsConfirmed: ticketsRes.rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectManualPayment(receiptId, adminNote = '') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const receiptRes = await client.query(
      'SELECT * FROM raffle_receipts WHERE id = $1 FOR UPDATE',
      [receiptId]
    );
    if (receiptRes.rows.length === 0) { await client.query('ROLLBACK'); return null; }
    const receipt = receiptRes.rows[0];

    await client.query(
      `UPDATE raffle_receipts SET status = 'rejected', admin_note = $1 WHERE id = $2`,
      [adminNote, receiptId]
    );

    const tgId = receipt.ticket_group_id || receipt.ticket_id;
    const ticketsRes = await client.query(
      'SELECT buyer_phone, buyer_name FROM raffle_tickets WHERE raffle_id = $1 AND mp_external_reference = $2 AND status IN ($3, $4)',
      [receipt.raffle_id, tgId, 'pending_transfer', 'pending_manual']
    );

    await client.query('COMMIT');

    // Notify buyer — pedir reenvío, NO cancelar tickets
    if (ticketsRes.rows.length > 0) {
      const buyerPhone = ticketsRes.rows[0].buyer_phone;
      const buyerName = ticketsRes.rows[0].buyer_name;
      const raffleRes = await pool.query('SELECT title FROM raffles WHERE id = $1', [receipt.raffle_id]);
      const raffleTitle = raffleRes.rows[0]?.title || 'Rifa';
      if (buyerPhone) {
        notifyRaffleBuyer(buyerPhone, `❌ Hola ${buyerName || ''}, el comprobante para "${raffleTitle}" no pudo verificarse. Motivo: ${adminNote || 'el comprobante no es válido'}. Enviá uno nuevo por este chat.`);
      }
    }

    return { success: true, raffleId: receipt.raffle_id, ticketsPreserved: ticketsRes.rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function confirmPayment(mpPaymentId) {
  const payment = await getPayment(mpPaymentId);
  if (!payment || payment.status !== 'approved') return null;

  const ticketGroupId = payment.external_reference;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ticketRes = await client.query(
      'SELECT * FROM raffle_tickets WHERE mp_external_reference = $1 FOR UPDATE',
      [ticketGroupId]
    );
    if (ticketRes.rows.length === 0) { await client.query('ROLLBACK'); return null; }

    const ticket = ticketRes.rows[0];

    const existingPayment = await client.query(
      'SELECT id FROM raffle_payments WHERE mp_payment_id = $1',
      [String(payment.id)]
    );
    if (existingPayment.rows.length > 0) { await client.query('ROLLBACK'); return { alreadyProcessed: true }; }

    await client.query(
      `UPDATE raffle_tickets SET status = 'paid', mp_payment_id = $1, paid_at = NOW()
       WHERE mp_external_reference = $2`,
      [String(payment.id), ticketGroupId]
    );

    await client.query(
      `INSERT INTO raffle_payments (raffle_id, ticket_id, mp_payment_id, mp_status, amount, payer_email, raw_webhook)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ticket.raffle_id, ticket.id, String(payment.id), payment.status,
       payment.transaction_amount, payment.payer?.email, JSON.stringify(payment)]
    );

    await client.query('COMMIT');
    return { success: true, raffleId: ticket.raffle_id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelExpiredReservations() {
  const result = await pool.query(
    `UPDATE raffle_tickets SET status = 'cancelled'
     WHERE status = 'reserved' AND created_at < NOW() - INTERVAL '30 minutes'
     RETURNING id`
  );
  return result.rowCount;
}
