import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import api from '../services/api.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import NotificationBell from './NotificationBell.jsx';

export default function Header() {
  const { user, accessToken, clearAuth } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-4">
      {/* Logo */}
      <Link to="/home" className="flex items-center gap-2 font-bold text-orange-500 text-lg shrink-0">
        ⚡ ThreadVerse
      </Link>

      {/* Search bar — takes remaining space */}
      {/* Why 300ms debounce? To avoid firing a search on every keystroke.
          We'll add debounce logic when we build the full search on Day 7. */}
      <form onSubmit={handleSearch} className="flex-1 max-w-xl">
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search ThreadVerse..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-1.5 rounded-full border border-gray-300 bg-gray-50 text-sm focus:outline-none focus:border-orange-400 focus:bg-white"
        />
      </form>

      {/* Right side: auth-aware controls */}
      <div className="flex items-center gap-3 ml-auto shrink-0">
        {accessToken && user ? (
          <>
            <NotificationBell />
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-orange-500"
              >
                {/* Avatar placeholder — real avatar on Day 7 */}
                <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs">
                  {user.username?.[0]?.toUpperCase()}
                </div>
                <span className="hidden sm:block">{user.username}</span>
                <span className="text-xs text-gray-400">▾</span>
              </button>

              {/* Dropdown */}
              {menuOpen && (
                <div
                  className="absolute right-0 top-10 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <Link to={`/u/${user.username}`} className="block px-4 py-2 text-sm hover:bg-gray-50" onClick={() => setMenuOpen(false)}>Profile</Link>
                  <Link to="/settings" className="block px-4 py-2 text-sm hover:bg-gray-50" onClick={() => setMenuOpen(false)}>Settings</Link>
                  <hr className="my-1" />
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                    Log Out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex gap-2">
            <Link to="/login" className="px-3 py-1.5 text-sm border border-orange-500 text-orange-500 rounded-full hover:bg-orange-50">Log In</Link>
            <Link to="/register" className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded-full hover:bg-orange-600">Sign Up</Link>
          </div>
        )}
      </div>
    </header>
  );
}