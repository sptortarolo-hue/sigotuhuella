import { useNavigate } from 'react-router-dom';
import PublicFlyerGenerator from '@/src/components/PublicFlyerGenerator';

export default function FlyerPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-brand-bg">
      <PublicFlyerGenerator onClose={() => navigate(-1)} />
    </div>
  );
}
