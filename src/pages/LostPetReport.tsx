import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Loader2, CheckCircle2, AlertCircle, MapPin, PawPrint, Mail, Phone, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { compressImage } from '@/src/lib/storageService';
import { api } from '@/src/lib/api';
import LocationPicker from '@/src/components/LocationPicker';
import MapLoader from '@/src/components/MapLoader';

const SPECIES_OPTIONS = [
  { value: 'perro', label: 'Perro', icon: '🐕' },
  { value: 'gato', label: 'Gato', icon: '🐈' },
  { value: 'otro', label: 'Otro', icon: '🐾' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Macho' },
  { value: 'female', label: 'Hembra' },
  { value: 'unknown', label: 'Desconocido' },
];

const AGE_OPTIONS = [
  { value: 'cachorro', label: 'Cachorro' },
  { value: 'joven', label: 'Joven' },
  { value: 'adulto', label: 'Adulto' },
  { value: 'mayor', label: 'Mayor' },
];

const SIZE_OPTIONS = [
  { value: 'chico', label: 'Chico' },
  { value: 'mediano', label: 'Mediano' },
  { value: 'grande', label: 'Grande' },
];

const DEFAULT_CENTER = { lat: -34.9507, lng: -57.9583 };

export default function LostPetReport() {
  const navigate = useNavigate();

  const [species, setSpecies] = useState('');
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [color, setColor] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [size, setSize] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imageMimeTypes, setImageMimeTypes] = useState<string[]>([]);

  const [pageStatus, setPageStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [createdId, setCreatedId] = useState('');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValid = species && description.trim().length >= 10 && location.trim().length >= 3 &&
    emailRegex.test(email) && images.length >= 1;

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
      (pos) => setCoordinates({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => alert('No se pudo obtener la ubicación. Permití el acceso al GPS o marcá la ubicación en el mapa.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Reverse geocoding: auto-fill address from coordinates
  useEffect(() => {
    if (!coordinates) return;
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coordinates.lat}&lon=${coordinates.lng}&addressdetails=1&accept-language=es`,
      { headers: { 'User-Agent': 'SigoTuHuella/1.0' } })
      .then(r => r.json())
      .then(data => {
        if (data?.address) {
          const parts: string[] = [];
          if (data.address.road) parts.push(data.address.road);
          if (data.address.house_number) parts.push(data.address.house_number);
          const street = parts.join(' ');
          if (street) setLocation(street);
        }
      })
      .catch(console.error);
  }, [coordinates]);

  const handleSubmit = async () => {
    if (!isValid) return;
    setPageStatus('submitting');
    setErrorMsg('');
    try {
      const body: any = {
        species, description, location, email,
        status: 'lost',
      };
      if (name) body.name = name;
      if (breed) body.breed = breed;
      if (color) body.color = color;
      if (gender) body.gender = gender;
      if (age) body.age = age;
      if (size) body.size = size;
      if (coordinates) { body.latitude = coordinates.lat; body.longitude = coordinates.lng; }
      if (phone) body.phone = phone;
      body.images = images.map((data, i) => ({ data, mimeType: imageMimeTypes[i] || 'image/jpeg' }));

      const data = await api.lostReport(body);
      setCreatedId(data.pet.id);
      setPageStatus('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error de conexión');
      setPageStatus('error');
    }
  };

  const handleReset = () => {
    setSpecies(''); setName(''); setBreed(''); setColor('');
    setGender(''); setAge(''); setSize(''); setDescription('');
    setLocation(''); setCoordinates(null); setEmail(''); setPhone('');
    setImages([]); setImageMimeTypes([]);
    setPageStatus('idle'); setErrorMsg(''); setCreatedId('');
  };

  if (pageStatus === 'success') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">¡Reporte enviado!</h1>
          <p className="text-gray-600 mb-4">
            Recibimos tu reporte. Te enviamos un email con el resumen y las instrucciones para completar tu registro.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left text-sm text-blue-800">
            <p className="font-bold mb-2">📧 Revisá tu casilla de email</p>
            <ul className="space-y-2 text-blue-700">
              <li>• Resumen de tu reporte</li>
              <li>• Notificaciones automáticas de mascotas similares encontradas</li>
              <li>• Invitación a crear tu contraseña para gestionar tu publicación</li>
            </ul>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={handleReset} className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all">
              Reportar otra mascota
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
        <button onClick={() => navigate('/reportar-rapido')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver a reporte rápido
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <PawPrint className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">Perdí mi mascota</h1>
          <p className="text-gray-500 mt-2 text-sm sm:text-base">Completá todos los datos. Te avisaremos si encontramos una mascota similar.</p>
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

          {/* Name */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Nombre (opcional)</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Luna" className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors" />
          </div>

            {/* Breed + Color */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Raza (opcional)</label>
                <input value={breed} onChange={e => setBreed(e.target.value)} placeholder="Ej: Caniche" className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Color (opcional)</label>
                <input value={color} onChange={e => setColor(e.target.value)} placeholder="Ej: Marrón" className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors" />
              </div>
            </div>

            {/* Gender + Age */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Sexo (opcional)</label>
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setGender(opt.value)} className={`flex-1 p-2.5 rounded-xl border-2 text-xs font-bold transition-all ${gender === opt.value ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-accent hover:border-gray-300'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Edad (opcional)</label>
                <select value={age} onChange={e => setAge(e.target.value)} className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors bg-white">
                  <option value="">Seleccionar</option>
                  {AGE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

          {/* Size */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Tamaño (opcional)</label>
            <div className="flex gap-3">
              {SIZE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setSize(opt.value)} className={`flex-1 p-3 rounded-xl border-2 text-sm font-bold transition-all ${size === opt.value ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-accent hover:border-gray-300'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Descripción *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Contanos cómo es, señas particulares, comportamiento..."
              className="w-full p-4 border border-brand-accent rounded-xl resize-none text-sm focus:outline-none focus:border-brand-primary transition-colors" rows={3} />
            <p className="text-xs text-gray-400 mt-1">{description.length} caracteres (mín. 10)</p>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">¿Dónde se perdió? *</label>

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
              <p className="text-xs text-green-600 mt-2">📍 Ubicación seleccionada en el mapa</p>
            )}

            <input value={location} onChange={e => setLocation(e.target.value)}
              placeholder="Ej: Calle 7 y 52, Sicardi"
              className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors mt-3" />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Email * <span className="font-normal text-gray-400">(Te enviaremos el resumen y notificaciones)</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={email} onChange={e => setEmail(e.target.value)}
                placeholder="nombre@email.com" type="email"
                className="w-full pl-12 pr-4 py-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors" />
            </div>
            {email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && (
              <p className="text-xs text-red-500 mt-1">Formato de email inválido</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Teléfono/Contacto (opcional)</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="Ej: 221 555-5555"
                className="w-full pl-12 pr-4 py-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors" />
            </div>
            <p className="text-xs text-gray-400 mt-1">Visible al público para que puedan contactarte</p>
          </div>

          {/* Photos */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Fotos * <span className="font-normal text-gray-400">(mínimo 1, máximo 3)</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-brand-accent">
                  <img src={`data:${imageMimeTypes[i] || 'image/jpeg'};base64,${img}`} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeImage(i)} className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600">✕</button>
                </div>
              ))}
              {images.length < 3 && (
                <label className={`w-24 h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-brand-primary transition-colors ${images.length === 0 ? 'border-red-300 bg-red-50' : 'border-brand-accent'}`}>
                  <Camera className="w-6 h-6 text-gray-400" />
                  <span className="text-xs text-gray-400 mt-1">{images.length === 0 ? 'Agregar' : 'Agregar'}</span>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              )}
            </div>
            {images.length === 0 && <p className="text-xs text-red-500 mt-1">Necesitás al menos 1 foto</p>}
            {images.length > 0 && <p className="text-xs text-gray-400 mt-1">{images.length}/3 fotos cargadas</p>}
          </div>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!isValid || pageStatus === 'submitting'}
            className="w-full py-4 bg-brand-primary text-white font-bold text-base rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2">
            {pageStatus === 'submitting' ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</> : 'Enviar reporte'}
          </button>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-bold mb-1">📧 ¿Qué pasa después?</p>
            <p>Te enviaremos un email con el resumen de tu reporte y te avisaremos automáticamente si aparece una mascota similar en la zona.</p>
          </div>
        </div>
      </div>
    </div>
  );
}