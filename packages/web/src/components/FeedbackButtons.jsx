// packages/web/src/components/FeedbackButtons.jsx
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const EMERALD = '63, 163, 122';
const AMARANTH = '194, 78, 107';

const BASE_CLASS =
  'inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors';
const IDLE_CLASS =
  'border-gray-200 dark:border-neutral-700 text-gray-400 hover:text-gray-600 dark:hover:text-mist';

function ThumbUpIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H7zM15 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
    </svg>
  );
}

function ThumbButton({
  value,
  flash,
  active,
  glowColor,
  activeClass,
  onRate,
  icon,
  reduceMotion,
}) {
  const glow = flash > 0 ? `rgba(${glowColor}, 0.55)` : `rgba(${glowColor}, 0)`;

  return (
    <motion.button
      key={`${value}:${flash}`}
      type="button"
      onClick={onRate}
      aria-label={value === 1 ? 'Thumbs up' : 'Thumbs down'}
      aria-pressed={active}
      whileTap={reduceMotion ? undefined : { scale: 0.8 }}
      animate={
        reduceMotion || flash === 0
          ? { scale: 1 }
          : {
              scale: [1, 1.25, 1],
              boxShadow: [
                `0 0 0 0 rgba(${glowColor}, 0)`,
                `0 0 14px 3px ${glow}`,
                `0 0 0 0 rgba(${glowColor}, 0)`,
              ],
            }
      }
      transition={{ duration: 0.5, times: [0, 0.45, 1], ease: 'easeOut' }}
      className={`${BASE_CLASS} ${active ? activeClass : IDLE_CLASS}`}
    >
      {icon}
    </motion.button>
  );
}

export default function FeedbackButtons({ className = '' }) {
  const reduceMotion = useReducedMotion();
  const [rating, setRating] = useState(null);
  const [upFlash, setUpFlash] = useState(0);
  const [downFlash, setDownFlash] = useState(0);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <ThumbButton
        value={1}
        flash={upFlash}
        active={rating === 1}
        glowColor={EMERALD}
        activeClass="border-emerald bg-emerald/10 text-emerald"
        icon={<ThumbUpIcon />}
        reduceMotion={reduceMotion}
        onRate={() => {
          setRating(1);
          setUpFlash((n) => n + 1);
        }}
      />
      <ThumbButton
        value={-1}
        flash={downFlash}
        active={rating === -1}
        glowColor={AMARANTH}
        activeClass="border-amaranth bg-amaranth/10 text-amaranth"
        icon={<ThumbDownIcon />}
        reduceMotion={reduceMotion}
        onRate={() => {
          setRating(-1);
          setDownFlash((n) => n + 1);
        }}
      />
    </div>
  );
}
