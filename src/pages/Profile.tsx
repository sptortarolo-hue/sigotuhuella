import React, { useState, useRef } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Save, Loader2, ArrowLeft, CheckCircle2, AlertCircle, Phone as PhoneIcon, Camera, Upload, PawPrint, CreditCard } from 'lucide-react';
import { motion } from 'motion/react';

export default function Profile() {
  const { user, login, logout } = useAuth();
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
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, display_name: data.user.display_name, phone: data.user.phone }));
      setProfileMsg('Datos actualizados');
    } catch (err: any) {
      setProfileError(err.message || 'Error al actualizar');
    } finally {
      setProfileLoading(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);

  const isMember = user?.member_number && user?.volunteer_status !== 'none';

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    setProfileMsg('');
    setProfileError('');
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(file);
      });
      const data = await api.users.uploadAvatar(user.id, { imageData: base64, mimeType: file.type });
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, avatar_data: data.avatar.avatar_data, avatar_mime_type: data.avatar.avatar_mime_type, avatar_type: data.avatar.avatar_type }));
      setProfileMsg('Foto de perfil actualizada');
    } catch (err: any) {
      setProfileError(err.message || 'Error al subir foto');
    } finally {
      setAvatarLoading(false);
    }
  };

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

  return (
    <div className="max-w-lg mx-auto px-4 py-12 space-y-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand-primary font-bold">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-[2rem] border border-brand-accent shadow-xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center"><User className="w-6 h-6" /></div>
          <div><h1 className="text-2xl font-serif font-bold text-brand-primary">Mi Perfil</h1><p className="text-sm text-gray-500">{user.email}</p></div>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Nombre</label>
            <input type="text" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
              <PhoneIcon className="w-4 h-4" /> WhatsApp / Teléfono
            </label>
            <input type="tel" className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none" placeholder="+54 9 221 123456" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          {profileMsg && <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm flex gap-2 items-center"><CheckCircle2 className="w-4 h-4" />{profileMsg}</div>}
          {profileError && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex gap-2 items-center"><AlertCircle className="w-4 h-4" />{profileError}</div>}
          <button type="submit" disabled={profileLoading} className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold flex items-center justify-center gap-2">{profileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar Cambios</button>
        </form>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white p-8 rounded-[2rem] border border-brand-accent shadow-xl">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center"><Camera className="w-6 h-6" /></div>
          <div>
            <h2 className="text-2xl font-serif font-bold text-brand-primary">Foto de Perfil</h2>
            <p className="text-xs text-gray-500">Aparecerá en tu carnet de miembro</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-brand-accent shrink-0 bg-brand-bg flex items-center justify-center">
            {user?.avatar_type === 'photo' && user?.avatar_data ? (
              <img src={`data:${user.avatar_mime_type};base64,${user.avatar_data}`} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <PawPrint className="w-8 h-8 text-brand-primary" />
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={avatarLoading}
            className="px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:shadow-lg transition-all disabled:opacity-50"
          >
            {avatarLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {user?.avatar_type === 'photo' ? 'Cambiar Foto' : 'Subir Foto'}
          </button>
        </div>
      </motion.div>

      {isMember && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white p-8 rounded-[2rem] border border-brand-accent shadow-xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center"><CreditCard className="w-6 h-6" /></div>
            <div>
              <h2 className="text-2xl font-serif font-bold text-brand-primary">Mi Carnet</h2>
              <p className="text-xs text-gray-500">{user.member_number}</p>
            </div>
          </div>
          <button onClick={() => navigate('/mi-carnet')} className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all">
            <CreditCard className="w-4 h-4" /> Ver Mi Carnet
          </button>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white p-8 rounded-[2rem] border border-brand-accent shadow-xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center"><Lock className="w-6 h-6" /></div>
          <div><h2 className="text-2xl font-serif font-bold text-brand-primary">Cambiar Contraseña</h2></div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Contraseña Actual</label>
            <input type="password" required className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Nueva Contraseña</label>
            <input type="password" required minLength={6} className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          {passwordMsg && <div className="p-3 bg-green-50 text-green-600 rounded-xl text-sm flex gap-2 items-center"><CheckCircle2 className="w-4 h-4" />{passwordMsg}</div>}
          {passwordError && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm flex gap-2 items-center"><AlertCircle className="w-4 h-4" />{passwordError}</div>}
          <button type="submit" disabled={passwordLoading} className="w-full py-3 bg-brand-primary text-white rounded-xl font-bold flex items-center justify-center gap-2">{passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Cambiar Contraseña</button>
        </form>
      </motion.div>
    </div>
  );
}