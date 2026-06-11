import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { fileToBase64 } from '@/src/lib/storageService';
import ImageCropper from '@/src/components/ImageCropper';
import {
  PawPrint, ArrowLeft, Loader2, CheckCircle2, Dog, Cat,
  QrCode, Mail, Lock, Phone, User, Camera, Syringe, Scissors, Bug, RefreshCw,
  Plus,
} from 'lucide-react';
import { motion } from 'motion/react';

const SPECIES_OPTIONS = [
  { value: 'dog', label: 'Perro', icon: <Dog className="w-5 h-5" /> },
  { value: 'cat', label: 'Gato', icon: <Cat className="w-5 h-5" /> },
  { value: 'other', label: 'Otro', icon: <PawPrint className="w-5 h-5" /> },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Macho' },
  { value: 'female', label: 'Hembra' },
  { value: 'unknown', label: 'No sé' },
];

const emptyPetForm = {
  name: '', species: 'dog' as 'dog' | 'cat' | 'other', breed: '', color: '',
  gender: 'unknown' as string, birth_date: '', bio: '',
  is_vaccinated: false, is_sterilized: false, is_dewormed: false,
  behavior_notes: '', medical_notes: '', emergency_phone: '',
};

export default function SolicitarChapita() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qrToken = searchParams.get('qr');

  const [pet, setPet] = useState({ ...emptyPetForm });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentMessage, setResentMessage] = useState('');

  const [pets, setPets] = useState<any[] | null>(null);
  const [petsLoading, setPetsLoading] = useState(false);
  const [showNewPetForm, setShowNewPetForm] = useState(false);
  const [assignLoading, setAssignLoading] = useState<string | null>(null);
  const [assignDone, setAssignDone] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && pets === null) {
      setPetsLoading(true);
      api.myPets.list().then(r => setPets(r || [])).catch(() => setPets([])).finally(() => setPetsLoading(false));
    }
  }, [user]);

  const handleAssignToPet = async (petId: string) => {
    setAssignLoading(petId);
    setError('');
    try {
      if (qrToken) {
        await api.qr.assignByToken(qrToken, petId);
        navigate(`/mascota/${qrToken}`, { replace: true });
      } else {
        await api.myPets.requestQr(petId);
        setAssignDone(true);
      }
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setAssignLoading(null);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
  };

  const handleCropComplete = (croppedBlob: Blob) => {
    const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(croppedBlob));
    setCropFile(null);
  };

  const handleCropCancel = () => {
    setCropFile(null);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    if (!pet.name || !pet.species) {
      setError('Completá el nombre y la especie de tu mascota');
      setLoading(false);
      return;
    }

    if (!user) {
      if (!email || !password) {
        setError('Completá tu email y contraseña para registrarte');
        setLoading(false);
        return;
      }
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden');
        setLoading(false);
        return;
      }
    }

    try {
      let avatarData: string | undefined;
      let avatarMime: string | undefined;
      if (avatarFile) {
        const result = await fileToBase64(avatarFile);
        avatarData = result.data;
        avatarMime = result.mimeType;
      }

      const payload: any = {
        pet: {
          ...pet,
          avatar_image: avatarData,
          avatar_mime_type: avatarMime,
          personality_tags: [],
        },
        share_token: qrToken || undefined,
      };

      if (!user) {
        payload.user = {
          email,
          password,
          displayName: displayName || email.split('@')[0],
          phone: phone || null,
        };
      }

      const data = await api.requestChapita(payload);

      if (data.requiresVerification) {
        setRequiresVerification(true);
        return;
      }

      if (data.share_token) {
        navigate(`/mascota/${data.share_token}`, { replace: true });
        return;
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  if (requiresVerification) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-10 h-10 text-amber-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">
            ¡Casi listo!
          </h1>
          <p className="text-gray-600 mb-2">
            {pet.name} ya está en lista para recibir su chappita QR.
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Solo falta confirmar tu email. Te enviamos un enlace de verificación a <strong>{email}</strong>.
            Hacé click en el enlace para activar tu cuenta.
          </p>
          <p className="text-gray-500 text-xs mb-1">
            Si no lo encontrás, revisá la carpeta de <strong>correo no deseado</strong> o spam.
          </p>
          <p className="text-gray-400 text-xs mb-6">El enlace vence en 48 horas. Si expiró, podés solicitar uno nuevo abajo.</p>

          {resentMessage && (
            <div className="mb-4 p-4 bg-green-50 rounded-xl border border-green-200 text-sm text-green-700">
              {resentMessage}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={async () => {
                setResending(true);
                setResentMessage('');
                try {
                  await api.auth.resendVerification(email);
                  setResentMessage('Email reenviado. Revisá tu casilla.');
                } catch {
                  setResentMessage('Error al reenviar. Intentá de nuevo.');
                } finally {
                  setResending(false);
                }
              }}
              disabled={resending}
              className="w-full px-6 py-3 bg-brand-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all"
            >
              {resending ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
              Reenviar email
            </button>
            <Link
              to="/login"
              className="w-full py-3 bg-white text-gray-600 border border-brand-accent rounded-xl font-bold text-center hover:bg-gray-50 transition-all text-sm"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (success || assignDone) {
    if (assignDone) {
      return (
        <div className="min-h-[80vh] flex items-center justify-center px-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center max-w-md"
          >
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">¡Solicitud enviada!</h1>
            <p className="text-gray-600 mb-6">Solicitaste una chappita QR para tu mascota. Te notificaremos cuando esté lista.</p>
            <button onClick={() => navigate('/mi-mascota', { replace: true })}
              className="w-full px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all">
              Ir a mis mascotas
            </button>
          </motion.div>
        </div>
      );
    }
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">
            ¡Solicitud enviada!
          </h1>
          <p className="text-gray-600 mb-2">
            {pet.name} ya está en lista para recibir su chappita identificadora QR.
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Te notificaremos cuando esté lista. Mientras tanto, podés completar el perfil de tu mascota.
          </p>
          <button
            onClick={() => navigate('/mi-mascota', { replace: true })}
            className="w-full px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all"
          >
            Ir a mis mascotas
          </button>
        </motion.div>
      </div>
    );
  }

  // Logged-in user with pets: show pet selector
  if (user && pets !== null && !showNewPetForm) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <button onClick={() => navigate('/mi-mascota')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a mis mascotas
        </button>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 shadow-xl"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-8 h-8 text-brand-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">
              {qrToken ? 'Asociar QR a una mascota' : 'Solicitar chappita QR'}
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              {qrToken
                ? 'Elegí a qué mascota querés asociar este código QR.'
                : 'Elegí una mascota para solicitar su chappita o registrá una nueva.'}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">{error}</div>
          )}

          {pets.length === 0 && (
            <div className="text-center py-8">
              <PawPrint className="w-12 h-12 text-brand-accent mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-4">Todavía no tenés mascotas registradas.</p>
            </div>
          )}

          {pets.length > 0 && (
            <div className="space-y-3 mb-6">
              {pets.map((p: any) => (
                <div key={p.id} className="flex items-center gap-4 p-4 bg-brand-bg rounded-2xl border border-brand-accent">
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-brand-primary/10 shrink-0">
                    {p.has_avatar ? (
                      <img src={`/my-pet-avatar/${p.id}`} alt={p.name} className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PawPrint className="w-5 h-5 text-brand-primary/40" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      {p.species === 'dog' ? 'Perro' : p.species === 'cat' ? 'Gato' : 'Otro'}
                      {p.breed ? ` · ${p.breed}` : ''}
                    </p>
                  </div>
                  <button onClick={() => handleAssignToPet(p.id)} disabled={assignLoading === p.id}
                    className="shrink-0 px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {assignLoading === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <QrCode className="w-3 h-3" />}
                    {qrToken ? 'Asociar QR' : 'Solicitar'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <button onClick={() => setShowNewPetForm(true)}
            className="w-full py-3 border-2 border-dashed border-brand-accent rounded-2xl text-sm text-gray-500 hover:text-brand-primary hover:border-brand-primary/50 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Registrar nueva mascota
          </button>
        </motion.div>
      </div>
    );
  }

  // Full form for:
  //   - not logged in users
  //   - logged-in users who clicked "Registrar nueva mascota"
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <button
        onClick={() => user ? setShowNewPetForm(false) : navigate(-1)}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] border border-brand-accent p-6 sm:p-8 shadow-xl"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <QrCode className="w-8 h-8 text-brand-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">
            {qrToken ? 'Creá el perfil digital de tu mascota' : 'Solicitar chappita identificadora'}
          </h1>
          <p className="text-gray-500 text-sm mt-2">
            {qrToken
              ? 'Completá los datos para asociar esta chappita QR a tu mascota.'
              : 'Protegé a tu mascota con una chappita QR. Completá los datos y te avisamos cuando esté lista.'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
            {error}
          </div>
        )}

        <div className="space-y-8">
          <div>
            <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2 mb-4">
              <PawPrint className="w-5 h-5" /> Datos de tu mascota
            </h2>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-2xl border-2 border-dashed border-brand-accent hover:border-brand-primary bg-brand-bg flex items-center justify-center overflow-hidden transition-colors shrink-0"
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8 text-brand-accent" />
                  )}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
                <div className="flex-1">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Nombre *</label>
                  <input
                    value={pet.name} onChange={e => setPet(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm"
                    placeholder="Nombre de tu mascota"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Especie *</label>
                <div className="grid grid-cols-3 gap-2">
                  {SPECIES_OPTIONS.map(opt => (
                    <button key={opt.value}
                      onClick={() => setPet(prev => ({ ...prev, species: opt.value as any }))}
                      className={`p-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                        pet.species === opt.value
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                          : 'border-brand-accent hover:border-brand-primary/50 text-gray-600'
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Raza</label>
                  <input value={pet.breed} onChange={e => setPet(prev => ({ ...prev, breed: e.target.value }))}
                    className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" placeholder="Ej: Labrador" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Color</label>
                  <input value={pet.color} onChange={e => setPet(prev => ({ ...prev, color: e.target.value }))}
                    className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" placeholder="Ej: Dorado" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Sexo</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {GENDER_OPTIONS.map(opt => (
                      <button key={opt.value}
                        onClick={() => setPet(prev => ({ ...prev, gender: opt.value }))}
                        className={`p-2 rounded-xl border text-xs font-medium transition-all ${
                          pet.gender === opt.value
                            ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                            : 'border-brand-accent hover:border-brand-primary/50 text-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Fecha de nacimiento</label>
                  <input type="date" value={pet.birth_date} onChange={e => setPet(prev => ({ ...prev, birth_date: e.target.value }))}
                    className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Señas particulares</label>
                <textarea value={pet.bio} onChange={e => setPet(prev => ({ ...prev, bio: e.target.value }))}
                  className="w-full mt-1 p-3 rounded-xl border border-brand-accent focus:border-brand-primary outline-none text-sm resize-none" rows={2}
                  placeholder="Manchas, cicatrices, comportamiento... (opcional)" />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Salud</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'is_vaccinated', label: 'Vacunado', icon: <Syringe className="w-3 h-3" /> },
                    { key: 'is_sterilized', label: 'Esterilizado', icon: <Scissors className="w-3 h-3" /> },
                    { key: 'is_dewormed', label: 'Desparasitado', icon: <Bug className="w-3 h-3" /> },
                  ].map(item => (
                    <button key={item.key}
                      onClick={() => setPet(prev => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))}
                      className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                        pet[item.key as keyof typeof pet]
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-brand-bg text-gray-400 border border-brand-accent'
                      }`}
                    >
                      {item.icon} {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Comportamiento</label>
                <textarea value={pet.behavior_notes || ''} onChange={e => setPet(prev => ({ ...prev, behavior_notes: e.target.value }))}
                  className="w-full p-3 rounded-xl border border-brand-accent bg-brand-bg outline-none text-sm resize-none" rows={2}
                  placeholder="¿Cómo es su comportamiento? (miedos, cómo acercarse, etc.)" />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Notas médicas</label>
                <textarea value={pet.medical_notes || ''} onChange={e => setPet(prev => ({ ...prev, medical_notes: e.target.value }))}
                  className="w-full p-3 rounded-xl border border-brand-accent bg-brand-bg outline-none text-sm resize-none" rows={2}
                  placeholder="Alergias, medicación, condiciones (opcional)" />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 block">Teléfono de emergencia</label>
                <input type="tel" value={pet.emergency_phone || ''} onChange={e => setPet(prev => ({ ...prev, emergency_phone: e.target.value }))}
                  className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm"
                  placeholder="Teléfono alternativo (opcional)" />
              </div>
            </div>
          </div>

          <div className="border-t border-brand-accent pt-8">
            <h2 className="text-lg font-bold text-brand-primary flex items-center gap-2 mb-4">
              <User className="w-5 h-5" /> Tus datos
            </h2>

            {user ? (
              <div className="p-4 bg-brand-accent/30 rounded-2xl border border-brand-accent">
                <p className="text-sm font-bold text-gray-800">{user.display_name || user.email}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
                <p className="text-xs text-gray-400 mt-1">Vas a solicitar la chappita con esta cuenta.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Nombre</label>
                  <input type="text" required className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm"
                    placeholder="Tu nombre" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <Mail className="w-3 h-3" /> Email *
                  </label>
                  <input type="email" required className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm"
                    placeholder="email@ejemplo.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <Phone className="w-3 h-3" /> WhatsApp / Teléfono
                  </label>
                  <input type="tel" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm"
                    placeholder="+54 9 221 123456" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <Lock className="w-3 h-3" /> Contraseña * <span className="font-normal normal-case text-gray-400">(mín. 6 caracteres)</span>
                  </label>
                  <input type="password" required minLength={6} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm"
                    placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <Lock className="w-3 h-3" /> Repetir contraseña *
                  </label>
                  <input type="password" required minLength={6} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none text-sm"
                    placeholder="Repetir contraseña" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <button onClick={handleSubmit} disabled={loading}
            className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold text-sm hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
            {qrToken ? 'Crear perfil digital' : 'Solicitar chappita QR'}
          </button>
        </div>
      </motion.div>

      {cropFile && (
        <ImageCropper file={cropFile} aspect={1} onCropComplete={handleCropComplete} onCancel={handleCropCancel} />
      )}
    </div>
  );
}
