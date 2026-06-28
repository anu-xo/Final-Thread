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
        // Get new access token using the httpOnly cookie (sent automatically)
        const { data: refreshData } = await api.post('/auth/refresh');
        
        // Fetch user profile with the new access token
        const { data: meData } = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${refreshData.accessToken}` }
        });
        
        setAuth(meData.user, refreshData.accessToken);
      } catch {
        // No valid session — user stays logged out, which is fine
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, [setAuth]);

  return { isInitializing };
}