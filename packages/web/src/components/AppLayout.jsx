import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';
import SearchModal from './SearchModal.jsx';
import SectionErrorBoundary from './SectionErrorBoundary.jsx';
import RouteFade from './RouteFade.jsx';
import { useNotificationSocket } from '../hooks/useNotifications.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import UpdateBanner from './UpdateBanner.jsx';
import AuroraBackground from './AuroraBackground.jsx';

// Feed-scene aurora — minimal by design: a single violet blob, dim (0.14),
// hugging the top of the page and fading out below 60% viewport height via
// the `.aurora-bg--fade-bottom` mask so the dense card list below the fold
// scrolls over clean space. Static (no drift) — the feed is a dense scanning
// surface and any motion here fatigues.
const FEED_BLOBS = [
  {
    color: 'violet',
    static: true,
    style: {
      top: '-35%',
      left: '50%',
      width: '72vw',
      height: '72vw',
      transform: 'translateX(-50%)',
      '--blob-opacity': 0.14,
    },
  },
];

function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div
      className="fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ top: 'calc(3.5rem + var(--tv-titlebar-h, 0px))' }}
    >
      <div className="rounded-lg bg-amaranth/10 dark:bg-amaranth/15 border border-amaranth/30 dark:border-amaranth/40 px-4 py-2.5 text-sm text-amaranth dark:text-amaranth mt-3 shadow-sm">
        You&apos;re offline — showing cached content
      </div>
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
    <div className="min-h-screen bg-gray-50 dark:bg-transparent">
      {/* Feed aurora lives in this persistent layout shell — NOT inside the
          scrolling feed component — so it never remounts on infinite-scroll
          or feed re-renders (perf rule). */}
      {location.pathname === '/home' && <AuroraBackground blobs={FEED_BLOBS} fade />}
      {isDesktop && <UpdateBanner />}
      <Header />
      <OfflineBanner />
      {/* pt-14 pushes content below the fixed Header; on Win/Linux the TitleBar
          adds --tv-titlebar-h (32px) above it, so we use calc() to combine. */}
      <div
        className="relative z-10 max-w-6xl mx-auto px-4 flex gap-6"
        style={{ paddingTop: 'calc(3.5rem + var(--tv-titlebar-h, 0px))' }}
      >
        <SectionErrorBoundary sectionName="Sidebar">
          <Sidebar />
        </SectionErrorBoundary>
        {/* Main content area — child routes render here. RouteFade is keyed on
            pathname so each page crossfades in while the shell stays mounted. */}
        <main className="flex-1 py-4 min-w-0">
          <SectionErrorBoundary sectionName="Feed">
            <RouteFade key={location.pathname}>
              <Outlet />
            </RouteFade>
          </SectionErrorBoundary>
        </main>
      </div>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
