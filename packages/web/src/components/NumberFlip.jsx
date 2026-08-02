// packages/web/src/components/NumberFlip.jsx
import { motion, useReducedMotion } from 'motion/react';

function formatNumber(value, grouped) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const rounded = Math.round(safe);
  return grouped ? rounded.toLocaleString('en-US') : String(rounded);
}

function FlipDigit({ char, flipKey }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return <span className="inline-block tabular-nums">{char}</span>;
  }
  return (
    <motion.span
      key={flipKey}
      className="inline-block tabular-nums"
      initial={{ rotateX: -90, opacity: 0, y: 6 }}
      animate={{ rotateX: 0, opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: '50% 100%', backfaceVisibility: 'hidden' }}
    >
      {char}
    </motion.span>
  );
}

export default function NumberFlip({ value, className = '', grouped = true }) {
  const str = formatNumber(value, grouped);

  return (
    <span className={`inline-flex overflow-hidden ${className}`} aria-live="polite">
      {str.split('').map((char, i) => {
        const flipKey = `${i}:${char}`;
        if (!/\d/.test(char)) {
          return (
            <span key={flipKey} className="inline-block tabular-nums">
              {char}
            </span>
          );
        }
        return <FlipDigit key={flipKey} char={char} flipKey={flipKey} />;
      })}
    </span>
  );
}
