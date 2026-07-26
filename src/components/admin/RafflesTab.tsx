import React, { useState, useEffect } from 'react';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/hooks/useAuth';
import { cn } from '@/src/lib/utils';
import {
  Plus, X, Loader2, Trash2, Edit2, Eye, Trophy, Calendar, Ticket,
  ChevronDown, ChevronUp, AlertCircle, Check, Pause, Play, Award, Users,
  HandCoins, Upload, CheckCircle, XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Prize {
  id?: string;
  position: number;
  title: string;
  description: string;
  amount: number | null;
}

interface Raffle {
  id: string;
  title: string;
  description: string | null;
  modality: string;
  total_numbers: number;
  price_per_number: number;
  status: string;
  draw_date: string | null;
  created_at: string;
  prizes: Prize[];
  sold_count?: number;
  stats?: { sold: number; reserved: number; available: number };
  tickets?: { number: number; status: string; buyer_name: string }[];
}

export default function RafflesTab() {
  const { user } = useAuth();
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRaffle, setEditingRaffle] = useState<Raffle | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [detailRaffle, setDetailRaffle] = useState<Raffle | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawResult, setDrawResult] = useState<any>(null);

  // Manual assignment state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualFormData, setManualFormData] = useState({ count: 1, name: '', phone: '', paymentMethod: 'manual' });
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<any>(null);

  // Receipts state
  const [showReceipts, setShowReceipts] = useState(false);
  const [receiptImage, setReceiptImage] = useState<string>('');
  const [receiptNote, setReceiptNote] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [uploadReceiptResult, setUploadReceiptResult] = useState<any>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    modality: 'raffle',
    total_numbers: 100,
    price_per_number: 1000,
    draw_date: '',
  });
  const [prizes, setPrizes] = useState<Prize[]>([
    { position: 1, title: '1er Premio', description: '', amount: null },
  ]);

  useEffect(() => { fetchRaffles(); }, []);

  async function fetchRaffles() {
    try {
      setLoading(true);
      const data = await api.raffles.list();
      setRaffles(data.raffles);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function openNew() {
    setEditingRaffle(null);
    setFormData({ title: '', description: '', modality: 'raffle', total_numbers: 100, price_per_number: 1000, draw_date: '' });
    setPrizes([{ position: 1, title: '1er Premio', description: '', amount: null }]);
    setShowForm(true);
  }

  function openEdit(raffle: Raffle) {
    setEditingRaffle(raffle);
    setFormData({
      title: raffle.title,
      description: raffle.description || '',
      modality: raffle.modality,
      total_numbers: raffle.total_numbers,
      price_per_number: raffle.price_per_number,
      draw_date: raffle.draw_date ? raffle.draw_date.slice(0, 16) : '',
    });
    setPrizes(raffle.prizes.map(p => ({ ...p })));
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.title || !formData.total_numbers || !formData.price_per_number) return;
    if (prizes.length === 0) return;
    try {
      setFormLoading(true);
      const payload = { ...formData, prizes };
      if (editingRaffle) {
        await api.raffles.update(editingRaffle.id, payload);
      } else {
        await api.raffles.create(payload);
      }
      setShowForm(false);
      fetchRaffles();
    } catch (err: any) {
      alert(err.message || 'Error al guardar');
    } finally { setFormLoading(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta rifa? Esta acción no se puede deshacer.')) return;
    try {
      await api.raffles.delete(id);
      fetchRaffles();
      if (detailRaffle?.id === id) setDetailRaffle(null);
    } catch (err) { console.error(err); }
  }

  async function handleStatusToggle(raffle: Raffle) {
    const newStatus = raffle.status === 'active' ? 'paused' : 'active';
    try {
      await api.raffles.update(raffle.id, { status: newStatus });
      fetchRaffles();
    } catch (err) { console.error(err); }
  }

  async function openDetail(raffle: Raffle) {
    try {
      setDetailLoading(true);
      const data = await api.raffles.get(raffle.id);
      setDetailRaffle(data.raffle);
    } catch (err) { console.error(err); }
    finally { setDetailLoading(false); }
  }

  async function handleDraw(raffleId: string) {
    if (!confirm('¿Sortear los premios? Esta acción es irreversible.')) return;
    try {
      const data = await api.raffles.draw(raffleId);
      setDrawResult(data);
      openDetail({ id: raffleId } as Raffle);
      fetchRaffles();
    } catch (err: any) {
      alert(err.message || 'Error al sortear');
    }
  }

  async function handleManualAssign(raffleId: string) {
    if (!manualFormData.name || !manualFormData.phone) {
      alert('Nombre y teléfono son obligatorios');
      return;
    }
    if (manualFormData.count < 1) {
      alert('La cantidad debe ser al menos 1');
      return;
    }
    try {
      setManualLoading(true);
      const data = await api.raffles.reserve(raffleId, {
        count: manualFormData.count,
        name: manualFormData.name,
        phone: manualFormData.phone,
        paymentMethod: manualFormData.paymentMethod,
      });
      setManualResult(data);
      setShowManualForm(false);
      setManualFormData({ count: 1, name: '', phone: '', paymentMethod: 'manual' });
      openDetail(detailRaffle!);
      fetchRaffles();
    } catch (err: any) {
      alert(err.message || 'Error en la asignación manual');
    } finally {
      setManualLoading(false);
    }
  }

  async function handleReceiptUpload(receiptRaffleId: string, ticketGroupId: string) {
    if (!receiptImage) { alert('Seleccioná una imagen'); return; }
    try {
      setUploadingReceipt(true);
      const data = await api.raffles.uploadReceipt(receiptRaffleId, {
        ticketGroupId,
        buyerName: manualFormData.name,
        buyerPhone: manualFormData.phone,
        imageData: receiptImage,
        imageMime: 'image/jpeg',
        amountExpected: detailRaffle ? detailRaffle.price_per_number * detailRaffle.tickets.filter(t => t.status === 'paid').length : 0,
      });
      setUploadReceiptResult(data);
      setShowReceipts(false);
      setReceiptImage('');
      openDetail(detailRaffle!);
    } catch (err: any) {
      alert(err.message || 'Error al subir comprobante');
    } finally {
      setUploadingReceipt(false);
    }
  }

  async function handleReceiptConfirm(receiptId: string, raffleId: string) {
    if (!confirm('¿Confirmar pago de este comprobante?')) return;
    try {
      await api.raffles.confirmReceipt(raffleId, receiptId, receiptNote);
      setReceiptNote('');
      openDetail(detailRaffle!);
      fetchRaffles();
    } catch (err: any) {
      alert(err.message || 'Error al confirmar');
    }
  }

  async function handleReceiptReject(receiptId: string, raffleId: string) {
    if (!confirm('¿Rechazar este comprobante?')) return;
    try {
      await api.raffles.rejectReceipt(raffleId, receiptId, receiptNote);
      setReceiptNote('');
      openDetail(detailRaffle!);
      fetchRaffles();
    } catch (err: any) {
      alert(err.message || 'Error al rechazar');
    }
  }

  function addPrize() {
    setPrizes([...prizes, { position: prizes.length + 1, title: `${prizes.length + 1}er Premio`, description: '', amount: null }]);
  }

  function removePrize(idx: number) {
    if (prizes.length <= 1) return;
    const updated = prizes.filter((_, i) => i !== idx).map((p, i) => ({ ...p, position: i + 1 }));
    setPrizes(updated);
  }

  function updatePrize(idx: number, field: keyof Prize, value: any) {
    const updated = [...prizes];
    (updated[idx] as any)[field] = value;
    setPrizes(updated);
  }

  function statusBadge(status: string) {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      paused: 'bg-yellow-100 text-yellow-700',
      closed: 'bg-red-100 text-red-700',
      drawn: 'bg-purple-100 text-purple-700',
    };
    const labels: Record<string, string> = {
      active: 'Activa', paused: 'Pausada', closed: 'Cerrada', drawn: 'Sorteada',
    };
    return (
      <span className={cn('text-[10px] px-2 py-1 rounded-full font-bold', styles[status] || 'bg-gray-100 text-gray-700')}>
        {labels[status] || status}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-brand-primary">Rifas y Sorteos</h2>
          <p className="text-sm text-gray-500">Crear rifas, vender números y sortear premios</p>
        </div>
        <div className="flex gap-2">
          <button onClick={async () => { await api.raffles.cleanup(); fetchRaffles(); }}
            className="px-4 py-2 border border-brand-accent rounded-xl text-sm font-bold hover:bg-brand-accent/20">
            Limpiar reservas
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-bold hover:opacity-90">
            <Plus className="w-4 h-4" /> Nueva Rifa
          </button>
        </div>
      </div>

      {raffles.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Ticket className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="font-bold">No hay rifas creadas</p>
          <p className="text-sm">Creá tu primera rifa para empezar a recaudar fondos</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {raffles.map(raffle => (
          <div key={raffle.id} className="bg-white rounded-2xl border border-brand-accent p-5 flex flex-col">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-brand-primary truncate">{raffle.title}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {raffle.total_numbers} números · ${raffle.price_per_number.toLocaleString('es-AR')} c/u
                </p>
              </div>
              {statusBadge(raffle.status)}
            </div>

            {raffle.prizes?.length > 0 && (
              <div className="mb-3 space-y-1">
                {raffle.prizes.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <Trophy className="w-3 h-3 text-brand-secondary shrink-0" />
                    <span className="font-bold">{p.title}</span>
                    {p.amount && <span className="text-gray-400">${p.amount.toLocaleString('es-AR')}</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" /> {raffle.sold_count || 0}/{raffle.total_numbers} vendidos
              </span>
              {raffle.draw_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {new Date(raffle.draw_date).toLocaleDateString('es-AR')}
                </span>
              )}
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <button onClick={() => openDetail(raffle)}
          </div>
        ))}
      </div>

      {/* Create/Edit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => !formLoading && setShowForm(false)} />
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 pb-0">
                <h3 className="text-xl font-serif font-bold text-brand-primary">
                  {editingRaffle ? 'Editar Rifa' : 'Nueva Rifa'}
                </h3>
                {!formLoading && <button onClick={() => setShowForm(false)} className="p-2 hover:bg-brand-accent/20 rounded-full"><X className="w-5 h-5" /></button>}
              </div>

              <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5">
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Título *</label>
                  <input type="text" required value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary mt-1"
                    placeholder="Ej: Rifa San Juan 2026" />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Descripción</label>
                  <textarea value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary mt-1"
                    rows={2} placeholder="Descripción de la rifa..." />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Cantidad de números *</label>
                    <input type="number" required min={1} value={formData.total_numbers}
                      onChange={e => setFormData({ ...formData, total_numbers: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Precio por número ($) *</label>
                    <input type="number" required min={0} step={100} value={formData.price_per_number}
                      onChange={e => setFormData({ ...formData, price_per_number: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Fecha de sorteo</label>
                    <input type="datetime-local" value={formData.draw_date}
                      onChange={e => setFormData({ ...formData, draw_date: e.target.value })}
                      className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary mt-1" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-bold uppercase text-gray-500">Premios *</label>
                    <button type="button" onClick={addPrize}
                      className="flex items-center gap-1 text-xs font-bold text-brand-primary hover:underline">
                      <Plus className="w-3 h-3" /> Agregar premio
                    </button>
                  </div>
                  <div className="space-y-3">
                    {prizes.map((prize, idx) => (
                      <div key={idx} className="flex gap-2 items-start bg-brand-bg/50 p-3 rounded-xl">
                        <div className="shrink-0 pt-3 text-xs font-bold text-gray-400 w-6 text-center">{prize.position}°</div>
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <input type="text" value={prize.title} placeholder="Título"
                            onChange={e => updatePrize(idx, 'title', e.target.value)}
                            className="px-3 py-2 bg-white rounded-lg border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                          <input type="text" value={prize.description || ''} placeholder="Descripción"
                            onChange={e => updatePrize(idx, 'description', e.target.value)}
                            className="px-3 py-2 bg-white rounded-lg border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                          <input type="number" value={prize.amount || ''} placeholder="Monto ($)" min={0}
                            onChange={e => updatePrize(idx, 'amount', e.target.value ? parseFloat(e.target.value) : null)}
                            className="px-3 py-2 bg-white rounded-lg border border-brand-accent outline-none text-sm focus:border-brand-primary" />
                        </div>
                        {prizes.length > 1 && (
                          <button type="button" onClick={() => removePrize(idx)}
                            className="shrink-0 p-2 text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} disabled={formLoading}
                    className="px-6 py-2.5 border border-brand-accent rounded-xl font-bold text-sm hover:bg-brand-accent/20">Cancelar</button>
                  <button type="submit" disabled={formLoading}
                    className="flex items-center gap-2 px-6 py-2.5 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90">
                    {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {editingRaffle ? 'Guardar cambios' : 'Crear rifa'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {detailRaffle && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => { setDetailRaffle(null); setDrawResult(null); }} />
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative w-full max-w-3xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 pb-0">
                <div>
                  <h3 className="text-xl font-serif font-bold text-brand-primary">{detailRaffle.title}</h3>
                  <p className="text-sm text-gray-500">{detailRaffle.total_numbers} números · ${detailRaffle.price_per_number.toLocaleString('es-AR')} c/u</p>
                </div>
                <button onClick={() => { setDetailRaffle(null); setDrawResult(null); }} className="p-2 hover:bg-brand-accent/20 rounded-full"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-5">
                {detailRaffle.stats && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-green-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-green-700">{detailRaffle.stats.sold}</p>
                      <p className="text-xs text-green-600 font-bold">Vendidos</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-yellow-700">{detailRaffle.stats.reserved}</p>
                      <p className="text-xs text-yellow-600 font-bold">Reservados</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-gray-700">{detailRaffle.stats.available}</p>
                      <p className="text-xs text-gray-600 font-bold">Disponibles</p>
                    </div>
                  </div>
                )}

                {detailRaffle.prizes?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Premios</h4>
                    <div className="space-y-2">
                      {detailRaffle.prizes.map((p, i) => (
                        <div key={i} className="flex items-center gap-3 bg-brand-bg/50 p-3 rounded-xl">
                          <Award className="w-5 h-5 text-brand-secondary shrink-0" />
                          <div className="flex-1">
                            <span className="font-bold text-sm">{p.title}</span>
                            {p.description && <span className="text-xs text-gray-500 ml-2">{p.description}</span>}
                          </div>
                          {p.amount && <span className="font-bold text-sm text-brand-primary">${p.amount.toLocaleString('es-AR')}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detailRaffle.tickets && detailRaffle.tickets.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">
                      Números vendidos ({detailRaffle.tickets.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {detailRaffle.tickets.map(t => (
                        <div key={t.number} className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold',
                          t.status === 'paid' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        )} title={`${t.buyer_name || 'Anónimo'} (${t.status})`}>
                          {t.number}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {drawResult && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <h4 className="font-bold text-purple-800 mb-2 flex items-center gap-2"><Trophy className="w-4 h-4" /> Resultado del sorteo</h4>
                    {drawResult.winners.map((w: any, i: number) => (
                      <div key={i} className="text-sm text-purple-700 mb-1">
                        <span className="font-bold">{w.prize}:</span> N° {w.ticketNumber} - {w.buyerName || 'Anónimo'}
                        {w.prizeAmount && <span className="text-purple-500 ml-1">(${w.prizeAmount.toLocaleString('es-AR')})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {detailRaffle.status !== 'drawn' && (
                  <div className="flex gap-3">
                    <button onClick={() => handleDraw(detailRaffle.id)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:opacity-90">
                      <Trophy className="w-4 h-4" /> Sortear
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {detailLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
        </div>
      )}
    </div>
  );
}
