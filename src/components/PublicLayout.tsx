import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import Navbar from '@/src/components/Navbar';
import PublicMobileTopBar from '@/src/components/PublicMobileTopBar';
import AuthSubNav from '@/src/components/auth/AuthSubNav';

export default function PublicLayout() {
  const { user } = useAuth();

  return (
    <>
      <PublicMobileTopBar />
      {user && <AuthSubNav />}
      <Navbar />
      <main className="pb-16 md:pb-0">
        <Outlet />
      </main>
      <footer className="hidden md:block bg-white border-t border-brand-accent py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 md:gap-12">
            <div className="col-span-2 md:col-span-1">
              <span className="text-xl md:text-2xl font-serif font-bold text-brand-primary mb-4 block">Sigo tu huella</span>
              <p className="text-gray-500 max-w-sm leading-relaxed text-sm">
                Comprometidos con el bienestar animal en nuestra zona sur.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-gray-800 mb-4 uppercase text-xs tracking-widest">Navegación</h4>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li><Link to="/perdidos" className="hover:text-brand-primary">Mascotas Reportadas</Link></li>
                <li><Link to="/adopcion" className="hover:text-brand-primary">Adopción</Link></li>
                <li><Link to="/reportar" className="hover:text-brand-primary">Publicar</Link></li>
                <li><Link to="/reportar-rapido" className="hover:text-brand-primary">Reporte Rápido</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-gray-800 mb-4 uppercase text-xs tracking-widest">Comunidad</h4>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li>
                  <Link to="/sumate" className="hover:text-brand-primary">
                    {user && user.volunteer_status === 'active' ? 'Asociado' : 'Sumate'}
                  </Link>
                </li>
                <li><Link to="/colaborar" className="hover:text-brand-primary">Colaborar</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-gray-800 mb-4 uppercase text-xs tracking-widest">Barrios</h4>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li>Villa Garibaldi</li>
                <li>Parque Sicardi</li>
                <li>Ignacio Correas</li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-brand-accent flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-gray-400 uppercase tracking-widest font-bold">
            <span>© 2026 Sigo tu huella</span>
            <span>Zona Sur, La Plata</span>
          </div>
        </div>
      </footer>
    </>
  );
}
