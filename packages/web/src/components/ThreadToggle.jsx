// packages/web/src/components/ThreadToggle.jsx
import { motion, useReducedMotion } from 'motion/react';

export default function ThreadToggle({ checked, onChange, disabled = false, label, className = '' }) {
  const reduceMotion = useReducedMotion();

  const toggle = () => {
    if (disabled) return;
    onChange(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={toggle}
      className={`relative inline-flex h-6 w-12 shrink-0 items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald/60 focus-visible:ring-offset-2 ${
        checked ? 'bg-emerald/15' : 'bg-neutral-200/70 dark:bg-neutral-700/60'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
    >
      {/* stitched track — a thread between two anchor knots */}
      <svg
        viewBox="0 0 48 24"
        className={`pointer-events-none absolute inset-0 h-6 w-12 transition-colors ${
          checked ? 'text-emerald' : 'text-neutral-400 dark:text-neutral-500'
        }`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <line x1="3" y1="12" x2="45" y2="12" strokeDasharray="3 3.5" />
        <circle cx="3" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="45" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>

      {/* bead — slides along the thread, emerald when active */}
      <motion.span
        className={`relative z-10 h-4 w-4 rounded-full border shadow-sm transition-colors ${
          checked
            ? 'border-emerald bg-emerald'
            : 'border-neutral-400 dark:border-neutral-500 bg-white dark:bg-neutral-300'
        }`}
        initial={false}
        animate={{ x: checked ? 30 : 2 }}
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 550, damping: 32, mass: 0.8 }}
      />
    </button>
  );
}
