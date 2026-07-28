import React, { useState, useEffect } from 'react';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/hooks/useAuth';
import { cn } from '@/src/lib/utils';
import {
  Plus, X, Loader2, Trash2, Edit2, Eye, Trophy, Calendar, Ticket,
  ChevronDown, ChevronUp, AlertCircle, Check, Pause, Play, Award, Users,
  HandCoins, Upload, CheckCircle, XCircle, MessageSquare, Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import RafflePublishModal from './RafflePublishModal';

interface Prize {
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
  stats?: { sold: number; reservedMp: number; pendingTransfer: number; pendingManual: number; available: number };
  tickets?: { number: number; status: string; buyer_name: string; payment_method: string; payment_status: string }[];
  receipts?: any[];
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

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualRaffleId, setManualRaffleId] = useState<string | null>(null);
  const [manualFormName, setManualFormName] = useState('');
  const [manualFormPhone, setManualFormPhone] = useState('');
  const [manualFormPayment, setManualFormPayment] = useState('manual');
  const [manualSelectedNumbers, setManualSelectedNumbers] = useState<number[]>([]);
  const [manualReceiptFile, setManualReceiptFile] = useState<File | null>(null);
  const [manualReceiptPreview, setManualReceiptPreview] = useState<string | null>(null);
  const [manualRaffleTickets, setManualRaffleTickets] = useState<any[] | null>(null);
  const [manualRaffleTotal, setManualRaffleTotal] = useState(0);
  const [manualRafflePrice, setManualRafflePrice] = useState(0);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<any>(null);
  const [showReceipts, setShowReceipts] = useState(false);
  const [receiptImage, setReceiptImage] = useState('');
  const [receiptNote, setReceiptNote] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [unmatchedReceipts, setUnmatchedReceipts] = useState<any[]>([]);
  const [unmatchedLoading, setUnmatchedLoading] = useState(false);
  const [assigningReceiptId, setAssigningReceiptId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [publishRaffleId, setPublishRaffleId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  async function fetchUnmatchedReceipts() {
    try {
      setUnmatchedLoading(true);
      const data = await api.raffles.unmatchedReceipts();
      setUnmatchedReceipts(data.receipts || []);
    } catch (err) { console.error(err); }
    finally { setUnmatchedLoading(false); }
  }

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
    if (!manualFormName || !manualFormPhone) {
      alert('Nombre y teléfono son obligatorios');
      return;
    }
    if (manualSelectedNumbers.length === 0) {
      alert('Seleccioná al menos un número');
      return;
    }
    try {
      setManualLoading(true);

      // Step 1: reserve numbers with autoConfirm (si no hay comprobante)
      const data = await api.raffles.reserve(raffleId, {
        numbers: manualSelectedNumbers,
        name: manualFormName,
        phone: manualFormPhone,
        paymentMethod: manualFormPayment,
        autoConfirm: !manualReceiptFile,
      });

      // Step 2: if receipt provided, upload as confirmed
      if (manualReceiptFile && manualReceiptPreview) {
        const base64 = manualReceiptPreview.split(',')[1];
        await api.raffles.uploadReceipt(raffleId, {
          ticketGroupId: data.ticketGroupId,
          buyerName: manualFormName,
          buyerPhone: manualFormPhone,
          imageData: base64,
          imageMime: manualReceiptFile.type || 'image/jpeg',
          amountExpected: manualSelectedNumbers.length * manualRafflePrice,
          status: 'confirmed',
        });
      }

      setManualResult(data);
      setShowManualForm(false);
      setManualFormName('');
      setManualFormPhone('');
      setManualFormPayment('manual');
      setManualSelectedNumbers([]);
      setManualReceiptFile(null);
      setManualReceiptPreview(null);
      setManualRaffleTickets(null);
      openDetail({ id: raffleId } as Raffle);
      fetchRaffles();
    } catch (err: any) {
      alert(err.message || 'Error en la asignación manual');
    } finally {
      setManualLoading(false);
    }
  }

  async function handleReceiptUpload(raffleId: string, ticketGroupId: string) {
    if (!receiptImage) { alert('Seleccioná una imagen'); return; }
    try {
      setUploadingReceipt(true);
      await api.raffles.uploadReceipt(raffleId, {
        ticketGroupId,
        buyerName: '',
        buyerPhone: '',
        imageData: receiptImage,
        imageMime: 'image/jpeg',
        amountExpected: detailRaffle ? detailRaffle.price_per_number * detailRaffle.tickets!.filter(t => t.status === 'paid').length : 0,
      });
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
    if (!confirm('¿Rechazar este comprobante? Los números seguirán reservados. El comprador puede reenviar otro comprobante.')) return;
    try {
      await api.raffles.rejectReceipt(raffleId, receiptId, receiptNote);
      setReceiptNote('');
      openDetail(detailRaffle!);
      fetchRaffles();
    } catch (err: any) {
      alert(err.message || 'Error al rechazar');
    }
  }

  async function handleReleaseTickets(ticketGroupId: string, buyerName: string) {
    if (!confirm(`¿Liberar los números de ${buyerName}? Se cancelará la reserva y los números quedarán disponibles para otros compradores.`)) return;
    try {
      await api.raffles.releaseTickets(ticketGroupId);
      openDetail(detailRaffle!);
      fetchRaffles();
    } catch (err: any) {
      alert(err.message || 'Error al liberar números');
    }
  }

  async function handleResendBank(raffleId: string, receiptId: string) {
    try {
      await api.raffles.resendBankDetails(raffleId, receiptId);
      alert('✅ Datos bancarios reenviados al comprador por WhatsApp');
    } catch (err: any) {
      alert(err.message || 'Error al reenviar datos');
    }
  }

  function defaultPrizeTitle(n: number) {
    if (n === 1) return '1er Premio';
    if (n === 2) return '2do Premio';
    if (n === 3) return '3er Premio';
    return `${n}to Premio`;
  }

  function addPrize() {
    setPrizes([...prizes, { position: prizes.length + 1, title: defaultPrizeTitle(prizes.length + 1), description: '', amount: null }]);
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

  const [formData, setFormData] = useState({ title: '', description: '', modality: 'raffle', total_numbers: 100, price_per_number: 1000, draw_date: '' });
  const [prizes, setPrizes] = useState<Prize[]>([{ position: 1, title: '1er Premio', description: '', amount: null }]);

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
          <button onClick={() => { fetchUnmatchedReceipts(); setShowUnmatched(true); }}
            className="px-4 py-2 border border-brand-accent rounded-xl text-sm font-bold hover:bg-brand-accent/20">
            Recibos sin asignar
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
              {raffle.draw_date ? (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {new Date(raffle.draw_date).toLocaleDateString('es-AR')}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-green-600">
                  <Ticket className="w-3 h-3" /> Sin fecha
                </span>
              )}
            </div>

            <div className="mt-auto flex flex-wrap gap-2">
              <button onClick={() => openDetail(raffle)}
                className="flex items-center gap-1 px-3 py-1.5 border border-brand-accent rounded-lg text-xs font-bold hover:bg-brand-accent/20">
                <Eye className="w-3 h-3" /> Ver
              </button>
              {raffle.status !== 'drawn' && (
                <>
                  <button onClick={() => openEdit(raffle)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-brand-accent rounded-lg text-xs font-bold hover:bg-brand-accent/20">
                    <Edit2 className="w-3 h-3" /> Editar
                  </button>
                  <button onClick={() => handleStatusToggle(raffle)}
                    className="flex items-center gap-1 px-3 py-1.5 border border-brand-accent rounded-lg text-xs font-bold hover:bg-brand-accent/20">
                    {raffle.status === 'active' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    {raffle.status === 'active' ? 'Pausar' : 'Reanudar'}
                  </button>
                </>
              )}
              <button onClick={() => {
                  setManualRaffleId(raffle.id);
                  setManualRaffleTickets(null);
                  setManualRaffleTotal(0);
                  setManualSelectedNumbers([]);
                  setManualReceiptFile(null);
                  setManualReceiptPreview(null);
                  setManualFormName('');
                  setManualFormPhone('');
                  setManualFormPayment('manual');
                  setShowManualForm(true);
                  api.raffles.get(raffle.id).then(data => {
                    setManualRaffleTickets(data.raffle?.tickets || []);
                    setManualRaffleTotal(data.raffle?.total_numbers);
                    setManualRafflePrice(data.raffle?.price_per_number);
                  }).catch(err => {
                    console.error('Error al cargar rifa:', err);
                  });
                }}
                  className="flex items-center gap-1 px-3 py-1.5 border border-brand-accent rounded-lg text-xs font-bold hover:bg-brand-accent/20">
                  <HandCoins className="w-3 h-3" /> Carga manual
                </button>
                <button onClick={() => setPublishRaffleId(raffle.id)}
                  className="flex items-center gap-1 px-3 py-1.5 border border-brand-accent rounded-lg text-xs font-bold hover:bg-brand-accent/20">
                  <Share2 className="w-3 h-3" /> Compartir
                </button>
                <button onClick={() => handleDelete(raffle.id)}
                className="flex items-center gap-1 px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
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
                          <input type="text" value={prize.description} placeholder="Descripción"
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

      {/* Manual Assignment Modal */}
      <AnimatePresence>
        {showManualForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" onClick={() => !manualLoading && setShowManualForm(false)} />
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 sm:p-8 border-b border-brand-accent shrink-0">
                <h3 className="text-lg font-serif font-bold text-brand-primary">Carga manual</h3>
                <button onClick={() => setShowManualForm(false)} className="p-2 hover:bg-brand-accent/20 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 sm:p-8 overflow-y-auto space-y-4">
                {/* Number Grid */}
                {manualRaffleTickets === null ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
                  </div>
                ) : manualRaffleTotal > 0 ? (
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500 mb-2 block">
                      Números ({manualSelectedNumbers.length} seleccionados)
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        const ticketMap = new Map((manualRaffleTickets || []).map((t: any) => [t.number, t]));
                        const nums = [];
                        for (let i = 1; i <= manualRaffleTotal; i++) nums.push(i);
                        return nums.map(n => {
                          const t = ticketMap.get(n);
                          const isSelected = manualSelectedNumbers.includes(n);
                          if (t) {
                            return (
                              <div key={n} className={cn(
                                'w-10 h-10 rounded-lg flex flex-col items-center justify-center text-[9px] font-bold relative cursor-default border',
                                t.status === 'paid' ? 'bg-green-100 text-green-800 border-green-300' :
                                t.status === 'pending_transfer' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                                'bg-blue-100 text-blue-800 border-blue-300'
                              )} title={`${t.buyer_name || 'Anónimo'} · ${t.status === 'paid' ? 'Pagado' : t.status === 'pending_transfer' ? 'Pendiente' : 'Reservado'}`}>
                                <span>{n}</span>
                                {t.buyer_name && <span className="text-[7px] leading-none opacity-70">{t.buyer_name.charAt(0).toUpperCase()}</span>}
                              </div>
                            );
                          }
                          return (
                            <div key={n} onClick={() => {
                              setManualSelectedNumbers(prev =>
                                prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]
                              );
                            }} className={cn(
                              'w-10 h-10 rounded-lg flex items-center justify-center text-[9px] font-bold border cursor-pointer transition-colors',
                              isSelected ? 'bg-indigo-100 text-indigo-700 border-indigo-300' :
                              'bg-gray-50 text-gray-300 border-dashed border-gray-200 hover:border-indigo-300 hover:text-indigo-500'
                            )}>
                              {n}
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-[9px]">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300" /> Pagado</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-100 border border-orange-300" /> Pendiente</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300" /> Reservado</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-100 border border-indigo-300" /> Seleccionado</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-50 border border-dashed border-gray-200" /> Disponible</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-red-500 text-center py-4">Error al cargar los números</p>
                )}

                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Nombre del comprador *</label>
                  <input type="text" required value={manualFormName}
                    onChange={e => setManualFormName(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Teléfono *</label>
                  <input type="tel" required value={manualFormPhone}
                    onChange={e => setManualFormPhone(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary mt-1" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Método de pago</label>
                  <select value={manualFormPayment}
                    onChange={e => setManualFormPayment(e.target.value)}
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none focus:border-brand-primary mt-1">
                    <option value="manual">Manual (efectivo / transferencia)</option>
                    <option value="transfer">Transferencia bancaria</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Comprobante <span className="text-gray-300 normal-case">(opcional)</span></label>
                  <input type="file" accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0] || null;
                      setManualReceiptFile(file);
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => setManualReceiptPreview(reader.result as string);
                        reader.readAsDataURL(file);
                      } else {
                        setManualReceiptPreview(null);
                      }
                    }}
                    className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-primary file:text-white hover:file:opacity-90 mt-1" />
                  {manualReceiptPreview && (
                    <div className="mt-2 relative inline-block">
                      <img src={manualReceiptPreview} alt="preview" className="w-20 h-20 object-cover rounded-xl border border-brand-accent" />
                      <button onClick={() => { setManualReceiptFile(null); setManualReceiptPreview(null); }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>

                {manualResult && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">
                    ✓ {manualSelectedNumbers.length} número(s) asignado(s)
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setShowManualForm(false)} disabled={manualLoading}
                    className="px-4 py-2 border border-brand-accent rounded-xl font-bold text-sm hover:bg-brand-accent/20">Cancelar</button>
                  <button onClick={() => manualRaffleId && handleManualAssign(manualRaffleId)} disabled={manualLoading || manualSelectedNumbers.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50">
                    {manualLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Asignar {manualSelectedNumbers.length > 0 ? `${manualSelectedNumbers.length} número${manualSelectedNumbers.length > 1 ? 's' : ''}` : ''}
                  </button>
                </div>
              </div>
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
                      <p className="text-xs text-green-600 font-bold">Pagados</p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-yellow-700">{detailRaffle.stats.reservedMp + detailRaffle.stats.pendingTransfer + detailRaffle.stats.pendingManual}</p>
                      <p className="text-xs text-yellow-600 font-bold">Pendientes</p>
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
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold text-gray-500 uppercase">
                        Números ({detailRaffle.tickets.length})
                      </h4>
                      <div className="flex bg-brand-bg rounded-lg p-0.5 border border-brand-accent">
                        <button onClick={() => setViewMode('grid')}
                          className={cn('px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors', viewMode === 'grid' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                          Grilla
                        </button>
                        <button onClick={() => setViewMode('table')}
                          className={cn('px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors', viewMode === 'table' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
                          Tabla
                        </button>
                      </div>
                    </div>

                    {viewMode === 'grid' && (() => {
                      const ticketMap = new Map(detailRaffle.tickets!.map((t: any) => [t.number, t]));
                      const total = detailRaffle.total_numbers;
                      const nums = [];
                      for (let i = 1; i <= total; i++) nums.push(i);
                      return (
                      <div>
                        <div className="flex flex-wrap gap-1">
                          {nums.map(n => {
                            const t = ticketMap.get(n);
                            const receiptForTicket = t ? ((t as any).receipt_image_data ? t : detailRaffle.receipts?.find((r: any) => r.ticket_group_id === (t as any).mp_external_reference)) : null;
                            return t ? (
                            <div key={n} className={cn(
                              'w-11 h-11 rounded-lg flex flex-col items-center justify-center text-[10px] font-bold relative group cursor-default',
                              'border',
                              t.status === 'paid' ? 'bg-green-100 text-green-800 border-green-300' :
                              t.status === 'pending_transfer' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                              'bg-blue-100 text-blue-800 border-blue-300'
                            )} title={`${t.buyer_name || 'Anónimo'} · ${t.status === 'paid' ? 'Pagado' : t.status === 'pending_transfer' ? 'Pendiente' : 'Reservado'}${receiptForTicket ? ' · Tiene comprobante' : ''}`}>
                              <span>{n}</span>
                              {t.buyer_name && <span className="text-[7px] leading-none opacity-70">{t.buyer_name.charAt(0).toUpperCase()}</span>}
                              {receiptForTicket && (
                                <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-10 hidden group-hover:block cursor-pointer" onClick={() => setPreviewImage(`data:${receiptForTicket.receipt_image_mime || receiptForTicket.image_mime || 'image/jpeg'};base64,${receiptForTicket.receipt_image_data || receiptForTicket.image_data}`)}>
                                  <div className="bg-white rounded-xl shadow-xl border border-brand-accent p-2 w-24">
                                    <img src={`data:${receiptForTicket.receipt_image_mime || receiptForTicket.image_mime || 'image/jpeg'};base64,${receiptForTicket.receipt_image_data || receiptForTicket.image_data}`} alt="comprobante" className="w-full aspect-square object-cover rounded-lg" />
                                    <p className={cn('text-[8px] text-center mt-1 font-bold', (receiptForTicket.receipt_status || receiptForTicket.status) === 'confirmed' ? 'text-green-600' : (receiptForTicket.receipt_status || receiptForTicket.status) === 'rejected' ? 'text-red-600' : 'text-yellow-600')}>
                                      {(receiptForTicket.receipt_status || receiptForTicket.status) === 'confirmed' ? '✓ Confirmado' : (receiptForTicket.receipt_status || receiptForTicket.status) === 'rejected' ? '✗ Rechazado' : 'Pendiente'}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                            ) : (
                            <div key={n} className="w-11 h-11 rounded-lg flex items-center justify-center text-[10px] font-bold text-gray-300 bg-gray-50 border border-dashed border-gray-200">
                              {n}
                            </div>
                            );
                          })}
                        </div>
                        {/* Legend */}
                        <div className="flex flex-wrap gap-3 mt-3 text-[10px]">
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-100 border border-green-300" /> Pagado</span>
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-100 border border-orange-300" /> Pendiente</span>
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300" /> Reservado</span>
                          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-50 border border-dashed border-gray-200" /> Disponible</span>
                        </div>
                      </div>
                      );
                    })()}

                    {viewMode === 'table' && (
                      <div className="overflow-x-auto rounded-2xl border border-brand-accent">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-brand-bg border-b border-brand-accent">
                              <th className="p-2 font-bold">N°</th>
                              <th className="p-2 font-bold">Comprador</th>
                              <th className="p-2 font-bold">Teléfono</th>
                              <th className="p-2 font-bold">Estado</th>
                              <th className="p-2 font-bold">Comprobante</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailRaffle.tickets.map(t => {
                              const receiptForTicket = (t as any).receipt_image_data ? t : detailRaffle.receipts?.find((r: any) => r.ticket_group_id === (t as any).mp_external_reference);
                              return (
                                <tr key={t.number} className={cn('border-b border-brand-accent/50', t.status === 'paid' ? 'bg-green-50/50' : t.status === 'pending_transfer' ? 'bg-orange-50/50' : 'bg-blue-50/50')}>
                                  <td className="p-2 font-bold">{t.number}</td>
                                  <td className="p-2">{t.buyer_name || 'Anónimo'}</td>
                                  <td className="p-2 text-gray-500">{t.buyer_phone || '-'}</td>
                                  <td className="p-2">
                                    <span className={cn(
                                      'text-[10px] px-2 py-0.5 rounded-full font-bold',
                                      t.status === 'paid' ? 'bg-red-100 text-red-700' :
                                      t.status === 'pending_transfer' ? 'bg-orange-100 text-orange-700' :
                                      'bg-yellow-100 text-yellow-700'
                                    )}>
                                      {t.status === 'paid' ? 'Pagado' : t.status === 'pending_transfer' ? 'Pendiente' : 'Reservado'}
                                    </span>
                                  </td>
                                  <td className="p-2">
                                    {receiptForTicket ? (
                                      <button onClick={() => setPreviewImage(`data:${receiptForTicket.receipt_image_mime || receiptForTicket.image_mime || 'image/jpeg'};base64,${receiptForTicket.receipt_image_data || receiptForTicket.image_data}`)}
                                        className="flex items-center gap-1.5 text-brand-primary hover:underline">
                                        <img src={`data:${receiptForTicket.receipt_image_mime || receiptForTicket.image_mime || 'image/jpeg'};base64,${receiptForTicket.receipt_image_data || receiptForTicket.image_data}`}
                                          alt="" className="w-8 h-8 object-cover rounded-lg border border-brand-accent" />
                                        <span className={cn(
                                          'text-[10px] font-bold',
                                          (receiptForTicket.receipt_status || receiptForTicket.status) === 'confirmed' ? 'text-green-600' :
                                          (receiptForTicket.receipt_status || receiptForTicket.status) === 'rejected' ? 'text-red-600' : 'text-yellow-600'
                                        )}>
                                          {(receiptForTicket.receipt_status || receiptForTicket.status) === 'confirmed' ? '✓' :
                                           (receiptForTicket.receipt_status || receiptForTicket.status) === 'rejected' ? '✗' : '?'}
                                        </span>
                                      </button>
                                    ) : (
                                      <span className="text-gray-300">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Receipts Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold text-gray-500 uppercase">Comprobantes</h4>
                    <button onClick={() => setShowReceipts(true)}
                      className="flex items-center gap-1 text-xs font-bold text-brand-primary hover:underline">
                      <Upload className="w-3 h-3" /> Subir comprobante
                    </button>
                  </div>
                  {detailRaffle.receipts && detailRaffle.receipts.length > 0 ? (
                    <div className="space-y-2">
                      {detailRaffle.receipts.map((r: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 bg-brand-bg/50 p-3 rounded-xl">
                          <button onClick={() => setPreviewImage(`data:${r.image_mime || 'image/jpeg'};base64,${r.image_data}`)}>
                            <img src={`data:${r.image_mime || 'image/jpeg'};base64,${r.image_data}`} alt="receipt" className="w-12 h-12 object-cover rounded-lg cursor-pointer hover:opacity-80" />
                          </button>
                          <div className="flex-1 text-xs min-w-0">
                            <p className="font-bold truncate">{r.buyer_name} — {r.buyer_phone}</p>
                            {r.ticket_numbers && r.ticket_numbers.length > 0 && (
                              <p className="text-gray-500">Números: {r.ticket_numbers.join(', ')}</p>
                            )}
                            <p className="text-gray-500">Esperado: ${r.amount_expected?.toLocaleString('es-AR')}</p>
                            <span className={cn(
                              'text-[10px] px-2 py-1 rounded-full font-bold',
                              r.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                              r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            )}>
                              {r.status === 'confirmed' ? 'Confirmado' : r.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                            </span>
                          </div>
                          {r.status === 'pending' && (
                            <div className="flex gap-1">
                              <button onClick={() => handleReceiptConfirm(r.id, detailRaffle.id)}
                                className="p-1 text-green-600 hover:bg-green-50 rounded" title="Confirmar pago"><CheckCircle className="w-4 h-4" /></button>
                              <button onClick={() => handleReceiptReject(r.id, detailRaffle.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded" title="Rechazar comprobante"><XCircle className="w-4 h-4" /></button>
                              <button onClick={() => handleResendBank(detailRaffle.id, r.id)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Reenviar datos bancarios"><MessageSquare className="w-4 h-4" /></button>
                              <button onClick={() => handleReleaseTickets(r.ticket_group_id, r.buyer_name || r.push_name || '')}
                                className="p-1 text-orange-600 hover:bg-orange-50 rounded" title="Liberar números"><X className="w-4 h-4" /></button>
                            </div>
                          )}
                          {(r.status === 'rejected' || r.status === 'confirmed') && (
                            <div className="flex gap-1">
                              {r.status === 'rejected' && (
                                <button onClick={() => handleResendBank(detailRaffle.id, r.id)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Reenviar datos bancarios"><MessageSquare className="w-4 h-4" /></button>
                              )}
                              {r.ticket_group_id && (
                                <button onClick={() => handleReleaseTickets(r.ticket_group_id, r.buyer_name || r.push_name || '')}
                                  className="p-1 text-orange-600 hover:bg-orange-50 rounded" title="Liberar números"><X className="w-4 h-4" /></button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No hay comprobantes aún. Los comprobantes enviados por WhatsApp aparecerán aquí.</p>
                  )}
                </div>

                {/* Upload Receipt Modal */}
                {showReceipts && (
                  <div className="bg-brand-bg/50 rounded-xl p-4 space-y-3">
                    <h4 className="text-sm font-bold">Subir comprobante</h4>
                    <input type="text" placeholder="Ticket Group ID o Número del ticket"
                      value={receiptImage} onChange={e => setReceiptImage(e.target.value)}
                      className="w-full px-3 py-2 bg-white rounded-lg border border-brand-accent outline-none text-sm" />
                    <textarea placeholder="Nota del admin (opcional)" value={receiptNote}
                      onChange={e => setReceiptNote(e.target.value)}
                      className="w-full px-3 py-2 bg-white rounded-lg border border-brand-accent outline-none text-sm" rows={2} />
                    <div className="flex gap-2">
                      <button onClick={() => detailRaffle && handleReceiptUpload(detailRaffle.id, receiptImage)}
                        disabled={uploadingReceipt}
                        className="px-4 py-2 bg-brand-primary text-white rounded-xl font-bold text-sm">
                        {uploadingReceipt ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Subir'}
                      </button>
                      <button onClick={() => setShowReceipts(false)}
                        className="px-4 py-2 border border-brand-accent rounded-xl font-bold text-sm hover:bg-brand-accent/20">Cancelar</button>
                    </div>
                  </div>
                )}

                {drawResult && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <h4 className="font-bold text-purple-800 mb-2 flex items-center gap-2"><Trophy className="w-4 h-4" /> Resultado del sorteo</h4>
                    {drawResult.winners && drawResult.winners.map((w: any, i: number) => (
                      <div key={i} className="text-sm text-purple-700 mb-1">
                        <span className="font-bold">{w.prize}:</span> N° {w.ticketNumber} - {w.buyerName || 'Anónimo'}
                        {w.prizeAmount && <span className="text-purple-500 ml-1">(${w.prizeAmount.toLocaleString('es-AR')})</span>}
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unmatched Receipts Modal */}
      {showUnmatched && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4" onClick={() => setShowUnmatched(false)}>
          <div className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" />
          <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 sm:p-8 border-b border-brand-accent shrink-0">
              <h3 className="text-lg font-bold">Recibos sin asignar</h3>
              <button onClick={() => setShowUnmatched(false)} className="p-2 hover:bg-brand-accent/20 rounded-xl"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 sm:p-8 overflow-y-auto space-y-4">
              {unmatchedLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-brand-primary" /></div>
              ) : unmatchedReceipts.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No hay recibos sin asignar</p>
              ) : unmatchedReceipts.map((r: any) => (
                <div key={r.id} className="bg-brand-bg/50 p-4 rounded-xl space-y-3">
                  <div className="flex items-start gap-4">
                    <button onClick={() => setPreviewImage(`data:${r.image_mime || 'image/jpeg'};base64,${r.image_data}`)}>
                      <img src={`data:${r.image_mime || 'image/jpeg'};base64,${r.image_data}`} alt="receipt" className="w-20 h-20 object-cover rounded-xl shrink-0 cursor-pointer hover:opacity-80" />
                    </button>
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="font-bold">{r.push_name || r.buyer_name || 'Desconocido'}</p>
                      <p className="text-gray-500 text-xs break-words">{r.lid_jid || r.buyer_phone || 'Sin ID'}</p>
                      <p className="text-gray-400 text-xs mt-1">{new Date(r.created_at).toLocaleString('es-AR')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      className="w-full px-3 py-2 bg-white rounded-xl border border-brand-accent outline-none text-sm"
                      value={assigningReceiptId === r.id ? r._selectedRaffle || '' : ''}
                      onChange={(e) => { r._selectedRaffle = e.target.value; setAssigningReceiptId(r.id); }}
                    >
                      <option value="">Seleccionar rifa...</option>
                      {raffles.filter(rf => rf.status !== 'drawn').map(rf => (
                        <option key={rf.id} value={rf.id}>{rf.title}</option>
                      ))}
                    </select>
                    <button
                      disabled={!r._selectedRaffle}
                      onClick={async () => {
                        if (!r._selectedRaffle) return;
                        try {
                          await api.raffles.assignReceipt(r.id, {
                            raffleId: r._selectedRaffle,
                            buyerName: r.push_name || r.buyer_name,
                            buyerPhone: r.lid_jid || r.buyer_phone,
                          });
                          fetchUnmatchedReceipts();
                          fetchRaffles();
                        } catch (err: any) {
                          alert(err.message || 'Error al asignar');
                        }
                      }}
                      className="px-4 py-2 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50"
                    >
                      Asignar a rifa
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Full-size image preview */}
      {previewImage && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={previewImage} alt="preview" className="max-w-full max-h-[90vh] object-contain rounded-2xl" />
            <button onClick={() => setPreviewImage(null)} className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {detailLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
        </div>
      )}

      {publishRaffleId && (
        <RafflePublishModal
          raffleId={publishRaffleId}
          onClose={() => setPublishRaffleId(null)}
        />
      )}
    </div>
  );
}