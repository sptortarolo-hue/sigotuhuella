import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { X, Clock, ArrowLeft, Ticket } from 'lucide-react';

export default function RifaPagoResultado() {
  const [searchParams] = useSearchParams();
  const isPending = searchParams.get('status') === 'pending';
  const raffleId = searchParams.get('raffle_id');

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-8 sm:p-12 max-w-md w-full text-center">
        {isPending ? (
          <>
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
            <h1 className="text-xl font-serif font-bold text-brand-primary mb-2">Pago pendiente</h1>
            <p className="text-sm text-gray-500 mb-6">
              Tu pago está siendo procesado. Te notificaremos por email cuando se confirme.
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-serif font-bold text-brand-primary mb-2">Pago no completado</h1>
            <p className="text-sm text-gray-500 mb-6">
              El pago no se pudo procesar. Podés intentar nuevamente seleccionando otros números.
            </p>
          </>
        )}

        <div className="flex flex-col gap-2">
          {raffleId && (
            <Link to={`/rifas/${raffleId}`}
              className="flex items-center justify-center gap-2 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90">
              <Ticket className="w-4 h-4" /> Intentar nuevamente
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
