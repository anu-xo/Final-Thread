import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socket } from '../lib/socket.js';

function updateFeedCaches(queryClient, updater) {
  queryClient.setQueriesData({ queryKey: ['feed'] }, updater);
  queryClient.setQueriesData({ queryKey: ['posts', 'feed'] }, updater);
}

export function useFeedRealtimeVotes() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleVoteUpdated = ({ postId, newScore }) => {
      updateFeedCaches(queryClient, (old) => {
        if (!old) return old;
        if ('pages' in old) {
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              posts: (page.posts || page.data || []).map((post) =>
                post._id === postId ? { ...post, score: newScore } : post
              ),
            })),
          };
        }
        return old;
      });
    };

    socket.on('voteUpdated', handleVoteUpdated);

    return () => {
      socket.off('voteUpdated', handleVoteUpdated);
    };
  }, [queryClient]);
}