import React, { useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { Loader2, AlertCircle, LogIn, UserPlus, Mail, Lock, User, Eye, EyeOff, Phone as PhoneIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthGateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  onSuccess?: () => void;
}

export default function AuthGate({ title, description, icon, onSuccess }: AuthGateProps) {
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.auth.login(loginEmail, loginPassword);
      login(res.token, res.user);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (regPassword !== regConfirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (regPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      const res = await api.auth.register(regEmail, regPassword, regName, regPhone);
      login(res.token, res.user);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-20">
      <div className="bg-white p-12 rounded-[3rem] border border-brand-accent shadow-xl">
        <div className="text-center mb-10">
          {icon || <AlertCircle className="w-16 h-16 text-brand-secondary mx-auto mb-6" />}
          <h1 className="text-3xl font-serif font-bold text-brand-primary mb-4">{title}</h1>
          <p className="text-gray-500">{description}</p>
        </div>

        {!mode && (
          <div className="grid md:grid-cols-2 gap-6">
            <button
              onClick={() => setMode('login')}
              className="group p-8 rounded-[2.5rem] border-2 border-brand-accent hover:border-brand-primary hover:bg-brand-primary/5 transition-all text-center"
            >
              <div className="w-14 h-14 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <LogIn className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-brand-primary mb-2">Ya soy usuario</h3>
              <p className="text-sm text-gray-400">Iniciá sesión con tu cuenta</p>
            </button>

            <button
              onClick={() => setMode('register')}
              className="group p-8 rounded-[2.5rem] border-2 border-brand-accent hover:border-brand-primary hover:bg-brand-primary/5 transition-all text-center"
            >
              <div className="w-14 h-14 bg-brand-secondary/10 text-brand-secondary rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <UserPlus className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-brand-primary mb-2">Primer ingreso</h3>
              <p className="text-sm text-gray-400">Registrate rápidamente</p>
            </button>
          </div>
        )}

        <AnimatePresence>
          {mode === 'login' && (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex items-center gap-2 mb-8">
                <button onClick={() => setMode(null)} className="text-sm text-gray-400 hover:text-brand-primary transition-colors">
                  ← Volver
                </button>
              </div>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      required
                      type="email"
                      className="w-full pl-12 pr-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                      placeholder="tu@email.com"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      className="w-full pl-12 pr-12 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-primary">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
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
                  {loading ? <Loader2 className="animate-spin w-6 h-6" /> : <LogIn className="w-6 h-6" />}
                  Iniciar Sesión
                </button>
              </form>
            </motion.div>
          )}

          {mode === 'register' && (
            <motion.div
              key="register"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex items-center gap-2 mb-8">
                <button onClick={() => setMode(null)} className="text-sm text-gray-400 hover:text-brand-primary transition-colors">
                  ← Volver
                </button>
              </div>
              <form onSubmit={handleRegister} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Nombre</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      required
                      type="text"
                      className="w-full pl-12 pr-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                      placeholder="Tu nombre"
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      required
                      type="email"
                      className="w-full pl-12 pr-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                      placeholder="tu@email.com"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">WhatsApp / Teléfono</label>
                  <div className="relative">
                    <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      className="w-full pl-12 pr-4 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                      placeholder="Ej: +54 9 221 123456"
                      value={regPhone}
                      onChange={e => setRegPhone(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      className="w-full pl-12 pr-12 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                      placeholder="Mínimo 6 caracteres"
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      minLength={6}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-primary">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Repetir Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      className="w-full pl-12 pr-12 py-4 bg-brand-bg rounded-2xl border border-brand-accent focus:ring-2 focus:ring-brand-primary/10 transition-all outline-none"
                      placeholder="Repetir contraseña"
                      value={regConfirmPassword}
                      onChange={e => setRegConfirmPassword(e.target.value)}
                      minLength={6}
                    />
                  </div>
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
                  {loading ? <Loader2 className="animate-spin w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
                  Crear Cuenta
                </button>

                <p className="text-xs text-center text-gray-400">
                  Al registrarte, aceptas que tus datos sean usados para la gestión de la comunidad.
                </p>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}