// packages/web/src/components/ThreadSnipIcon.jsx
import { motion, useReducedMotion } from 'motion/react';

export default function ThreadSnipIcon({ className = '', snip = 0 }) {
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
      {/* thread being cut — dashed with a gap at the snip point */}
      <path d="M2 12h8.5" strokeDasharray="2.5 3" />
      <path d="M13.5 12h8.5" strokeDasharray="2.5 3" />
      <path d="M11 12h2" opacity="0.35" />

      {/* scissors — a quick snap wiggle on Leave */}
      <motion.g
        key={snip}
        initial={reduceMotion || snip === 0 ? false : { rotate: 0, scale: 1 }}
        animate={
          reduceMotion || snip === 0
            ? {}
            : { rotate: [0, 9, -7, 0], scale: [1, 0.94, 1] }
        }
        transition={{ duration: 0.4, ease: 'easeInOut' }}
        style={{ transformOrigin: '50% 50%' }}
      >
        <circle cx="5" cy="5" r="2.2" />
        <circle cx="5" cy="19" r="2.2" />
        <path d="M7 6.6 12 12" />
        <path d="M7 17.4 12 12" />
        <path d="M12 12l5.5-2" />
        <path d="M12 12l5.5 2" />
      </motion.g>
    </svg>
  );
}
