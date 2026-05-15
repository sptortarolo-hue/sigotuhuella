import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PawPrint, Heart, Search, Menu, X, PlusCircle, HandCoins, Users, User, LogOut, Settings, LayoutList, LogIn, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/hooks/useAuth';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

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

const navItems = [
     { name: 'Inicio', path: '/', icon: PawPrint },
     { name: 'Novedades', path: '/novedades', icon: Sparkles },
     { name: 'Mascotas Reportadas', path: '/perdidos', icon: Search },
     { name: 'Adopción', path: '/adopcion', icon: Heart },
     { name: 'Colaborar', path: '/colaborar', icon: HandCoins },
     { name: 'Sumate', path: '/sumate', icon: Users },
      { name: 'Reportar', path: '/reportar', icon: PlusCircle },
   ];

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
          <div className="hidden md:flex items-center gap-1">
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

            {!user && (
              <Link
                to="/login"
                className="ml-2 px-4 py-2 bg-brand-primary text-white text-xs sm:text-sm font-bold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all whitespace-nowrap"
              >
                Iniciar Sesión
              </Link>
            )}

            {user && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="p-2 bg-brand-primary/10 text-brand-primary rounded-xl hover:bg-brand-primary/20 transition-colors"
                >
                  <User className="w-5 h-5" />
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
                        <button onClick={() => handleNavClick('/dashboard')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
                          <PawPrint className="w-4 h-4 text-brand-primary" /> Mi Panel
                        </button>
                        <button onClick={() => handleNavClick('/mis-publicaciones')} className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-3 hover:bg-brand-bg transition-colors">
                          <LayoutList className="w-4 h-4 text-brand-primary" /> Mis Publicaciones
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
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 text-brand-primary"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Menú"
          >
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden bg-brand-bg border-b border-brand-accent px-4 py-4 flex flex-col gap-2"
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
            {user ? (
              <div className="border-t border-brand-accent pt-3 mt-2">
                <p className="text-xs text-gray-400 px-2 mb-2 font-bold uppercase tracking-widest">Mi Cuenta</p>
                <Link to="/dashboard" onClick={() => handleNavClick('/dashboard')} className="flex items-center gap-3 text-base font-medium p-3 rounded-lg text-gray-600 hover:bg-brand-bg">
                  <PawPrint className="w-5 h-5 shrink-0" /> Mi Panel
                </Link>
                <Link to="/mis-publicaciones" onClick={() => handleNavClick('/mis-publicaciones')} className="flex items-center gap-3 text-base font-medium p-3 rounded-lg text-gray-600 hover:bg-brand-bg">
                  <LayoutList className="w-5 h-5 shrink-0" /> Mis Publicaciones
                </Link>
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