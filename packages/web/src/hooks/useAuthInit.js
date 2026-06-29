// packages/web/src/hooks/useAuthInit.js
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';

export function useAuthInit() {
  const { setAuth } = useAuthStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const { data: refreshData } = await api.post('/auth/refresh', null, {
          signal: AbortSignal.timeout(3000), // fail fast if backend is down
        });
        const { data: meData } = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${refreshData.accessToken}` },
          signal: AbortSignal.timeout(3000),
        });
        setAuth(meData.user, refreshData.accessToken);
      } catch {
        // No session or backend down — continue as guest
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, [setAuth]);

  return { isInitializing };
}