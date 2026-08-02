// packages/web/src/components/ChatPanel.jsx
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useAIChat } from '../hooks/useAIChat.js';
import { RetryableError } from './RetryableError.jsx';
import StitchIcon from './StitchIcon.jsx';
import CitationPill from './CitationPill.jsx';
import FeedbackButtons from './FeedbackButtons.jsx';

function tokenize(text) {
  const complete = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    current += text[i];
    if (text[i] === ' ' || text[i] === '\n') {
      complete.push(current);
      current = '';
    }
  }
  return { complete, partial: current };
}

/** Streaming assistant text: fully-typed words blur in; the trailing partial word stays static */
function StreamingWords({ text, reduceMotion }) {
  if (reduceMotion) return <span>{text}</span>;
  const { complete, partial } = tokenize(text);
  return (
    <>
      {complete.map((t, i) => (
        <span key={i} className="blur-in-word">{t}</span>
      ))}
      {partial && <span>{partial}</span>}
    </>
  );
}

function AIAvatar() {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amaranth text-white">
      <StitchIcon className="h-3.5 w-3.5" />
    </span>
  );
}

function PulsingStitch({ className = 'h-4 w-4' }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <StitchIcon className={className} />;
  return (
    <motion.span
      className="inline-flex"
      animate={{ scale: [1, 1.15, 1], opacity: [1, 0.5, 1] }}
      transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
    >
      <StitchIcon className={className} />
    </motion.span>
  );
}

function ChatPanel({ communityId, communityName, isOnline = true }) {
  const { messages, streaming, warning, error, sendMessage, retry } = useAIChat(
    communityId,
    communityName,
    isOnline,
  );
  const reduceMotion = useReducedMotion();
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const disabled = !isOnline || streaming;
  const last = messages[messages.length - 1];
  const streamingAssistant = streaming && last?.role === 'assistant' ? last : null;
  const waitingFirstToken = streaming && !streamingAssistant;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    setInput('');
    sendMessage(trimmed);
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {!isOnline && (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-400/60 dark:border-neutral-600 px-3 py-2 text-xs text-gray-500 dark:text-neutral-400 opacity-80">
            <svg
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 2v8 M4.5 6.5 L8 10 L11.5 6.5 M3 13 h10" />
            </svg>
            Reading from local cache
          </div>
        )}

        {messages.length === 0 && !streaming && (
          <p className="text-sm text-gray-400 dark:text-neutral-500 text-center mt-12">
            {isOnline
              ? 'Ask the AI anything about this community'
              : 'Reconnect to start a new conversation'}
          </p>
        )}

        {messages.map((msg, i) => {
          const isStreamingMsg = msg === streamingAssistant;

          if (msg.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] break-words whitespace-pre-wrap rounded-lg bg-amaranth px-4 py-2.5 text-sm text-white">
                  {msg.content}
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex items-start gap-2">
              <AIAvatar />
              <div className="max-w-[80%] rounded-lg border border-amaranth/30 bg-amaranth/5 px-4 py-2.5 text-sm leading-relaxed text-gray-800 dark:text-neutral-200 dark:bg-amaranth/10">
                <div className="break-words whitespace-pre-wrap">
                  {isStreamingMsg ? (
                    <StreamingWords text={msg.content} reduceMotion={reduceMotion} />
                  ) : (
                    msg.content
                  )}
                  {isStreamingMsg && (
                    <span className="ml-1 inline-block text-amaranth">
                      <PulsingStitch className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>

                {!isStreamingMsg && msg.sources?.length > 0 && (
                  <div className="mt-3 border-t border-gray-200 pt-2 dark:border-white/10">
                    <span className="mb-1 block text-[11px] text-gray-500 dark:text-neutral-400">
                      Based on:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.sources.map((s) => (
                        <CitationPill key={s.postId} source={s} />
                      ))}
                    </div>
                  </div>
                )}

                {!isStreamingMsg && <FeedbackButtons className="mt-2" />}
              </div>
            </div>
          );
        })}

        {waitingFirstToken && (
          <div className="flex items-start gap-2">
            <AIAvatar />
            <div
              role="status"
              aria-label="Thinking"
              className="flex h-7 items-center justify-center text-amaranth"
            >
              <PulsingStitch className="h-3.5 w-3.5" />
            </div>
          </div>
        )}

        {warning && (
          <div className="rounded-lg bg-amaranth/10 dark:bg-amaranth/15 border border-amaranth/30 dark:border-amaranth/40 px-4 py-2 text-xs text-amaranth dark:text-amaranth">
            {warning}
          </div>
        )}

        {error && (
          <RetryableError message={error} onRetry={retry} />
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-gray-200 dark:border-neutral-700 p-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          placeholder={
            isOnline
              ? 'Ask AI anything...'
              : 'Offline â€” input disabled'
          }
          className="flex-1 rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-900 dark:text-neutral-100 px-4 py-2.5 text-sm disabled:bg-gray-100 dark:disabled:bg-neutral-800 disabled:text-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-amaranth/60"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="rounded-lg bg-amaranth px-4 py-2.5 text-sm font-medium text-white hover:bg-amaranth/90 disabled:bg-gray-300 dark:disabled:bg-neutral-600 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatPanel;
