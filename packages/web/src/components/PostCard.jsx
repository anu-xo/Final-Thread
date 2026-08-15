// components/PostCard.jsx
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { MessageCircle } from 'lucide-react';
import VoteButton from './VoteButton';
import OnlinePill from './OnlinePill.jsx';
import AskAIPill from './AskAIPill.jsx';
import { useCommunityPresence } from '../hooks/useCommunityPresence.js';
import { sanitizeHtml } from '../utils/sanitize.js';

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const units = [
    ['y', 31536000], ['mo', 2592000], ['d', 86400],
    ['h', 3600], ['m', 60], ['s', 1],
  ];
  for (const [label, secs] of units) {
    const val = Math.floor(seconds / secs);
    if (val >= 1) return `${val}${label} ago`;
  }
  return 'just now';
}

/** Community avatar — violet→pink gradient circle (icon image when set) */
function CommunityAvatar({ community }) {
  const name = community?.name || community?.slug || 'r';
  const initial = name[0]?.toUpperCase() || 'r';
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet to-pink text-xs font-semibold text-white">
      {community?.icon ? (
        <img src={community.icon} alt={name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        initial
      )}
    </span>
  );
}

/**
 * PostCard — Midnight Aurora feed card
 *
 *  • Top row: community avatar (gradient circle), community name, timestamp,
 *    and a live "online now" pill (pulsing dot — mint by default, community
 *    accent when the community has accent customization enabled)
 *  • Title (15px / 500) + muted preview text (13px)
 *  • Footer: vote pill (up pink / down muted), comment count with icon, and a
 *    right-aligned "Ask AI about this thread" pill that opens the AI chat
 *    panel pre-loaded with this post + its comments as context
 *  • Hover: the signature glow-lift (`.card-glow`) — card lifts 3px with a
 *    violet→pink glow shadow, border transitions to --border-strong, and a
 *    one-shot diagonal sheen sweeps across once (it never loops on hover)
 *  • Mounts with a fade-up; pass `revealDelay` (ms) to stagger cards in a
 *    freshly loaded first page (feed virtualization keeps delay 0 so only
 *    newly-visible rows animate)
 *  • prefers-reduced-motion disables the entry animation and hover lift/sheen
 */
export default function PostCard({ post, revealDelay = 0 }) {
  const reduceMotion = useReducedMotion();

  const {
    _id, title, body, content, community, score, commentCount,
    createdAt, userVote,
  } = post;

  const presenceCount = useCommunityPresence(community?.slug);
  const preview = body || content;
  const accent = community?.accentColor ?? null;

  return (
    <motion.div
      data-post-id={_id}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: revealDelay / 1000 }}
      className="relative flex flex-col gap-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate p-3.5 card-glow"
    >
      {/* ── Top row — community avatar · community · time · online pill ── */}
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to={`/community/${community?.slug}`}
          className="flex min-w-0 items-center gap-2"
        >
          <CommunityAvatar community={community} />
          <span className="truncate text-xs font-semibold text-gray-700 dark:text-mist/90 transition-colors hover:text-emerald">
            {community?.name || community?.slug}
          </span>
        </Link>
        <span className="shrink-0 text-xs text-gray-500 dark:text-mist/50">
          · {timeAgo(createdAt)}
        </span>
        <div className="ml-auto shrink-0">
          <OnlinePill count={presenceCount} accent={accent} />
        </div>
      </div>

      {/* ── Title — 15px / 500 ── */}
      <Link
        to={`/posts/${_id}`}
        className="block font-display text-[15px] font-medium leading-snug text-gray-900 dark:text-mist line-clamp-2 transition-colors hover:text-emerald"
      >
        {title}
      </Link>

      {/* ── Preview — 13px muted ── */}
      {preview && (
        <Link
          to={`/posts/${_id}`}
          className="block text-[13px] leading-relaxed text-gray-500 dark:text-mist/60 line-clamp-2"
        >
          <span
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(preview) }}
          />
        </Link>
      )}

      {/* ── Footer — vote pill · comments · Ask AI ── */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-0.5">
        <div className="flex items-center gap-3">
          <VoteButton
            targetId={_id}
            targetType="post"
            initialScore={score}
            initialUserVote={userVote ?? 0}
            size="sm"
            layout="horizontal"
            variant="pill"
          />
          <Link
            to={`/posts/${_id}`}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-mist/60 transition-colors hover:text-emerald"
          >
            <MessageCircle size={15} className="shrink-0" />
            {commentCount} comments
          </Link>
        </div>

        <AskAIPill
          postId={_id}
          communityId={community?._id}
          aiEnabled={community?.aiEnabled}
          accent={accent}
          title={title}
          variant="popover"
        />
      </div>
    </motion.div>
  );
}
