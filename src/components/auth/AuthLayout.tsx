import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import ReportSheet from './ReportSheet';

export default function AuthLayout() {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Mobile: TopBar */}
      <div className="lg:hidden">
        <TopBar />
      </div>

      {/* Desktop: Sidebar */}
      <Sidebar onReportClick={() => setReportOpen(true)} />

      {/* Main content */}
      <div className="lg:ml-64 pb-20 lg:pb-0">
        <Outlet />
      </div>

      {/* Mobile: BottomNav */}
      <BottomNav onReportClick={() => setReportOpen(true)} />

      {/* Report Sheet */}
      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}
