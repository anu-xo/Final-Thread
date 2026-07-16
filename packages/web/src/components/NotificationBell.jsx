import { useState } from 'react';
import { useUnreadCount, useNotifications, useMarkAllRead } from '../hooks/useNotifications';
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

  const handleToggle = () => {
    setOpen((o) => !o);
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
    // Desktop: clear the dock badge / taskbar flash once read
    if (isDesktop && window.electronAPI?.clearBadge) {
      window.electronAPI.clearBadge();
    }
  };

  return (
    <div className="relative">
      <button onClick={handleToggle} className="relative p-2 rounded-full hover:bg-neutral-800">
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50">
          <div className="flex justify-between items-center p-3 border-b border-neutral-700">
            <span className="font-medium">Notifications</span>
            <button onClick={handleMarkAllRead} className="text-xs text-blue-400 hover:underline">
              Mark all as read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <div className="p-4 text-sm text-neutral-500 text-center">You're all caught up.</div>
            )}
            {notifications.map((n) => (
              <a
                key={n._id}
                href={buildNotificationLink(n)}
                className={`flex gap-2 p-3 border-b border-neutral-800 hover:bg-neutral-800 ${
                  !n.read ? 'bg-neutral-850' : ''
                }`}
              >
                <span>{ICONS[n.type] || '🔔'}</span>
                <div className="flex-1 text-sm">
                  <span className="font-medium">{n.actor?.username}</span>{' '}
                  {notificationText(n.type)}
                  <div className="text-xs text-neutral-500">{timeAgo(n.createdAt)}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function notificationText(type) {
  switch (type) {
    case 'reply': return 'replied to your comment';
    case 'mention': return 'mentioned you';
    case 'mod_action': return 'took a moderator action on your content';
    case 'ai_response': return 'AI responded in your conversation';
    default: return 'sent a notification';
  }
}

function buildNotificationLink(n) {
  if (n.targetType === 'Comment') return `/post/${n.postId || ''}#comment-${n.target}`;
  return '#';
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