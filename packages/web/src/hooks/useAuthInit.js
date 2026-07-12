// packages/web/src/hooks/useAuthInit.js
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/authStore.js';
import api from '../services/api.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export function useAuthInit() {
  const { setAuth } = useAuthStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        // Use plain axios here (NOT the `api` instance) so a failed
        // refresh on app boot does not pass through the response
        // interceptor and trigger its retry/redirect logic. A 401 here
        // just means "not logged in" — that's expected, not an error.
        const { data: refreshData } = await axios.post(
          `${API_URL}/auth/refresh`,
          null,
          { withCredentials: true, signal: AbortSignal.timeout(3000) }
        );

        const { data: meData } = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${refreshData.data.accessToken}` },
          signal: AbortSignal.timeout(3000),
        });

        setAuth(meData.user, refreshData.data.accessToken);
      } catch {
        // No session, expired session, or backend down — continue as guest
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, [setAuth]);

  return { isInitializing };
}