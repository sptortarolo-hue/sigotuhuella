import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import PwaHandler from '@/src/components/PwaHandler';
import ScrollToTop from '@/src/components/ScrollToTop';
import PublicLayout from '@/src/components/PublicLayout';
import PublicMobileLayout from '@/src/components/PublicMobileLayout';
import PublicMobileNav from '@/src/components/PublicMobileNav';
import AuthLayout from '@/src/components/auth/AuthLayout';
import ProtectedRoute from '@/src/components/auth/ProtectedRoute';
import Home from '@/src/pages/Home';
import PetGallery from '@/src/components/PetGallery';
import { Loader2 } from 'lucide-react';

const Login = lazy(() => import('@/src/pages/Login'));
const Admin = import.meta.env.VITE_PLAY_BUILD === 'true' ? null : lazy(() => import('@/src/pages/Admin'));
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
const ForgotPassword = lazy(() => import('@/src/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/src/pages/ResetPassword'));
const VerifyMember = lazy(() => import('@/src/pages/VerifyMember'));
const MemberCardPage = lazy(() => import('@/src/pages/MemberCardPage'));

const DiffusionPage = lazy(() => import('@/src/pages/DiffusionPage'));
const QuickReport = lazy(() => import('@/src/pages/QuickReport'));
const LostPetReport = lazy(() => import('@/src/pages/LostPetReport'));
const CompleteRegistration = lazy(() => import('@/src/pages/CompleteRegistration'));
const MyPetsPortal = lazy(() => import('@/src/pages/MyPetsPortal'));
const MyPetDetail = lazy(() => import('@/src/pages/MyPetDetail'));
const PublicPetProfile = lazy(() => import('@/src/pages/PublicPetProfile'));
const VetPetProfile = lazy(() => import('@/src/pages/VetPetProfile'));
const Feed = lazy(() => import('@/src/pages/Feed'));
const Contests = lazy(() => import('@/src/pages/Contests'));
const SolicitarChapita = lazy(() => import('@/src/pages/SolicitarChapita'));
const AdoptionClaim = lazy(() => import('@/src/pages/AdoptionClaim'));
const ManualHub = lazy(() => import('@/src/pages/ManualHub'));
const ManualAdopcion = lazy(() => import('@/src/pages/ManualAdopcion'));
const ManualChapita = lazy(() => import('@/src/pages/ManualChapita'));
const VerifyEmail = lazy(() => import('@/src/pages/VerifyEmail'));
const FlyerPage = lazy(() => import('@/src/pages/FlyerPage'));
const MyCases = lazy(() => import('@/src/pages/MyCases'));
const IS_PLAY_BUILD = import.meta.env.VITE_PLAY_BUILD === 'true';

function CaseRedirect() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!id) { navigate('/', { replace: true }); return; }
    fetch(`/api/cases/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json())
      .then(data => {
        if (data.case?.pet_id) navigate(`/pet/${data.case.pet_id}`, { replace: true });
        else setError(true);
      })
      .catch(() => setError(true));
  }, [id, navigate]);
  if (error) return <Navigate to="/" replace />;
  return (
    <div className="h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
        <span className="font-bold uppercase tracking-widest text-xs text-brand-primary">Cargando caso...</span>
      </div>
    </div>
  );
}

// En el build de Google Play se elimina toda funcionalidad de dinero real
// (rifas y sorteos) para no disparar la política de "real-money gambling".
const Rifas = IS_PLAY_BUILD ? null : lazy(() => import('@/src/pages/Rifas'));
const RifaDetail = IS_PLAY_BUILD ? null : lazy(() => import('@/src/pages/RifaDetail'));
const RifaPagoExito = IS_PLAY_BUILD ? null : lazy(() => import('@/src/pages/RifaPagoExito'));
const RifaPagoResultado = IS_PLAY_BUILD ? null : lazy(() => import('@/src/pages/RifaPagoResultado'));
const Legales = lazy(() => import('@/src/pages/Legales'));
const EliminarCuenta = lazy(() => import('@/src/pages/EliminarCuenta'));

const fallback = (
  <div className="h-[60vh] flex items-center justify-center text-brand-primary">
    <Loader2 className="w-8 h-8 animate-spin" />
  </div>
);

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <div className="min-h-screen bg-brand-bg">
        <PwaHandler />
        <Suspense fallback={fallback}>
          <Routes>
            {/* Public routes with Navbar + Footer */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/perdidos" element={<PetGallery type="lost" />} />
              <Route path="/adopcion" element={<PetGallery type="adoption" />} />
              <Route path="/pet/:id" element={<PetDetail />} />
              <Route path="/novedades" element={<Novedades />} />
              <Route path="/novedad/:id" element={<NovedadDetail />} />
              <Route path="/perdiste-a-tu-mascota" element={<LostPetGuide />} />
              <Route path="/caso/:id" element={<CaseRedirect />} />
              <Route path="/reportar" element={<ReportPet />} />
              <Route path="/reportar-rapido" element={<QuickReport />} />
              <Route path="/perdi-mi-mascota" element={<LostPetReport />} />
              <Route path="/completar-registro" element={<CompleteRegistration />} />
              <Route path="/difusion" element={<DiffusionPage />} />
              <Route path="/descargar-cartel" element={<DiffusionPage />} />
              <Route path="/flyer" element={<FlyerPage />} />
              <Route path="/compartir-qr" element={<DiffusionPage />} />
              <Route path="/colaborar" element={<Collaborate />} />
              {!IS_PLAY_BUILD && (
                <>
                  <Route path="/rifas" element={<Rifas />} />
                  <Route path="/rifas/pago-exitoso" element={<RifaPagoExito />} />
                  <Route path="/rifas/pago-fallido" element={<RifaPagoResultado />} />
                  <Route path="/rifas/pago-pendiente" element={<RifaPagoResultado />} />
                  <Route path="/rifas/:id" element={<RifaDetail />} />
                </>
              )}
              <Route path="/solicitar-chapita" element={<SolicitarChapita />} />
              <Route path="/adopcion/reclamar/:token" element={<AdoptionClaim />} />
              <Route path="/manual" element={<ManualHub />} />
              <Route path="/manual/adopcion" element={<ManualAdopcion />} />
              <Route path="/manual/chapita" element={<ManualChapita />} />
              <Route path="/verificar-email" element={<VerifyEmail />} />
              <Route path="/sumate" element={<Join />} />
              <Route path="/verificar/:memberNumber" element={<VerifyMember />} />
              <Route path="/legales" element={<Legales />} />
              <Route path="/eliminar-cuenta" element={<EliminarCuenta />} />
              <Route path="/mascota/:shareToken" element={<PublicPetProfile />} />
              <Route path="/vet/:token" element={<VetPetProfile />} />
            </Route>

            {/* Auth routes with sidebar/bottom-nav layout */}
            <Route
              element={
                <ProtectedRoute>
                  <AuthLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/mi-mascota" element={<MyPetsPortal />} />
              <Route path="/mi-mascota/:id" element={<MyPetDetail />} />
              <Route path="/mis-publicaciones" element={<MyPets />} />
              <Route path="/mis-casos" element={<MyCases />} />
              <Route path="/mis-casos/:id" element={<CaseRedirect />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/concursos" element={<Contests />} />
              <Route path="/perfil" element={<Profile />} />
              <Route path="/mi-carnet" element={<MemberCardPage />} />
              {!IS_PLAY_BUILD && (
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute isAdmin>
                      <Admin />
                    </ProtectedRoute>
                  }
                />
              )}
            </Route>

            {/* Standalone routes with mobile shell */}
            <Route element={<PublicMobileLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>

        {/* Global mobile bottom nav — always visible */}
        <PublicMobileNav />
      </div>
    </Router>
  );
}
