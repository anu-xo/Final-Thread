// packages/web/src/components/AIChat/RetryableError.jsx
export function RetryableError({ message, onRetry }) {
  return (
    <button onClick={onRetry} className="ai-error-bubble">
      ⚠ {message} — tap to retry
    </button>
  );
}