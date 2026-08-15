import { useState } from 'react';
import type { ReactNode, FormEvent, ChangeEvent } from 'react';
import { X, Loader2, HandHeart, PartyPopper, Lock, LocateFixed, Camera, CheckCircle2, User, Phone, Mail, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '@/src/lib/api';
import { getCurrentPosition } from '@/src/lib/geolocation';
import { filesToBase64 } from '@/src/lib/storageService';
import { pickPhoto } from '@/src/lib/cameraService';
import { isNative } from '@/src/lib/platform';
import { PhoneInput } from '@/src/components/PhoneInput';

const CLOSE_REASONS: { value: string; label: string; emoji: string }[] = [
  { value: 'reunited', label: 'Se reencontró', emoji: '🎉' },
  { value: 'deceased', label: 'Falleció', emoji: '🕊️' },
  { value: 'transferred', label: 'Fue trasladada', emoji: '📍' },
  { value: 'adopted', label: 'Fue adoptada', emoji: '🏠' },
];

export default function CaseActions({ caseId, onChanged }: { caseId: string; onChanged: () => void }) {
  const [showMeeting, setShowMeeting] = useState(false);
  const [showReunite, setShowReunite] = useState(false);
  const [showClose, setShowClose] = useState(false);

  return (
    <>
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => setShowMeeting(true)}
          className="w-full sm:w-auto px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <HandHeart className="w-4 h-4" /> Proponer encuentro
        </button>
        <button
          onClick={() => setShowReunite(true)}
          className="w-full sm:w-auto px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
        >
          <PartyPopper className="w-4 h-4" /> Confirmar reunión
        </button>
        <button
          onClick={() => setShowClose(true)}
          className="w-full sm:w-auto px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-300 transition-colors flex items-center justify-center gap-2"
        >
          <Lock className="w-4 h-4" /> Cerrar caso
        </button>
      </div>

      {showMeeting && <MeetingModal caseId={caseId} onClose={() => setShowMeeting(false)} onDone={() => { setShowMeeting(false); onChanged(); }} />}
      {showReunite && <ReuniteModal caseId={caseId} onClose={() => setShowReunite(false)} onDone={() => { setShowReunite(false); onChanged(); }} />}
      {showClose && <CloseModal caseId={caseId} onClose={() => setShowClose(false)} onDone={() => { setShowClose(false); onChanged(); }} />}
    </>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-brand-primary/20 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4 shrink-0">
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 pt-0 overflow-y-auto">{children}</div>
      </motion.div>
    </div>
  );
}

function MeetingModal({ caseId, onClose, onDone }: { caseId: string; onClose: () => void; onDone: () => void }) {
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const locate = async () => {
    setLocating(true);
    try {
      const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      alert('No pudimos obtener tu ubicación. Activá el GPS y probá de nuevo.');
    } finally {
      setLocating(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!time) { alert('Ingresá fecha y hora del encuentro'); return; }
    setSaving(true);
    try {
      await api.cases.proposeMeeting(caseId, { time, location: location.trim() || null, lat: coords?.lat, lng: coords?.lng });
      onDone();
    } catch (err: any) {
      alert(err.message || 'Error al proponer el encuentro');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Proponer punto de encuentro" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Fecha y hora</label>
          <input type="datetime-local" value={time} onChange={e => setTime(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-brand-accent text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Lugar (opcional)</label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Ej: Veterinaria de 7 y 50" className="w-full px-4 py-3 rounded-xl border border-brand-accent text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary" />
        </div>
        <div>
          <button type="button" onClick={locate} disabled={locating} className="flex items-center gap-2 text-sm font-bold text-brand-primary">
            <LocateFixed className="w-4 h-4" /> {locating ? 'Obteniendo...' : coords ? `Ubicación: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Usar mi ubicación'}
          </button>
        </div>
        <button type="submit" disabled={saving} className="w-full px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Proponer encuentro
        </button>
      </form>
    </ModalShell>
  );
}

function ReuniteModal({ caseId, onClose, onDone }: { caseId: string; onClose: () => void; onDone: () => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoMime, setPhotoMime] = useState('image/jpeg');
  const [saving, setSaving] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPhoneValid, setOwnerPhoneValid] = useState(true);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerAddress, setOwnerAddress] = useState('');

  const handlePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirm('¿Confirmás que la mascota volvió a casa? Se cerrará el caso y se avisará a quienes colaboraron.')) return;
    setSaving(true);
    try {
      await api.cases.reunite(caseId, {
        photo_data: photo,
        photo_mime: photoMime,
        owner_name: ownerName || null,
        owner_phone: ownerPhone || null,
        owner_email: ownerEmail || null,
        owner_address: ownerAddress || null,
      });
      onDone();
    } catch (err: any) {
      alert(err.message || 'Error al confirmar la reunión');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Confirmar reunión" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-500">Registrá el reencuentro. Opcionalmente subí una foto y completá los datos del dueño.</p>
        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Foto (opcional)</label>
          <div className="flex items-center gap-3">
            <label
              onClick={(e) => {
                if (isNative()) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleNativePhoto();
                }
              }}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-brand-accent text-sm font-bold text-gray-600 cursor-pointer hover:border-brand-primary"
            >
              <Camera className="w-4 h-4" /> Elegir foto
              <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </label>
            {photo && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5 mb-1">
            <User className="w-3 h-3" /> Nombre del dueño
          </label>
          <input
            type="text"
            value={ownerName}
            onChange={e => setOwnerName(e.target.value)}
            placeholder="Ej: Juan Pérez"
            className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary transition-colors"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5 mb-1">
            <Phone className="w-3 h-3" /> Teléfono
          </label>
          <PhoneInput
            value={ownerPhone}
            onChange={(value, e164) => { setOwnerPhone(value); setOwnerPhoneValid(!value || !!e164); }}
            placeholder="Ej: 2215551234"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5 mb-1">
            <Mail className="w-3 h-3" /> Email
          </label>
          <input
            type="email"
            value={ownerEmail}
            onChange={e => setOwnerEmail(e.target.value)}
            placeholder="Ej: juan@email.com"
            className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary transition-colors"
          />
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5 mb-1">
            <MapPin className="w-3 h-3" /> Dirección
          </label>
          <input
            type="text"
            value={ownerAddress}
            onChange={e => setOwnerAddress(e.target.value)}
            placeholder="Ej: Calle 7 entre 52 y 53"
            className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm focus:border-brand-primary transition-colors"
          />
        </div>

        <button type="submit" disabled={saving} className="w-full px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar reunión
        </button>
      </form>
    </ModalShell>
  );
}

function CloseModal({ caseId, onClose, onDone }: { caseId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason) { alert('Elegí el motivo de cierre'); return; }
    if (!confirm(`¿Cerrar el caso con motivo "${CLOSE_REASONS.find(r => r.value === reason)?.label}"?`)) return;
    setSaving(true);
    try {
      await api.cases.close(caseId, reason);
      onDone();
    } catch (err: any) {
      alert(err.message || 'Error al cerrar el caso');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Cerrar caso" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CLOSE_REASONS.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              className={`p-3 rounded-xl border text-left transition-colors ${reason === r.value ? 'border-brand-primary bg-brand-primary/10' : 'border-brand-accent hover:border-brand-primary'}`}
            >
              <span className="text-lg">{r.emoji}</span>
              <p className="text-sm font-bold text-gray-700 mt-1">{r.label}</p>
            </button>
          ))}
        </div>
        <button type="submit" disabled={saving || !reason} className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-300 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Cerrar caso
        </button>
      </form>
    </ModalShell>
  );
}
