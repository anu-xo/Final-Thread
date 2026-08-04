// packages/web/src/components/RouteFade.jsx
import { motion, useReducedMotion } from 'motion/react';

/**
 * RouteFade — quick crossfade on navigation.
 *
 * Wrap page content keyed on the current pathname so each navigation fades
 * the new page in over ~180ms instead of a hard swap. It wraps only the page
 * content (the <Outlet /> or a public page), never the shared shell, so the
 * header/sidebar stay put and nothing remounts unnecessarily.
 *
 * prefers-reduced-motion: no fade, instant swap.
 */
export default function RouteFade({ children }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
