// config/neoConfig.js
// Shared Neo layer tuning knobs, read once at import time (mirror of the
// staleNudgeCron / staleNudge pattern). Tests set process.env before importing.

// Posts fed into the per-community AI highlight prompt for the weekly digest.
export const NEO_DIGEST_HIGHLIGHT_TOP_N = Number(
  process.env.NEO_DIGEST_HIGHLIGHT_TOP_N || 5
);

// Lookback window (hours) for the ambient-pulse job's "what's active" query.
export const NEO_PULSE_WINDOW_HOURS = Number(
  process.env.NEO_PULSE_WINDOW_HOURS || 24
);

// Redis TTL (seconds) for a community's cached pulse. Cron runs hourly, so the
// TTL outlives the interval and guards against duplicate pulses per window.
export const NEO_PULSE_CACHE_TTL_SECONDS = Number(
  process.env.NEO_PULSE_CACHE_TTL_SECONDS || 4200
);
