import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { useUiStore } from '../store/uiStore.js';
import api from '../services/api.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import NotificationBell from './NotificationBell.jsx';

export default function Header() {
  const { user, accessToken, clearAuth } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUiStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isDesktop || !window.electronAPI?.onFocusSearch) return undefined;

    return window.electronAPI.onFocusSearch(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select?.();
    });
  }, [isDesktop]);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}  // Even if server call fails, clear local state
    clearAuth();
    navigate('/login');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  // Close dropdown on Escape
  const handleMenuKeyDown = useCallback((e) => {
    if (e.key === 'Escape') setMenuOpen(false);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleMenuKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleMenuKeyDown);
    };
  }, [menuOpen, handleMenuKeyDown]);

  return (
    <header
      className="fixed left-0 right-0 z-50 h-14 bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-700 flex items-center px-4 gap-3"
      style={{ top: 'var(--tv-titlebar-h, 0px)' }}
    >
      {/* Hamburger menu â€” hidden on lg+ (1024px+) where sidebar is always inline */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden p-1.5 rounded-md text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800"
        aria-label="Toggle sidebar"
        aria-expanded={sidebarOpen}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {sidebarOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Logo */}
      <Link to="/home" className="flex items-center gap-2 font-bold text-emerald text-lg shrink-0">
        âš¡ ThreadVerse
      </Link>

      {/* Search bar â€” visible sm+ (640px+); on xs show a search icon button instead */}
      <form onSubmit={handleSearch} className="hidden sm:flex flex-1 max-w-xl">
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search ThreadVerse..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search ThreadVerse"
          className="w-full px-4 py-1.5 rounded-full border border-gray-300 dark:border-neutral-600 bg-gray-50 dark:bg-neutral-800 text-sm focus:outline-none focus:border-emerald focus:bg-white dark:focus:bg-neutral-700 dark:text-neutral-200 placeholder:text-gray-400 dark:placeholder:text-neutral-500"
        />
      </form>
      {/* Mobile search icon â€” visible below sm (640px) */}
      <button
        onClick={() => navigate('/search')}
        className="sm:hidden p-1.5 rounded-md text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800"
        aria-label="Search"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      {/* Right side: auth-aware controls */}
      <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
        {accessToken && user ? (
          <>
            <NotificationBell />
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-neutral-300 hover:text-emerald"
                aria-label={`User menu for ${user.username}`}
                aria-expanded={menuOpen}
                aria-haspopup="true"
              >
                {/* Avatar placeholder â€” real avatar on Day 7 */}
                <div className="w-7 h-7 rounded-full bg-emerald/10 flex items-center justify-center text-emerald font-bold text-xs">
                  {user.username?.[0]?.toUpperCase()}
                </div>
                <span className="hidden sm:block">{user.username}</span>
                <span className="text-xs text-gray-400">â–¾</span>
              </button>

              {/* Dropdown */}
              {menuOpen && (
                <div
                  className="absolute right-0 top-10 w-44 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg z-50 py-1"
                  role="menu"
                >
                  <Link to={`/u/${user.username}`} className="block px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-neutral-700" role="menuitem" onClick={() => setMenuOpen(false)}>Profile</Link>
                  <Link to="/settings" className="block px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-neutral-700" role="menuitem" onClick={() => setMenuOpen(false)}>Settings</Link>
                  <hr className="my-1 border-gray-200 dark:border-neutral-700" />
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-amaranth hover:bg-red-50 dark:hover:bg-amaranth/15" role="menuitem">
                    Log Out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex gap-1.5 sm:gap-2">
            <Link to="/login" className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm border border-emerald text-emerald rounded-full hover:bg-orange-50 dark:hover:bg-emerald/10">Log In</Link>
            <Link to="/register" className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-emerald text-white rounded-full hover:bg-emerald/90">Sign Up</Link>
          </div>
        )}
      </div>
    </header>
  );
}
