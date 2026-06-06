import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import { api } from '@/src/lib/api';
import { Loader2, CheckCircle2, XCircle, Mail } from 'lucide-react';
import { motion } from 'motion/react';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token de verificación no encontrado.');
      return;
    }

    api.auth.verifyEmail(token)
      .then(data => {
        if (data.valid && data.token && data.user) {
          login(data.token, data.user);
          setStatus('success');
          setMessage('Email verificado exitosamente');
          setEmail(data.user.email);
        } else {
          setStatus('error');
          setMessage('Error al verificar el email.');
        }
      })
      .catch(err => {
        setStatus('error');
        setMessage(err.message || 'El enlace de verificación es inválido o ya expiró.');
      });
  }, [token]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center max-w-md"
      >
        {status === 'loading' && (
          <>
            <div className="w-20 h-20 bg-brand-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 className="w-10 h-10 text-brand-primary animate-spin" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">
              Verificando email...
            </h1>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">
              ¡Email verificado!
            </h1>
            <p className="text-gray-600 mb-6">
              Tu cuenta está activa. Ya podés acceder a todas las funcionalidades.
            </p>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="w-full px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all"
            >
              Ir al inicio
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-10 h-10 text-red-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary mb-3">
              Error de verificación
            </h1>
            <p className="text-gray-600 mb-2">{message}</p>
            <p className="text-gray-500 text-sm mb-6">
              Si el problema persiste, solicitá un nuevo enlace de verificación desde la pantalla de inicio de sesión.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:shadow-lg transition-all"
            >
              Ir a iniciar sesión
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}