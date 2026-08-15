import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { Ticket, Trophy, Calendar, Users, Loader2, ArrowRight, Clock, PartyPopper, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { Helmet } from 'react-helmet-async';
import { IS_PLAY_BUILD } from '@/src/lib/buildConfig';

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

function getCountdown(targetDate: string | null) {
  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, expired: true };
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    expired: false,
  };
}

export default function Rifas() {
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.raffles.list().then(data => setRaffles(data.raffles)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const activas = useMemo(() => raffles.filter(r => r.status === 'active' || r.status === 'paused'), [raffles]);
  const finalizadas = useMemo(() => raffles.filter(r => r.status === 'drawn').slice(0, 3), [raffles]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
      <Helmet>
        <title>Rifas solidarias - Sigo Tu Huella</title>
        <meta name="description" content="Participá de las rifas solidarias para ayudar a las mascotas de Sicardi y Garibaldi." />
      </Helmet>
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
      {/* Hero header */}
      <div className="text-center mb-10 sm:mb-14">
        <div className="inline-flex items-center gap-2 bg-amber-100/80 text-amber-700 text-xs font-bold px-4 py-2 rounded-full mb-4">
          <Ticket className="w-4 h-4" />
          Rifas y Sorteos
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-3">
          Ayudá comprando un número
        </h1>
        <p className="text-gray-500 text-base sm:text-lg max-w-xl mx-auto">
          Cada número vendido ayuda a rescatar y cuidar mascotas. ¡Elegí el tuyo!
        </p>
        <p className="text-sm text-amber-600 font-medium mt-3">🐾 Todo lo recaudado va en ayuda de mascotas rescatadas</p>
      </div>

      {activas.length === 0 && finalizadas.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <Ticket className="w-10 h-10 text-amber-300" />
          </div>
          <p className="text-lg font-bold text-gray-500">No hay rifas activas en este momento</p>
          <p className="text-sm mt-2">Volvé pronto para conocer nuevas oportunidades</p>
        </div>
      )}

      {/* ─── RIFAS ACTIVAS ─── */}
      <div className={cn(
        "grid gap-6 sm:gap-8",
        activas.length === 1
          ? "grid-cols-1 max-w-xl mx-auto"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      )}>
        {activas.map((raffle, idx) => {
          const soldPercent = Math.round(((raffle.sold_count || 0) / raffle.total_numbers) * 100);
          const remaining = raffle.total_numbers - (raffle.sold_count || 0);
          const countdown = getCountdown(raffle.draw_date);
          const isUrgent = remaining <= raffle.total_numbers * 0.2 && remaining > 0;
          return (
            <motion.div
              key={raffle.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Link
                to={`/rifas/${raffle.id}`}
                className="group block bg-white rounded-3xl border border-brand-accent overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                {/* Card header with gradient */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 px-6 pt-6 pb-4 relative">
                  <div className="flex items-start justify-between mb-3">
                    <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-bold bg-green-100 text-green-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Activa
                    </span>
                    {isUrgent && (
                      <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-bold bg-red-100 text-red-600">
                        ¡Solo {remaining}!
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-serif font-bold text-brand-primary group-hover:text-amber-700 transition-colors leading-snug">
                    {raffle.title}
                  </h2>
                </div>

                <div className="px-6 pb-6">
                  {raffle.description && (
                    <p className="text-sm text-gray-500 mb-4 line-clamp-2 mt-4">{raffle.description}</p>
                  )}

                  {/* Premios */}
                  {raffle.prizes?.length > 0 && (
                    <div className="mb-4">
                      <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-2">Premios</div>
                      <div className="space-y-2">
                        {raffle.prizes.slice(0, 3).map((p, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <div className={cn(
                              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                              i === 0 ? "bg-gradient-to-br from-amber-400 to-orange-400 text-white" : "bg-amber-100 text-amber-600"
                            )}>
                              <Trophy className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="font-bold text-sm text-gray-700 block truncate">{p.title}</span>
                            </div>
                            {p.amount && (
                              <span className="text-xs font-bold text-amber-600 shrink-0">${p.amount.toLocaleString('es-AR')}</span>
                            )}
                          </div>
                        ))}
                        {raffle.prizes.length > 3 && (
                          <div className="text-xs text-gray-400 pl-9">+{raffle.prizes.length - 3} premio{raffle.prizes.length - 3 > 1 ? 's' : ''} más</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Info bar */}
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
                    <span className="flex items-center gap-1 bg-brand-bg rounded-lg px-2 py-1">
                      <Ticket className="w-3.5 h-3.5 text-amber-600" />
                      <strong>${raffle.price_per_number.toLocaleString('es-AR')}</strong>/número
                    </span>
                    {countdown && !countdown.expired && (
                      <span className="flex items-center gap-1 bg-brand-bg rounded-lg px-2 py-1">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        {countdown.days > 0 ? `${countdown.days}d ${countdown.hours}h` : `${countdown.hours}h`}
                      </span>
                    )}
                    {raffle.draw_date ? (
                      <span className="flex items-center gap-1 bg-brand-bg rounded-lg px-2 py-1">
                        <Calendar className="w-3.5 h-3.5 text-amber-600" />
                        {new Date(raffle.draw_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 bg-green-50 rounded-lg px-2 py-1 text-green-700">
                        <Ticket className="w-3.5 h-3.5" /> Sin fecha
                      </span>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {raffle.sold_count || 0} de {raffle.total_numbers} vendidos
                      </span>
                      <span className="font-bold text-amber-600">{soldPercent}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-amber-400 to-orange-400 h-full rounded-full transition-all"
                        style={{ width: `${soldPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-sm group-hover:shadow-lg group-hover:shadow-amber-200 transition-all">
                    {IS_PLAY_BUILD ? 'Ver rifa' : 'Comprar números'}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* ─── RIFAS FINALIZADAS (historial) ─── */}
      {finalizadas.length > 0 && (
        <div className="mt-14 sm:mt-16">
          <div className="border-t border-brand-accent mb-6 sm:mb-8" />
          <div className="flex items-center gap-2 mb-5 sm:mb-6">
            <PartyPopper className="w-5 h-5 text-gray-400" />
            <h2 className="text-xl sm:text-2xl font-bold text-brand-primary">Rifas finalizadas</h2>
          </div>

          <div className="space-y-4 sm:space-y-6 max-w-xl sm:max-w-2xl">
            {finalizadas.map((raffle, idx) => {
              const countdown = getCountdown(raffle.draw_date);
              return (
                <motion.div
                  key={raffle.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <div className="group block bg-white rounded-2xl border border-brand-accent overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                    {/* Card header */}
                    <div className="bg-gradient-to-br from-gray-50 to-amber-50 px-5 pt-5 pb-3 relative">
                      <div className="flex items-start justify-between mb-2">
                        <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-bold bg-gray-100 text-gray-600">
                          Finalizada
                        </span>
                        {countdown && countdown.expired && (
                          <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-bold bg-green-100 text-green-700">
                            🎉 Ya se sorteó
                          </span>
                        )}
                      </div>
                      <h2 className="text-base sm:text-lg font-serif font-bold text-brand-primary leading-snug">
                        {raffle.title}
                      </h2>
                      {raffle.draw_date && (
                        <p className="text-xs text-gray-500 mt-1">
                          Sorteado el {new Date(raffle.draw_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>

                    <div className="px-5 pb-5">
                      {/* Premios */}
                      {raffle.prizes?.length > 0 && (
                        <div className="mt-3 mb-4">
                          <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-2">Premios</div>
                          <div className="space-y-1.5">
                            {raffle.prizes.slice(0, 3).map((p, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <div className={cn(
                                  "w-6 h-6 rounded-md flex items-center justify-center shrink-0",
                                  i === 0 ? "bg-gradient-to-br from-amber-400 to-orange-400 text-white" : "bg-amber-100 text-amber-600"
                                )}>
                                  <Trophy className="w-3 h-3" />
                                </div>
                                <span className="font-bold text-xs text-gray-700 block truncate">{p.title}</span>
                              </div>
                            ))}
                            {raffle.prizes.length > 3 && (
                              <div className="text-xs text-gray-400 pl-8">+{raffle.prizes.length - 3} premio{raffle.prizes.length - 3 > 1 ? 's' : ''} más</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* CTAs */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Link
                          to={`/rifas/${raffle.id}`}
                          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:scale-[1.01] transition-all"
                        >
                          Ver resultados
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                        <a
                          href={`/api/raffles/${raffle.id}/draw-flyer`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-white border border-brand-accent text-gray-700 rounded-xl font-bold text-sm hover:bg-brand-accent/20 transition-all"
                        >
                          <FileText className="w-4 h-4" />
                          Ver flyer
                        </a>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
