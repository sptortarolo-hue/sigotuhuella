import { useState } from 'react';
import { auth } from '@/src/lib/firebase';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { useAuth } from '@/src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { LogIn, LogOut, ShieldAlert, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const { user, isAdmin, loading } = useAuth();
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    setAuthLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // Wait a bit for useAuth to pick up the new state
      setTimeout(() => {
        if (!loading) {
          navigate('/admin');
        }
      }, 1000);
    } catch (e: any) {
      setError('Error al iniciar sesión. Intenta de nuevo.');
      console.error(e);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (e) {
      console.error(e);
    }
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
            <div className="p-4 bg-brand-accent/30 rounded-2xl border border-brand-accent flex items-center gap-4">
              <img src={user.photoURL || ''} className="w-12 h-12 rounded-full border-2 border-white" alt="Avatar" />
              <div>
                <p className="text-sm font-bold text-gray-800">{user.displayName}</p>
                <p className="text-xs text-gray-500">{user.email}</p>
              </div>
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
          <div className="space-y-6">
            {error && <p className="text-red-600 text-sm text-center font-medium bg-red-50 py-2 rounded-xl">{error}</p>}
            
            <button
              onClick={handleLogin}
              disabled={authLoading}
              className="w-full py-4 bg-white border-2 border-brand-accent text-gray-800 rounded-2xl font-bold flex items-center justify-center gap-3 hover:border-brand-primary transition-all group"
            >
              {authLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <img src="https://www.google.com/favicon.ico" className="w-5 h-5 grayscale group-hover:grayscale-0 transition-all" alt="Google" />
              )}
              Ingresar con Google
            </button>

            <p className="text-xs text-center text-gray-400">
              Al ingresar aceptas el manejo de datos para la gestión vecinal.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
