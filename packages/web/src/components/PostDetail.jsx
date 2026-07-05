import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import api from '../services/api.js';

const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
  withCredentials: true,
  transports: ['websocket'],
});

export default function PostDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['posts', id],
    queryFn: async () => {
      const { data: response } = await api.get(`/posts/${id}`);
      return response.post;
    },
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!id) return;

    socket.emit('join_post', { postId: id });

    const handleVoteUpdated = ({ postId }) => {
      if (postId !== id) return;

      queryClient.invalidateQueries({ queryKey: ['posts', id] });
    };

    socket.on('vote:updated', handleVoteUpdated);

    return () => {
      socket.off('vote:updated', handleVoteUpdated);
      socket.emit('leave_post', { postId: id });
    };
  }, [id, queryClient]);

  if (isLoading) return <div className="p-4">Loading post...</div>;
  if (error) return <div className="p-4 text-red-500">Unable to load post.</div>;

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-2xl font-semibold">{data?.title}</h1>
      <p className="text-gray-600">Score: {data?.score}</p>
      <p className="text-gray-700 whitespace-pre-wrap">{data?.body}</p>
    </div>
  );
}
