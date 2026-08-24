import { Navigate } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children, isAdmin, isCoordinator }: { children: React.ReactNode; isAdmin?: boolean; isCoordinator?: boolean }) {
  const { user, isAdmin: isUserAdmin, isCoordinator: isUserCoordinator, loading } = useAuth();

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-brand-bg text-brand-primary">
      <Loader2 className="w-10 h-10 animate-spin" />
    </div>
  );

  if (!user) return <Navigate to="/" replace />;
  if (isAdmin && !isUserAdmin) return <Navigate to="/" replace />;
  if (isCoordinator && !isUserAdmin && !isUserCoordinator) return <Navigate to="/" replace />;

  return <>{children}</>;
}
