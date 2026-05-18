import React, { useState, useEffect } from 'react';
import { api } from '@/src/lib/api';
import { X, Plus, FileText, Download, Loader2, Calendar, DollarSign, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PetRecord {
  id: string;
  record_type: string;
  title: string;
  description: string | null;
  amount: number | null;
  record_date: string;
  next_date: string | null;
  vet_name: string | null;
  clinic_name: string | null;
  medication_name: string | null;
  dosage: string | null;
}

export default function PetRecordsModal({ petId, petName, onClose }: { petId: string, petName: string, onClose: () => void }) {
  const [records, setRecords] = useState<PetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    recordType: 'note',
    title: '',
    description: '',
    amount: '',
    recordDate: new Date().toISOString().split('T')[0],
    nextDate: '',
    vetName: '',
    clinicName: '',
    medicationName: '',
    dosage: '',
  });

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/pets/${petId}/records`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [petId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = { ...formData, amount: formData.amount ? parseFloat(formData.amount) : null };
      const res = await fetch(`/api/pets/${petId}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setFormOpen(false);
        setFormData({
          recordType: 'note', title: '', description: '', amount: '',
          recordDate: new Date().toISOString().split('T')[0], nextDate: '',
          vetName: '', clinicName: '', medicationName: '', dosage: ''
        });
        fetchRecords();
      } else {
        alert('Error al guardar el registro');
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión');
    } finally {
      setFormLoading(false);
    }
  };

  const deleteRecord = async (id: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/pets/${petId}/records/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchRecords();
    } catch (e) {
      console.error(e);
    }
  };

  const downloadReport = async () => {
    try {
      const token = localStorage.getItem('token');
      // For fetch download
      const res = await fetch(`/api/pets/${petId}/records/report`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to generate report');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Seguimiento_${petName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Error al generar el PDF');
    }
  };

  const typeLabels: Record<string, string> = {
    appointment: 'Turno Vet.', study: 'Estudio', expense: 'Gasto',
    medication: 'Medicación', vaccine: 'Vacuna', surgery: 'Cirugía', note: 'Nota'
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-brand-primary/40 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        
        <div className="p-6 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50">
          <div>
            <h2 className="text-2xl font-serif font-bold text-brand-primary">Historial Médico</h2>
            <p className="text-sm text-gray-500">Seguimiento de {petName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-brand-accent rounded-full text-gray-500 hover:text-brand-primary transition-colors"><X className="w-6 h-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-brand-bg/20">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
            <button onClick={() => setFormOpen(!formOpen)} className="w-full sm:w-auto px-6 py-3 bg-brand-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand-primary/90 transition-colors">
              <Plus className="w-5 h-5" /> {formOpen ? 'Cancelar' : 'Nuevo Registro'}
            </button>
            <button onClick={downloadReport} className="w-full sm:w-auto px-6 py-3 bg-white text-brand-primary border border-brand-accent rounded-xl font-bold flex items-center justify-center gap-2 hover:border-brand-primary transition-colors">
              <Download className="w-5 h-5" /> Descargar PDF
            </button>
          </div>

          <AnimatePresence>
            {formOpen && (
              <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-brand-accent mb-8 shadow-sm space-y-4 overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Tipo de Registro *</label>
                    <select required className="w-full px-4 py-2 mt-1 bg-brand-bg rounded-xl border border-brand-accent" value={formData.recordType} onChange={e => setFormData({...formData, recordType: e.target.value})}>
                      <option value="note">Nota General</option>
                      <option value="vaccine">Vacuna</option>
                      <option value="medication">Medicación</option>
                      <option value="appointment">Turno Veterinario</option>
                      <option value="expense">Gasto / Compra</option>
                      <option value="study">Estudio Clínico</option>
                      <option value="surgery">Cirugía</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Título / Motivo *</label>
                    <input required type="text" className="w-full px-4 py-2 mt-1 bg-brand-bg rounded-xl border border-brand-accent" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ej: Vacuna Antirrábica" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Fecha *</label>
                    <input required type="date" className="w-full px-4 py-2 mt-1 bg-brand-bg rounded-xl border border-brand-accent" value={formData.recordDate} onChange={e => setFormData({...formData, recordDate: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Costo / Gasto ($)</label>
                    <input type="number" step="0.01" className="w-full px-4 py-2 mt-1 bg-brand-bg rounded-xl border border-brand-accent" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Próxima Fecha (Ej: Refuerzo)</label>
                    <input type="date" className="w-full px-4 py-2 mt-1 bg-brand-bg rounded-xl border border-brand-accent" value={formData.nextDate} onChange={e => setFormData({...formData, nextDate: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Veterinario / Clínica</label>
                    <input type="text" className="w-full px-4 py-2 mt-1 bg-brand-bg rounded-xl border border-brand-accent" value={formData.vetName} onChange={e => setFormData({...formData, vetName: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Detalles Adicionales</label>
                  <textarea rows={2} className="w-full px-4 py-2 mt-1 bg-brand-bg rounded-xl border border-brand-accent resize-none" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Notas, dosis de medicación, diagnóstico..." />
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={formLoading} className="px-6 py-2 bg-brand-primary text-white rounded-xl font-bold flex items-center gap-2">
                    {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Guardar
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-brand-primary" /></div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-brand-accent border-dashed">
              <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No hay registros médicos para esta mascota.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map(record => (
                <div key={record.id} className="bg-white p-5 rounded-2xl border border-brand-accent shadow-sm flex flex-col md:flex-row gap-4 justify-between group">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-brand-bg rounded-xl flex items-center justify-center text-brand-primary shrink-0">
                      {record.record_type === 'expense' ? <DollarSign className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-md">
                          {typeLabels[record.record_type] || record.record_type}
                        </span>
                        <span className="text-xs text-gray-400 flex items-center gap-1"><Calendar className="w-3 h-3" /> {format(new Date(record.record_date), 'dd MMM yyyy', { locale: es })}</span>
                      </div>
                      <h4 className="font-bold text-gray-800">{record.title}</h4>
                      {record.description && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{record.description}</p>}
                      {(record.vet_name || record.clinic_name) && (
                        <p className="text-xs text-gray-500 mt-2">Vet: {[record.vet_name, record.clinic_name].filter(Boolean).join(' - ')}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-row md:flex-col justify-between items-end md:items-end shrink-0">
                    {record.amount && <span className="font-bold text-lg text-emerald-600">${parseFloat(record.amount as any).toLocaleString('es-AR')}</span>}
                    <button onClick={() => deleteRecord(record.id)} className="text-xs font-bold text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
