// packages/web/src/hooks/useAdminStats.js
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get('/admin/stats')).data.data,
    staleTime: 60_000, // matches the 5min server cache loosely, avoid over-fetching
  });
}