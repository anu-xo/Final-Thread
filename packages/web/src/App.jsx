// packages/web/src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { useAuthInit } from './hooks/useAuthInit.js'; // ← Import the hook

// Layout & Route Guards
import AppLayout from './components/AppLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// Pages
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';

const Home = () => (
  <div className="flex flex-col items-center justify-center p-8">
    <h1 className="text-4xl font-bold text-[#ff4500]">⚡ ThreadVerse</h1>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30 * 1000 } },
});

export default function App() {
  // Run the token re-hydration logic on mount
  const { isInitializing } = useAuthInit(); 

  // Show a clean loading state while checking credentials on page refresh
  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-500 font-medium animate-pulse">Loading session...</div>
      </div>
    );
  }

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Home />} />
              </Route>
            </Route>

            <Route path="*" element={<div>404 — Not Found</div>} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  );
}