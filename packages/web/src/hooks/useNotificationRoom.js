import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { socket } from '../lib/socket.js';

export function useNotificationRoom() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user?._id) return;

    socket.emit('join_user', { userId: user._id });

    return () => {
      socket.emit('leave_user', { userId: user._id });
    };
  }, [user?._id]);
}
