import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './context/AuthContext.jsx';
import { useAuthInit } from './hooks/useAuthInit.js';
import { useIsDesktop } from './hooks/useIsDesktop.js';

// Layout & Route Guards
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// Pages
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import CreateCommunity from './pages/CreateCommunity.jsx';
import CommunityBrowser from './pages/CommunityBrowser.jsx';
import CommunityPage from './pages/CommunityPage.jsx';
import TiptapSmokePage from './pages/TiptapSmokePage.jsx';
import PostDetail from './components/PostDetail.jsx';
import SubmitPostPage from './pages/SubmitPostPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import AIChatPage from './pages/AIChatPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30 * 1000 } },
});

// Separate component so useAuthInit runs inside AuthProvider
function AppRoutes() {
  const { isInitializing } = useAuthInit();

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-500 font-medium animate-pulse">Loading session...</div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/submit" element={<SubmitPostPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/ai/chat" element={<AIChatPage />} />
          
          {/* Community Routes */}
          <Route path="/communities" element={<CommunityBrowser />} />
          <Route path="/communities/create" element={<CreateCommunity />} />
          <Route path="/community/:slug" element={<CommunityPage />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/posts/:id" element={<PostDetail />} />
          <Route path="/tiptap-smoke" element={<TiptapSmokePage />} />
        </Route>
      </Route>

      <Route path="*" element={<div>404 — Not Found</div>} />
    </Routes>
  );
}

function DesktopShortcutBridge() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (!isDesktop || !window.electronAPI) return undefined;

    const removeNavigate = window.electronAPI.onNavigate((path) => {
      if (path) navigate(path);
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
        <BrowserRouter>
          <AuthProvider>
            <DesktopShortcutBridge />
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}