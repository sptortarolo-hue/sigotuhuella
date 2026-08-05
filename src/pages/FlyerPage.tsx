import { useNavigate } from 'react-router-dom';
import PublicFlyerGenerator from '@/src/components/PublicFlyerGenerator';
import { Helmet } from 'react-helmet-async';

export default function FlyerPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-brand-bg">
      <Helmet>
        <title>Crear flyer - Sigo Tu Huella</title>
        <meta name="description" content="Generá un flyer para compartir en redes sociales." />
      </Helmet>
      <PublicFlyerGenerator onClose={() => navigate(-1)} />
    </div>
  );
}
