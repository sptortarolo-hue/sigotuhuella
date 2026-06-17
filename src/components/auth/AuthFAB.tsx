import { useAuth } from '@/src/hooks/useAuth';

export default function AuthFAB({ onReportClick }: { onReportClick: () => void }) {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <button
      onClick={onReportClick}
      className="fixed bottom-24 right-6 z-50 w-14 h-14 bg-brand-primary text-white rounded-full flex items-center justify-center shadow-lg shadow-brand-primary/30 hover:shadow-xl hover:scale-105 active:scale-95 transition-all lg:hidden"
      aria-label="Reportar"
    >
      <span className="text-2xl leading-none font-bold">+</span>
    </button>
  );
}
