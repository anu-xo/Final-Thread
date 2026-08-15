// packages/web/src/components/GlobalChatDrawer.jsx
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, Plus, Sparkles } from 'lucide-react';
import { useAIChat } from '../hooks/useAIChat.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { authFetch } from '../services/authFetch.js';
import { ChatConversation } from './ChatPanel.jsx';
import StitchIcon from './StitchIcon.jsx';

// One-tap starter questions for the standalone site-wide chat. Grounded enough
// that the global RAG retrieval (across all communities) can answer them.
const QUICK_PROMPTS = [
  'What is trending across ThreadVerse right now?',
  'Summarize the biggest discussion this week',
  'Find posts about web development',
  'Compare discussions across different communities',
];

/**
 * GlobalChatDrawer — the persistent, site-wide "talk to the AI" entry point.
 *
 * A floating button (bottom-right) opens a standalone chat panel that works with
 * zero community context: `useAIChat` is called with `communityId = null`, so
 * the backend runs global retrieval and the "Neo AI" persona. It resumes
 * the user's most recent standalone conversation on open and offers a "new
 * chat" reset. Mounted once in AppLayout so it persists across every page.
 */
export default function GlobalChatDrawer() {
  const [open, setOpen] = useState(false);
  const isOnline = useOnlineStatus();
  const reduceMotion = useReducedMotion();
  const {
    messages,
    streaming,
    warning,
    error,
    sendMessage,
    retry,
    resetConversation,
    resumeConversation,
  } = useAIChat(null, 'Neo AI', isOnline, null);
  const resumedRef = useRef(false);

  // Resume the most recent standalone conversation the first time the panel opens
  useEffect(() => {
    if (!open || resumedRef.current) return;
    resumedRef.current = true;
    (async () => {
      try {
        const response = await authFetch('/api/ai/conversations?global=1', {
          credentials: 'include',
        });
        if (!response.ok) return;
        const { data } = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          await resumeConversation(data[0]._id);
        }
      } catch {
        // Keep a fresh empty chat — resuming is best-effort
      }
    })();
  }, [open, resumeConversation]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Allow any page to programmatically open the standalone chat (e.g. the
  // /ai/chat empty state when the user has no subscribed communities).
  useEffect(() => {
    const onOpenRequest = () => setOpen(true);
    window.addEventListener('threadverse:open-ai-chat', onOpenRequest);
    return () => window.removeEventListener('threadverse:open-ai-chat', onOpenRequest);
  }, []);

  const quickActions = QUICK_PROMPTS.map((q) => (
    <button
      key={q}
      type="button"
      onClick={() => sendMessage(q)}
      disabled={!isOnline || streaming}
      className="rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs text-gray-600 dark:text-neutral-300 transition hover:border-amaranth/50 hover:text-amaranth disabled:cursor-not-allowed disabled:opacity-50"
    >
      {q}
    </button>
  ));

  return (
    <>
      {/* Floating action button — the persistent site-wide entry point */}
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        initial={false}
        animate={open ? { scale: 0, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.15 }}
        aria-label="Open AI chat"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amaranth to-pink text-white shadow-lg shadow-amaranth/30 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-amaranth ${
          open ? 'pointer-events-none' : ''
        }`}
      >
        <StitchIcon className="h-6 w-6" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Neo AI chat"
            initial={{ x: '110%' }}
            animate={{ x: 0 }}
            exit={{ x: '110%' }}
            transition={
              reduceMotion
                ? { duration: 0.2, ease: 'easeOut' }
                : { type: 'spring', stiffness: 320, damping: 32 }
            }
            className="fixed right-0 bottom-0 z-50 flex w-full flex-col overflow-hidden border-l border-t border-gray-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 sm:w-96"
            style={{ top: 'var(--tv-titlebar-h, 0px)', height: 'calc(100vh - var(--tv-titlebar-h, 0px))' }}
          >
            {/* Header */}
            <div className="relative flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-3 dark:border-neutral-700">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-amaranth" />
              <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-900 dark:text-neutral-100">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet to-pink text-white">
                  <StitchIcon className="h-4 w-4" />
                </span>
                <span className="truncate">
                  <Sparkles size={13} className="mr-1 inline text-pink" />
                  Ask Neo AI
                </span>
              </h2>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={resetConversation}
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  aria-label="Start a new chat"
                  title="Start a new chat"
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  aria-label="Close chat"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Conversation */}
            <div className="min-h-0 flex-1">
              <ChatConversation
                messages={messages}
                streaming={streaming}
                warning={warning}
                error={error}
                retry={retry}
                isOnline={isOnline}
                onSend={sendMessage}
                disabled={!isOnline || streaming}
                inputPlaceholder={
                  isOnline ? 'Ask Neo AI anything...' : 'Offline — input disabled'
                }
                emptyMessage="Ask Neo AI anything."
                emptyActions={quickActions}
                autoFocus
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
