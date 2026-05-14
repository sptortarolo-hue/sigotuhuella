import { useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { LogIn, LogOut, ShieldAlert, Loader2, Mail, Lock, UserPlus } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const { user, isAdmin, loading, login, logout } = useAuth();
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setError('');
    try {
      if (mode === 'register') {
        const data = await api.auth.register(email, password, displayName);
        login(data.token, data.user);
      } else {
        const data = await api.auth.login(email, password);
        login(data.token, data.user);
      }
      navigate('/admin');
    } catch (err: any) {
      setError(err.message || 'Error al procesar la solicitud');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (loading) return (
    <div className="h-[60vh] flex items-center justify-center text-brand-primary">
      <Loader2 className="w-10 h-10 animate-spin" />
    </div>
  );

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-[2rem] border border-brand-accent shadow-xl"
      >
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-brand-primary">Acceso Administrador</h1>
          <p className="text-gray-500 text-sm mt-2">Solo personal autorizado del movimiento.</p>
        </div>

        {user ? (
          <div className="space-y-6">
            <div className="p-4 bg-brand-accent/30 rounded-2xl border border-brand-accent">
              <p className="text-sm font-bold text-gray-800">{user.display_name || user.email}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>

            {!isAdmin && (
              <div className="p-4 bg-red-50 text-red-700 rounded-2xl text-sm flex gap-3 items-start border border-red-100">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <p>Tu cuenta no tiene permisos de administrador. Si crees que esto es un error, contacta al equipo de "Sigo tu huella".</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold hover:shadow-lg transition-all"
                >
                  Ir al Panel de Control
                </button>
              )}
              <button
                onClick={handleLogout}
                className="w-full py-4 bg-white text-gray-600 border border-brand-accent rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
              >
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <p className="text-red-600 text-sm text-center font-medium bg-red-50 py-2 rounded-xl">{error}</p>}

            {mode === 'register' && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Nombre</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none"
                  placeholder="Tu nombre"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                <Mail className="w-3 h-3" /> Email
              </label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none"
                placeholder="email@ejemplo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                <Lock className="w-3 h-3" /> Contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none"
                placeholder="Min. 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all"
            >
              {authLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : mode === 'login' ? (
                <LogIn className="w-5 h-5" />
              ) : (
                <UserPlus className="w-5 h-5" />
              )}
              {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </button>

            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="w-full text-center text-sm text-brand-primary font-bold hover:underline"
            >
              {mode === 'login' ? '¿No tenés cuenta? Registrate' : '¿Ya tenés cuenta? Iniciá sesión'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
