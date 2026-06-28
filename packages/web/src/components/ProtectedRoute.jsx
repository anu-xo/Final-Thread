import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';

// Why: Any route wrapped in <ProtectedRoute> will redirect to /login
// if the user isn't authenticated. This prevents logged-out users from
// accessing /settings, /communities/create, post creation, etc.
export default function ProtectedRoute() {
  const { accessToken } = useAuthStore();

  if (!accessToken) {
    // 'replace' means the login page replaces the current history entry
    // so pressing Back after login doesn't send them back to the login page
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}