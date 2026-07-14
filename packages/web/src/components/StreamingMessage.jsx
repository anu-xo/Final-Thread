// packages/web/src/components/AIChat/StreamingMessage.jsx
function StreamingMessage({ content, isStreaming }) {
  return (
    <div className="ai-message">
      <span>{content}</span>
      {isStreaming && <span className="animate-pulse ml-0.5">▍</span>}
    </div>
  );
}