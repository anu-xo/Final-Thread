// packages/web/src/components/AIChatInline.jsx
import { useMemo } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useAIChat } from '../hooks/useAIChat.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useCommunityStore } from '../store/communityStore.js';
import { ChatConversation } from './ChatPanel.jsx';
import StitchIcon from './StitchIcon.jsx';

/**
 * AIChatInline — the thread-scoped AI chat panel mounted from an AskAIPill.
 *
 * Replaces the old fixed-position global drawer: same SSE wiring (useAIChat),
 * streaming render, citation pills and thumbs feedback — but it expands as a
 * panel anchored to the pill instead of a full-screen overlay.
 *
 * It ALWAYS pins `postId` on every request so the backend runs the narrowed
 * post-scoped retrieval (post embedding + comment thread) before falling back
 * to community-wide search.
 *
 * variant:
 *   - 'popover' — absolutely positioned under the pill (PostCard)
 *   - 'inline'  — expands in the page flow (PostDetail)
 */
export default function AIChatInline({
  postId,
  communityId,
  onClose,
  variant = 'inline',
  title = null,
}) {
  const isOnline = useOnlineStatus();
  const subscribed = useCommunityStore((s) => s.subscribed);

  const communityName = useMemo(() => {
    const match = Object.values(subscribed).find((c) => String(c._id) === String(communityId));
    return match?.name || match?.slug || 'this thread';
  }, [subscribed, communityId]);

  const { messages, streaming, warning, error, sendMessage, retry } = useAIChat(
    communityId,
    communityName,
    isOnline,
    { postId, title },
  );

  const disabled = !isOnline || streaming;

  const panelClass =
    variant === 'popover'
      ? 'absolute right-0 top-full z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl'
      : 'overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg';

  return (
    <div className={panelClass}>
      {/* Header */}
      <div className="relative flex items-center justify-between gap-2 border-b border-gray-200 px-3 h-11 dark:border-neutral-700">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-amaranth" />
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-900 dark:text-neutral-100">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amaranth text-white">
            <StitchIcon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">
            <Sparkles size={12} className="mr-1 inline text-pink" />
            Ask AI about this thread
          </span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          aria-label="Close chat"
        >
          <X size={16} />
        </button>
      </div>

      {/* Conversation — fixed height so the panel never stretches the page */}
      <div className={variant === 'popover' ? 'h-96' : 'h-[26rem]'}>
        <ChatConversation
          messages={messages}
          streaming={streaming}
          warning={warning}
          error={error}
          retry={retry}
          isOnline={isOnline}
          threadTitle={title}
          onSend={sendMessage}
          disabled={disabled}
          inputPlaceholder={isOnline ? 'Ask about this thread...' : 'Offline — input disabled'}
        />
      </div>
    </div>
  );
}
