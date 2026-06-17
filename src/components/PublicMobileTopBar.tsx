import { Link, useNavigate } from 'react-router-dom';
import { PawPrint, User, LogOut } from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';

export default function PublicMobileTopBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-4 border-b border-brand-accent bg-white md:hidden">
      <Link to="/" className="flex items-center gap-2">
        <div className="p-1.5 bg-brand-primary rounded-xl">
          <PawPrint className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-serif font-bold text-brand-primary">Sigo tu huella</span>
      </Link>

      {user ? (
        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <Link
            to="/dashboard"
            className="w-8 h-8 rounded-full overflow-hidden border-2 border-brand-accent"
            title="Ir al dashboard"
          >
            {user.avatar_type === 'photo' && user.avatar_data ? (
              <img
                src={`data:${user.avatar_mime_type || 'image/jpeg'};base64,${user.avatar_data}`}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-brand-primary/10">
                <User className="w-4 h-4 text-brand-primary" />
              </div>
            )}
          </Link>
        </div>
      ) : (
        <Link
          to="/login"
          className="px-4 py-1.5 bg-brand-primary text-white rounded-xl text-xs font-bold"
        >
          Iniciar sesión
        </Link>
      )}
    </div>
  );
}
