// Why a layout component?
// React Router v6 supports "nested routes" where a parent route renders a layout
// and child routes render inside it via <Outlet />.
// Every authenticated page uses this layout — we define Header + Sidebar once here.
import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import SearchModal from './SearchModal.jsx';
import SectionErrorBoundary from './SectionErrorBoundary.jsx';
import { useNotificationSocket } from '../hooks/useNotifications.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import UpdateBanner from './UpdateBanner.jsx';

function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div
      className="fixed inset-x-0 z-50 bg-yellow-500 text-yellow-950 text-center text-sm font-medium py-1.5"
      style={{ top: 'calc(3.5rem + var(--tv-titlebar-h, 0px))' }}
    >
      You are offline — some features may be unavailable
    </div>
  );
}

export default function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const isDesktop = useIsDesktop();
  useNotificationSocket();

  useEffect(() => {
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onFocusSearch) return undefined;

    return window.electronAPI.onFocusSearch(() => setSearchOpen(true));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {isDesktop && <UpdateBanner />}
      <Header />
      <OfflineBanner />
      {/* pt-14 pushes content below the fixed Header; on Win/Linux the TitleBar
          adds --tv-titlebar-h (32px) above it, so we use calc() to combine. */}
      <div
        className="max-w-6xl mx-auto px-4 flex gap-6"
        style={{ paddingTop: 'calc(3.5rem + var(--tv-titlebar-h, 0px))' }}
      >
        <SectionErrorBoundary sectionName="Sidebar">
          <Sidebar />
        </SectionErrorBoundary>
        {/* Main content area — child routes render here */}
        <main className="flex-1 py-4 min-w-0">
          <SectionErrorBoundary sectionName="Feed">
            <Outlet />
          </SectionErrorBoundary>
        </main>
      </div>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}