import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './context/AuthContext.jsx';
import { useAuthInit } from './hooks/useAuthInit.js';

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

const Home = () => (
  <div className="flex flex-col items-center justify-center p-8">
    <h1 className="text-4xl font-bold text-[#ff4500]">⚡ ThreadVerse</h1>
  </div>
);

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
          <Route path="/" element={<Home />} />
          
          {/* Community Routes */}
          <Route path="/communities" element={<CommunityBrowser />} />
          <Route path="/communities/create" element={<CreateCommunity />} />
          <Route path="/community/:slug" element={<CommunityPage />} />
          <Route path="/posts/:id" element={<PostDetail />} />
          <Route path="/tiptap-smoke" element={<TiptapSmokePage />} />
        </Route>
      </Route>

      <Route path="*" element={<div>404 — Not Found</div>} />
    </Routes>
  );
}

export default function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}