import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';

import { AuthProvider } from './context/AuthContext.jsx';
import { useAuthInit } from './hooks/useAuthInit.js';
import { useIsDesktop } from './hooks/useIsDesktop.js';

// Layout & Route Guards
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// Lazy-loaded Pages
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const CreateCommunity = lazy(() => import('./pages/CreateCommunity.jsx'));
const CommunityBrowser = lazy(() => import('./pages/CommunityBrowser.jsx'));
const CommunityPage = lazy(() => import('./pages/CommunityPage.jsx'));
const TiptapSmokePage = lazy(() => import('./pages/TiptapSmokePage.jsx'));
const PostDetail = lazy(() => import('./components/PostDetail.jsx'));
const SubmitPostPage = lazy(() => import('./pages/SubmitPostPage.jsx'));
const SearchPage = lazy(() => import('./pages/SearchPage.jsx'));
const AIChatPage = lazy(() => import('./pages/AIChatPage.jsx'));
const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'));

function PageSkeleton() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
    },
  },
});

// Runs after AuthProvider is mounted
function AppRoutes() {
  const { isInitializing } = useAuthInit();

  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center">
        Loading session...
      </div>
    );
  }

  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/submit" element={<SubmitPostPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/ai/chat" element={<AIChatPage />} />

            {/* Community */}
            <Route path="/communities" element={<CommunityBrowser />} />
            <Route path="/communities/create" element={<CreateCommunity />} />
            <Route path="/community/:slug" element={<CommunityPage />} />

            {/* User */}
            <Route path="/u/:username" element={<ProfilePage />} />

            {/* Posts */}
            <Route path="/posts/:id" element={<PostDetail />} />

            {/* Dev */}
            <Route path="/tiptap-smoke" element={<TiptapSmokePage />} />
          </Route>
        </Route>

        <Route path="*" element={<div>404 — Not Found</div>} />
      </Routes>
    </Suspense>
  );
}

/**
 * Handles Electron global shortcuts.
 * Ctrl/Cmd + Shift + A → /ai/chat
 */
function DesktopShortcutBridge() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (!isDesktop || !window.electronAPI) return;

    const removeNavigate = window.electronAPI.onNavigate((path) => {
      if (path) {
        navigate(path);
      }
    });

    const removeOpenAIChat = window.electronAPI.onOpenAIChat(() => {
      navigate('/ai/chat');
    });

    return () => {
      removeNavigate?.();
      removeOpenAIChat?.();
    };
  }, [isDesktop, navigate]);

  return null;
}

export default function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <DesktopShortcutBridge />
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}