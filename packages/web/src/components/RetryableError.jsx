// packages/web/src/components/AIChat/RetryableError.jsx
export function RetryableError({ message, onRetry }) {
  return (
    <button
      onClick={onRetry}
      className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-700 dark:text-red-400 text-left transition hover:bg-red-100 dark:hover:bg-red-900/20"
    >
      ⚠ {message} — tap to retry
    </button>
  );
}