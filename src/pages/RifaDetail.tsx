import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/hooks/useAuth';
import { cn } from '@/src/lib/utils';
import {
  Loader2, ArrowLeft, Trophy, Calendar, Ticket, Check, ShoppingCart, X, AlertCircle, Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
  prizes: Prize[];
  tickets: { number: number; status: string; buyer_name: string }[];
  stats: { sold: number; reserved: number; available: number };
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

  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  useEffect(() => {
    if (!id) return;
    api.raffles.get(id).then(data => setRaffle(data.raffle)).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (user) {
      setForm(f => ({
        ...f,
        name: f.name || user.displayName || user.name || '',
        email: f.email || user.email || '',
        phone: f.phone || user.phone || '',
      }));
    }
  }, [user]);

  const soldNumbers = new Set(
    (raffle?.tickets || []).filter(t => t.status === 'paid').map(t => t.number)
  );
  const reservedNumbers = new Set(
    (raffle?.tickets || []).filter(t => t.status === 'reserved').map(t => t.number)
  );

  function toggleNumber(num: number) {
    if (soldNumbers.has(num) || reservedNumbers.has(num)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }

  function selectRow(start: number) {
    if (!raffle) return;
    const nums: number[] = [];
    for (let i = start; i < Math.min(start + 10, raffle.total_numbers); i++) {
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

  async function handlePurchase(e: React.FormEvent) {
    e.preventDefault();
    if (!raffle || selected.size === 0) return;
    if (!form.name || !form.email) {
      setCheckoutError('Nombre y email son obligatorios');
      return;
    }

    try {
      setCheckoutLoading(true);
      setCheckoutError('');
      const data = await api.raffles.reserve(raffle.id, {
        numbers: Array.from(selected).sort((a, b) => a - b),
        name: form.name,
        email: form.email,
        phone: form.phone,
      });
      if (data.initPoint) {
        window.location.href = data.initPoint;
      } else if (data.sandboxInitPoint) {
        window.location.href = data.sandboxInitPoint;
      }
    } catch (err: any) {
      setCheckoutError(err.message || 'Error al procesar la compra');
      setCheckoutLoading(false);
    }
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <Link to="/rifas" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary mb-6">
        <ArrowLeft className="w-4 h-4" /> Volver a rifas
      </Link>

      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-brand-primary">{raffle.title}</h1>
            {raffle.description && <p className="text-gray-500 mt-2">{raffle.description}</p>}
          </div>
          <div className="shrink-0 text-sm text-gray-500 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Ticket className="w-4 h-4" /> ${raffle.price_per_number.toLocaleString('es-AR')} / número
            </span>
            {raffle.draw_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" /> {new Date(raffle.draw_date).toLocaleDateString('es-AR')}
              </span>
            )}
          </div>
        </div>

        {raffle.prizes?.length > 0 && (
          <div className="mb-6 space-y-2">
            {raffle.prizes.map((p, i) => (
              <div key={i} className="flex items-center gap-3 bg-brand-bg/50 p-3 rounded-xl">
                <Trophy className="w-5 h-5 text-brand-secondary shrink-0" />
                <div className="flex-1">
                  <span className="font-bold text-sm">{p.title}</span>
                  {p.description && <span className="text-xs text-gray-500 ml-2">{p.description}</span>}
                </div>
                {p.amount && <span className="font-bold text-sm text-brand-primary">${p.amount.toLocaleString('es-AR')}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-500 mb-2">
            <span className="flex items-center gap-1">
              <Users className="w-4 h-4" /> {raffle.stats.sold} vendidos · {raffle.stats.available} disponibles
            </span>
            <span>{soldPercent}%</span>
          </div>
          <div className="w-full bg-brand-accent/50 rounded-full h-3">
            <div className="bg-brand-secondary rounded-full h-3 transition-all" style={{ width: `${soldPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-brand-primary">Elegí tus números</h2>
          {selected.size > 0 && (
            <span className="text-sm font-bold text-brand-secondary">
              {selected.size} seleccionado{selected.size > 1 ? 's' : ''} · ${total.toLocaleString('es-AR')}
            </span>
          )}
        </div>

        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 sm:gap-2 mb-4">
          {Array.from({ length: raffle.total_numbers }, (_, i) => i).map(num => {
            const isSold = soldNumbers.has(num);
            const isReserved = reservedNumbers.has(num);
            const isSelected = selected.has(num);

            return (
              <button
                key={num}
                onClick={() => toggleNumber(num)}
                disabled={isSold || isReserved}
                className={cn(
                  'aspect-square rounded-lg flex items-center justify-center text-xs sm:text-sm font-bold transition-all',
                  isSold && 'bg-red-100 text-red-400 cursor-not-allowed',
                  isReserved && 'bg-yellow-100 text-yellow-500 cursor-not-allowed',
                  isSelected && 'bg-brand-primary text-white ring-2 ring-brand-secondary scale-105',
                  !isSold && !isReserved && !isSelected && 'bg-brand-bg hover:bg-brand-accent text-gray-700 cursor-pointer',
                )}
              >
                {num}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand-bg border border-brand-accent" /> Disponible</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand-primary" /> Seleccionado</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100" /> Vendido</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-100" /> Reservado</span>
        </div>
      </div>

      {selected.size > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8">
          <h2 className="text-lg font-bold text-brand-primary mb-4 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" /> Completá tus datos
          </h2>

          <form onSubmit={handlePurchase} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-gray-500">Nombre *</label>
                <input type="text" required value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary mt-1"
                  placeholder="Tu nombre" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-gray-500">Email *</label>
                <input type="email" required value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary mt-1"
                  placeholder="tu@email.com" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500">Teléfono (opcional)</label>
              <input type="tel" value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary mt-1"
                placeholder="11-1234-5678" />
            </div>

            <div className="bg-brand-bg/50 rounded-xl p-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{selected.size} número{selected.size > 1 ? 's' : ''} × ${raffle.price_per_number.toLocaleString('es-AR')}</span>
                <span className="font-bold text-brand-primary">${total.toLocaleString('es-AR')}</span>
              </div>
              <p className="text-xs text-gray-400">Serás redirigido a Mercado Pago para completar el pago</p>
            </div>

            {checkoutError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0" /> {checkoutError}
              </div>
            )}

            <button type="submit" disabled={checkoutLoading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50">
              {checkoutLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</>
              ) : (
                <>Pagar ${total.toLocaleString('es-AR')} con Mercado Pago</>
              )}
            </button>
          </form>
        </motion.div>
      )}
    </div>
  );
}
