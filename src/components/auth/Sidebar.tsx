import { useLocation, useNavigate } from 'react-router-dom';
import { Home, PawPrint, User, Plus, Sparkles, Share2, Camera, HandCoins, LogOut, Heart, Search, LogIn, LayoutDashboard, Bell, BellOff, Settings, Ticket, FolderOpen, Megaphone } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAuth } from '@/src/hooks/useAuth';
import { useEffect, useState } from 'react';
import { subscribe, unsubscribe, isSubscribed, isSupported } from '@/src/lib/pushService';
import { api } from '@/src/lib/api';
import { IS_PLAY_BUILD } from '@/src/lib/buildConfig';
import NotificationBell from '@/src/components/NotificationBell';
const publicBase = [
  { label: 'Inicio', icon: Home, path: '/' },
  { label: 'Mascotas Reportadas', icon: Search, path: '/perdidos' },
  { label: 'Adopción', icon: Heart, path: '/adopcion' },
  { label: 'Colaborar', icon: HandCoins, path: '/colaborar' },
  { label: 'Difusión', icon: Share2, path: '/difusion' },
  { label: 'Sumate', icon: User, path: '/sumate' },
  { label: 'Novedades', icon: Sparkles, path: '/novedades' },
];

const portalItems = [
  { label: 'Inicio', icon: Home, path: '/' },
  { label: 'Mi Portal', icon: LayoutDashboard, path: '/mi-portal' },
  { label: 'Mis Mascotas', icon: PawPrint, path: '/mi-mascota' },
  { label: 'Mis Casos', icon: FolderOpen, path: '/mis-casos' },
  { label: 'Voluntario', icon: Megaphone, path: '/voluntario' },
  { label: 'Mi Perfil', icon: User, path: '/perfil' },
];

const moreBase = [
  { label: 'Mascotas Reportadas', icon: Search, path: '/perdidos' },
  { label: 'Adopción', icon: Heart, path: '/adopcion' },
  { label: 'Novedades', icon: Sparkles, path: '/novedades' },
  { label: 'Sumate', icon: User, path: '/sumate' },
  { label: 'Difusión', icon: Share2, path: '/difusion' },
  { label: 'Generar Flyer', icon: Camera, path: '/flyer' },
  { label: 'Colaborar', icon: HandCoins, path: '/colaborar' },
];

const rifaItem = { label: 'Rifas', icon: Ticket, path: '/rifas' };

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin, isCoordinator } = useAuth();
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [rafflesVisible, setRafflesVisible] = useState(true);

  useEffect(() => {
    isSupported().then(async (ok) => {
      if (!ok) { setPushEnabled(null); return; }
      const sub = await isSubscribed();
      setPushEnabled(sub);
    });
    api.settings.getPublic().then((data: any) => {
      if (data.raffles_visible !== undefined) setRafflesVisible(data.raffles_visible !== 'false');
    }).catch(() => {});
  }, []);

  const publicItems = rafflesVisible && !IS_PLAY_BUILD ? [...publicBase.slice(0, 3), rifaItem, ...publicBase.slice(3)] : publicBase;
  const moreItems = rafflesVisible && !IS_PLAY_BUILD ? [...moreBase.slice(0, 2), rifaItem, ...moreBase.slice(2)] : moreBase;

  const handleBellClick = async () => {
    if (pushEnabled) {
      const ok = await unsubscribe();
      if (ok) setPushEnabled(false);
    } else {
      const ok = await subscribe();
      if (ok) setPushEnabled(true);
    }
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/mi-portal') return location.pathname === '/mi-portal' || location.pathname === '/dashboard';
    if (path === '/perfil') return location.pathname === '/perfil';
    if (path === '/sumate') return location.pathname === '/sumate';
    if (path === '/colaborar') return location.pathname === '/colaborar';
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-r lg:border-brand-accent lg:bg-white lg:z-50">
      <div className="flex items-center justify-between gap-2 px-6 h-16 border-b border-brand-accent shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0 ring-1 ring-brand-primary/20">
            <img src="/sigotuhuella.jpg" alt="Sigo tu huella" className="w-full h-full object-cover" />
          </div>
          <span className="text-lg font-serif font-bold text-brand-primary">Sigo tu huella</span>
        </div>
        {pushEnabled !== null && (
          <button
            onClick={handleBellClick}
            title={pushEnabled ? 'Desactivar notificaciones push' : 'Activar notificaciones push'}
            className={cn(
              "p-2 rounded-full transition-colors shrink-0",
              pushEnabled ? "text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20" : "text-gray-400 hover:text-brand-primary hover:bg-brand-primary/10"
            )}
          >
            {pushEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>
        )}
        {user && <NotificationBell />}
        {!IS_PLAY_BUILD && (isAdmin || isCoordinator) && (
          <button
            onClick={() => navigate('/admin')}
            className="p-2 rounded-full text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 transition-colors shrink-0"
            title="Panel Admin"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex flex-col gap-1 p-4 flex-1 overflow-y-auto">
        {user ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-4 pb-1">Tu Portal</p>
            {portalItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left",
                  isActive(item.path)
                    ? "bg-brand-primary/10 text-brand-primary font-bold"
                    : "text-gray-600 hover:bg-brand-bg hover:text-gray-900"
                )}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", isActive(item.path) && "fill-brand-primary/15")} />
                {item.label}
              </button>
            ))}

            <div className="border-t border-brand-accent my-2" />

            {moreItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left",
                  isActive(item.path)
                    ? "bg-brand-primary/10 text-brand-primary font-bold"
                    : "text-gray-600 hover:bg-brand-bg hover:text-gray-900"
                )}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", isActive(item.path) && "fill-brand-primary/15")} />
                {item.label}
              </button>
            ))}

            <div className="border-t border-brand-accent my-2" />

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
            >
              <LogOut className="w-5 h-5 shrink-0" /> Cerrar sesión
            </button>
          </>
        ) : (
          <>
            {publicItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left",
                  isActive(item.path)
                    ? "bg-brand-primary/10 text-brand-primary font-bold"
                    : "text-gray-600 hover:bg-brand-bg hover:text-gray-900"
                )}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", isActive(item.path) && "fill-brand-primary/15")} />
                {item.label}
              </button>
            ))}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-brand-accent">
        {user ? (
          <>
            <div className="flex items-center gap-3 mt-4 px-2">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-brand-primary/10 shrink-0">
                {user.avatar_type === 'photo' && user.avatar_data ? (
                  <img
                    src={`data:${user.avatar_mime_type || 'image/jpeg'};base64,${user.avatar_data}`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-4 h-4 text-brand-primary" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-800 truncate">{user.display_name || 'Usuario'}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
            </div>
          </>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
          >
            <LogIn className="w-5 h-5" /> Iniciar Sesión
          </button>
        )}
      </div>
    </aside>
  );
}
