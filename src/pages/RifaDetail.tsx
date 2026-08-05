import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/hooks/useAuth';
import { cn } from '@/src/lib/utils';
import {
  Loader2, ArrowLeft, Trophy, Calendar, Ticket, Check, ShoppingCart, X, AlertCircle,
  Users, Shield, Share2, Clock, Copy, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { shareRaffleOnWhatsApp } from '@/src/lib/whatsappShare';

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
  tickets: { number: number; status: string; buyer_name: string }[];
  stats: { sold: number; reservedMp: number; pendingTransfer: number; pendingManual: number; available: number };
}

function useCountdown(targetDate: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!targetDate) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    expired: false,
  };
}

export default function RifaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [raffle, setRaffle] = useState<Raffle | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [reserveResult, setReserveResult] = useState<{ tickets: { number: number }[]; account: { bank_name: string; alias: string; cbu: string; cvu: string } } | null>(null);

  const [form, setForm] = useState({ name: '', phone: '' });

  useEffect(() => {
    if (!id) return;
    api.raffles.get(id).then(data => setRaffle(data.raffle)).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (user) {
      setForm(f => ({
        ...f,
        name: f.name || user.display_name || '',
        phone: f.phone || user.phone || '',
      }));
    }
  }, [user]);

  const countdown = useCountdown(raffle?.draw_date || null);

  const soldNumbers = useMemo(() => new Set(
    (raffle?.tickets || []).filter(t => t.status === 'paid').map(t => t.number)
  ), [raffle?.tickets]);

  const reservedNumbers = useMemo(() => new Set(
    (raffle?.tickets || []).filter(t => t.status !== 'paid' && t.status !== 'cancelled').map(t => t.number)
  ), [raffle?.tickets]);

  const ticketMap = useMemo(() => new Map(
    (raffle?.tickets || []).map(t => [t.number, t])
  ), [raffle?.tickets]);

  function toggleNumber(num: number) {
    if (soldNumbers.has(num) || reservedNumbers.has(num)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
    setShowGrid(true);
  }

  function selectRow(start: number) {
    if (!raffle) return;
    const nums: number[] = [];
    for (let i = start; i <= Math.min(start + 9, raffle.total_numbers); i++) {
      if (!soldNumbers.has(i) && !reservedNumbers.has(i)) nums.push(i);
    }
    const allSelected = nums.every(n => selected.has(n));
    setSelected(prev => {
      const next = new Set(prev);
      nums.forEach(n => allSelected ? next.delete(n) : next.add(n));
      return next;
    });
  }

  const total = selected.size * (raffle?.price_per_number || 0);

  async function handleReserve() {
    if (!raffle || selected.size === 0) return;
    if (!form.name || !form.phone) {
      setCheckoutError('Nombre y WhatsApp son obligatorios');
      return;
    }
    try {
      setCheckoutLoading(true);
      setCheckoutError('');
      const data = await api.raffles.reserve(raffle.id, {
        numbers: Array.from(selected).sort((a, b) => a - b),
        name: form.name,
        phone: form.phone,
        paymentMethod: 'transfer',
      });
      setReserveResult({ tickets: data.tickets, account: data.account });
    } catch (err: any) {
      setCheckoutError(err.message || 'Error al procesar la reserva');
      setCheckoutLoading(false);
      setConfirming(false);
    }
  }

  function handlePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!raffle || selected.size === 0) return;
    if (!form.name || !form.phone) {
      setCheckoutError('Nombre y WhatsApp son obligatorios');
      return;
    }
    setConfirming(true);
    setCheckoutError('');
  }

  function handleShare(platform: 'whatsapp' | 'instagram' | 'copy') {
    const url = window.location.href;
    const text = `¡Participá de la rifa "${raffle?.title}"! Cada número ayuda a rescatar mascotas. ${url}`;
    if (platform === 'whatsapp') {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    } else if (platform === 'instagram') {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function scrollToGrid() {
    document.getElementById('raffle-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setShowGrid(true);
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (!raffle) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500 font-bold">Rifa no encontrada</p>
        <Link to="/rifas" className="text-brand-primary font-bold hover:underline">Volver a rifas</Link>
      </div>
    );
  }

  const soldPercent = Math.round((raffle.stats.sold / raffle.total_numbers) * 100);
  const totalParticipantes = raffle.stats.sold + raffle.stats.reservedMp + raffle.stats.pendingTransfer + raffle.stats.pendingManual;

  if (reserveResult) {
    const reservedNumbers = reserveResult.tickets.map(t => t.number).sort((a, b) => a - b);
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-3xl border border-brand-accent p-6 sm:p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-serif font-bold text-brand-primary mb-2">¡Números reservados!</h1>
            <p className="text-sm text-gray-500 mb-6">Te enviamos un WhatsApp con toda la información</p>

            <div className="bg-brand-bg rounded-2xl p-4 mb-4 text-left">
              <div className="text-xs font-bold text-gray-500 uppercase mb-2">Números</div>
              <div className="flex flex-wrap gap-1.5">
                {reservedNumbers.map(n => (
                  <span key={n} className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-sm font-bold">{n}</span>
                ))}
              </div>
            </div>

            <div className="bg-brand-bg rounded-2xl p-4 mb-4 text-left">
              <div className="text-xs font-bold text-gray-500 uppercase mb-2">Importe a transferir</div>
              <div className="text-2xl font-bold text-brand-primary">${total.toLocaleString('es-AR')}</div>
            </div>

            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200/50 text-left mb-6">
              <div className="text-xs font-bold text-amber-700 uppercase mb-2">🏦 Datos para transferir</div>
              <div className="space-y-1.5 text-sm">
                <div className="font-bold text-gray-800">{reserveResult.account.bank_name}</div>
                {reserveResult.account.alias && (
                  <div><span className="text-gray-500">Alias:</span> <span className="font-bold text-gray-800">{reserveResult.account.alias}</span></div>
                )}
                {reserveResult.account.cbu && (
                  <div><span className="text-gray-500">CBU:</span> <span className="font-bold text-gray-800">{reserveResult.account.cbu}</span></div>
                )}
                {reserveResult.account.cvu && (
                  <div><span className="text-gray-500">CVU:</span> <span className="font-bold text-gray-800">{reserveResult.account.cvu}</span></div>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-400 mb-6">
              📱 Enviá el comprobante de la transferencia por WhatsApp
            </p>

            <Link to="/rifas"
              className="block w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all text-center">
              Volver a rifas
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* ─── HERO ─── */}
      <section className="relative bg-gradient-to-br from-amber-50 via-orange-50 to-brand-bg overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-16 relative">
          <Link to="/rifas" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver a rifas
          </Link>

          <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-12">
            {/* Left: Info */}
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 bg-amber-100/80 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
                <Ticket className="w-3.5 h-3.5" />
                Rifa Activa
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-brand-primary mb-3 leading-tight">
                {raffle.title}
              </h1>

              {raffle.description && (
                <p className="text-gray-600 text-base sm:text-lg mb-6 max-w-xl">{raffle.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6">
                <div className="bg-white/80 backdrop-blur-sm border border-amber-200/50 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-amber-600" />
                  <div>
                    <div className="text-xs text-gray-500">Precio</div>
                    <div className="font-bold text-brand-primary">${raffle.price_per_number.toLocaleString('es-AR')}<span className="text-xs font-normal text-gray-500"> /número</span></div>
                  </div>
                </div>
                {raffle.draw_date ? (
                  <div className="bg-white/80 backdrop-blur-sm border border-amber-200/50 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-amber-600" />
                    <div>
                      <div className="text-xs text-gray-500">Sorteo</div>
                      <div className="font-bold text-brand-primary">{new Date(raffle.draw_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/80 backdrop-blur-sm border border-green-200/50 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-green-600" />
                    <div>
                      <div className="text-xs text-gray-500">Sorteo</div>
                      <div className="font-bold text-green-700 text-sm">Se sorteará cuando se vendan todos los números</div>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={scrollToGrid}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:scale-[1.02] transition-all"
              >
                Elegí tus números
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* Right: Countdown */}
            {countdown && !countdown.expired && (
              <div className="lg:w-72 shrink-0">
                <div className="bg-white/90 backdrop-blur-sm border border-amber-200/50 rounded-3xl p-5 sm:p-6 text-center">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Falta para el sorteo</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { value: countdown.days, label: 'Días' },
                      { value: countdown.hours, label: 'Hrs' },
                      { value: countdown.minutes, label: 'Min' },
                      { value: countdown.seconds, label: 'Seg' },
                    ].map(({ value, label }) => (
                      <div key={label} className="bg-gradient-to-b from-amber-50 to-orange-50 rounded-xl p-2 sm:p-3">
                        <div className="text-2xl sm:text-3xl font-bold text-amber-700 tabular-nums">{String(value).padStart(2, '0')}</div>
                        <div className="text-[10px] sm:text-xs text-amber-600 font-medium">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Impact message */}
          <div className="mt-6 sm:mt-8 bg-white/60 backdrop-blur-sm border border-amber-200/30 rounded-2xl px-4 py-3 inline-flex items-center gap-2 text-sm text-amber-700 font-medium">
            <span className="text-base">🐾</span>
            Todo lo recaudado va en ayuda de mascotas rescatadas
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* ─── TRUST + SHARE ─── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Shield className="w-4 h-4 text-green-600" />
            <span>Pago por transferencia bancaria</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => raffle && shareRaffleOnWhatsApp(raffle.id, raffle.title)} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-colors">
              📱 Compartir por WhatsApp
            </button>
            <button onClick={() => handleShare('copy')} className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors" title="Copiar link">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* ─── PREMIOS ─── */}
        {raffle.prizes?.length > 0 && (
          <div className="mb-6 sm:mb-8">
            <h2 className="text-lg sm:text-xl font-bold text-brand-primary mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Premios
            </h2>
            <div className={cn(
              "grid gap-3 sm:gap-4",
              raffle.prizes.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
            )}>
              {raffle.prizes.map((p, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={cn(
                    "relative overflow-hidden rounded-2xl border p-4 sm:p-5",
                    i === 0
                      ? "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200/50"
                      : "bg-white border-brand-accent"
                  )}
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className={cn(
                      "w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0",
                      i === 0
                        ? "bg-gradient-to-br from-amber-400 to-orange-400 text-white"
                        : "bg-amber-100 text-amber-600"
                    )}>
                      <Trophy className="w-6 h-6 sm:w-7 sm:h-7" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">
                        {i === 0 ? '🏆 Primer Premio' : `Premio #${p.position}`}
                      </div>
                      <h3 className="font-bold text-brand-primary text-base sm:text-lg leading-snug">{p.title}</h3>
                      {p.description && <p className="text-sm text-gray-500 mt-1">{p.description}</p>}
                    </div>
                    {p.amount && (
                      <div className="text-right shrink-0">
                        <div className="text-lg sm:text-xl font-bold text-brand-primary">${p.amount.toLocaleString('es-AR')}</div>
                        <div className="text-[10px] text-gray-400 uppercase">valor</div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ─── PROGRESO ─── */}
        <div className="bg-white rounded-3xl border border-brand-accent p-5 sm:p-6 mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Users className="w-4 h-4 text-amber-600" />
              {totalParticipantes} persona{totalParticipantes !== 1 ? 's' : ''} ya participó{totalParticipantes !== 1 ? 'ron' : ''}
            </div>
            <span className="text-sm font-bold text-amber-600">{soldPercent}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 sm:h-4 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${soldPercent}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="bg-gradient-to-r from-amber-400 to-orange-400 h-full rounded-full"
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>{raffle.stats.sold} vendidos</span>
            <span>{raffle.stats.available} disponibles de {raffle.total_numbers}</span>
          </div>
        </div>

        {/* ─── CÓMO FUNCIONA ─── */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-lg sm:text-xl font-bold text-brand-primary mb-4">¿Cómo funciona?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {[
              { icon: Ticket, title: 'Elegí tus números', desc: 'Seleccioná los números que quieras del grid', color: 'amber' },
              { icon: Shield, title: 'Pagá por transferencia', desc: 'Transferí a la cuenta que te mostramos', color: 'green' },
              { icon: Trophy, title: 'Esperá el sorteo', desc: 'El día del sorteo se sortean los premios', color: 'orange' },
            ].map(({ icon: Icon, title, desc, color }, i) => (
              <div key={i} className="bg-white rounded-2xl border border-brand-accent p-4 sm:p-5 text-center">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3",
                  color === 'amber' && "bg-amber-100 text-amber-600",
                  color === 'green' && "bg-green-100 text-green-600",
                  color === 'orange' && "bg-orange-100 text-orange-600",
                )}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="font-bold text-brand-primary text-sm mb-1">{title}</div>
                <div className="text-xs text-gray-500">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── GRID DE NÚMEROS ─── */}
        <div id="raffle-grid" className="bg-white rounded-3xl border border-brand-accent p-5 sm:p-6 mb-6 sm:mb-8 scroll-mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-bold text-brand-primary">Elegí tus números</h2>
            {selected.size > 0 && (
              <span className="text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                {selected.size} seleccionado{selected.size > 1 ? 's' : ''} · ${total.toLocaleString('es-AR')}
              </span>
            )}
          </div>

          {/* Row selectors for 10s */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4">
            {Array.from({ length: Math.ceil(raffle.total_numbers / 10) }, (_, row) => {
              const start = row * 10 + 1;
              const end = Math.min(start + 9, raffle.total_numbers);
              const numsInRow = Array.from({ length: end - start + 1 }, (_, i) => start + i);
              const allSold = numsInRow.every(n => soldNumbers.has(n) || reservedNumbers.has(n));
              const allSelected = numsInRow.every(n => selected.has(n));
              return (
                <button
                  key={row}
                  onClick={() => selectRow(start)}
                  disabled={allSold}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-bold transition-all border",
                    allSold && "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed",
                    !allSold && allSelected && "bg-amber-500 text-white border-amber-500",
                    !allSold && !allSelected && "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
                  )}
                >
                  {start}–{end}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 sm:gap-2 mb-4">
            {Array.from({ length: raffle.total_numbers }, (_, i) => i + 1).map(num => {
              const isSold = soldNumbers.has(num);
              const isReserved = reservedNumbers.has(num);
              const isSelected = selected.has(num);
              const ticket = ticketMap.get(num);

              return (
                <motion.button
                  key={num}
                  whileTap={!isSold && !isReserved ? { scale: 0.9 } : undefined}
                  onClick={() => toggleNumber(num)}
                  disabled={isSold || isReserved}
                  title={ticket?.buyer_name ? `${ticket.buyer_name} · ${ticket.status === 'paid' ? 'Pagado' : 'Reservado'}` : undefined}
                  className={cn(
                    'aspect-square rounded-xl flex flex-col items-center justify-center text-xs sm:text-sm font-bold transition-all duration-200 relative',
                    isSold && 'bg-green-100 text-green-700 cursor-not-allowed border border-green-300',
                    isReserved && 'bg-orange-100 text-orange-700 cursor-not-allowed border border-orange-300',
                    isSelected && 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-200 scale-105 ring-2 ring-amber-300',
                    !isSold && !isReserved && !isSelected && 'bg-brand-bg hover:bg-amber-50 text-gray-700 hover:text-amber-700 cursor-pointer border border-transparent hover:border-amber-200',
                  )}
                >
                  <span>{num}</span>
                  {ticket?.buyer_name && <span className="text-[8px] sm:text-[10px] leading-none opacity-70">{ticket.buyer_name.charAt(0).toUpperCase()}</span>}
                </motion.button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 sm:gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-lg bg-brand-bg border border-brand-accent" /> Disponible
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500" /> Seleccionado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-lg bg-green-100 border border-green-300" /> Vendido
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-lg bg-orange-100 border border-orange-300" /> Reservado
            </span>
          </div>
        </div>

        {/* ─── CHECKOUT ─── */}
        <AnimatePresence>
          {selected.size > 0 && !confirming && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-3xl border border-brand-accent p-5 sm:p-6 mb-20 sm:mb-8"
            >
              <h2 className="text-lg sm:text-xl font-bold text-brand-primary mb-4 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" /> Completá tus datos
              </h2>

              <form onSubmit={handlePurchase} className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Nombre *</label>
                  <input type="text" required value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 mt-1 transition-all"
                    placeholder="Tu nombre" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Número de WhatsApp *</label>
                  <input type="tel" required value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 mt-1 transition-all"
                    placeholder="11-1234-5678" />
                </div>

                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200/50">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{selected.size} número{selected.size > 1 ? 's' : ''} × ${raffle.price_per_number.toLocaleString('es-AR')}</span>
                    <span className="font-bold text-brand-primary text-lg">${total.toLocaleString('es-AR')}</span>
                  </div>
                  <p className="text-xs text-gray-500">Pago por transferencia bancaria</p>
                </div>

                {checkoutError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {checkoutError}
                  </div>
                )}

                <button type="submit" disabled={checkoutLoading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100 transition-all">
                  Reservar ${total.toLocaleString('es-AR')}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── CONFIRMACIÓN ─── */}
        <AnimatePresence>
          {confirming && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-3xl border border-brand-accent p-5 sm:p-6 mb-20 sm:mb-8"
            >
              <h2 className="text-lg sm:text-xl font-bold text-brand-primary mb-4 flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" /> Resumen de tu reserva
              </h2>

              <div className="space-y-4">
                <div className="bg-brand-bg rounded-2xl p-4">
                  <div className="text-xs font-bold text-gray-500 uppercase mb-2">Números seleccionados</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(selected).sort((a, b) => a - b).map(n => (
                      <span key={n} className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-sm font-bold">{n}</span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-brand-bg rounded-2xl p-4">
                    <div className="text-xs font-bold text-gray-500 uppercase mb-1">Nombre</div>
                    <div className="font-bold text-brand-primary">{form.name}</div>
                  </div>
                  <div className="bg-brand-bg rounded-2xl p-4">
                    <div className="text-xs font-bold text-gray-500 uppercase mb-1">WhatsApp</div>
                    <div className="font-bold text-brand-primary">{form.phone}</div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-4 border border-amber-200/50">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{selected.size} número{selected.size > 1 ? 's' : ''} × ${raffle.price_per_number.toLocaleString('es-AR')}</span>
                    <span className="font-bold text-brand-primary text-lg">${total.toLocaleString('es-AR')}</span>
                  </div>
                  <p className="text-xs text-gray-500">Pago por transferencia bancaria</p>
                </div>

                {checkoutError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {checkoutError}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={() => setConfirming(false)} disabled={checkoutLoading}
                    className="flex-1 px-4 py-3 border border-brand-accent rounded-xl font-bold text-sm hover:bg-brand-accent/20 transition-all">
                    Modificar
                  </button>
                  <button onClick={handleReserve} disabled={checkoutLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-sm hover:shadow-lg hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100 transition-all">
                    {checkoutLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Reservando...</>
                    ) : (
                      <>Confirmar ${total.toLocaleString('es-AR')}</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── MOBILE FLOATING CTA ─── */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 sm:hidden z-50 p-4 bg-white/95 backdrop-blur-sm border-t border-amber-200/50 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500">{selected.size} número{selected.size > 1 ? 's' : ''}</div>
                <div className="font-bold text-brand-primary">${total.toLocaleString('es-AR')}</div>
              </div>
              <button
                onClick={() => document.getElementById('raffle-grid')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-sm shrink-0"
              >
                Continuar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
