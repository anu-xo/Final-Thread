import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useUnreadCount, useNotifications, useMarkAllRead, notificationText, buildNotificationLink } from '../hooks/useNotifications';
import { useIsDesktop } from '../hooks/useIsDesktop';

const ICONS = {
  reply: '💬',
  mention: '📣',
  mod_action: '🛡️',
  ai_response: '🤖',
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadCount();
  const { data: notifications = [] } = useNotifications();
  const markAllRead = useMarkAllRead();
  const isDesktop = useIsDesktop();
  const menuRef = useRef(null);

  const handleToggle = () => {
    setOpen((o) => !o);
  };

  const handleMarkAllRead = () => {
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

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleToggle}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-neutral-800"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
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
            {notifications.map((n) => (
              <Link
                key={n._id}
                to={buildNotificationLink(n)}
                onClick={() => setOpen(false)}
                className={`flex gap-2 p-3 border-b border-gray-100 dark:border-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800 ${
                  !n.read ? 'bg-orange-50 dark:bg-orange-900/10' : ''
                }`}
              >
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

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
