import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Download, Loader2, ArrowRight, Camera, PawPrint, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { statusDesigns, drawFlyer } from '@/src/lib/flyerRenderer';
import ImageCropper from '@/src/components/ImageCropper';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate, Link } from 'react-router-dom';

interface Props {
  onClose: () => void;
}

function blobToBase64(blob: Blob): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const b64 = result.split(',')[1];
      resolve({ data: b64, mimeType: blob.type || 'image/jpeg' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export default function PublicFlyerGenerator({ onClose }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'preview' | 'done'>('form');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const [form, setForm] = useState({
    name: '', status: 'lost', species: 'perro', breed: '',
    location: '', contact_info: '', instagram: '', description: '',
  });
  const updateField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Photo state
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [caseNumber, setCaseNumber] = useState('');
  const [petId, setPetId] = useState('');

  const cleanPhoto = useCallback(() => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoBlob(null);
    setPhotoUrl(null);
  }, [photoUrl]);

  const handleFilePick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) { setPendingFile(file); setShowCropper(true); }
    };
    input.click();
  };

  const handleCropComplete = (blob: Blob) => {
    cleanPhoto();
    setPhotoBlob(blob);
    setPhotoUrl(URL.createObjectURL(blob));
    setShowCropper(false);
    setPendingFile(null);
  };

  const handleGenerate = async () => {
    if (!form.location && !form.contact_info) {
      setError('Completá al menos ubicación o teléfono');
      return;
    }
    if (!photoBlob) {
      setError('Agregá una foto de la mascota');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const encoded = await blobToBase64(photoBlob);
      const res = await fetch('/api/pets/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          images: [{ data: encoded.data, mimeType: encoded.mimeType }],
          neighborhoods: [],
        }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      const data = await res.json();
      const cn = data.pet.case_number || '';
      setCaseNumber(cn);
      setPetId(data.pet.id);

      // Use the server-returned image as the source
      const petImages = data.pet.images || [];
      const imgSrc = petImages.length > 0 && petImages[0].image_data
        ? `data:${petImages[0].mime_type || 'image/jpeg'};base64,${petImages[0].image_data}`
        : photoUrl;

      // Load both images in parallel, then render
      const [petImg, logoImg] = await Promise.all([
        loadImage(imgSrc!).catch(() => null),
        loadImage('/sigotuhuella.jpg').catch(() => null),
      ]);

      // Render on hidden canvas and preview canvas
      const w = 1080, h = 1080;
      const flyerData = {
        name: form.name, status: form.status, species: form.species,
        breed: form.breed, location: form.location, contact_info: form.contact_info,
        instagram: form.instagram, description: form.description, case_number: cn,
      };
      const design = statusDesigns[form.status] || statusDesigns.lost;

      [canvasRef.current, previewCanvasRef.current].forEach(canvas => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = w;
        canvas.height = h;
        drawFlyer(ctx, w, h, design, flyerData, petImg, logoImg);
      });

      setStep('preview');
      setSaving(false);
    } catch (e: any) {
      setError(e.message || 'Error al generar flyer');
      setSaving(false);
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `${caseNumber || 'flyer'}.png`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      setStep('done');
    }, 'image/png');
  };

  const previewScale = 240 / 1080;

  useEffect(() => {
    return () => { cleanPhoto(); };
  }, [cleanPhoto]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-brand-primary/30 backdrop-brightness-75" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-y-auto max-h-[90vh]"
      >
        <div className="p-6 sm:p-8 border-b border-brand-accent flex justify-between items-center bg-brand-bg/50 sticky top-0 z-10 bg-white">
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-brand-primary flex items-center gap-2">
            <Camera className="w-5 h-5 text-brand-secondary" />
            Flyer para redes
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-brand-accent rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          {step === 'form' && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">
                  Foto de la mascota
                </label>
                {photoUrl ? (
                  <div className="relative w-28 h-28 mx-auto">
                    <img src={photoUrl} alt="" className="w-full h-full object-cover rounded-2xl border-2 border-brand-accent" />
                    <button onClick={cleanPhoto}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md">
                      X
                    </button>
                  </div>
                ) : (
                  <button onClick={handleFilePick}
                    className="w-full h-28 border-2 border-dashed border-brand-accent rounded-2xl flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-brand-primary hover:text-brand-primary transition-all">
                    <Upload className="w-6 h-6" />
                    <span className="text-xs font-bold">Subir foto</span>
                  </button>
                )}
              </div>

              {showCropper && pendingFile && (
                <ImageCropper
                  file={pendingFile}
                  aspect={1}
                  onCropComplete={handleCropComplete}
                  onCancel={() => { setShowCropper(false); setPendingFile(null); }}
                />
              )}

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">Estado</label>
                <div className="flex gap-2">
                  {[
                    { value: 'lost', label: 'Perdido' },
                    { value: 'sighted', label: 'Avistado' },
                    { value: 'retained', label: 'Retenido' },
                  ].map(opt => (
                    <button key={opt.value}
                      onClick={() => updateField('status', opt.value)}
                      className={cn('flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all',
                        form.status === opt.value ? 'bg-brand-primary text-white border-brand-primary' : 'border-brand-accent text-gray-600'
                      )}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <input placeholder="Nombre de la mascota (opcional)"
                  value={form.name} onChange={e => updateField('name', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-accent text-sm focus:outline-none focus:border-brand-primary" />
                <div className="flex gap-3">
                  <select value={form.species} onChange={e => updateField('species', e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl border border-brand-accent text-sm focus:outline-none focus:border-brand-primary bg-white">
                    <option value="perro">Perro</option>
                    <option value="gato">Gato</option>
                    <option value="otro">Otro</option>
                  </select>
                  <input placeholder="Raza (opcional)" value={form.breed} onChange={e => updateField('breed', e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl border border-brand-accent text-sm focus:outline-none focus:border-brand-primary" />
                </div>
                <input placeholder="Zona / barrio" value={form.location} onChange={e => updateField('location', e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-accent text-sm focus:outline-none focus:border-brand-primary" />
                <div className="flex gap-3">
                  <input placeholder="Teléfono / WhatsApp" value={form.contact_info} onChange={e => updateField('contact_info', e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl border border-brand-accent text-sm focus:outline-none focus:border-brand-primary" />
                  <input placeholder="@Instagram" value={form.instagram} onChange={e => updateField('instagram', e.target.value)}
                    className="flex-1 px-4 py-3 rounded-xl border border-brand-accent text-sm focus:outline-none focus:border-brand-primary" />
                </div>
                <textarea placeholder="Descripción corta (opcional)" value={form.description} onChange={e => updateField('description', e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-brand-accent text-sm focus:outline-none focus:border-brand-primary resize-none" />
              </div>

              {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

              <button onClick={handleGenerate} disabled={saving}
                className="w-full py-3.5 bg-gradient-to-r from-brand-primary to-brand-secondary/80 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg transition-all disabled:opacity-70">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</> : <><PawPrint className="w-4 h-4" /> Generar flyer</>}
              </button>

              <p className="text-[10px] text-gray-400 text-center">
                Al generar, se crea un caso anónimo. Tu número aparece en el flyer.
              </p>
            </>
          )}

          {step === 'preview' && (
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-sm font-bold text-green-700">Flyer generado</span>
              </div>

              <div className="rounded-3xl border-4 border-brand-accent shadow-xl mx-auto overflow-hidden pointer-events-none select-none"
                style={{ width: Math.round(1080 * previewScale), height: Math.round(1080 * previewScale) }}>
                <canvas ref={previewCanvasRef}
                  className="block w-full h-full pointer-events-none select-none"
                  style={{ width: Math.round(1080 * previewScale), height: Math.round(1080 * previewScale) }}
                />
              </div>

              <p className="text-xs text-gray-500">
                Caso: <span className="font-bold text-brand-primary">{caseNumber}</span>
              </p>

              <button onClick={handleDownload}
                className="w-full py-3.5 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg transition-all">
                <Download className="w-4 h-4" /> Descargar flyer
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center space-y-5 py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <PawPrint className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-brand-primary">Caso {caseNumber} registrado</p>
                <p className="text-sm text-gray-500 mt-1">Flyer listo para compartir en redes.</p>
              </div>

              {!user ? (
                <div className="bg-brand-bg rounded-2xl p-5 border border-brand-accent space-y-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Creá tu cuenta gratis para:</p>
                  <ul className="text-sm text-gray-600 space-y-2 text-left">
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-brand-secondary rounded-full" /> Alertas de coincidencias</li>
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-brand-secondary rounded-full" /> Editar datos de tu caso</li>
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-brand-secondary rounded-full" /> Ver en el mapa</li>
                    <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-brand-secondary rounded-full" /> Seguimiento desde tu perfil</li>
                  </ul>
                  <button onClick={() => navigate(`/register?case=${caseNumber}`)}
                    className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg transition-all">
                    Crear cuenta gratis <ArrowRight className="w-4 h-4" />
                  </button>
                  <button onClick={onClose}
                    className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 font-bold">
                    Ahora no
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">Tu caso ya está vinculado a tu cuenta.</p>
                  <Link to={`/pet/${petId}`}
                    className="block w-full py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg transition-all text-center">
                    Ver mi caso
                  </Link>
                  <button onClick={onClose}
                    className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 font-bold">
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </motion.div>
    </div>
  );
}
