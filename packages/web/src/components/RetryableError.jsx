// packages/web/src/components/AIChat/RetryableError.jsx
export function RetryableError({ message, onRetry }) {
  return (
    <button
      onClick={onRetry}
      className="rounded-xl border border-amaranth/30 dark:border-amaranth/40 bg-red-50 dark:bg-amaranth/10 px-4 py-3 text-sm text-amaranth dark:text-amaranth text-left transition hover:bg-amaranth/10 dark:hover:bg-amaranth/15"
    >
      âš  {message} â€” tap to retry
    </button>
  );
}