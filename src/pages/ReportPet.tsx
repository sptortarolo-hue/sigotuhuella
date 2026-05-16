import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import { createPet, PetStatus } from '@/src/lib/petService';
import { filesToBase64 } from '@/src/lib/storageService';
import MapLoader from '@/src/components/MapLoader';
import LocationPicker from '@/src/components/LocationPicker';
import {
  Camera,
  MapPin,
  Phone,
  FileText,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
  Locate,
  Share2,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PetCard from '@/src/components/PetCard';
import SocialShareModal from '@/src/components/SocialShareModal';
import AuthGate from '@/src/components/AuthGate';

const DEFAULT_CENTER = { lat: -34.9961, lng: -57.8524 };

export default function ReportPet() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [previewPet, setPreviewPet] = useState<any>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    species: 'dog' as 'dog' | 'cat' | 'other',
    breed: '',
    color: '',
    status: PetStatus.LOST,
    gender: 'unknown' as 'male' | 'female' | 'unknown',
    location: '',
    contactInfo: '',
    description: '',
    coordinates: null as { lat: number; lng: number } | null
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      if (files.length + selectedFiles.length > 3) {
        alert('Máximo 3 imágenes permitidas');
        return;
      }

      const newFiles = [...files, ...selectedFiles];
      setFiles(newFiles);

      const newPreviews = selectedFiles.map((file: File) => URL.createObjectURL(file));
      setPreviews([...previews, ...newPreviews]);
    }
  };

  
  const removeFile = (index: number) => {
    const newFiles = [...files];
    newFiles.splice(index, 1);
    setFiles(newFiles);

    const newPreviews = [...previews];
    URL.revokeObjectURL(newPreviews[index]);
    newPreviews.splice(index, 1);
    setPreviews(newPreviews);
  };

const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     setError('');

     if (files.length === 0) {
       setError('Debes subir al menos una imagen.');
       return;
     }

     if (!formData.coordinates) {
       setError('Por favor activa la ubicación en el mapa haciendo click donde fue visto.');
       return;
     }

     if (!formData.description.trim()) {
       setError('La descripción es obligatoria.');
       return;
     }

     if (!formData.location.trim()) {
       setError('La referencia de ubicación es obligatoria.');
       return;
     }

     if (!formData.contactInfo.trim()) {
       setError('El número de contacto es obligatorio.');
       return;
     }

     setLoading(true);
     try {
       const images = await filesToBase64(files);

       const petData = {
         name: formData.name || null,
         species: formData.species,
         breed: formData.breed || null,
         color: formData.color || null,
         status: formData.status,
         gender: formData.gender,
         description: formData.description,
         location: formData.location,
         latitude: formData.coordinates.lat,
         longitude: formData.coordinates.lng,
         contactInfo: formData.contactInfo,
         images,
       };

       const createdPet = await createPet(petData);

       setPreviewPet(createdPet);
       setSuccess(true);
       window.scrollTo({ top: 0, behavior: 'smooth' });
     } catch (err: any) {
       console.error(err);
       setError(err.message?.includes('400') || err.message?.includes('401')
         ? 'Error de autenticación. Recarga la página e intenta de nuevo.'
         : 'Hubo un error al publicar tu reporte. Por favor intenta de nuevo.');
     } finally {
       setLoading(false);
     }
   };




  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-brand-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <AuthGate
        title="Identificate para publicar"
        description="Para publicar un reporte de mascota perdida o encontrada, necesitamos que te identifiques."
        icon={<AlertCircle className="w-16 h-16 text-brand-secondary mx-auto mb-6" />}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary font-bold mb-6">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <AnimatePresence mode="wait">
        {success && previewPet ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-brand-accent shadow-xl text-center">
              <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-6" />
              <h1 className="text-4xl font-serif font-bold text-brand-primary mb-4">¡Publicado con éxito!</h1>
              <p className="text-gray-500 mb-8">Tu reporte ya es visible para toda la comunidad de Sicardi y Garibaldi.</p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => navigate('/perdidos')}
                  className="px-8 py-4 bg-brand-primary text-white rounded-2xl font-bold hover:shadow-lg transition-all"
                >
                  Ir a la Galería
                </button>
                <button
                  onClick={() => { setSuccess(false); setPreviewPet(null); }}
                  className="px-8 py-4 bg-white text-brand-primary border border-brand-accent rounded-2xl font-bold hover:border-brand-primary transition-all"
                >
                  Hacer otro reporte
                </button>
              </div>
            </div>

            <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-brand-accent shadow-xl">
              <h2 className="text-2xl font-serif font-bold text-brand-primary mb-8 text-center">Vista previa de tu publicación</h2>
              <div className="max-w-sm mx-auto">
                <PetCard pet={previewPet} />
              </div>

              <div className="mt-12 p-8 bg-brand-bg rounded-[2.5rem] border border-brand-accent text-center">
                <div className="w-12 h-12 bg-brand-secondary/10 text-brand-secondary rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Share2 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-brand-primary mb-2">Difundir es clave</h3>
                <p className="text-sm text-gray-500 mb-8">
                  Compartí esta publicación en tus redes sociales para que más personas puedan ayudar.
                </p>
                <button
                  onClick={() => setShowShareModal(true)}
                  className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all mx-auto"
                >
                  <Share2 className="w-5 h-5" />
                  Compartilo en redes sociales
                </button>
              </div>
              <AnimatePresence>
                {showShareModal && previewPet && (
                  <SocialShareModal pet={previewPet} onClose={() => setShowShareModal(false)} />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-8 md:p-12 rounded-[3rem] border border-brand-accent shadow-xl"
          >
            <div className="mb-10 text-center">
              <h1 className="text-4xl font-serif font-bold text-brand-primary mb-2">Reportar Mascota</h1>
              <p className="text-gray-500">Completa los datos para que la comunidad pueda ayudarte.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-4">
                <label className="text-sm font-bold uppercase tracking-widest text-gray-500 flex justify-between">
                  <span>Imágenes (1 a 3) *</span>
                  <span className={files.length === 3 ? "text-brand-secondary" : ""}>{files.length}/3</span>
                </label>

                <div className="grid grid-cols-3 gap-4">
                  {previews.map((preview, index) => (
                    <div key={index} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-brand-accent shadow-sm">
                      <img src={preview} className="w-full h-full object-cover" alt="Preview" />
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {files.length < 3 && (
                    <label className="aspect-square rounded-2xl border-2 border-dashed border-brand-accent hover:border-brand-primary hover:bg-brand-primary/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group">
                      <Camera className="w-8 h-8 text-gray-400 group-hover:text-brand-primary transition-colors" />
                      <span className="text-[10px] uppercase font-bold text-gray-400 group-hover:text-brand-primary">Subir Foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                        multiple={3 - files.length > 1}
                      />
                    </label>
                  )}
                </div>
                {files.length === 0 && <p className="text-xs text-red-500 font-medium tracking-wide">Es obligatorio subir al menos una foto clara de la mascota.</p>}
              </div>

<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                   <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Nombre (si lo tiene)</label>
                   <input
                     type="text"
                     className="w-full px-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                     placeholder="Eje: Firulais"
                     value={formData.name}
                     onChange={e => setFormData({ ...formData, name: e.target.value })}
                   />
                 </div>

                 <div className="space-y-2">
                   <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Estado *</label>
                   <select
                     required
                     className="w-full px-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent outline-none"
                     value={formData.status}
                     onChange={e => setFormData({ ...formData, status: e.target.value as PetStatus })}
                   >
                     <option value={PetStatus.LOST}>Se perdió</option>
                     <option value={PetStatus.RETAINED}>Está retenido</option>
                     <option value={PetStatus.SIGHTED}>Fue avistado</option>
                      <option value={PetStatus.ACCIDENTED}>Está accidentado</option>
                      <option value={PetStatus.NEEDS_ATTENTION}>Necesita atención</option>
                    </select>
                 </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Especie *</label>
                  <div className="flex gap-2">
                    {['dog', 'cat', 'other'].map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFormData({ ...formData, species: s as any })}
                        className={`flex-1 py-3 text-xs font-bold rounded-xl border transition-all ${
                          formData.species === s
                          ? 'bg-brand-primary border-brand-primary text-white shadow-md'
                          : 'bg-white border-brand-accent text-gray-500'
                        }`}
                      >
                        {s === 'dog' ? 'Perro' : s === 'cat' ? 'Gato' : 'Otro'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Sexo *</label>
                  <div className="flex gap-2">
                    {['male', 'female', 'unknown'].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setFormData({ ...formData, gender: g as any })}
                        className={`flex-1 py-3 text-xs font-bold rounded-xl border transition-all ${
                          formData.gender === g
                          ? 'bg-brand-primary border-brand-primary text-white shadow-md'
                          : 'bg-white border-brand-accent text-gray-500'
                        }`}
                      >
                        {g === 'male' ? 'Macho' : g === 'female' ? 'Hembra' : 'No sé'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                  <Locate className="w-3 h-3" />
                  ¿Dónde fue visto por última vez? (Marca en el mapa) *
                </label>

                <MapLoader>
                  <LocationPicker
                    initialCenter={DEFAULT_CENTER}
                    selectedLocation={formData.coordinates || undefined}
                    onLocationSelect={async (coords) => {
                      setFormData(prev => ({ ...prev, coordinates: coords }));
                      try {
                        const res = await fetch(
                          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&addressdetails=1&accept-language=es`,
                          { headers: { 'User-Agent': 'SigoTuHuella/1.0' } }
                        );
                        const data = await res.json();
                        if (data?.address) {
                          const parts: string[] = [];
                          if (data.address.road) parts.push(data.address.road);
                          if (data.address.house_number) parts.push(data.address.house_number);
                          const street = parts.join(' ');
                          if (street) {
                            setFormData(prev => ({ ...prev, location: street }));
                          }
                        }
                      } catch (e) {
                        console.error('Error al obtener dirección:', e);
                      }
                    }}
                  />
                </MapLoader>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Referencia escrita (Calle, esquina, etc.)</label>
                  <input
                    required
                    type="text"
                    placeholder="Ej: Calle 610 y 11"
                    className="w-full px-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                    value={formData.location}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                  <Phone className="w-3 h-3" />
                  Contacto (WhatsApp / Teléfono) *
                </label>
<input
                   required
                   type="text"
                   inputMode="numeric"
                   pattern="[0-9]*"
                   onChange={(e) => {
                     setFormData({ ...formData, contactInfo: e.target.value.replace(/\D/g, '') });
                   }}
                   placeholder="Eje: 2211234567 (Solo números)"
                   className="w-full px-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                   value={formData.contactInfo}
                 />
                <p className="text-[10px] text-gray-400">Ingresa solo los números de tu celular para que puedan contactarte por WhatsApp.</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                  <FileText className="w-3 h-3" />
                  Más detalles (Raza, color, collar, señas particulares) *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Cualquier información que ayude a reconocer a la mascota..."
                  className="w-full px-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none resize-none"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100 flex gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-brand-primary text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 font-serif text-xl"
              >
                {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
                Publicar Reporte
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}