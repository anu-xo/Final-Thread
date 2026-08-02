// packages/web/src/components/AIChat/StreamingMessage.jsx
function StreamingMessage({ content, isStreaming }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-emerald/10 text-xs font-bold text-emerald">AI</span>
      <div className="flex-1 rounded-2xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 px-4 py-3 text-sm text-gray-800 dark:text-neutral-200 leading-relaxed">
        <span>{content}</span>
        {isStreaming && <span className="animate-pulse ml-0.5 text-emerald">▍</span>}
      </div>
    </div>
  );
}