// packages/web/src/components/VoteButton.jsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown } from 'lucide-react';
import api from '../services/api';

export default function VoteButton({ targetId, targetType, initialScore, initialUserVote = 0 }) {
  const queryClient = useQueryClient();
  const [score, setScore] = useState(initialScore);
  const [userVote, setUserVote] = useState(initialUserVote); // -1 | 0 | 1

  const voteMutation = useMutation({
    mutationFn: (value) =>
      api.post('/votes', { targetId, targetType, value }),
    onMutate: async (newValue) => {
      // Optimistic update: apply the delta immediately, before the server responds
      const delta = newValue - userVote;
      setScore((prev) => prev + delta);
      const previousVote = userVote;
      setUserVote(newValue);
      return { previousVote, previousScore: score };
    },
    onError: (err, newValue, context) => {
      // Roll back on failure — this is why onMutate returns context
      setScore(context.previousScore);
      setUserVote(context.previousVote);
    },
    onSuccess: (response) => {
      // Reconcile with server truth in case of race conditions with other voters
      setScore(response.data.data.score);
    },
  });

  const handleVote = (value) => {
    const newValue = userVote === value ? 0 : value; // clicking the active arrow again removes the vote
    voteMutation.mutate(newValue);
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={() => handleVote(1)}
        aria-label="Upvote"
        className={`p-1 rounded transition-colors ${
          userVote === 1 ? 'text-orange-500' : 'text-gray-400 hover:text-orange-400'
        }`}
      >
        <ChevronUp size={20} />
      </button>

      <span
        key={score} // key change re-triggers the animation on every score change
        className="text-sm font-semibold tabular-nums animate-[pulse_0.3s_ease-out]"
      >
        {score}
      </span>

      <button
        onClick={() => handleVote(-1)}
        aria-label="Downvote"
        className={`p-1 rounded transition-colors ${
          userVote === -1 ? 'text-blue-500' : 'text-gray-400 hover:text-blue-400'
        }`}
      >
        <ChevronDown size={20} />
      </button>
    </div>
  );
}