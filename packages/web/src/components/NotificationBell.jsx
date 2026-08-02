import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useUnreadCount, useNotifications, useMarkAllRead, notificationText, buildNotificationLink } from '../hooks/useNotifications';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { socket } from '../lib/socket.js';
import StitchLine from './StitchLine.jsx';
import NumberFlip from './NumberFlip.jsx';

const ICONS = {
  reply: '💬',
  mention: '📣',
  mod_action: '🛡️',
  ai_response: '🤖',
};

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// Small emerald knot that "ties on" to the bell: a thread tail draws in,
// then the knot itself springs in with a bounce.
function BellKnot({ className = '' }) {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <motion.path
        d="M7 1.2 C 3.8 3 10.2 4 7 6"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
      <motion.circle
        cx="7"
        cy="8"
        r="2.6"
        fill="currentColor"
        stroke="none"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 13, delay: 0.12 }}
        style={{ transformOrigin: '50% 50%' }}
      />
    </svg>
  );
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: notifications = [] } = useNotifications();
  const markAllRead = useMarkAllRead();
  const isDesktop = useIsDesktop();
  const reduceMotion = useReducedMotion();
  const menuRef = useRef(null);

  // Knot + badge are driven optimistically by the live socket event, then
  // reconciled against the refetched unread count.
  const [knotKey, setKnotKey] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  // Notifications locally treated as read — lets the stitch marks fade out
  // staggered even before the server refetch lands.
  const [locallyRead, setLocallyRead] = useState(() => new Set());

  useEffect(() => {
    setLiveCount(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    const handleNew = () => {
      setKnotKey((k) => k + 1);
      setLiveCount((c) => c + 1);
    };
    socket.on('notification:new', handleNew);
    return () => {
      socket.off('notification:new', handleNew);
    };
  }, []);

  const isRead = (n) => n.read || locallyRead.has(n._id);

  const handleToggle = () => {
    setOpen((o) => !o);
  };

  const handleMarkAllRead = () => {
    setLocallyRead((prev) => {
      const next = new Set(prev);
      notifications.forEach((n) => {
        if (!n.read && !next.has(n._id)) next.add(n._id);
      });
      return next;
    });
    setLiveCount(0);
    markAllRead.mutate();
    if (isDesktop && window.electronAPI?.clearBadge) {
      window.electronAPI.clearBadge();
    }
  };

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const displayCount = Math.max(0, liveCount);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleToggle}
        aria-label={`Notifications${displayCount > 0 ? `, ${displayCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-neutral-800"
      >
        <span className="relative inline-flex">
          <BellIcon />
          <AnimatePresence>
            {knotKey > 0 && (
              <motion.span
                key={knotKey}
                className="pointer-events-none absolute -top-2 -left-1.5 text-emerald"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.2, rotate: -24 }}
                animate={
                  reduceMotion
                    ? { opacity: 1 }
                    : {
                        opacity: [0, 1, 1, 0],
                        scale: [0.2, 1.3, 1, 0.9],
                        rotate: [-24, 8, 0, 0],
                      }
                }
                exit={reduceMotion ? undefined : { opacity: 0, scale: 0.6 }}
                transition={
                  reduceMotion
                    ? { duration: 0.3 }
                    : { duration: 1.7, times: [0, 0.22, 0.55, 1], ease: 'easeOut' }
                }
              >
                <BellKnot className="h-3.5 w-3.5" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        {displayCount > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1"
          >
            {displayCount > 99 ? '99+' : <NumberFlip value={displayCount} grouped={false} />}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-xl z-50">
          <div className="flex justify-between items-center p-3 border-b border-gray-200 dark:border-neutral-700">
            <span className="font-medium text-gray-900 dark:text-neutral-100">Notifications</span>
            <button onClick={handleMarkAllRead} className="text-xs text-blue-500 hover:underline">
              Mark all as read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="p-4 text-sm text-gray-400 dark:text-neutral-500 text-center">You're all caught up.</div>
            )}
            {notifications.map((n, index) => (
              <Link
                key={n._id}
                to={buildNotificationLink(n)}
                onClick={() => setOpen(false)}
                className={`relative flex gap-2 p-3 pl-5 border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 ${
                  !isRead(n) ? 'bg-orange-50/60 dark:bg-orange-900/10' : ''
                }`}
              >
                <AnimatePresence>
                  {!isRead(n) && (
                    <motion.span
                      key="stitch"
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald"
                      initial={reduceMotion ? false : { opacity: 0, scaleY: 0.4 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      exit={reduceMotion ? undefined : { opacity: 0, scaleY: 0.2 }}
                      transition={{ duration: 0.3, ease: 'easeOut', delay: index * 0.04 }}
                      style={{ transformOrigin: '50% 50%' }}
                    >
                      <StitchLine orientation="vertical" length={26} strokeWidth={2} dash={4} gap={4} />
                    </motion.span>
                  )}
                </AnimatePresence>
                <span>{ICONS[n.type] || '🔔'}</span>
                <div className="flex-1 text-sm">
                  <span className="font-medium text-gray-900 dark:text-neutral-100">{n.actor?.username}</span>{' '}
                  <span className="text-gray-700 dark:text-neutral-300">{notificationText(n.type)}</span>
                  <div className="text-xs text-gray-400 dark:text-neutral-500">{timeAgo(n.createdAt)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
