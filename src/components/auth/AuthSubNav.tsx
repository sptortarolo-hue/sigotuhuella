import { useLocation, useNavigate } from 'react-router-dom';
import { Home, PawPrint, User } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const tabs = [
  { label: 'Inicio', icon: Home, path: '/dashboard' },
  { label: 'Mascotas', icon: PawPrint, path: '/mi-mascota' },
  { label: 'Perfil', icon: User, path: '/perfil' },
];

export default function AuthSubNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    if (path === '/mi-mascota') return location.pathname.startsWith('/mi-mascota');
    if (path === '/perfil') return location.pathname === '/perfil';
    return false;
  };

  return (
    <nav className="flex items-stretch border-b border-brand-accent bg-white lg:hidden">
      {tabs.map((tab) => (
        <button
          key={tab.path}
          onClick={() => navigate(tab.path)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 px-3 transition-colors relative",
            isActive(tab.path)
              ? "text-brand-primary"
              : "text-gray-400 hover:text-gray-600"
          )}
        >
          <tab.icon className={cn("w-5 h-5", isActive(tab.path) && "fill-brand-primary/15")} />
          <span className={cn("text-[10px] font-semibold", isActive(tab.path) && "font-bold")}>
            {tab.label}
          </span>
          {isActive(tab.path) && (
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-brand-primary rounded-full" />
          )}
        </button>
      ))}
    </nav>
  );
}
