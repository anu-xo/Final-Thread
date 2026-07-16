import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import api from '../services/api';
import { socket } from '../lib/socket.js';
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

// Mount once inside AppLayout — NOT inside NotificationBell, to avoid
// re-subscribing on every open/close. Handles both the socket room join
// and the real-time notification listener.
export function useNotificationSocket() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?._id);

  useEffect(() => {
    if (!userId) return;

    socket.emit('join_user', { userId });

    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };
    socket.on('notification:new', handler);

    return () => {
      socket.off('notification:new', handler);
      socket.emit('leave_user', { userId });
    };
  }, [userId, queryClient]);
}