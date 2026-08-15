import React, { useState } from 'react';
import { X, Eye, Loader2, MapPin, LocateFixed, Camera } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '@/src/lib/api';
import { filesToBase64 } from '@/src/lib/storageService';
import { pickPhoto } from '@/src/lib/cameraService';
import { isNative } from '@/src/lib/platform';
import { PhoneInput } from '@/src/components/PhoneInput';

interface SightingModalProps {
  caseId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function SightingModal({ caseId, onClose, onSaved }: SightingModalProps) {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappValid, setWhatsappValid] = useState(true);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState('image/jpeg');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const locate = () => {
    if (!navigator.geolocation) {
      alert('Tu dispositivo no soporta geolocalización');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      (err) => { setLocating(false); alert('No pudimos obtener tu ubicación. Activá el GPS y probá de nuevo.'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const [b64] = await filesToBase64([file]);
    setPhoto(b64.data);
    setPhotoMime(b64.mimeType || 'image/jpeg');
  };

  const handleNativePhoto = async () => {
    const picked = await pickPhoto();
    if (!picked) return;
    const [b64] = await filesToBase64([picked.file]);
    setPhoto(b64.data);
    setPhotoMime(b64.mimeType || 'image/jpeg');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coords) { alert('Primero obtené tu ubicación GPS'); return; }
    if (!name.trim()) { alert('Ingresá tu nombre'); return; }
    if (!whatsappValid) { alert('WhatsApp inválido. Formato: 549XXXXXXXXXX'); return; }
    setSaving(true);
    try {
      await api.cases.createSighting(caseId, {
        reporter_name: name.trim(),
        reporter_whatsapp: whatsapp.trim() || null,
        lat: coords.lat,
        lng: coords.lng,
        description: description.trim() || null,
        photo_data: photo,
        photo_mime: photoMime,
      });
      onSaved();
    } catch (err: any) {
      alert(err.message || 'Error al reportar el avistamiento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 sm:p-8 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50 shrink-0">
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-brand-primary flex items-center gap-2">
            <Eye className="w-6 h-6 text-amber-500" /> Reportar avistamiento
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-brand-accent rounded-full"><X className="w-6 h-6" /></button>
        </div>

        <form onSubmit={submit} className="p-6 sm:p-8 overflow-y-auto space-y-5">
          <div>
            <label className="text-xs font-bold uppercase text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> Ubicación donde lo viste</label>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className={`mt-2 w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${coords ? 'bg-emerald-500 text-white' : 'bg-brand-bg border border-brand-accent text-brand-primary hover:bg-brand-primary/5'}`}
            >
              {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
              {coords ? `Ubicación obtenida ✓ (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})` : 'Obtener mi ubicación GPS'}
            </button>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Tu nombre *</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Ej: María" className="w-full mt-1 px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none" />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Tu WhatsApp (opcional)</label>
            <PhoneInput value={whatsapp} onChange={(value, e164) => { setWhatsapp(value); setWhatsappValid(!value || !!e164); }} placeholder="+54 9 221 ..." className="mt-1 bg-brand-bg" />
            <p className="text-[10px] text-gray-400 mt-1">El dueño podría contactarte si tiene preguntas.</p>
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Detalles (opcional)</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="¿Qué estaba haciendo? ¿Tenía collar y chapita?" className="w-full mt-1 px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none" />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Foto (opcional)</label>
            {isNative() ? (
              <button
                type="button"
                onClick={handleNativePhoto}
                className="w-full mt-1 px-4 py-3 bg-brand-bg rounded-xl border border-dashed border-brand-accent text-sm font-bold text-brand-primary flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" /> Agregar foto
              </button>
            ) : (
              <input type="file" accept="image/*" onChange={handlePhoto} className="w-full mt-1 px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent" />
            )}
            {photo && <img src={`data:${photoMime};base64,${photo}`} className="w-28 h-28 object-cover rounded-xl mt-2 border border-brand-accent" alt="preview" />}
          </div>

          <button type="submit" disabled={saving} className="w-full py-4 bg-amber-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-amber-600 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-5 h-5" />} Reportar avistamiento
          </button>
          <p className="text-[10px] text-gray-400 text-center">Los avistamientos ayudan a encontrar a la mascota más rápido. Los datos se publican en el mapa del caso.</p>
        </form>
      </motion.div>
    </div>
  );
}