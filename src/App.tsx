import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import Navbar from '@/src/components/Navbar';
import PwaHandler from '@/src/components/PwaHandler';
import Home from '@/src/pages/Home';
import PetGallery from '@/src/components/PetGallery';
import { useAuth } from '@/src/hooks/useAuth';
import { Loader2 } from 'lucide-react';

// Lazy load admin pages
const Login = lazy(() => import('@/src/pages/Login'));
const Admin = lazy(() => import('@/src/pages/Admin'));
const ReportPet = lazy(() => import('@/src/pages/ReportPet'));
const Collaborate = lazy(() => import('@/src/pages/Collaborate'));
const Join = lazy(() => import('@/src/pages/Join'));
const Profile = lazy(() => import('@/src/pages/Profile'));
const MyPets = lazy(() => import('@/src/pages/MyPets'));
const Dashboard = lazy(() => import('@/src/pages/Dashboard'));
const PetDetail = lazy(() => import('@/src/pages/PetDetail'));
const Novedades = lazy(() => import('@/src/pages/Novedades'));
const NovedadDetail = lazy(() => import('@/src/pages/NovedadDetail'));
const LostPetGuide = lazy(() => import('@/src/pages/LostPetGuide'));

function ProtectedRoute({ children, isAdmin }: { children: React.ReactNode, isAdmin?: boolean }) {
  const { user, isAdmin: isUserAdmin, loading } = useAuth();

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-brand-bg text-brand-primary">
      <Loader2 className="w-10 h-10 animate-spin" />
    </div>
  );

  if (!user || (isAdmin && !isUserAdmin)) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-brand-bg">
        <PwaHandler />
        <Navbar />
        <main>
          <Suspense fallback={
            <div className="h-[60vh] flex items-center justify-center text-brand-primary">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          }>
            <Routes>
              <Route path="/" element={<Home />} />
               <Route path="/perdidos" element={<PetGallery type="lost" />} />
               <Route path="/adopcion" element={<PetGallery type="adoption" />} />
               <Route path="/pet/:id" element={<PetDetail />} />
               <Route path="/novedades" element={<Novedades />} />
               <Route path="/novedad/:id" element={<NovedadDetail />} />
               <Route path="/perdiste-a-tu-mascota" element={<LostPetGuide />} />
               <Route path="/reportar" element={<ReportPet />} />

              <Route path="/colaborar" element={<Collaborate />} />
              <Route path="/sumate" element={<Join />} />
              <Route path="/perfil" element={<Profile />} />
              <Route path="/mis-publicaciones" element={<MyPets />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute isAdmin>
                    <Admin />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>

        <footer className="bg-white border-t border-brand-accent py-12">
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
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-gray-800 mb-4 uppercase text-xs tracking-widest">Comunidad</h4>
                <ul className="space-y-2 text-gray-600 text-sm">
                  <li><Link to="/sumate" className="hover:text-brand-primary">Sumate</Link></li>
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
      </div>
    </Router>
  );
}