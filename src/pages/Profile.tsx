import { useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Save, Loader2, ArrowLeft, CheckCircle2, AlertCircle, Phone as PhoneIcon } from 'lucide-react';
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