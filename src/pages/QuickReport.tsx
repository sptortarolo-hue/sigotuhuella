import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Loader2, CheckCircle2, AlertCircle, ArrowLeft, PawPrint } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || '';

const SPECIES_OPTIONS = [
  { value: 'perro', label: 'Perro', icon: '🐕' },
  { value: 'gato', label: 'Gato', icon: '🐈' },
  { value: 'otro', label: 'Otro', icon: '🐾' },
];

const STATUS_OPTIONS = [
  { value: 'lost', label: 'Perdido/a', desc: 'Lo vi y está perdido' },
  { value: 'found', label: 'Encontrado/a', desc: 'Lo tengo conmigo o lo vi en la vía pública' },
];

type Status = 'idle' | 'submitting' | 'success' | 'error';

export default function QuickReport() {
  const navigate = useNavigate();
  const [species, setSpecies] = useState('');
  const [status, setStatus] = useState<'lost' | 'found'>('lost');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imageMimeTypes, setImageMimeTypes] = useState<string[]>([]);
  const [pageStatus, setPageStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [createdId, setCreatedId] = useState('');

  const isValid = species && description.trim().length >= 10 && location.trim().length >= 3;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < Math.min(files.length, 3 - images.length); i++) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        const base64 = result.split(',')[1];
        setImages(prev => [...prev, base64]);
        setImageMimeTypes(prev => [...prev, files[i].type]);
      };
      reader.readAsDataURL(files[i]);
    }
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
    setImageMimeTypes(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setPageStatus('submitting');
    setErrorMsg('');
    try {
      const body: any = { species, description, location, status };
      if (contactInfo) body.contact_info = contactInfo;
      if (images.length > 0) {
        body.images = images.map((data, i) => ({ data, mimeType: imageMimeTypes[i] || 'image/jpeg' }));
      }
      const res = await fetch('/api/pets/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al enviar el reporte');
      }
      const data = await res.json();
      setCreatedId(data.pet.id);
      setPageStatus('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión');
      setPageStatus('error');
    }
  };

  const handleReset = () => {
    setSpecies('');
    setStatus('lost');
    setDescription('');
    setLocation('');
    setContactInfo('');
    setImages([]);
    setImageMimeTypes([]);
    setPageStatus('idle');
    setErrorMsg('');
    setCreatedId('');
  };

  if (pageStatus === 'success') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">¡Reporte enviado!</h1>
          <p className="text-gray-600 mb-6">
            Recibimos tu reporte. Los administradores ya fueron notificados y en breve lo revisarán.
            {createdId && ' Si hay un match con una mascota perdida te contactaremos a la brevedad.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={handleReset} className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all">
              Reportar otro
            </button>
            <button onClick={() => navigate('/')} className="px-6 py-3 border border-brand-accent text-gray-600 rounded-xl font-bold hover:bg-brand-bg transition-all">
              Volver al inicio
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] py-8 sm:py-12 px-4">
      <div className="max-w-lg mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <PawPrint className="w-8 h-8 text-brand-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">Reporte rápido</h1>
          <p className="text-gray-500 mt-2 text-sm sm:text-base">Sin necesidad de registro. Completá los datos básicos y lo publicamos.</p>
        </div>

        <AnimatePresence mode="wait">
          {pageStatus === 'error' && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{errorMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-6">
          {/* Species */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Especie *</label>
            <div className="grid grid-cols-3 gap-3">
              {SPECIES_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setSpecies(opt.value)} className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${species === opt.value ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-accent hover:border-gray-300'}`}>
                  <span className="text-2xl">{opt.icon}</span>
                  <span className="text-sm font-bold">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Tipo de reporte *</label>
            <div className="grid grid-cols-2 gap-3">
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setStatus(opt.value as 'lost' | 'found')} className={`text-left p-4 rounded-xl border-2 transition-all ${status === opt.value ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-accent hover:border-gray-300'}`}>
                  <p className="text-sm font-bold">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Descripción *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Color, tamaño, señas particulares, raza aproximada..." className="w-full p-4 border border-brand-accent rounded-xl resize-none text-sm focus:outline-none focus:border-brand-primary transition-colors" rows={3} />
            <p className="text-xs text-gray-400 mt-1">{description.length} caracteres (mín. 10)</p>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Ubicación *</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Ej: Villa Garibaldi, La Plata" className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors" />
          </div>

          {/* Contact info */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Contacto (opcional)</label>
            <input value={contactInfo} onChange={e => setContactInfo(e.target.value)} placeholder="Teléfono, email o Instagram" className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors" />
            <p className="text-xs text-gray-400 mt-1">Solo visible para administradores</p>
          </div>

          {/* Photos */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Fotos (opcional, hasta 3)</label>
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-brand-accent">
                  <img src={`data:${imageMimeTypes[i] || 'image/jpeg'};base64,${img}`} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(i)} className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600">✕</button>
                </div>
              ))}
              {images.length < 3 && (
                <label className="w-24 h-24 border-2 border-dashed border-brand-accent rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-brand-primary transition-colors">
                  <Camera className="w-6 h-6 text-gray-400" />
                  <span className="text-xs text-gray-400 mt-1">Agregar</span>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              )}
            </div>
          </div>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!isValid || pageStatus === 'submitting'} className="w-full py-4 bg-brand-primary text-white font-bold text-base rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2">
            {pageStatus === 'submitting' ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</> : 'Enviar reporte'}
          </button>

          <p className="text-xs text-gray-400 text-center">Al enviar aceptas que tus datos sean utilizados para la publicación del reporte.</p>
        </div>
      </div>
    </div>
  );
}
