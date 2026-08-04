// components/OnlinePill.jsx
import { accentHex, accentRgba } from '../lib/communityAccents.js';

function compactCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/**
 * Live "who's online" indicator — a small pill with a pulsing dot and the
 * live Socket.io presence count for a community.
 *
 * The dot is mint by default. When the community has accent customization
 * enabled (a mod-chosen accent), the dot (and its glow) take that accent
 * color instead. Pass `accent={null}` (or omit it) for the mint default.
 *
 * `count === null` means no presence update has arrived yet — the pill is
 * hidden instead of flashing a misleading "0 online".
 */
export default function OnlinePill({ count, accent = null }) {
  if (count == null) return null;

  const accentKey = accent || 'mint';
  const dot = accentHex(accentKey);

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color: dot, backgroundColor: accentRgba(accentKey, 0.1) }}
    >
      <span
        className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
        style={{ backgroundColor: dot }}
        aria-hidden="true"
      />
      {compactCount(count)} online
    </span>
  );
}
