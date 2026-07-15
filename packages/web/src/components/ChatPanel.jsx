// packages/web/src/components/AIChat/ChatPanel.jsx
import { useAIChat } from '../../hooks/useAIChat';
import { RetryableError } from './RetryableError';

function ChatPanel({ communityId, communityName }) {
  const { messages, streaming, warning, error, sendMessage, retry } = useAIChat(communityId, communityName);

  return (
    <div className="ai-chat-panel">
      {messages.map((msg, i) => (
        <div key={i} className={msg.role === 'assistant' ? 'ai-message' : 'user-message'}>
          {msg.content}
          {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
            <span className="animate-pulse ml-0.5">▍</span>
          )}
        </div>
      ))}

      {warning && (
        <div className="ai-warning-banner">⚠ {warning}</div>
      )}

      {error && (
        <RetryableError message={error} onRetry={retry} />
      )}

      {/* your existing input box, community picker, etc. */}
    </div>
  );
}

export default ChatPanel;