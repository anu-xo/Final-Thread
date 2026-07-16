import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import { useAuthStore } from '../store/authStore';

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => (await api.get('/notifications/unread-count')).data.data.count,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async () => (await api.get('/notifications')).data.data,
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// Mount once near the app root (e.g. inside AppLayout) — NOT per-component,
// same lesson as the post vote sockets: one listener, lifted up, or you'll
// get duplicate badge increments per notification.
export function useNotificationSocket() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?._id);

  useEffect(() => {
    if (!userId) return;
    const socket = getSocket();

    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    socket.on('notification:new', handler);
    return () => socket.off('notification:new', handler);
  }, [userId, queryClient]);
}