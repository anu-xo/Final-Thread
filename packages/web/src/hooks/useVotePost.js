// hooks/useVotePost.js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export function useVotePost({ communityId, sort } = {}) {
  const queryClient = useQueryClient();
  const feedKey = ['posts', 'feed', { communityId, sort }];

  return useMutation({
    mutationFn: ({ postId, direction }) =>
      api.post('/votes', { postId, value: direction }).then((r) => r.data),

    onMutate: async ({ postId, direction }) => {
      await queryClient.cancelQueries({ queryKey: feedKey });

      const previousData = queryClient.getQueryData(feedKey);

      queryClient.setQueryData(feedKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            posts: page.posts.map((post) => {
              if (post._id !== postId) return post;

              const prevVote = post.userVote || 0;
              const scoreDelta = direction - prevVote;

              return {
                ...post,
                userVote: direction,
                score: post.score + scoreDelta,
              };
            }),
          })),
        };
      });

      // return context for rollback
      return { previousData };
    },

    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(feedKey, context.previousData);
      }
    },

    onSettled: () => {
      // reconcile with server truth eventually (don't need to await)
      queryClient.invalidateQueries({ queryKey: feedKey, refetchType: 'none' });
    },
  });
}