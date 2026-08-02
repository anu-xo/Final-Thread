// packages/web/src/components/CitationPill.jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';

const DASH = 6;
const GAP = 6;

function buildDashArray(length) {
  const period = DASH + GAP;
  const stitches = Math.max(1, Math.round(length / period));
  const visible = Array.from({ length: stitches }, () => `${DASH} ${GAP}`).join(' ');
  return `${visible} 0 ${length + GAP}`;
}

export default function CitationPill({ source }) {
  const navigate = useNavigate();
  const pillRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [line, setLine] = useState(null); // { x1, y1, x2, y2 } viewport coords

  const drawLine = useCallback(() => {
    if (reduceMotion) return;
    const pill = pillRef.current;
    if (!pill) return;
    const target = document.querySelector(`[data-post-id="${source.postId}"]`);
    if (!target) return;

    const p = pill.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const { innerWidth: vw, innerHeight: vh } = window;

    const inViewport = t.left < vw && t.right > 0 && t.top < vh && t.bottom > 0;
    if (!inViewport) return;

    setLine({
      x1: p.left,
      y1: p.top + p.height / 2,
      x2: t.right,
      y2: t.top + t.height / 2,
    });
  }, [reduceMotion, source.postId]);

  useEffect(() => {
    if (!hovered) return undefined;
    const onScroll = () => drawLine();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [hovered, drawLine]);

  const hideLine = useCallback(() => setLine(null), []);

  const length = line ? Math.hypot(line.x2 - line.x1, line.y2 - line.y1) : 0;

  return (
    <>
      <button
        ref={pillRef}
        type="button"
        onMouseEnter={() => {
          setHovered(true);
          drawLine();
        }}
        onMouseLeave={() => {
          setHovered(false);
          hideLine();
        }}
        onClick={() => navigate(`/posts/${source.postId}`)}
        title={source.title}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amaranth/40 bg-amaranth/10 px-2.5 py-1 text-xs text-amaranth transition-colors hover:bg-amaranth/20 dark:border-amaranth/50 dark:bg-amaranth/15"
      >
        <svg
          className="h-3 w-3 shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 2 h6 a1 1 0 0 1 1 1 v10 a1 1 0 0 1 -1 1 H6 a1 1 0 0 1 -1 -1 V3 a1 1 0 0 1 1 -1 Z" />
          <path d="M8 5 h3 M8 8 h3 M8 11 h3" />
        </svg>
        <span className="truncate">{source.title}</span>
      </button>

      <AnimatePresence>
        {line && (
          <motion.svg
            key="thread-to-post"
            width="100%"
            height="100%"
            style={{ overflow: 'visible' }}
            className="pointer-events-none fixed inset-0 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.line
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="var(--color-emerald)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={buildDashArray(length)}
              initial={{ strokeDashoffset: length }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </>
  );
}
