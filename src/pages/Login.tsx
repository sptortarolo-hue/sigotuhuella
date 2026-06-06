import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { LogIn, LogOut, ShieldAlert, Loader2, Mail, Lock, UserPlus, Phone as PhoneIcon, Eye, EyeOff, KeyRound, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function Login() {
  const { user, isAdmin, loading, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from || '/';
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'register' | 'complete-registration' | 'verify-email' | 'link-google'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [resending, setResending] = useState(false);
  const [resentMessage, setResentMessage] = useState('');
  const [linkingEmail, setLinkingEmail] = useState('');
  const [linkingPassword, setLinkingPassword] = useState('');
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleInitedRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setError('');
    try {
      if (mode === 'complete-registration') {
        if (password !== confirmPassword) {
          setError('Las contraseñas no coinciden');
          setAuthLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('La contraseña debe tener al menos 6 caracteres');
          setAuthLoading(false);
          return;
        }
        await api.completeRegistration({ email, password });
        const data = await api.auth.login(email, password);
        login(data.token, data.user);
        navigate(from, { replace: true });
        return;
      }

      if (mode === 'register') {
        if (password !== confirmPassword) {
          setError('Las contraseñas no coinciden');
          setAuthLoading(false);
          return;
        }
        await api.auth.register(email, password, displayName, phone);
        setMode('verify-email');
        setRegistrationSuccess(false);
        setAuthLoading(false);
        return;
      }

      try {
        const emailStatus = await api.checkEmail(email);
        if (emailStatus.exists && emailStatus.registrationPending) {
          setMode('complete-registration');
          setError('Ya reportaste una mascota perdida. Creá tu contraseña para completar el registro.');
          setAuthLoading(false);
          return;
        }
      } catch {
        // If check-email fails, proceed with normal login
      }

      const data = await api.auth.login(email, password);
      login(data.token, data.user);
      navigate(from, { replace: true });
    } catch (err: any) {
      if (err.message?.includes('Email no verificado') || err.message?.includes('email no verificado')) {
        setMode('verify-email');
        setError('');
      } else {
        setError(err.message || 'Error al procesar la solicitud');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleResponse = async (response: { credential: string }) => {
    setAuthLoading(true);
    setError('');
    try {
      const data = await api.auth.googleLogin(response.credential);
      if (data.needsPassword) {
        setLinkingEmail(data.email);
        setMode('link-google');
        return;
      }
      login(data.token, data.user);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión con Google');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLinkGoogle = async () => {
    if (!linkingPassword) { setError('Ingresá tu contraseña'); return; }
    setAuthLoading(true);
    setError('');
    try {
      const googleCred = (window as any).__pendingGoogleCred;
      if (!googleCred) { setError('Error de sesión de Google. Intentá de nuevo.'); setAuthLoading(false); return; }
      const data = await api.auth.linkGoogle(googleCred, linkingPassword);
      (window as any).__pendingGoogleCred = null;
      login(data.token, data.user);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Error al vincular cuenta');
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || googleInitedRef.current) return;
    const init = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        });
        if (googleButtonRef.current) {
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            type: 'standard',
            size: 'large',
            width: '100%',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
          });
        }
        googleInitedRef.current = true;
      } else {
        setTimeout(init, 500);
      }
    };
    init();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const greeting = new Date().getHours() < 12 ? '¡Buenos días!' : new Date().getHours() < 18 ? '¡Buenas tardes!' : '¡Buenas noches!';

  if (loading) return (
    <div className="h-[60vh] flex items-center justify-center text-brand-primary">
      <Loader2 className="w-10 h-10 animate-spin" />
    </div>
  );

  if (registrationSuccess) {
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
            {greeting}
          </h1>
          <p className="text-gray-600 mb-2">
            Tu cuenta fue creada exitosamente.
            {displayName && <span> ¡Nos alegra tenerte acá, <strong>{displayName}</strong>!</span>}
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Ahora solo falta confirmar tu email. Te enviamos un enlace de verificación a <strong>{email}</strong>.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setMode('verify-email')}
              className="w-full px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all"
            >
              Revisar mi email
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full px-6 py-3 bg-white text-gray-600 border border-brand-accent rounded-xl font-bold hover:bg-gray-50 transition-all"
            >
              Ir al inicio
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-[2rem] border border-brand-accent shadow-xl"
      >
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            {mode === 'complete-registration' ? (
              <KeyRound className="w-8 h-8 text-brand-primary" />
            ) : (
              <LogIn className="w-8 h-8" />
            )}
          </div>
          <h1 className="text-3xl font-serif font-bold text-brand-primary">
            {mode === 'complete-registration' ? 'Completá tu registro' : mode === 'verify-email' ? 'Confirmá tu email' : mode === 'link-google' ? 'Vinculá tu cuenta' : 'Iniciá Sesión'}
          </h1>
          <p className="text-gray-500 text-sm mt-2">
            {mode === 'complete-registration'
              ? 'Creá tu contraseña para acceder a tu cuenta.'
              : mode === 'verify-email'
                ? 'Te enviamos un enlace de verificación. Revisá tu casilla de correo.'
                : mode === 'link-google'
                  ? 'Ya tenés una cuenta con este email. Ingresá tu contraseña para vincularla con Google.'
                  : 'Ingresá para publicar reportes, gestionar tus publicaciones y colaborar con la comunidad.'}
          </p>
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
        ) : mode === 'verify-email' ? (
            <div className="space-y-6">
              <div className="p-5 bg-amber-50 rounded-2xl border border-amber-200 text-sm text-amber-800">
                <p className="font-bold mb-1">📧 Revisá tu bandeja de entrada</p>
                <p>Te enviamos un email de verificación a <strong>{email}</strong>. Hacé click en el enlace para activar tu cuenta.</p>
                <p className="mt-2 text-amber-700">Si no lo encontrás, revisá la carpeta de <strong>correo no deseado</strong> o spam.</p>
                <p className="mt-1 text-amber-600 text-xs">El enlace vence en 48 horas. Si expiró, podés solicitar uno nuevo abajo.</p>
              </div>

              {resentMessage && (
                <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-sm text-green-700 text-center">
                  {resentMessage}
                </div>
              )}

              <button
                onClick={async () => {
                  setResending(true);
                  setResentMessage('');
                  try {
                    await api.auth.resendVerification(email);
                    setResentMessage('Email reenviado exitosamente. Revisá tu casilla.');
                  } catch (e: any) {
                    setResentMessage('Error al reenviar. Intentá de nuevo más tarde.');
                  } finally {
                    setResending(false);
                  }
                }}
                disabled={resending}
                className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all"
              >
                {resending ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                Reenviar email
              </button>

              <button
                onClick={() => { setMode('login'); setError(''); }}
                className="w-full text-center text-sm text-brand-primary font-bold hover:underline"
              >
                Volver a iniciar sesión
              </button>
            </div>
        ) : mode === 'link-google' ? (
          <div className="space-y-6">
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 text-sm text-blue-800">
              <p className="font-bold mb-1">🔗 Cuenta existente</p>
              <p>Ya hay una cuenta con <strong>{linkingEmail}</strong>. Ingresá tu contraseña para vincularla con Google y poder iniciar sesión con ambos métodos.</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                <Lock className="w-3 h-3" /> Contraseña
              </label>
              <input
                type="password" required
                className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none"
                placeholder="Tu contraseña"
                value={linkingPassword}
                onChange={e => setLinkingPassword(e.target.value)}
              />
            </div>
            <button
              onClick={handleLinkGoogle}
              disabled={authLoading}
              className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all"
            >
              {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
              Vincular y entrar
            </button>
            <button
              onClick={() => { setMode('login'); setError(''); setLinkingPassword(''); }}
              className="w-full text-center text-sm text-brand-primary font-bold hover:underline"
            >
              Volver a iniciar sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <p className={`text-sm text-center font-medium py-2 px-4 rounded-xl ${
                mode === 'complete-registration'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-red-50 text-red-600'
              }`}>
                {error}
              </p>
            )}

            {/* Complete registration mode */}
            {mode === 'complete-registration' && (
              <div className="space-y-5">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
                  <p className="font-bold">Email verificado: {email}</p>
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
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <Lock className="w-3 h-3" /> Repetir Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none"
                    placeholder="Repetir contraseña"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Register mode */}
            {mode === 'register' && (
              <div className="space-y-5">
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
                    <PhoneIcon className="w-3 h-3" /> WhatsApp / Teléfono
                  </label>
                  <input
                    type="tel"
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none"
                    placeholder="+54 9 221 123456"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
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
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <Lock className="w-3 h-3" /> Repetir Contraseña
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    className="w-full px-4 py-3 bg-brand-bg rounded-xl border border-brand-accent outline-none"
                    placeholder="Repetir contraseña"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Login mode */}
            {mode === 'login' && (
              <>
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
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => navigate('/forgot-password')}
                    className="text-xs text-brand-primary font-bold hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                {GOOGLE_CLIENT_ID && (
                  <>
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-brand-accent"></div>
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-3 text-gray-400 font-bold">O</span>
                      </div>
                    </div>
                    <div ref={googleButtonRef} className="w-full min-h-[40px]"></div>
                  </>
                )}
              </>
            )}

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
              {mode === 'complete-registration' ? 'Completar registro' : mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
            </button>

            {mode !== 'complete-registration' && (
              <button
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                className="w-full text-center text-sm text-brand-primary font-bold hover:underline"
              >
                {mode === 'login' ? '¿No tenés cuenta? Registrate' : '¿Ya tenés cuenta? Iniciá sesión'}
              </button>
            )}

            {mode === 'complete-registration' && (
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); }}
                className="w-full text-center text-sm text-brand-primary font-bold hover:underline"
              >
                Volver a iniciar sesión
              </button>
            )}
          </form>
          )}
      </motion.div>
    </div>
  );
}