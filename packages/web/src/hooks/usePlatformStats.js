import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export function usePlatformStats() {
  return useQuery({
    queryKey: ['admin', 'stats', 'platform'],
    queryFn: async () => (await api.get('/admin/stats/platform')).data.data,
    staleTime: 60_000,
  });
}
