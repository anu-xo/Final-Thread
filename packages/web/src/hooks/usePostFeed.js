// hooks/usePostFeed.js
import { useInfiniteQuery } from '@tanstack/react-query';
import api from '../services/api.js';

export function usePostFeed({ communityId, sort = 'hot' } = {}) {
  return useInfiniteQuery({
    queryKey: ['posts', 'feed', { communityId, sort }],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get('/posts', {
        params: { communityId, sort, cursor: pageParam, limit: 20 },
      });
      return data; // expects { posts: [...], nextCursor: string | null }
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}