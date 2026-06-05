import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PawPrint, Heart, Search, Menu, X, PlusCircle, HandCoins, Users, User, LogOut, Settings, LayoutList, LogIn, Sparkles, CreditCard, FileText, Share2, Bell, BellOff } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/hooks/useAuth';
import { subscribe, unsubscribe, isSubscribed, isSupported } from '@/src/lib/pushService';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  const isMember = user && user.volunteer_status === 'active';
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

  const navItems = [
    { name: 'Inicio', path: '/', icon: PawPrint },
    ...(user ? [{ name: 'Reportar', path: '/reportar', icon: FileText }] : []),
    { name: 'Mascotas Reportadas', path: '/perdidos', icon: Search },
    { name: 'Adopción', path: '/adopcion', icon: Heart },
    { name: 'Colaborar', path: '/colaborar', icon: HandCoins },
    { name: 'Difusión', path: '/difusion', icon: Share2 },
    { name: isMember ? 'Asociado' : 'Sumate', path: '/sumate', icon: Users },
    { name: 'Novedades', path: '/novedades', icon: Sparkles },
  ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    setIsOpen(false);
    navigate('/');
  };

  const handleNavClick = (path: string) => {
    setIsOpen(false);
    setUserMenuOpen(false);
    navigate(path);
  };

  return (
    <nav className="sticky top-0 z-50 bg-brand-bg/95 backdrop-blur-md border-b border-brand-accent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 sm:h-20 items-center">
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <div className="p-1.5 sm:p-2.5 bg-brand-primary rounded-xl sm:rounded-2xl transition-all group-hover:rotate-12 shadow-lg group-hover:shadow-brand-primary/20">
              <PawPrint className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className="text-lg sm:text-2xl font-serif font-bold text-brand-primary tracking-tight whitespace-nowrap">Sigo tu huella</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center justify-between flex-1 ml-8">
            <div className="flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "text-xs sm:text-sm font-medium transition-colors hover:text-brand-primary px-2 py-1 rounded-lg whitespace-nowrap",
                    location.pathname === item.path ? "text-brand-primary font-bold" : "text-gray-600"
                  )}
                >
                  {item.name}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {pushEnabled !== null && (
                <button
                  onClick={handleBellClick}
                  title={pushEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    pushEnabled ? "text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20" : "text-gray-400 hover:text-brand-primary hover:bg-brand-primary/10"
                  )}
                >
                  {pushEnabled ? <Bell className="w-4 h-4 sm:w-5 sm:h-5" /> : <BellOff className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              )}
              <div className="w-px h-6 bg-gray-300" />

              {!user && (
                <Link
                  to="/login"
                  className="px-4 py-2 bg-brand-primary text-white text-xs sm:text-sm font-bold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all whitespace-nowrap"
                >
                  Iniciar Sesión
                </Link>
              )}

              {user && (
                <>
                <span className="hidden lg:block text-sm text-gray-700 bg-brand-primary/5 px-3 py-1.5 rounded-full font-medium">Hola, {user.display_name || user.email}</span>
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="p-0.5 bg-brand-primary/10 text-brand-primary rounded-full hover:bg-brand-primary/20 transition-colors flex items-center justify-center overflow-hidden w-9 h-9 border border-brand-accent hover:border-brand-primary"
                  >
                    {user.avatar_type === 'photo' && user.avatar_data ? (
                      <img 
                        src={`data:${user.avatar_mime_type || 'image/jpeg'};base64,${user.avatar_data}`} 
                        alt="Avatar" 
                        className="w-full h-full object-cover rounded-full" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-brand-primary/10 rounded-full">
                        <User className="w-5 h-5" />
                      </div>
                    )}
                  </button>
                  <AnimatePresence>
                    {userMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-brand-accent overflow-hidden z-50"
                      >
                        <div className="px-4 py-3 border-b border-brand-accent bg-brand-bg/50">
                          <p className="text-sm font-bold text-brand-primary truncate">{user.display_name || user.email}</p>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
      <div className="py-1">
        {isAdmin && (
          <button onClick={() => handleNavClick('/admin')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-primary/5 text-brand-primary font-bold transition-colors border-b border-brand-accent">
            <Settings className="w-4 h-4 text-brand-primary animate-pulse" /> Panel Admin
          </button>
        )}
        <button onClick={() => handleNavClick('/dashboard')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
          <PawPrint className="w-4 h-4 text-brand-primary" /> Mi Panel
        </button>
        <button onClick={() => handleNavClick('/mis-publicaciones')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
          <LayoutList className="w-4 h-4 text-brand-primary" /> Mis Publicaciones
        </button>
        <button onClick={() => handleNavClick('/mi-mascota')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
          <Heart className="w-4 h-4 text-brand-secondary" /> Mi Mascota
        </button>
        {isMember && (
          <button onClick={() => handleNavClick('/mi-carnet')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
            <CreditCard className="w-4 h-4 text-brand-primary" /> Mi Carnet
          </button>
        )}
        <button onClick={() => handleNavClick('/feed')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
          <Sparkles className="w-4 h-4 text-brand-primary" /> Comunidad
        </button>
        <button onClick={() => handleNavClick('/perfil')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
          <Settings className="w-4 h-4 text-brand-primary" /> Editar Perfil
        </button>
        <button onClick={handleLogout} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-red-50 text-red-600 transition-colors">
          <LogOut className="w-4 h-4" /> Cerrar Sesión
        </button>
      </div>
    </motion.div>
  )}
</AnimatePresence>
</div>
</>)}
            </div>
          </div>

          {/* Mobile: login/avatar + hamburger */}
          <div className="flex items-center gap-2 md:hidden">
            {!user ? (
              <Link
                to="/login"
                className="px-3 py-1.5 bg-brand-primary text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all whitespace-nowrap"
              >
                Iniciar
              </Link>
            ) : (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="w-9 h-9 rounded-full overflow-hidden border-2 border-brand-accent hover:border-brand-primary transition-colors"
                >
                  {user.avatar_type === 'photo' && user.avatar_data ? (
                    <img
                      src={`data:${user.avatar_mime_type || 'image/jpeg'};base64,${user.avatar_data}`}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-brand-primary/10">
                      <User className="w-5 h-5 text-brand-primary" />
                    </div>
                  )}
                </button>
                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ type: "spring", duration: 0.2 }}
                      style={{ transformOrigin: "top right" }}
                      className="absolute right-0 top-full mt-2 mr-[-16px] w-56 bg-white rounded-2xl shadow-xl border border-brand-accent overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 border-b border-brand-accent bg-brand-bg/50">
                        <p className="text-sm font-bold text-brand-primary truncate">{user.display_name || user.email}</p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      </div>
                      <div className="py-1">
                        {isAdmin && (
                          <button onClick={() => handleNavClick('/admin')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-primary/5 text-brand-primary font-bold transition-colors border-b border-brand-accent">
                            <Settings className="w-4 h-4 text-brand-primary animate-pulse" /> Panel Admin
                          </button>
                        )}
                        <button onClick={() => handleNavClick('/dashboard')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
                          <PawPrint className="w-4 h-4 text-brand-primary" /> Mi Panel
                        </button>
        <button onClick={() => handleNavClick('/mis-publicaciones')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
          <LayoutList className="w-4 h-4 text-brand-primary" /> Mis Publicaciones
        </button>
        <button onClick={() => handleNavClick('/mi-mascota')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
          <Heart className="w-4 h-4 text-brand-secondary" /> Mi Mascota
        </button>
        {isMember && (
          <button onClick={() => handleNavClick('/mi-carnet')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
            <CreditCard className="w-4 h-4 text-brand-primary" /> Mi Carnet
          </button>
        )}
        <button onClick={() => handleNavClick('/feed')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
          <Sparkles className="w-4 h-4 text-brand-primary" /> Comunidad
        </button>
        <button onClick={() => handleNavClick('/perfil')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
          <Settings className="w-4 h-4 text-brand-primary" /> Editar Perfil
        </button>
        <button onClick={handleLogout} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-red-50 text-red-600 transition-colors">
          <LogOut className="w-4 h-4" /> Cerrar Sesión
        </button>
      </div>
    </motion.div>
  )}
</AnimatePresence>
</div>
)}
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
        <button
          className="p-2 text-brand-primary"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Menú"
        >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-y-auto max-h-[calc(100dvh-4rem)] bg-brand-bg border-b border-brand-accent px-4 py-4 flex flex-col gap-2"
          >
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => handleNavClick(item.path)}
                className={cn(
                  "flex items-center gap-3 text-base font-medium p-3 rounded-lg transition-colors",
                  location.pathname === item.path ? "bg-brand-primary/10 text-brand-primary" : "text-gray-600"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.name}
              </Link>
        ))}
        {pushEnabled !== null && (
          <button
            onClick={() => { handleBellClick(); }}
            className={cn(
              "w-full flex items-center gap-3 text-base font-medium p-3 rounded-lg transition-colors",
              pushEnabled ? "text-brand-primary bg-brand-primary/10" : "text-gray-600"
            )}
          >
            {pushEnabled ? <Bell className="w-5 h-5 shrink-0" /> : <BellOff className="w-5 h-5 shrink-0" />}
            {pushEnabled ? 'Notificaciones activadas' : 'Activar notificaciones'}
          </button>
        )}
        {user ? (
              <div className="border-t border-brand-accent pt-3 mt-2">
                <p className="text-xs text-gray-400 px-2 mb-2 font-bold uppercase tracking-widest">Mi Cuenta</p>
                <div className="flex items-center gap-3 px-2 mb-3 pb-3 border-b border-brand-accent">
                  {user.avatar_type === 'photo' && user.avatar_data ? (
                    <img
                      src={`data:${user.avatar_mime_type || 'image/jpeg'};base64,${user.avatar_data}`}
                      alt="Avatar"
                      className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-brand-accent"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0 border-2 border-brand-accent">
                      <User className="w-5 h-5 text-brand-primary" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-brand-primary truncate">{user.display_name || user.email}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                </div>
                {isAdmin && (
                  <Link to="/admin" onClick={() => handleNavClick('/admin')} className="flex items-center gap-3 text-base font-bold p-3 rounded-lg text-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10 mb-2">
                    <Settings className="w-5 h-5 shrink-0" /> Panel Admin
                  </Link>
                )}
                <Link to="/dashboard" onClick={() => handleNavClick('/dashboard')} className="flex items-center gap-3 text-base font-medium p-3 rounded-lg text-gray-600 hover:bg-brand-bg">
                  <PawPrint className="w-5 h-5 shrink-0" /> Mi Panel
                </Link>
                <Link to="/mis-publicaciones" onClick={() => handleNavClick('/mis-publicaciones')} className="flex items-center gap-3 text-base font-medium p-3 rounded-lg text-gray-600 hover:bg-brand-bg">
                  <LayoutList className="w-5 h-5 shrink-0" /> Mis Publicaciones
                </Link>
                {isMember && (
                  <Link to="/mi-carnet" onClick={() => handleNavClick('/mi-carnet')} className="flex items-center gap-3 text-base font-medium p-3 rounded-lg text-gray-600 hover:bg-brand-bg">
                    <CreditCard className="w-5 h-5 shrink-0" /> Mi Carnet
                  </Link>
                )}
                <Link to="/perfil" onClick={() => handleNavClick('/perfil')} className="flex items-center gap-3 text-base font-medium p-3 rounded-lg text-gray-600 hover:bg-brand-bg">
                  <Settings className="w-5 h-5 shrink-0" /> Editar Perfil
                </Link>
                <button onClick={handleLogout} className="w-full flex items-center gap-3 text-base font-medium p-3 rounded-lg text-red-600 hover:bg-red-50">
                  <LogOut className="w-5 h-5 shrink-0" /> Cerrar Sesión
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => handleNavClick('/login')}
                className="flex items-center gap-3 text-base font-medium p-3 rounded-lg bg-brand-primary/10 text-brand-primary"
              >
                <LogIn className="w-5 h-5 shrink-0" /> Iniciar Sesión
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}