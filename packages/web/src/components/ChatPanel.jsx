import { useState } from 'react';
import { useAIChat } from '../hooks/useAIChat.js';
import { RetryableError } from './RetryableError.jsx';

function ChatPanel({ communityId, communityName, isOnline = true }) {
  const { messages, streaming, warning, error, sendMessage, retry } = useAIChat(
    communityId,
    communityName,
    isOnline,
  );
  const [input, setInput] = useState('');

  const disabled = !isOnline || streaming;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    setInput('');
    sendMessage(trimmed);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !streaming && (
          <p className="text-sm text-gray-400 text-center mt-12">
            {isOnline
              ? 'Ask the AI anything about this community'
              : 'You are offline — start a conversation when you reconnect'}
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`rounded-lg px-4 py-2.5 text-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white ml-auto max-w-[80%]'
                : 'bg-gray-100 text-gray-900 max-w-[80%]'
            }`}
          >
            {msg.content}
            {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
              <span className="animate-pulse ml-0.5">▍</span>
            )}
          </div>
        ))}

        {warning && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-2 text-xs text-yellow-800">
            {warning}
          </div>
        )}

        {error && (
          <RetryableError message={error} onRetry={retry} />
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
          placeholder={
            isOnline
              ? 'Ask AI anything...'
              : 'Offline — input disabled'
          }
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatPanel;
