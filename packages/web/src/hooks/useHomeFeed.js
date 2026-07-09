import { useInfiniteQuery } from '@tanstack/react-query';
import api from '../services/api.js';

export function useHomeFeed(sort = 'hot') {
  return useInfiniteQuery({
    queryKey: ['feed', sort],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get('/feed', {
        params: { sort, cursor: pageParam },
      });

      return data;
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage?.meta?.cursor ?? undefined,
  });
}