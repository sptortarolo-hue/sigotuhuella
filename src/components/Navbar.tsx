import { Link, useLocation } from 'react-router-dom';
import { PawPrint, Heart, Search, Monitor, Menu, X, PlusCircle, HandCoins, Users } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { name: 'Inicio', path: '/', icon: PawPrint },
    { name: 'Perdidos', path: '/perdidos', icon: Search },
    { name: 'Adopción', path: '/adopcion', icon: Heart },
    { name: 'Colaborar', path: '/colaborar', icon: HandCoins },
    { name: 'Sumate', path: '/sumate', icon: Users },
    { name: 'Publicar', path: '/reportar', icon: PlusCircle },
    { name: 'Admin', path: '/admin', icon: Monitor },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-brand-bg/80 backdrop-blur-md border-b border-brand-accent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="p-2.5 bg-brand-primary rounded-2xl transition-all group-hover:rotate-12 shadow-lg group-hover:shadow-brand-primary/20">
              <PawPrint className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-serif font-bold text-brand-primary tracking-tight">Sigo tu huella</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-brand-primary",
                  location.pathname === item.path ? "text-brand-primary font-bold" : "text-gray-600"
                )}
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            className="md:hidden p-2 text-brand-primary"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X /> : <Menu />}
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
            className="md:hidden overflow-hidden bg-brand-bg border-b border-brand-accent px-4 py-6 flex flex-col gap-4"
          >
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-3 text-lg font-medium p-2 rounded-lg",
                  location.pathname === item.path ? "bg-brand-primary/10 text-brand-primary" : "text-gray-600"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
