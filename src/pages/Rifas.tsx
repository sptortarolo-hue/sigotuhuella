import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { Ticket, Trophy, Calendar, Users, Loader2, ArrowRight } from 'lucide-react';

interface Prize {
  position: number;
  title: string;
  description: string | null;
  amount: number | null;
}

interface Raffle {
  id: string;
  title: string;
  description: string | null;
  total_numbers: number;
  price_per_number: number;
  status: string;
  draw_date: string | null;
  created_at: string;
  prizes: Prize[];
  sold_count: number;
}

export default function Rifas() {
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.raffles.list().then(data => setRaffles(data.raffles)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-3">
          Rifas y Sorteos
        </h1>
        <p className="text-gray-500 text-base sm:text-lg max-w-xl mx-auto">
          Comprá números y ayudá a recaudar fondos para nuestra causa. ¡Cada número cuenta!
        </p>
      </div>

      {raffles.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Ticket className="w-16 h-16 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-bold">No hay rifas activas en este momento</p>
          <p className="text-sm mt-2">Volvé pronto para conocer nuevas oportunidades</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {raffles.map(raffle => {
          const soldPercent = Math.round(((raffle.sold_count || 0) / raffle.total_numbers) * 100);
          return (
            <Link
              key={raffle.id}
              to={`/rifas/${raffle.id}`}
              className="group bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 hover:shadow-lg transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-serif font-bold text-brand-primary group-hover:text-brand-secondary transition-colors">
                  {raffle.title}
                </h2>
                <span className="shrink-0 text-[10px] px-2 py-1 rounded-full font-bold bg-green-100 text-green-700">
                  Activa
                </span>
              </div>

              {raffle.description && (
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{raffle.description}</p>
              )}

              {raffle.prizes?.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  {raffle.prizes.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Trophy className="w-4 h-4 text-brand-secondary shrink-0" />
                      <span className="font-bold text-gray-700">{p.title}</span>
                      {p.amount && <span className="text-gray-400">${p.amount.toLocaleString('es-AR')}</span>}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                <span className="flex items-center gap-1">
                  <Ticket className="w-3.5 h-3.5" />
                  ${raffle.price_per_number.toLocaleString('es-AR')} / número
                </span>
                {raffle.draw_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(raffle.draw_date).toLocaleDateString('es-AR')}
                  </span>
                )}
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{raffle.sold_count || 0} / {raffle.total_numbers} vendidos</span>
                  <span>{soldPercent}%</span>
                </div>
                <div className="w-full bg-brand-accent/50 rounded-full h-2">
                  <div className="bg-brand-secondary rounded-full h-2 transition-all" style={{ width: `${soldPercent}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm group-hover:opacity-90 transition-opacity">
                Comprar números
                <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
