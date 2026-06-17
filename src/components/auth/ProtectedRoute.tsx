import { Navigate } from 'react-router-dom';
import { useAuth } from '@/src/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children, isAdmin }: { children: React.ReactNode; isAdmin?: boolean }) {
  const { user, isAdmin: isUserAdmin, loading } = useAuth();

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-brand-bg text-brand-primary">
      <Loader2 className="w-10 h-10 animate-spin" />
    </div>
  );

  if (!user || (isAdmin && !isUserAdmin)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
