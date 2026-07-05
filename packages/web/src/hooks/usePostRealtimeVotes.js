import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';

export function usePostRealtimeVotes() {
  const queryClient = useQueryClient();

  const socket = useMemo(() => io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
    withCredentials: true,
    transports: ['websocket'],
  }), []);

  useEffect(() => {
    const handleVoteUpdated = ({ postId, newScore }) => {
      queryClient.setQueriesData({ queryKey: ['posts', 'feed'] }, (old) => {
        if (!old) return old;

        if ('pages' in old) {
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              posts: page.posts.map((post) =>
                post._id === postId ? { ...post, score: newScore } : post
              ),
            })),
          };
        }

        return old;
      });

      queryClient.invalidateQueries({ queryKey: ['posts', 'feed'], refetchType: 'none' });
    };

    socket.on('vote:updated', handleVoteUpdated);

    return () => {
      socket.off('vote:updated', handleVoteUpdated);
      socket.disconnect();
    };
  }, [queryClient, socket]);

  return socket;
}
