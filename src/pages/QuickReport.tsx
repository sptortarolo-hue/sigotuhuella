import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, HeartHandshake, Frown, Camera, Loader2, CheckCircle2, AlertCircle, ArrowLeft, PawPrint, Share2, MapPin, Locate } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { compressImage } from '@/src/lib/storageService';
import LocationPicker from '@/src/components/LocationPicker';
import MapLoader from '@/src/components/MapLoader';

const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || '';

const SPECIES_OPTIONS = [
  { value: 'perro', label: 'Perro', icon: '🐕' },
  { value: 'gato', label: 'Gato', icon: '🐈' },
  { value: 'otro', label: 'Otro', icon: '🐾' },
];

const DEFAULT_CENTER = { lat: -34.9507, lng: -57.9583 };

type PageState = 'menu' | 'sighted' | 'retained' | 'submitting' | 'success' | 'error';

export default function QuickReport() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>('menu');
  const [errorMsg, setErrorMsg] = useState('');
  const [createdId, setCreatedId] = useState('');
  const [createdSpecies, setCreatedSpecies] = useState('');
  const [createdLocation, setCreatedLocation] = useState('');
  const [createdStatus, setCreatedStatus] = useState('');

  const [species, setSpecies] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [contactInfo, setContactInfo] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imageMimeTypes, setImageMimeTypes] = useState<string[]>([]);

  const resetForm = () => {
    setSpecies('');
    setDescription('');
    setLocation('');
    setCoordinates(null);
    setContactInfo('');
    setImages([]);
    setImageMimeTypes([]);
    setErrorMsg('');
    setCreatedId('');
  };

  const isValid = (pageState === 'sighted' || pageState === 'retained') &&
    species && description.trim().length >= 10 && location.trim().length >= 3;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles) return;
    const compressed = await Promise.all(
      Array.from(rawFiles).slice(0, 3 - images.length).map(f => compressImage(f))
    );
    for (const file of compressed) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        const base64 = result.split(',')[1];
        setImages(prev => [...prev, base64]);
        setImageMimeTypes(prev => [...prev, 'image/jpeg']);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
    setImageMimeTypes(prev => prev.filter((_, i) => i !== idx));
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoordinates(coords);
      },
      () => alert('No se pudo obtener la ubicación. Permití el acceso al GPS o marcá la ubicación en el mapa.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const submitReport = async (status: string) => {
    if (!isValid) return;
    setPageState('submitting');
    setErrorMsg('');
    try {
      const body: any = { species, description, location, status };
      if (coordinates) {
        body.latitude = coordinates.lat;
        body.longitude = coordinates.lng;
      }
      if (contactInfo && status === 'retained') body.contact_info = contactInfo;
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
      setCreatedSpecies(species);
      setCreatedLocation(location);
      setCreatedStatus(status);
      setPageState('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión');
      setPageState('error');
    }
  };

  const handleReset = () => {
    resetForm();
    setPageState('menu');
  };

  const goToMenu = () => {
    resetForm();
    setPageState('menu');
  };

  // Success screen
  if (pageState === 'success') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">¡Reporte enviado!</h1>
          <p className="text-gray-600 mb-6">
            Recibimos tu reporte. Los administradores ya fueron notificados.
            {createdStatus === 'sighted' && ' Ayudá a difundir para que llegue a su dueño.'}
            {createdStatus === 'retained' && ' En breve nos pondremos en contacto para coordinar.'}
          </p>
          <button onClick={() => {
              const msg = encodeURIComponent(
                `🐾 Se reportó un ${createdSpecies} ${createdStatus === 'sighted' ? 'avistado' : 'retenido'} en ${createdLocation}.\n\nMás info: https://sigotuhuella.online/pet/${createdId}\n\nAyudanos a difundir 🙏`
              );
              window.open(`https://wa.me/?text=${msg}`, '_blank');
            }} className="w-full mb-3 px-6 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all flex items-center justify-center gap-2">
              <Share2 className="w-5 h-5" /> Compartir en WhatsApp
            </button>
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

  // Forms for sighted/retained
  if (pageState === 'sighted' || pageState === 'retained') {
    return (
      <div className="min-h-[80vh] py-8 sm:py-12 px-4">
        <div className="max-w-lg mx-auto">
          <button onClick={goToMenu} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>

          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: pageState === 'sighted' ? '#fef3c7' : '#d1fae5' }}>
              {pageState === 'sighted'
                ? <Search className="w-8 h-8 text-amber-600" />
                : <HeartHandshake className="w-8 h-8 text-emerald-600" />
              }
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">
              {pageState === 'sighted' ? 'Vi una mascota en la calle' : 'Encontré una mascota y lo tengo'}
            </h1>
            <p className="text-gray-500 mt-2 text-sm sm:text-base">
              {pageState === 'sighted'
                ? 'Presumo que está perdida. Reportala para ayudar a encontrar a su dueño.'
                : 'Reportala para que podamos ayudar a encontrar a su dueño.'}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {pageState === 'error' && (
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

            {/* Description */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Descripción *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder={pageState === 'sighted' ? 'Color, tamaño, señas particulares, dónde lo viste...' : 'Color, tamaño, raza aproximada, señas particulares...'}
                className="w-full p-4 border border-brand-accent rounded-xl resize-none text-sm focus:outline-none focus:border-brand-primary transition-colors" rows={3} />
              <p className="text-xs text-gray-400 mt-1">{description.length} caracteres (mín. 10)</p>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Ubicación *</label>
              <input value={location} onChange={e => setLocation(e.target.value)}
                placeholder={pageState === 'sighted' ? 'Ej: Calle 7 y 52, Sicardi' : 'Ej: Calle 5 y 48, Garibaldi'}
                className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors mb-3" />

              <button onClick={getLocation} className="flex items-center gap-2 text-sm font-bold text-brand-primary bg-brand-primary/5 px-4 py-2.5 rounded-xl hover:bg-brand-primary/10 transition-colors mb-3">
                <MapPin className="w-4 h-4" /> Obtener mi ubicación actual
              </button>

              <MapLoader>
                <LocationPicker
                  initialCenter={coordinates || DEFAULT_CENTER}
                  selectedLocation={coordinates || undefined}
                  onLocationSelect={(coords) => setCoordinates(coords)}
                />
              </MapLoader>
              {coordinates && (
                <p className="text-xs text-green-600 mt-1">📍 Ubicación seleccionada</p>
              )}
            </div>

            {/* Contact info (only for retained) */}
            {pageState === 'retained' && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Contacto (opcional)</label>
                <input value={contactInfo} onChange={e => setContactInfo(e.target.value)}
                  placeholder="Teléfono, email o Instagram"
                  className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors" />
                <p className="text-xs text-gray-400 mt-1">Solo visible para administradores</p>
              </div>
            )}

            {/* Photos (only for retained) */}
            {pageState === 'retained' && (
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
            )}

            {/* Submit */}
            <button onClick={() => submitReport(pageState === 'sighted' ? 'sighted' : 'retained')}
              disabled={!isValid || pageState === 'submitting'}
              className="w-full py-4 bg-brand-primary text-white font-bold text-base rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2">
              {pageState === 'submitting' ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</> : 'Enviar reporte'}
            </button>

            <p className="text-xs text-gray-400 text-center">Al enviar aceptás que tus datos sean utilizados para la publicación del reporte.</p>
          </div>
        </div>
      </div>
    );
  }

  // Menu - landing with 3 options
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
          <p className="text-gray-500 mt-2 text-sm sm:text-base">Sin necesidad de registro. Elegí qué situación querés reportar:</p>
        </div>

        <div className="space-y-4">
          {/* Option 1: Sighted */}
          <button onClick={() => { resetForm(); setPageState('sighted'); }}
            className="w-full text-left p-5 sm:p-6 rounded-2xl border-2 border-amber-200 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-300 transition-all group">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Search className="w-7 h-7 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-gray-800">Vi una mascota en la calle</h3>
                <p className="text-sm text-gray-500 mt-1">Presumo que está perdida. Reportala para ayudar a encontrar a su dueño.</p>
              </div>
            </div>
          </button>

          {/* Option 2: Retained */}
          <button onClick={() => { resetForm(); setPageState('retained'); }}
            className="w-full text-left p-5 sm:p-6 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-300 transition-all group">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <HeartHandshake className="w-7 h-7 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-gray-800">Encontré una mascota y lo tengo</h3>
                <p className="text-sm text-gray-500 mt-1">La tenés con vos y querés ayudar a que vuelva a su hogar.</p>
              </div>
            </div>
          </button>

          {/* Option 3: Lost my pet */}
          <button onClick={() => navigate('/perdi-mi-mascota')}
            className="w-full text-left p-5 sm:p-6 rounded-2xl border-2 border-red-200 bg-red-50/50 hover:bg-red-50 hover:border-red-300 transition-all group">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-red-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Frown className="w-7 h-7 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-gray-800">Perdí mi mascota</h3>
                <p className="text-sm text-gray-500 mt-1">Completá un formulario completo con todos los datos. Te avisaremos si aparece.</p>
              </div>
            </div>
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-8">Al enviar aceptás que tus datos sean utilizados para la publicación del reporte.</p>
      </div>
    </div>
  );
}