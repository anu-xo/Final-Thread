// packages/web/src/components/AskAIPill.jsx
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import AIChatInline from './AIChatInline.jsx';
import { accentHex, accentRgba } from '../lib/communityAccents.js';

/**
 * AskAIPill — small "Ask AI about this thread" entry point.
 *
 * Renders nothing when the community has AI disabled (respects Community.aiEnabled).
 * When opened, mounts AIChatInline anchored to the pill:
 *   - PostCard (variant="popover") — a popover under the pill, near votes/comments
 *   - PostDetail (variant="inline") — expands in the page flow, pinned near the top
 */
export function AskAIPill({
  postId,
  communityId,
  aiEnabled,
  accent = null,
  title = null,
  variant = 'popover',
}) {
  const [open, setOpen] = useState(false);

  if (!aiEnabled) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="card-glow inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:brightness-110"
        style={{
          borderColor: accentRgba(accent, 0.3),
          backgroundColor: accentRgba(accent, 0.1),
          color: accentHex(accent),
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Sparkles size={13} className="shrink-0" style={{ color: accentHex(accent) }} />
        Ask AI about this thread
      </button>

      {open && (
        <AIChatInline
          postId={postId}
          communityId={communityId}
          onClose={() => setOpen(false)}
          variant={variant}
          title={title}
        />
      )}
    </div>
  );
}

export default AskAIPill;
