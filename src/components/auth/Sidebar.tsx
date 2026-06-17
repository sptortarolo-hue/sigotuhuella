import { useLocation, useNavigate } from 'react-router-dom';
import { Home, PawPrint, User, Plus, Sparkles, Share2, Camera, HandCoins, LogOut } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAuth } from '@/src/hooks/useAuth';

const portalItems = [
  { label: 'Mi Portal', icon: Home, path: '/dashboard' },
  { label: 'Mis Mascotas', icon: PawPrint, path: '/mi-mascota' },
  { label: 'Mi Perfil', icon: User, path: '/perfil' },
];

const moreItems = [
  { label: 'Novedades', icon: Sparkles, path: '/novedades' },
  { label: 'Sumate', icon: User, path: '/sumate' },
  { label: 'Difusión', icon: Share2, path: '/difusion' },
  { label: 'Generar Flyer', icon: Camera, path: '/flyer' },
  { label: 'Colaborar', icon: HandCoins, path: '/colaborar' },
];

export default function Sidebar({ onReportClick }: { onReportClick: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
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
      <div className="flex items-center gap-2 px-6 h-16 border-b border-brand-accent shrink-0">
        <div className="p-1.5 bg-brand-primary rounded-xl">
          <PawPrint className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-serif font-bold text-brand-primary">Sigo tu huella</span>
      </div>

      <nav className="flex flex-col gap-1 p-4 flex-1 overflow-y-auto">
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
      </nav>

      <div className="p-4 border-t border-brand-accent">
        <button
          onClick={onReportClick}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
        >
          <Plus className="w-5 h-5" /> Reportar
        </button>

        {user && (
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
        )}
      </div>
    </aside>
  );
}
