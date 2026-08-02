// components/PostCard.jsx
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import VoteButton from './VoteButton';
import StitchLine from './StitchLine';

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

/**
 * PostCard — Nightloom feed card
 *
 *  • slate surface (white in light mode), mist text, emerald/amaranth accents
 *  • Fraunces (font-display) for the title
 *  • Hover: card lifts 2px (motion whileHover) and a StitchLine briefly
 *    traces the top border, drawing in then fading out
 *  • Mounts with a fade+rise; pass `revealDelay` (ms) to stagger cards in a
 *    freshly loaded first page (feed virtualization keeps delay 0 so only
 *    newly-visible rows animate)
 *  • prefers-reduced-motion disables the entry/hover/trace animation
 */
export default function PostCard({ post, revealDelay = 0 }) {
  const [trace, setTrace] = useState(null); // { key, length } while tracing
  const cardRef = useRef(null);
  const reduceMotion = useReducedMotion();

  const {
    _id, title, author, community, score, commentCount,
    createdAt, userVote, flair,
  } = post;

  const handleEnter = () => {
    if (reduceMotion) return; // decorative trace — skip for reduced motion
    const el = cardRef.current;
    if (el && el.offsetWidth > 0) {
      setTrace({ key: Date.now(), length: el.offsetWidth });
    }
  };

  const handleLeave = () => setTrace(null);

  return (
    <motion.div
      ref={cardRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduceMotion ? undefined : { y: -2, transition: { duration: 0.2, ease: 'easeOut' } }}
      transition={{ duration: 0.35, ease: 'easeOut', delay: revealDelay / 1000 }}
      className="relative flex gap-3 rounded-lg border p-3 bg-white dark:bg-slate border-gray-200 dark:border-white/10 transition-[box-shadow,border-color] hover:border-emerald/50 hover:shadow-lg dark:hover:border-emerald/40"
    >
      {/* ── StitchLine border trace — draws in across the top edge, then fades ── */}
      {trace && (
        <motion.div
          key={trace.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.2, times: [0, 0.12, 0.7, 1] }}
          onAnimationComplete={() => setTrace(null)}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 text-emerald"
        >
          <StitchLine
            orientation="horizontal"
            length={trace.length}
            strokeWidth={2}
            dash={6}
            gap={6}
            duration={0.4}
            delay={0}
          />
        </motion.div>
      )}

      {/* Vote column — uses the shared VoteButton with optimistic updates */}
      <div className="shrink-0">
        <VoteButton
          targetId={_id}
          targetType="post"
          initialScore={score}
          initialUserVote={userVote ?? 0}
          size="sm"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-mist/60 mb-1">
          <span className="bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded-full font-medium text-gray-700 dark:text-mist/80 truncate max-w-[160px]">
            r/{community?.name}
          </span>
          {flair && (
            <span className="bg-steel/15 text-steel px-2 py-0.5 rounded-full font-medium">
              {flair.name}
            </span>
          )}
          <span className="truncate">Posted by u/{author?.username}</span>
          <span className="shrink-0">· {timeAgo(createdAt)}</span>
        </div>

        <h3 className="font-display text-lg leading-snug text-gray-900 dark:text-mist">
          <Link to={`/posts/${_id}`} className="transition-colors hover:text-emerald">
            {title}
          </Link>
        </h3>

        {post?.media?.length > 0 && (
          <Link to={`/posts/${_id}`} className="mt-3 block overflow-hidden rounded-lg border bg-gray-50 dark:bg-void border-gray-200 dark:border-white/10">
            <img
              src={post.media[0]}
              alt={title}
              className="h-56 w-full object-cover"
              loading="lazy"
            />
          </Link>
        )}

        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-mist/60">
          <Link
            to={`/posts/${_id}`}
            className="transition-colors hover:text-emerald"
          >
            💬 {commentCount} comments
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
