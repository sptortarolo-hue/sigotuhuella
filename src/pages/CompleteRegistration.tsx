import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, KeyRound, Mail } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '@/src/lib/api';

export default function CompleteRegistration() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pageStatus, setPageStatus] = useState<'loading' | 'idle' | 'submitting' | 'success' | 'error'>(
    token ? 'idle' : 'error'
  );
  const [errorMsg, setErrorMsg] = useState('');
  const [validToken, setValidToken] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [mode, setMode] = useState<'token' | 'email'>(token ? 'token' : 'email');

  useEffect(() => {
    if (token) {
      api.validateToken(token).then(data => {
        if (data.valid) {
          setValidToken(true);
          setEmail(data.email);
          setDisplayName(data.displayName || '');
          setPageStatus('idle');
        } else {
          setPageStatus('error');
          setErrorMsg('El enlace no es válido o ya fue utilizado.');
        }
      }).catch(() => {
        setPageStatus('error');
        setErrorMsg('Error al validar el enlace.');
      });
    }
  }, [token]);

  const handleSubmit = async () => {
    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden');
      return;
    }
    setPageStatus('submitting');
    setErrorMsg('');
    try {
      const data = mode === 'token'
        ? await api.completeRegistration({ token, password })
        : await api.completeRegistration({ email: loginEmail, password });
      setPageStatus('success');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al completar el registro');
      setPageStatus('error');
    }
  };

  if (pageStatus === 'success') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-md">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">¡Registro completado!</h1>
          <p className="text-gray-600 mb-6">Ya podés iniciar sesión para gestionar tus publicaciones y recibir notificaciones.</p>
          <button onClick={() => navigate('/login')} className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all">
            Iniciar sesión
          </button>
        </motion.div>
      </div>
    );
  }

  if (pageStatus === 'error' && !token) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">Enlace inválido</h1>
          <p className="text-gray-600 mb-6">Si ya completaste tu registro, podés iniciar sesión. Si no recibiste el enlace, revisá tu casilla de email o contactanos.</p>
          <button onClick={() => navigate('/login')} className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all">
            Ir a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  if (pageStatus === 'loading') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-8 h-8 text-brand-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary">Completar registro</h1>
          <p className="text-gray-500 mt-2 text-sm sm:text-base">
            {mode === 'token' && displayName
              ? `¡Hola ${displayName}! Creá tu contraseña para acceder a tu cuenta.`
              : 'Creá una contraseña para acceder a tu cuenta y gestionar tus publicaciones.'}
          </p>
        </div>

        {pageStatus === 'error' && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="text-sm">{errorMsg}</span>
          </div>
        )}

        <div className="space-y-4">
          {mode === 'email' && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  placeholder="nombre@email.com" type="email"
                  className="w-full pl-12 pr-4 py-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors" />
              </div>
            </div>
          )}

          {mode === 'token' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 mb-2">
              <p className="font-bold">Email verificado: {email}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Contraseña</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password"
              placeholder="Mínimo 6 caracteres"
              className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors" />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Confirmar contraseña</label>
            <input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type="password"
              placeholder="Repetí la contraseña"
              className="w-full p-4 border border-brand-accent rounded-xl text-sm focus:outline-none focus:border-brand-primary transition-colors" />
          </div>

          <button onClick={handleSubmit} disabled={pageStatus === 'submitting' || password.length < 6 || password !== confirmPassword}
            className="w-full py-4 bg-brand-primary text-white font-bold text-base rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg transition-all flex items-center justify-center gap-2">
            {pageStatus === 'submitting' ? <><Loader2 className="w-5 h-5 animate-spin" /> Guardando...</> : 'Completar registro'}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Ya tenés cuenta? <button onClick={() => navigate('/login')} className="text-brand-primary font-bold hover:underline">Iniciar sesión</button>
          </p>
        </div>
      </div>
    </div>
  );
}