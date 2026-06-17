import { Outlet } from 'react-router-dom';
import PublicMobileTopBar from '@/src/components/PublicMobileTopBar';

export default function PublicMobileLayout() {
  return (
    <>
      <PublicMobileTopBar />
      <main className="pt-14 md:pt-0 pb-16 md:pb-0">
        <Outlet />
      </main>
    </>
  );
}
