// packages/web/src/hooks/useCommunityPresence.js
import { useEffect, useState } from 'react';
import { socket } from '../lib/socket.js';

/**
 * Live "online now" count for a community, via Socket.io.
 *
 * Joins the `community:<slug>` room for as long as this hook is mounted and
 * tracks the `presence:update` events the server broadcasts to that room.
 * Leaves (and stops listening) on unmount. Also re-joins after a socket
 * reconnect, since Socket.io does not restore room membership automatically.
 *
 * Returns `null` until the first presence update arrives, so callers can hide
 * the online pill instead of flashing a "0 online" state.
 */
export function useCommunityPresence(slug) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    if (!slug) return undefined;

    const join = () => socket.emit('join_community', { slug });
    const handlePresence = ({ slug: eventSlug, count: nextCount }) => {
      if (eventSlug === slug) setCount(nextCount);
    };

    join();
    socket.on('presence:update', handlePresence);
    socket.on('connect', join);

    return () => {
      socket.off('presence:update', handlePresence);
      socket.off('connect', join);
      socket.emit('leave_community', { slug });
    };
  }, [slug]);

  return count;
}
