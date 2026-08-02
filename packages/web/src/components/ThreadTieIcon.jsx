// packages/web/src/components/ThreadTieIcon.jsx
import { motion, useReducedMotion } from 'motion/react';

export default function ThreadTieIcon({ className = '', tie = 0 }) {
  const reduceMotion = useReducedMotion();

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* thread being tied — dashed with a gap at the knot */}
      <path d="M2 12h6" strokeDasharray="2.5 3" />
      <path d="M16 12h6" strokeDasharray="2.5 3" />

      {/* knot — pulls tight with a quick snap wiggle on Unban */}
      <motion.g
        key={tie}
        initial={reduceMotion || tie === 0 ? false : { scale: 1.15, opacity: 0.35 }}
        animate={
          reduceMotion || tie === 0
            ? {}
            : { scale: [1.15, 0.94, 1], opacity: [0.35, 1, 1], rotate: [0, -6, 4, 0] }
        }
        transition={{ duration: 0.5, ease: 'easeInOut' }}
        style={{ transformOrigin: '50% 50%' }}
      >
        <path d="M8 12c0-2.1 1.7-3.3 4-3.3s4 1.2 4 3.3-1.7 3.3-4 3.3-4-1.2-4-3.3Z" />
        <path d="M10.4 8.95 9.5 4.6" />
        <path d="M13.6 8.95 14.5 4.6" />
      </motion.g>
    </svg>
  );
}
