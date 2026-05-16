import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/src/lib/api';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.auth.forgotPassword(email);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-[2rem] border border-brand-accent shadow-xl"
      >
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-brand-primary font-bold text-sm mb-6 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a iniciar sesión
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-primary/10 text-brand-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif font-bold text-brand-primary">
            ¿Olvidaste tu contraseña?
          </h1>
          <p className="text-gray-500 text-sm mt-2">
            Ingresá tu email y te enviaremos un enlace para recuperar tu contraseña.
          </p>
        </div>

        {success ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>
            <p className="text-gray-600">
              Si el email existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.
            </p>
            <p className="text-sm text-gray-500">
              Revisa tu bandeja de entrada (y spam).
            </p>
            <button
              onClick={() => navigate('/login')}
              className="text-brand-primary font-bold hover:underline"
            >
              Volver al login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <p className="text-red-600 text-sm text-center font-medium bg-red-50 py-2 rounded-xl">
                {error}
              </p>
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
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:shadow-lg transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Mail className="w-5 h-5" />
              )}
              Enviar enlace de recuperación
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}