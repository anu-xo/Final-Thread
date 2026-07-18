import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import api from '../services/api';
import { socket } from '../lib/socket.js';
import { useAuthStore } from '../store/authStore';
import { useIsDesktop } from './useIsDesktop.js';

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
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (!userId) return;

    socket.emit('join_user', { userId });

    const handler = (notif) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });

      if (isDesktop && window.electronAPI?.showOSNotification) {
        window.electronAPI.showOSNotification({
          title: 'ThreadVerse',
          body: notificationText(notif.type),
          targetUrl: buildNotificationLink(notif),
        });
      }
    };
    socket.on('notification:new', handler);

    return () => {
      socket.off('notification:new', handler);
      socket.emit('leave_user', { userId });
    };
  }, [userId, isDesktop, queryClient]);
}

export function notificationText(type) {
  switch (type) {
    case 'reply': return 'replied to your comment';
    case 'mention': return 'mentioned you';
    case 'mod_action': return 'took a moderator action on your content';
    case 'ai_response': return 'AI responded in your conversation';
    default: return 'sent a notification';
  }
}

export function buildNotificationLink(n) {
  if (n.targetType === 'Comment') return `/post/${n.postId || ''}#comment-${n.target}`;
  return '#';
}