import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import api from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { useUiStore } from '../store/uiStore.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';

export default function Sidebar() {
  const { accessToken } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUiStore();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const [appVersion, setAppVersion] = useState(null);

  useEffect(() => {
    if (isDesktop) {
      window.electronAPI.getAppVersion().then(setAppVersion);
    }
  }, [isDesktop]);

  // Close sidebar on mobile when navigating (only when overlay is open)
  useEffect(() => {
    if (sidebarOpen) {
      toggleSidebar();
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data } = useQuery({
    queryKey: ['sidebar-communities'],
    queryFn: () => api.get('/communities?limit=10').then(r => r.data),
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <>
      {/* Mobile overlay backdrop — only shows below lg breakpoint */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar — CSS-driven responsive behavior:
          Below lg: fixed overlay drawer (shown/hidden via translateX)
          lg+: inline alongside content (always visible, no overlay) */}
      <aside
        className={`
          shrink-0 pt-2
          fixed top-0 left-0 z-50 h-full w-64 overflow-y-auto
          bg-white dark:bg-neutral-900 border-r border-gray-200 dark:border-neutral-700
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:translate-x-0 lg:h-auto lg:w-56 lg:border-r-0 lg:transform-none lg:transition-none
        `}
        style={{ paddingTop: 'calc(3.5rem + var(--tv-titlebar-h, 0px))' }}
      >
        <nav className="space-y-0.5">
          <p className="px-3 py-2 text-xs font-semibold text-gray-400 tracking-wide">Feeds</p>
          <SidebarLink to="/home" label="Home" active={location.pathname === '/home'} />
          <SidebarLink to="/popular" label="Popular" active={location.pathname === '/popular'} />
          <SidebarLink to="/all" label="All" active={location.pathname === '/all'} />

          {data?.data?.length > 0 && (
            <>
              <p className="px-3 py-2 mt-3 text-xs font-semibold text-gray-400 tracking-wide">Communities</p>
              {data.data.map(community => (
                <SidebarLink
                  key={community._id}
                  to={`/r/${community.slug}`}
                  label={`r/${community.slug}`}
                  active={location.pathname === `/r/${community.slug}`}
                />
              ))}
            </>
          )}

          <hr className="my-3 border-gray-100 dark:border-neutral-700" />
          <SidebarLink to="/communities/create" label="+ Create Community" active={false} />
          <SidebarLink to="/tiptap-smoke" label="Tiptap Smoke" active={location.pathname === '/tiptap-smoke'} />

          {isDesktop && (
            <>
              <hr className="my-3 border-gray-100 dark:border-neutral-700" />
              <p className="px-3 py-2 text-xs font-semibold text-gray-400 tracking-wide">Desktop</p>
              <SidebarLink
                to="/settings#desktop"
                label="Desktop Settings"
                active={location.pathname === '/settings' && location.hash === '#desktop'}
              />
              {appVersion && (
                <span className="block px-3 py-1.5 text-xs text-gray-400">v{appVersion}</span>
              )}
            </>
          )}
        </nav>
      </aside>
    </>
  );
}

function SidebarLink({ to, label, active }) {
  return (
    <Link
      to={to}
      className={`block px-3 py-1.5 text-sm rounded-md transition-colors ${
        active
          ? 'bg-emerald/10 text-emerald font-medium'
          : 'text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800'
      }`}
    >
      {label}
    </Link>
  );
}
