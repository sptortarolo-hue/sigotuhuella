import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { useNavigate } from 'react-router-dom';
import {
  User, Lock, Save, Loader2, CheckCircle2, AlertCircle,
  Phone as PhoneIcon, Camera, Upload, PawPrint, CreditCard,
  ChevronRight, LogOut, Shield, Bell, BellOff, Settings,
  Trophy, Trash2, Ban,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ImageCropper from '@/src/components/ImageCropper';
import { fileToBase64 } from '@/src/lib/storageService';
import { subscribe, unsubscribe, isSubscribed, isSupported } from '@/src/lib/pushService';
import { cn } from '@/src/lib/utils';
import { IS_PLAY_BUILD } from '@/src/lib/buildConfig';
import { NEIGHBORHOODS } from '@/src/lib/neighborhoods';

type Section = 'profile' | 'password' | 'blocked' | null;

export default function Profile() {
  const { user, login, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [notificationPreference, setNotificationPreference] = useState(user?.notification_preference || 'both');
  const [neighborhoods, setNeighborhoods] = useState<string[]>(
    Array.isArray(user?.neighborhoods) ? user.neighborhoods : (() => {
      try { return JSON.parse(user?.neighborhoods || '[]'); } catch { return []; }
    })()
  );
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
  const [phoneError, setPhoneError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedError, setBlockedError] = useState('');
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const isValidPhone = (p: string) => /^549\d{10}$/.test(p.replace(/\D/g, ''));

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    if (!value) { setPhoneError(''); return; }
    if (!isValidPhone(value)) {
      setPhoneError('Formato: 549XXXXXXXXXX (13 dígitos)');
    } else {
      setPhoneError('');
    }
  };

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
    if (phoneError) {
      setProfileError('El teléfono no tiene el formato correcto');
      return;
    }
    setProfileLoading(true);
    setProfileMsg('');
    setProfileError('');
    try {
      const data = await api.users.update(user.id, { displayName, phone, notificationPreference, neighborhoods });
      updateUser({ display_name: data.user.display_name, phone: data.user.phone, notification_preference: data.user.notification_preference, neighborhoods: data.user.neighborhoods });
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

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await unsubscribe();
    } catch { /* best effort: el server igual limpia los tokens */ }
    try {
      await api.auth.deleteAccount();
      logout();
      navigate('/', { replace: true });
    } catch (err: any) {
      setDeleteError(err.message || 'Error al eliminar la cuenta. Intentá de nuevo.');
      setDeleteLoading(false);
    }
  };

  const fetchBlocked = async () => {
    setBlockedLoading(true);
    setBlockedError('');
    try {
      const data = await api.blocks.list();
      setBlockedUsers(data.blocked || []);
    } catch (err: any) {
      setBlockedError(err.message || 'Error al cargar bloqueos');
    } finally {
      setBlockedLoading(false);
    }
  };

  const handleUnblock = async (userId: string) => {
    setUnblocking(userId);
    setBlockedError('');
    try {
      await api.blocks.unblock(userId);
      setBlockedUsers(prev => prev.filter(u => u.blocked_id !== userId));
    } catch (err: any) {
      setBlockedError(err.message || 'Error al desbloquear');
    } finally {
      setUnblocking(null);
    }
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
    {
      icon: <Ban className="w-5 h-5" />,
      label: 'Usuarios bloqueados',
      desc: blockedUsers.length > 0 ? `${blockedUsers.length} usuario(s) bloqueado(s)` : 'Gestioná tus bloqueos',
      onClick: () => {
        setOpenSection(prev => prev === 'blocked' ? null : 'blocked');
        if (blockedUsers.length === 0 && !blockedLoading) fetchBlocked();
      },
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
                          placeholder="549XXXXXXXXXX" value={phone} onChange={e => handlePhoneChange(e.target.value)} />
                        {phoneError && (
                          <p className="text-xs text-red-500 mt-1">{phoneError}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Canal de notificaciones</label>
                        <p className="text-xs text-gray-400 mb-3">Elegí cómo querés recibir las alertas de reportes, reencuentros y novedades</p>
                        <div className="space-y-2">
                          {[
                            { value: 'both', label: 'WhatsApp + Email' },
                            { value: 'whatsapp', label: 'Solo WhatsApp' },
                            { value: 'email', label: 'Solo Email' },
                          ].map(opt => (
                            <label key={opt.value} className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-brand-accent cursor-pointer text-sm">
                              <input type="radio" name="notifPref" value={opt.value}
                                checked={notificationPreference === opt.value}
                                onChange={e => setNotificationPreference(e.target.value)}
                                className="accent-brand-primary" />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1 block">Alertas de mi barrio</label>
                        <p className="text-xs text-gray-400 mb-3">Elegí los barrios donde querés recibir alertas vecinales de mascotas perdidas. Al elegirlos, aceptás recibir estas notificaciones push.</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {NEIGHBORHOODS.map(n => {
                            const active = neighborhoods.includes(n.id);
                            return (
                              <button key={n.id} type="button"
                                onClick={() => setNeighborhoods(prev => active ? prev.filter(x => x !== n.id) : [...prev, n.id])}
                                className={cn(
                                  "px-3 py-2 rounded-xl text-xs font-bold border transition-all",
                                  active ? "bg-brand-primary/15 text-brand-primary border-brand-primary" : "bg-white border-brand-accent text-gray-500 hover:border-brand-primary"
                                )}
                              >
                                {n.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {profileMsg && <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm flex gap-2 items-center"><CheckCircle2 className="w-4 h-4" />{profileMsg}</div>}
                      {profileError && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex gap-2 items-center"><AlertCircle className="w-4 h-4" />{profileError}</div>}
                      <button type="submit" disabled={profileLoading || !!phoneError}
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
              {(item.label === 'Usuarios bloqueados' && openSection === 'blocked') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b border-brand-accent"
                >
                  <div className="px-4 pb-4 pt-2 space-y-3 bg-brand-bg/30">
                    {blockedError && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {blockedError}
                      </div>
                    )}
                    {blockedLoading ? (
                      <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 animate-spin text-brand-primary" /></div>
                    ) : blockedUsers.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">No bloqueaste a nadie todavía.</p>
                    ) : (
                      blockedUsers.map(u => (
                        <div key={u.blocked_id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-brand-accent">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-brand-primary/10 flex items-center justify-center shrink-0">
                            {u.avatar_type === 'photo' && u.avatar_data ? (
                              <img src={`data:${u.avatar_mime_type};base64,${u.avatar_data}`} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-4 h-4 text-brand-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{u.display_name || 'Usuario'}</p>
                            <p className="text-[10px] text-gray-400">Bloqueado</p>
                          </div>
                          <button
                            onClick={() => handleUnblock(u.blocked_id)}
                            disabled={unblocking === u.blocked_id}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border border-brand-accent text-gray-500 hover:bg-brand-bg disabled:opacity-50"
                          >
                            {unblocking === u.blocked_id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            Desbloquear
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </motion.div>

      {/* Admin panel */}
      {!IS_PLAY_BUILD && isAdmin && (
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

      {/* Eliminar cuenta */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4"
      >
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full flex items-center justify-center gap-3 px-4 py-4 bg-red-50 text-red-500 rounded-2xl border border-red-200 hover:bg-red-100 transition-all font-bold text-sm"
          >
            <Trash2 className="w-5 h-5" /> Eliminar mi cuenta
          </button>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 sm:p-5">
            <p className="text-sm font-bold text-red-600 mb-2">¿Eliminar tu cuenta definitivamente?</p>
            <p className="text-xs text-gray-600 mb-4">
              Se borrarán tus datos personales, tus mascotas y publicaciones propias (los reportes públicos
              se conservan sin tus datos de contacto, por su valor para la comunidad). Esta acción no se puede deshacer.
            </p>
            {deleteError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-white p-3 rounded-xl mb-3">
                <AlertCircle className="w-4 h-4 shrink-0" /> {deleteError}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-3 border border-brand-accent rounded-xl font-bold text-sm hover:bg-white transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 disabled:opacity-50 transition-all"
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Sí, eliminar
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Crop modal */}
      {cropFile && (
        <ImageCropper file={cropFile} aspect={1} onCropComplete={handleCropComplete} onCancel={handleCropCancel} />
      )}
    </div>
  );
}
