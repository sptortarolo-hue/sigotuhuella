import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Mobile: TopBar */}
      <div className="lg:hidden">
        <TopBar />
      </div>

      {/* Desktop: Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="lg:ml-64 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <Outlet />
      </div>
    </div>
  );
}
