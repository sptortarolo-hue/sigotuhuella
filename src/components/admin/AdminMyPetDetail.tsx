import { useState } from 'react';
import { cn } from '@/src/lib/utils';
import { formatTag } from '@/src/lib/personalityTags';
import { formatDate } from '@/src/lib/formatDate';
import { api } from '@/src/lib/api';
import {
  PawPrint, Syringe, Scissors, Bug, ExternalLink, Download,
  Edit3, QrCode, Copy, Check, Heart, Stethoscope, Phone, Image as ImageIcon, Loader2, Trash2
} from 'lucide-react';
import QRCode from 'qrcode';
import ImageLightbox from './ImageLightbox';

const PET_TYPE_BADGE: Record<string, { label: string; bg: string }> = {
  own:       { label: 'Propia',       bg: 'bg-blue-100 text-blue-700' },
  foster:    { label: 'Tránsito',     bg: 'bg-amber-100 text-amber-700' },
  adoption:  { label: 'Adopción',     bg: 'bg-rose-100 text-rose-700' },
  community: { label: 'Comunitaria',  bg: 'bg-purple-100 text-purple-700' },
};

function getAge(birthDate: string) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (months < 0) { years--; months += 12; }
  if (years === 0) return `${months} mes${months !== 1 ? 'es' : ''}`;
  if (months === 0) return `${years} año${years !== 1 ? 's' : ''}`;
  return `${years} año${years !== 1 ? 's' : ''} y ${months} mes${months !== 1 ? 'es' : ''}`;
}

interface AdminMyPetDetailProps {
  pet: any;
  onClose?: () => void;
  isMobile?: boolean;
  onEdit?: () => void;
  onDelete?: (pet: any) => void;
  onReplaced?: () => void;
}

export default function AdminMyPetDetail({ pet, onClose, isMobile, onEdit, onDelete, onReplaced }: AdminMyPetDetailProps) {
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrRequested, setQrRequested] = useState(false);
  const [showReplaceForm, setShowReplaceForm] = useState(false);
  const [freeQrs, setFreeQrs] = useState<any[]>([]);
  const [freeQrsLoading, setFreeQrsLoading] = useState(false);
  const [replaceQrId, setReplaceQrId] = useState('');
  const [replaceLoading, setReplaceLoading] = useState(false);

  const handleOpenReplace = async () => {
    setShowReplaceForm(true);
    setReplaceQrId('');
    try {
      setFreeQrsLoading(true);
      const data: any = await api.qr.unassigned();
      setFreeQrs(data.identifiers || []);
    } catch (e: any) {
      alert(e?.message || 'Error al cargar QRs libres');
    } finally {
      setFreeQrsLoading(false);
    }
  };

  const handleReplace = async () => {
    if (!replaceQrId) return;
    if (!window.confirm(`Reponer chapita de ${pet.name} (${pet.qr_data?.code}) con el código seleccionado? La anterior quedará dada de baja.`)) return;
    setReplaceLoading(true);
    try {
      const result: any = await api.qr.replace(pet.id, replaceQrId);
      alert(`Chapita repuesta: ${result.old_code} → ${result.new_code}. La anterior quedó dada de baja.`);
      setShowReplaceForm(false);
      onReplaced?.();
    } catch (e: any) {
      alert(e?.message || 'Error al reponer chapita');
    } finally {
      setReplaceLoading(false);
    }
  };

  const handleSinglePdf = async () => {
    try {
      await api.qr.singlePdf(pet.qr_data.id, pet.qr_data.code);
    } catch (e: any) {
      alert(e?.message || 'Error al descargar PDF');
    }
  };

  const handleRequestQr = async () => {
    setQrLoading(true);
    try {
      await api.myPets.requestQr(pet.id);
      setQrRequested(true);
    } catch (e: any) {
      alert(e?.message || 'Error al solicitar QR');
    } finally {
      setQrLoading(false);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  const handleDownloadQr = async () => {
    try {
      const url = `${window.location.origin}/mascota/${pet.qr_data.share_token}`;
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: '#5A5A40', light: '#ffffff' },
      });
      const link = document.createElement('a');
      link.download = `qr-${pet.qr_data.code || pet.qr_data.share_token}.png`;
      link.href = qrDataUrl;
      link.click();
    } catch (err) {
      console.error('Error generando QR:', err);
    }
  };

  const allImages: string[] = [];
  if (pet.avatar_image) allImages.push(`data:${pet.avatar_mime_type || 'image/jpeg'};base64,${pet.avatar_image}`);
  (pet.photos || []).forEach((p: any) => {
    if (p.image_data) allImages.push(`data:${p.mime_type || 'image/jpeg'};base64,${p.image_data}`);
  });

  const avatarSrc = allImages[0] || null;

  const openLightbox = (idx: number) => {
    if (allImages.length > 0) { setLightboxImages(allImages); setLightboxIndex(idx); }
  };

  const infoFields = [
    { label: 'Nombre', value: pet.name },
    { label: 'Especie', value: pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otro' },
    { label: 'Raza', value: pet.breed },
    { label: 'Color', value: pet.color },
    { label: 'Sexo', value: pet.gender === 'male' ? 'Macho' : pet.gender === 'female' ? 'Hembra' : 'Desconocido' },
    { label: 'Nacimiento', value: pet.birth_date ? formatDate(pet.birth_date) : null },
    { label: 'Edad', value: getAge(pet.birth_date) },
    { label: 'Chip ID', value: pet.chip_id },
    { label: 'Peso', value: pet.weight_kg ? `${pet.weight_kg} kg` : null },
  ].filter(f => f.value);

  return (
    <div className={cn("space-y-5", isMobile ? "p-4" : "p-6")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-brand-bg overflow-hidden shrink-0 border-2 border-brand-accent">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt=""
                className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => openLightbox(0)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300"><PawPrint className="w-8 h-8" /></div>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-lg text-brand-primary truncate">{pet.name}</h3>
            <p className="text-sm text-gray-500">
              {pet.species === 'dog' ? 'Perro' : pet.species === 'cat' ? 'Gato' : 'Otro'}
              {pet.breed ? ` · ${pet.breed}` : ''}
              {getAge(pet.birth_date) ? ` · ${getAge(pet.birth_date)}` : ''}
            </p>
            {pet.pet_type && pet.pet_type !== 'own' && (
              <span className={cn("inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-bold", PET_TYPE_BADGE[pet.pet_type]?.bg)}>
                {PET_TYPE_BADGE[pet.pet_type]?.label}
              </span>
            )}
            {pet.personality_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {pet.personality_tags.map((tag: string) => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded-full">{formatTag(tag)}</span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          {onEdit && (
            <button onClick={onEdit}
              className="px-4 py-2 bg-brand-primary text-white rounded-xl font-bold text-xs hover:shadow-lg transition-all flex items-center gap-2">
              <Edit3 className="w-3 h-3" /> Editar mascota
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete?.(pet)}
              className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold text-xs hover:bg-red-100 transition-colors flex items-center gap-2">
              <Trash2 className="w-3 h-3" /> Eliminar
            </button>
          )}
        </div>
      </div>

      {/* Bio */}
      {pet.bio && (
        <div className="p-4 bg-brand-bg rounded-2xl">
          <p className="text-sm text-gray-600 italic">"{pet.bio}"</p>
        </div>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3">
        {infoFields.map(field => (
          <div key={field.label} className="p-3 bg-brand-bg rounded-xl">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{field.label}</p>
            <p className="text-sm font-medium text-gray-800 mt-0.5">{field.value}</p>
          </div>
        ))}
      </div>

      {/* Health flags */}
      <div className="flex flex-wrap gap-2">
        {pet.is_vaccinated && (
          <span className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-medium">
            <Syringe className="w-3 h-3" /> Vacunado
          </span>
        )}
        {pet.is_sterilized && (
          <span className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-medium">
            <Scissors className="w-3 h-3" /> Esterilizado
          </span>
        )}
        {pet.is_dewormed && (
          <span className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-xl text-xs font-medium">
            <Bug className="w-3 h-3" /> Desparasitado
          </span>
        )}
      </div>

      {/* Behavior notes */}
      {pet.behavior_notes && (
        <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
          <h4 className="text-xs font-bold uppercase tracking-widest text-orange-600 mb-1 flex items-center gap-1.5">
            <Heart className="w-3 h-3" /> Comportamiento
          </h4>
          <p className="text-sm text-gray-600">{pet.behavior_notes}</p>
        </div>
      )}

      {/* Medical notes */}
      {pet.medical_notes && (
        <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
          <h4 className="text-xs font-bold uppercase tracking-widest text-red-600 mb-1 flex items-center gap-1.5">
            <Stethoscope className="w-3 h-3" /> Notas médicas
          </h4>
          <p className="text-sm text-gray-600">{pet.medical_notes}</p>
        </div>
      )}

      {/* Emergency phone */}
      {pet.emergency_phone && (
        <div className="flex items-center gap-2 p-3 bg-brand-bg rounded-xl">
          <Phone className="w-4 h-4 text-brand-primary shrink-0" />
          <span className="text-sm text-gray-600">Tel. emergencia: <strong>{pet.emergency_phone}</strong></span>
        </div>
      )}

      {/* Photos gallery */}
      {(pet.photos || []).filter((p: any) => p.id !== 'avatar' || !pet.avatar_image).length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
            <ImageIcon className="w-3 h-3" /> Fotos ({pet.photos?.length || 0})
          </h4>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {(pet.photos || []).map((photo: any, idx: number) => {
              const dataUri = photo.image_data
                ? `data:${photo.mime_type || 'image/jpeg'};base64,${photo.image_data}`
                : null;
              return dataUri ? (
                <div key={photo.id} className="aspect-square rounded-xl overflow-hidden bg-brand-bg cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => openLightbox(idx + (pet.avatar_image ? 1 : 0))}>
                  <img src={dataUri} alt="" className="w-full h-full object-cover" />
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* QR */}
      {pet.qr_data ? (
        <div className="border border-brand-accent rounded-2xl p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
            <QrCode className="w-4 h-4" /> Identificación QR
          </h4>
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 shrink-0 bg-brand-bg rounded-xl flex items-center justify-center">
              <QrCode className="w-12 h-12 text-brand-primary/40" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <p className="text-sm font-bold text-brand-primary">{pet.qr_data.code}</p>
              <p className="text-[10px] text-gray-400 break-all">Token: {pet.qr_data.share_token}</p>
              <div className="flex gap-2 flex-wrap">
                <a href={`${window.location.origin}/mascota/${pet.qr_data.share_token}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-primary font-medium hover:underline">
                  <ExternalLink className="w-3 h-3" /> Perfil público
                </a>
                <button onClick={() => copyToClipboard(`${window.location.origin}/mascota/${pet.qr_data.share_token}`, 'qr')}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 font-medium hover:text-brand-primary">
                  {copied === 'qr' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === 'qr' ? 'Copiado' : 'Copiar link'}
                </button>
                <button onClick={handleDownloadQr}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 font-medium hover:text-brand-primary">
                  <Download className="w-3 h-3" /> Descargar QR
                </button>
                {pet.qr_data?.id && (
                  <button onClick={handleSinglePdf}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 font-medium hover:text-brand-primary">
                    <Download className="w-3 h-3" /> PDF chapita
                  </button>
                )}
                <button onClick={handleOpenReplace}
                  className="inline-flex items-center gap-1 text-xs text-amber-700 font-bold hover:text-amber-900">
                  <QrCode className="w-3 h-3" /> Reponer chapita
                </button>
              </div>
              {pet.qr_replacement_requested && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                  El dueño pidió reposición por {pet.qr_replacement_reason === 'deteriorada' ? 'deterioro' : 'pérdida'}
                  {pet.qr_replacement_requested_at ? ` el ${formatDate(pet.qr_replacement_requested_at)}` : ''}.
                </p>
              )}
              {showReplaceForm && (
                <div className="mt-2 p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
                  <p className="text-[11px] text-amber-800 font-bold">La chapita {pet.qr_data.code} quedará dada de baja y dejará de funcionar.</p>
                  <select
                    value={replaceQrId}
                    onChange={e => setReplaceQrId(e.target.value)}
                    disabled={freeQrsLoading || replaceLoading}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-amber-300 text-xs outline-none disabled:opacity-50"
                  >
                    <option value="" disabled>{freeQrsLoading ? 'Cargando…' : 'Elegí la chapita nueva…'}</option>
                    {freeQrs.map((qr: any) => (
                      <option key={qr.id} value={qr.id}>{qr.code}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button onClick={handleReplace} disabled={!replaceQrId || replaceLoading}
                      className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-1">
                      {replaceLoading && <Loader2 className="w-3 h-3 animate-spin" />} Confirmar reposición
                    </button>
                    <button onClick={() => setShowReplaceForm(false)}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-brand-accent rounded-2xl p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-2">
            <QrCode className="w-4 h-4" /> Identificación QR
          </h4>
          {pet.qr_requested || qrRequested ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
              Solicitud de QR enviada. El admin la verá en la pestaña Chapitas y podrá asignar el código.
            </div>
          ) : (
            <button
              onClick={handleRequestQr}
              disabled={qrLoading}
              className="w-full px-4 py-2.5 bg-brand-primary/10 text-brand-primary rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-brand-primary/20 transition-colors disabled:opacity-50"
            >
              {qrLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <QrCode className="w-3 h-3" />}
              Solicitar identificación QR
            </button>
          )}
        </div>
      )}

      {onClose && (
        <button onClick={onClose} className="w-full py-2.5 border border-brand-accent rounded-xl text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors">
          Cerrar
        </button>
      )}

      {lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxImages([])}
          onChange={setLightboxIndex}
        />
      )}
    </div>
  );
}
