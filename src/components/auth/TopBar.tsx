import { Link, useNavigate } from 'react-router-dom';
import { PawPrint, Bell, BellOff, User, LogOut, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { subscribe, unsubscribe, isSubscribed, isSupported } from '@/src/lib/pushService';
import { cn } from '@/src/lib/utils';

export default function TopBar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    isSupported().then(async (ok) => {
      if (!ok) { setPushEnabled(null); return; }
      const sub = await isSubscribed();
      setPushEnabled(sub);
    });
  }, []);

  const handleBellClick = async () => {
    if (pushEnabled) {
      const ok = await unsubscribe();
      if (ok) setPushEnabled(false);
    } else {
      const ok = await subscribe();
      if (ok) setPushEnabled(true);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-14 px-4 border-b border-brand-accent bg-white lg:hidden">
      <Link to="/dashboard" className="flex items-center gap-2">
        <div className="p-1.5 bg-brand-primary rounded-xl">
          <PawPrint className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-serif font-bold text-brand-primary">Sigo tu huella</span>
      </Link>
      <div className="flex items-center gap-2">
        {pushEnabled !== null && (
          <button
            onClick={handleBellClick}
            title={pushEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}
            className={cn(
              "p-2 rounded-full transition-colors",
              pushEnabled ? "text-brand-primary bg-brand-primary/10" : "text-gray-400"
            )}
          >
            {pushEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </button>
        )}
        {isAdmin && (
          <Link
            to="/admin"
            className="p-2 rounded-full text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 transition-colors"
            title="Panel Admin"
          >
            <Settings className="w-5 h-5" />
          </Link>
        )}
        <button
          onClick={handleLogout}
          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
          title="Cerrar sesión"
        >
          <LogOut className="w-4 h-4" />
        </button>
        <Link
          to="/perfil"
          className="w-8 h-8 rounded-full overflow-hidden border-2 border-brand-accent"
        >
          {user?.avatar_type === 'photo' && user?.avatar_data ? (
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
    </div>
  );
}
