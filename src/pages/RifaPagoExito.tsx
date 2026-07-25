import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { Check, X, Loader2, Ticket, ArrowLeft } from 'lucide-react';

export default function RifaPagoExito() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'paid' | 'pending' | 'error'>('loading');
  const [tickets, setTickets] = useState<{ number: number; status: string; buyer_name: string }[]>([]);
  const [raffleId, setRaffleId] = useState<string | null>(null);

  useEffect(() => {
    const ticketGroupId = searchParams.get('payment_id') || searchParams.get('external_reference');
    const rid = searchParams.get('raffle_id');

    if (!ticketGroupId) {
      setStatus('error');
      return;
    }

    if (rid) setRaffleId(rid);

    const pollStatus = async () => {
      for (let i = 0; i < 10; i++) {
        try {
          if (!rid) break;
          const data = await api.raffles.ticketStatus(rid, ticketGroupId);
          if (data.status === 'paid') {
            setTickets(data.tickets);
            setStatus('paid');
            return;
          }
          if (data.status === 'cancelled') {
            setTickets(data.tickets);
            setStatus('error');
            return;
          }
        } catch { }
        await new Promise(r => setTimeout(r, 2000));
      }
      setStatus('pending');
    };

    pollStatus();
  }, [searchParams]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-8 sm:p-12 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-brand-primary mx-auto mb-4" />
            <h1 className="text-xl font-serif font-bold text-brand-primary mb-2">Verificando pago...</h1>
            <p className="text-sm text-gray-500">Estamos confirmando tu compra con Mercado Pago</p>
          </>
        )}

        {status === 'paid' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-xl font-serif font-bold text-brand-primary mb-2">¡Pago confirmado!</h1>
            <p className="text-sm text-gray-500 mb-6">Tus números fueron asignados correctamente</p>

            {tickets.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-bold uppercase text-gray-400 mb-2">Tus números</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {tickets.map(t => (
                    <div key={t.number} className="w-10 h-10 bg-brand-primary text-white rounded-lg flex items-center justify-center text-sm font-bold">
                      {t.number}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 mb-6">
              Guardá esta página como comprobante. También recibirás un email de confirmación.
            </p>
          </>
        )}

        {status === 'pending' && (
          <>
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-yellow-600" />
            </div>
            <h1 className="text-xl font-serif font-bold text-brand-primary mb-2">Pago pendiente</h1>
            <p className="text-sm text-gray-500 mb-4">
              Tu pago está siendo procesado. Te notificaremos por email cuando se confirme.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-serif font-bold text-brand-primary mb-2">No se pudo confirmar</h1>
            <p className="text-sm text-gray-500 mb-4">
              Si realizaste el pago, contactanos para resolverlo.
            </p>
          </>
        )}

        <div className="flex flex-col gap-2">
          {raffleId && (
            <Link to={`/rifas/${raffleId}`}
              className="flex items-center justify-center gap-2 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90">
              <Ticket className="w-4 h-4" /> Volver a la rifa
            </Link>
          )}
          <Link to="/rifas"
            className="flex items-center justify-center gap-2 py-2.5 border border-brand-accent rounded-xl font-bold text-sm hover:bg-brand-accent/20">
            <ArrowLeft className="w-4 h-4" /> Ver otras rifas
          </Link>
        </div>
      </div>
    </div>
  );
}
