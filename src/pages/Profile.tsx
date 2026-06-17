import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { useNavigate } from 'react-router-dom';
import {
  User, Lock, Save, Loader2, CheckCircle2, AlertCircle,
  Phone as PhoneIcon, Camera, Upload, PawPrint, CreditCard,
  ChevronRight, LogOut, Shield, Bell, BellOff, Settings,
  Trophy,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ImageCropper from '@/src/components/ImageCropper';
import { fileToBase64 } from '@/src/lib/storageService';
import { subscribe, unsubscribe, isSubscribed, isSupported } from '@/src/lib/pushService';
import { cn } from '@/src/lib/utils';

type Section = 'profile' | 'password' | null;

export default function Profile() {
  const { user, login, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [openSection, setOpenSection] = useState<Section>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const isMember = user?.member_number && user?.volunteer_status !== 'none';
  const { isAdmin, loading } = useAuth();

  const [statsData, setStatsData] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [gamification, setGamification] = useState<any>(null);
  const [gamificationLoading, setGamificationLoading] = useState(false);
  const [myPetsCount, setMyPetsCount] = useState(0);

  useEffect(() => {
    if (user && isMember) {
      setStatsLoading(true);
      setGamificationLoading(true);
      Promise.all([
        api.users.stats(user.id).then(data => setStatsData(data)),
        api.gamification.myStats().then(data => setGamification(data)),
        api.users.myPets(user.id).then(data => setMyPetsCount((data.pets || []).length)),
      ]).catch(err => console.error('Error al cargar estadísticas:', err))
        .finally(() => { setStatsLoading(false); setGamificationLoading(false); });
    }
  }, [user]);

  useEffect(() => {
    isSupported().then(async (ok) => {
      if (!ok) { setPushEnabled(null); return; }
      const sub = await isSubscribed();
      setPushEnabled(sub);
    });
  }, []);

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMsg('');
    setProfileError('');
    try {
      const data = await api.users.update(user.id, { displayName, phone });
      updateUser({ display_name: data.user.display_name, phone: data.user.phone });
      setProfileMsg('Datos actualizados');
    } catch (err: any) {
      setProfileError(err.message || 'Error al actualizar');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropFile(file);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCropFile(null);
    setAvatarLoading(true);
    setProfileMsg('');
    setProfileError('');
    try {
      const { data, mimeType } = await fileToBase64(new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' }));
      const res = await api.users.uploadAvatar(user.id, { imageData: data, mimeType });
      updateUser({
        avatar_data: res.avatar.avatar_data,
        avatar_mime_type: res.avatar.avatar_mime_type,
        avatar_type: res.avatar.avatar_type,
      });
      setProfileMsg('Foto de perfil actualizada');
    } catch (err: any) {
      setProfileError(err.message || 'Error al subir foto');
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleCropCancel = () => setCropFile(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordMsg('');
    setPasswordError('');
    try {
      await api.users.changePassword(user.id, currentPassword, newPassword);
      setPasswordMsg('Contraseña cambiada');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Error al cambiar contraseña');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleBellClick = async () => {
    if (pushEnabled) {
      const ok = await unsubscribe();
      if (ok) setPushEnabled(false);
    } else {
      const ok = await subscribe();
      if (ok) setPushEnabled(true);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const menuItems = [
    {
      icon: <CreditCard className="w-5 h-5" />,
      label: 'Mi Carnet Digital',
      desc: isMember ? `Credencial Nº ${user.member_number}` : 'Asociate para obtener tu carnet',
      onClick: () => isMember ? navigate('/mi-carnet') : navigate('/sumate'),
      show: true,
    },
    {
      icon: <Settings className="w-5 h-5" />,
      label: 'Editar Perfil',
      desc: 'Nombre, teléfono y foto',
      onClick: () => setOpenSection(openSection === 'profile' ? null : 'profile'),
      show: true,
    },
    {
      icon: pushEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />,
      label: pushEnabled ? 'Notificaciones activadas' : 'Notificaciones',
      desc: pushEnabled ? 'Tocá para desactivar' : 'Activá las notificaciones push',
      onClick: handleBellClick,
      show: pushEnabled !== null,
    },
    {
      icon: <Lock className="w-5 h-5" />,
      label: 'Cambiar Contraseña',
      desc: 'Actualizá tu clave de acceso',
      onClick: () => setOpenSection(openSection === 'password' ? null : 'password'),
      show: true,
    },
  ];

  const statItems = [
    { label: 'Reportes', value: statsData?.stats?.total_reports ?? 0 },
    { label: 'Encuentros', value: statsData?.stats?.reunited_count ?? 0 },
    { label: 'Mascotas', value: myPetsCount },
    { label: 'Puntos', value: gamification?.points ?? 0 },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center mb-8"
      >
        <div className="relative mb-4">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-brand-accent bg-brand-bg">
            {user?.avatar_type === 'photo' && user?.avatar_data ? (
              <img
                src={`data:${user.avatar_mime_type};base64,${user.avatar_data}`}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-10 h-10 text-brand-primary" />
              </div>
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-7 h-7 bg-brand-primary text-white rounded-full flex items-center justify-center border-2 border-white"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
        </div>

        <h1 className="text-xl font-bold text-gray-900">{user.display_name || 'Usuario'}</h1>
        <p className="text-sm text-gray-500">{user.email}</p>

        {isMember && (
          <span className="mt-2 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
            ★ Socio · Nivel {statsData?.level?.name || '—'}
          </span>
        )}
      </motion.div>

      {/* Stats */}
      {isMember && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-brand-accent p-4 mb-6"
        >
          {statsLoading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="w-5 h-5 animate-spin text-brand-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 text-center">
              {statItems.map((item) => (
                <div key={item.label}>
                  <div className="text-xl font-bold text-brand-primary">{item.value}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{item.label}</div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Avatar loading overlay */}
      {avatarLoading && (
        <div className="flex justify-center mb-4">
          <Loader2 className="w-5 h-5 animate-spin text-brand-primary" />
        </div>
      )}

      {/* Menu */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-brand-accent overflow-hidden mb-6"
      >
        {menuItems.filter(m => m.show).map((item, i) => (
          <div key={i}>
            <button
              onClick={item.onClick}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-brand-bg/50",
                i < menuItems.filter(m => m.show).length - 1 && "border-b border-brand-accent"
              )}
            >
              <span className="text-brand-primary shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{item.label}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            </button>

            {/* Expandable sections */}
            <AnimatePresence>
              {(item.label === 'Editar Perfil' && openSection === 'profile') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b border-brand-accent"
                >
                  <div className="px-4 pb-4 pt-2 space-y-4 bg-brand-bg/30">
                    <form onSubmit={handleUpdateProfile} className="space-y-4">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Nombre</label>
                        <input type="text" className="w-full mt-1 px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm"
                          value={displayName} onChange={e => setDisplayName(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                          <PhoneIcon className="w-4 h-4" /> WhatsApp / Teléfono
                        </label>
                        <input type="tel" className="w-full mt-1 px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm"
                          placeholder="+54 9 221 123456" value={phone} onChange={e => setPhone(e.target.value)} />
                      </div>
                      {profileMsg && <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm flex gap-2 items-center"><CheckCircle2 className="w-4 h-4" />{profileMsg}</div>}
                      {profileError && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex gap-2 items-center"><AlertCircle className="w-4 h-4" />{profileError}</div>}
                      <button type="submit" disabled={profileLoading}
                        className="w-full px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg transition-all disabled:opacity-50"
                      >
                        {profileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar Cambios
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}

              {(item.label === 'Cambiar Contraseña' && openSection === 'password') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b border-brand-accent"
                >
                  <div className="px-4 pb-4 pt-2 space-y-4 bg-brand-bg/30">
                    <form onSubmit={handleChangePassword} className="space-y-4">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Contraseña Actual</label>
                        <input type="password" required className="w-full mt-1 px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm"
                          value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Nueva Contraseña</label>
                        <input type="password" required minLength={6} className="w-full mt-1 px-4 py-3 bg-white rounded-xl border border-brand-accent outline-none text-sm"
                          value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                      </div>
                      {passwordMsg && <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm flex gap-2 items-center"><CheckCircle2 className="w-4 h-4" />{passwordMsg}</div>}
                      {passwordError && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex gap-2 items-center"><AlertCircle className="w-4 h-4" />{passwordError}</div>}
                      <button type="submit" disabled={passwordLoading}
                        className="w-full px-6 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg transition-all disabled:opacity-50"
                      >
                        {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Cambiar Contraseña
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </motion.div>

      {/* Admin panel */}
      {isAdmin && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => navigate('/admin')}
          className="w-full flex items-center gap-3 px-4 py-4 bg-white rounded-2xl border border-brand-accent mb-4 text-left hover:bg-brand-primary/5 transition-all"
        >
          <Shield className="w-5 h-5 text-purple-600" />
          <div className="flex-1">
            <p className="text-sm font-bold text-purple-700">Panel Admin</p>
            <p className="text-xs text-gray-400">Gestionar usuarios, reportes y configuración</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </motion.button>
      )}

      {/* Logout */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-3 px-4 py-4 bg-white text-red-600 rounded-2xl border border-red-100 hover:bg-red-50 transition-all font-bold text-sm"
      >
        <LogOut className="w-5 h-5" /> Cerrar Sesión
      </motion.button>

      {/* Crop modal */}
      {cropFile && (
        <ImageCropper file={cropFile} aspect={1} onCropComplete={handleCropComplete} onCancel={handleCropCancel} />
      )}
    </div>
  );
}
