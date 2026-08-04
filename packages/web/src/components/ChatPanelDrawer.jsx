import { useEffect } from 'react';
import { useUiStore } from '../store/uiStore.js';
import { useCommunityStore } from '../store/communityStore.js';
import ChatPanel from './ChatPanel.jsx';
import StitchIcon from './StitchIcon.jsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

export default function ChatPanelDrawer() {
  const { chatPanelOpen, chatContext, setChatPanelOpen } = useUiStore();
  const isOnline = useOnlineStatus();
  const subscribed = useCommunityStore((s) => s.subscribed);

  useEffect(() => {
    if (!window.electronAPI?.onOpenAIChat) return undefined;

    return window.electronAPI.onOpenAIChat(() => {
      // Native "open AI chat" triggers the generic community chat, not a thread
      useUiStore.setState({ chatPanelOpen: true, chatContext: null });
    });
  }, [setChatPanelOpen]);

  if (!chatPanelOpen) return null;

  // A thread context (from "Ask AI about this thread") wins over the
  // last-viewed community, so the panel opens pre-loaded on that post.
  const community = chatContext
    ? {
        _id: chatContext.communityId,
        name: chatContext.communityName,
        slug: chatContext.communitySlug,
      }
    : (Object.keys(subscribed)[0] ? subscribed[Object.keys(subscribed)[0]] : null);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => setChatPanelOpen(false)}
      />
      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white dark:bg-neutral-900 border-l border-gray-200 dark:border-neutral-700 shadow-2xl transform transition-transform duration-200 ease-in-out"
        style={{ paddingTop: 'var(--tv-titlebar-h, 0px)' }}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between px-4 h-14 border-b border-gray-200 dark:border-neutral-700">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-amaranth" />
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-neutral-100 min-w-0">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amaranth text-white">
              <StitchIcon className="h-3.5 w-3.5" />
            </span>
            <span className="truncate">
              AI Chat{chatContext ? ` — ${chatContext.title}` : community?.slug ? ` — r/${community.slug}` : ''}
            </span>
          </h2>
          <button
            onClick={() => setChatPanelOpen(false)}
            className="p-1.5 rounded-md text-gray-500 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800"
            aria-label="Close chat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Chat content */}
        <div className="h-[calc(100%-3.5rem)]">
          {community ? (
            <ChatPanel
              communityId={community._id}
              communityName={community.name || community.slug}
              isOnline={isOnline}
              threadContext={chatContext}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gray-400 dark:text-neutral-500 p-6 text-center">
              Join a community first to start chatting with AI.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
