// packages/web/src/components/VoteButton.jsx
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import api from '../services/api';
import StitchLine from './StitchLine.jsx';

// Count spring — snappy enough to feel alive, damped enough to settle fast.
const COUNT_SPRING = { stiffness: 280, damping: 24, mass: 0.55 };

// Stitch "snap taut" — quick squash-and-release on the wrapper's scaleX.
const SNAP_TIMES = [0, 0.55, 1];
const SNAP_SCALE = [0, 1.15, 1];

/**
 * VoteButton — 3-state vote widget (up / neutral / down)
 *
 * States use the Midnight Aurora palette: upvoted → pink, downvoted → violet,
 * neutral → mist/gray.
 *
 * Props
 *  targetId       — MongoDB _id of the post or comment
 *  targetType     — 'post' | 'comment'
 *  initialScore   — numeric score at render time
 *  initialUserVote — -1 | 0 | 1 (defaults to 0 = not voted)
 *  size           — 'sm' | 'md' (md is default, sm for comment rows)
 *  layout         — 'vertical' (default) | 'horizontal'
 *  variant        — 'default' (default) | 'pill' (rounded pill container for
 *                    the feed-card footer; resting up-arrow pink, down muted)
 *
 * Behaviour
 *  • Clicking the already-active arrow sends value:0 (toggle/remove vote)
 *  • onMutate applies the delta immediately (optimistic)
 *  • onError rolls back to the snapshot captured in onMutate's context
 *  • onSuccess reconciles with the server-returned score to handle
 *    concurrent voters that landed between our request firing and settling
 *  • The count springs to each new value via a Framer Motion spring (no
 *    linear count-up)
 *  • Every score/vote change re-snaps a thin horizontal StitchLine beneath
 *    the count (quick scaleX squash-and-release) to confirm the vote landed
 *  • prefers-reduced-motion: count jumps instantly, stitch appears statically
 *  • Buttons are disabled while a mutation is in flight to prevent
 *    double-clicks accumulating into a runaway delta
 */
export default function VoteButton({
  targetId,
  targetType,
  initialScore = 0,
  initialUserVote = 0,
  size = 'md',
  layout = 'vertical',
  variant = 'default',
}) {
  // We track score + vote in local state rather than deriving from React Query
  // because VoteButton is used both in the feed (query-backed) and in comment
  // rows (not yet query-backed). Either way, onSuccess reconciles with truth.
  const [score, setScore] = useState(initialScore);
  const [userVote, setUserVote] = useState(initialUserVote);

  useEffect(() => {
    setScore(initialScore);
    setUserVote(initialUserVote);
  }, [initialScore, initialUserVote, targetId]);

  // Snapshot refs used in onMutate so the closure always captures fresh values
  // (avoids the "stale score captured by closure" bug with useState)
  const scoreRef = useRef(initialScore);
  const userVoteRef = useRef(initialUserVote);

  scoreRef.current = score;
  userVoteRef.current = userVote;

  const reduceMotion = useReducedMotion();

  // Spring-animated count — retargets whenever `score` changes (optimistic
  // apply, rollback, or server reconcile).
  const springScore = useSpring(score, COUNT_SPRING);
  const animatedScore = useTransform(springScore, (v) => Math.round(v).toString());

  // StitchLine "snap taut" confirmation — re-runs on any score/vote change.
  const [stitchKey, setStitchKey] = useState(0);
  const prevStateRef = useRef({ score: initialScore, userVote: initialUserVote });
  useEffect(() => {
    const prev = prevStateRef.current;
    if (prev.score !== score || prev.userVote !== userVote) {
      setStitchKey((k) => k + 1);
      prevStateRef.current = { score, userVote };
    }
  }, [score, userVote]);

  const voteMutation = useMutation({
    mutationFn: (value) =>
      api.post('/votes', { targetId, targetType, value }),

    onMutate: async (newValue) => {
      // Snapshot current state *before* we touch anything
      const previousScore = scoreRef.current;
      const previousVote = userVoteRef.current;

      // Apply delta immediately — user sees the change with zero network wait
      const delta = newValue - previousVote;
      setScore((prev) => prev + delta);
      setUserVote(newValue);

      // Return snapshot so onError can restore it
      return { previousScore, previousVote };
    },

    onError: (_err, _newValue, context) => {
      // Roll back — this runs if the API call fails or the request is rejected
      if (context) {
        setScore(context.previousScore);
        setUserVote(context.previousVote);
      }
    },

    onSuccess: (response) => {
      // Reconcile with server truth to correct any concurrent-voter drift.
      // The backend returns { data: { score } } in its standard envelope.
      const serverScore = response?.data?.data?.score;
      const serverUserVote = response?.data?.data?.userVote;
      if (typeof serverScore === 'number') {
        setScore(serverScore);
      }
      if (typeof serverUserVote === 'number') {
        setUserVote(serverUserVote);
      }
    },
  });

  const handleVote = (value) => {
    if (voteMutation.isPending) return; // guard against double-click
    // Toggle: clicking the active arrow again removes the vote (sends 0)
    const newValue = userVoteRef.current === value ? 0 : value;
    voteMutation.mutate(newValue);
  };

  // ── Size tokens ──────────────────────────────────────────────────────────
  const iconSize = size === 'sm' ? 16 : 20;
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const padding  = size === 'sm' ? 'p-0.5' : 'p-1';

  // ── Layout ───────────────────────────────────────────────────────────────
  const isPill = variant === 'pill';
  const containerClass = isPill
    ? 'flex items-center gap-0.5 rounded-full border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-1 py-0.5'
    : layout === 'horizontal'
      ? 'flex flex-row items-center gap-0.5'
      : 'flex flex-col items-center gap-0.5';

  const isPending = voteMutation.isPending;
  const activeUp = userVote === 1;
  const activeDown = userVote === -1;

  // Neutral score reads as mist in dark mode (legible on void) and as a
  // soft gray in light mode (where mist would vanish on fog).
  const neutralScoreColor = 'text-gray-700 dark:text-mist';
  const stitchColor = activeUp
    ? 'text-pink'
    : activeDown
      ? 'text-violet'
      : 'text-gray-400 dark:text-neutral-500';

  // Pill variant (feed card footer): resting up-arrow is pink, resting
  // down-arrow is muted; active states keep the app's pink/violet feedback.
  const upNeutralClass = isPill
    ? 'text-pink hover:scale-110'
    : 'text-gray-400 hover:text-pink hover:scale-110';
  const downNeutralClass = isPill
    ? 'text-gray-400 dark:text-neutral-500 hover:scale-110'
    : 'text-gray-400 hover:text-violet hover:scale-110';

  const ScoreEl = reduceMotion ? 'span' : motion.span;

  return (
    <div className={containerClass}>
  // ── Upvote ──
  <motion.button
    id={`vote-up-${targetId}`}
    onClick={() => handleVote(1)}
    disabled={isPending}
    aria-label="Upvote"
    aria-pressed={activeUp}
    whileTap={reduceMotion || isPending ? undefined : { scale: 0.72 }}
    transition={{ type: 'spring', stiffness: 600, damping: 20 }}
    className={`${padding} rounded transition-all duration-150 ${
      isPending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
    } ${
      activeUp
        ? 'text-pink scale-110'
        : upNeutralClass
    }`}
  >
    <ChevronUp size={iconSize} strokeWidth={activeUp ? 2.5 : 2} />
  </motion.button>

      {/* ── Score — springs to each new value, no linear count-up ── */}
      <ScoreEl
        className={`${textSize} font-semibold tabular-nums ${
          activeUp ? 'text-pink' : activeDown ? 'text-violet' : neutralScoreColor
        }`}
      >
        {reduceMotion ? score : animatedScore}
      </ScoreEl>

      {/* ── StitchLine confirmation — snaps taut on every state change ── */}
      {!isPill && stitchKey > 0 && (
        <motion.div
          key={stitchKey}
          initial={reduceMotion ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
          animate={reduceMotion ? { scaleX: 1, opacity: 1 } : { scaleX: SNAP_SCALE, opacity: [0, 1, 1] }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.32, times: SNAP_TIMES, ease: 'easeOut' }}
          style={{ originX: 0.5 }}
          className={`w-12 ${stitchColor}`}
        >
          <StitchLine
            orientation="horizontal"
            length={48}
            strokeWidth={2}
            dash={5}
            gap={5}
            duration={0.15}
          />
        </motion.div>
      )}

  {/* ── Downvote ── */}
  <motion.button
    id={`vote-down-${targetId}`}
    onClick={() => handleVote(-1)}
    disabled={isPending}
    aria-label="Downvote"
    aria-pressed={activeDown}
    whileTap={reduceMotion || isPending ? undefined : { scale: 0.72 }}
    transition={{ type: 'spring', stiffness: 600, damping: 20 }}
    className={`${padding} rounded transition-all duration-150 ${
      isPending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
    } ${
      activeDown
        ? 'text-violet scale-110'
        : downNeutralClass
    }`}
  >
    <ChevronDown
      size={iconSize}
      strokeWidth={activeDown ? 2.5 : 2}
    />
  </motion.button>
    </div>
  );
}
