import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import AuthSubNav from './AuthSubNav';
import AuthFAB from './AuthFAB';
import Sidebar from './Sidebar';
import ReportSheet from './ReportSheet';

export default function AuthLayout() {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Mobile: TopBar + AuthSubNav */}
      <div className="lg:hidden">
        <TopBar />
        <AuthSubNav />
      </div>

      {/* Desktop: Sidebar */}
      <Sidebar onReportClick={() => setReportOpen(true)} />

      {/* Main content */}
      <div className="lg:ml-64 pb-16 lg:pb-0">
        <Outlet />
      </div>

      {/* Mobile: Floating FAB */}
      <AuthFAB onReportClick={() => setReportOpen(true)} />

      {/* Report Sheet */}
      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}
