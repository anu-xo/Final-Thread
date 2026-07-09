// packages/web/src/components/VoteButton.jsx
import { useEffect, useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronUp, ChevronDown } from 'lucide-react';
import api from '../services/api';

/**
 * VoteButton — 3-state vote widget (up / neutral / down)
 *
 * Props
 *  targetId       — MongoDB _id of the post or comment
 *  targetType     — 'post' | 'comment'
 *  initialScore   — numeric score at render time
 *  initialUserVote — -1 | 0 | 1 (defaults to 0 = not voted)
 *  size           — 'sm' | 'md' (md is default, sm for comment rows)
 *  layout         — 'vertical' (default) | 'horizontal'
 *
 * Behaviour
 *  • Clicking the already-active arrow sends value:0 (toggle/remove vote)
 *  • onMutate applies the delta immediately (optimistic)
 *  • onError rolls back to the snapshot captured in onMutate's context
 *  • onSuccess reconciles with the server-returned score to handle
 *    concurrent voters that landed between our request firing and settling
 *  • The score <span> is keyed on the score value so the CSS animation
 *    re-triggers on every change, including rollbacks
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
  const containerClass =
    layout === 'horizontal'
      ? 'flex flex-row items-center gap-0.5'
      : 'flex flex-col items-center gap-0.5';

  const isPending = voteMutation.isPending;

  return (
    <div className={containerClass}>
      {/* ── Upvote ── */}
      <button
        id={`vote-up-${targetId}`}
        onClick={() => handleVote(1)}
        disabled={isPending}
        aria-label="Upvote"
        aria-pressed={userVote === 1}
        className={`${padding} rounded transition-all duration-150 ${
          isPending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        } ${
          userVote === 1
            ? 'text-orange-500 scale-110'
            : 'text-gray-400 hover:text-orange-400 hover:scale-110'
        }`}
      >
        <ChevronUp size={iconSize} strokeWidth={userVote === 1 ? 2.5 : 2} />
      </button>

      {/* ── Score — keyed on value so animation re-fires every change ── */}
      <span
        key={score}
        className={`${textSize} font-semibold tabular-nums vote-score-pop ${
          userVote === 1
            ? 'text-orange-500'
            : userVote === -1
            ? 'text-blue-500'
            : 'text-gray-700'
        }`}
      >
        {score}
      </span>

      {/* ── Downvote ── */}
      <button
        id={`vote-down-${targetId}`}
        onClick={() => handleVote(-1)}
        disabled={isPending}
        aria-label="Downvote"
        aria-pressed={userVote === -1}
        className={`${padding} rounded transition-all duration-150 ${
          isPending ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        } ${
          userVote === -1
            ? 'text-blue-500 scale-110'
            : 'text-gray-400 hover:text-blue-400 hover:scale-110'
        }`}
      >
        <ChevronDown
          size={iconSize}
          strokeWidth={userVote === -1 ? 2.5 : 2}
        />
      </button>
    </div>
  );
}