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

// Max active-layer notifications (dedup + stale combined) a single user can get
// per day. The two jobs share one budget so users aren't double-pinged.
export const NEO_ACTIVE_DAILY_LIMIT = Number(process.env.NEO_ACTIVE_DAILY_LIMIT || 3);

// Nightly eval sample sizes per trigger type. New layers (mention/summary/
// digest) are cheaper and more templated than open-ended chat — bounded context,
// templated prompts — so they need less coverage for a representative signal.
// Deliberately NOT copied from the 20-question passive-chat suite: doing that
// for all four types would roughly triple nightly eval cost for marginal
// extra confidence.
export const NEO_EVAL_MENTION_SAMPLE_SIZE = Number(
  process.env.NEO_EVAL_MENTION_SAMPLE_SIZE || 8
);
export const NEO_EVAL_SUMMARY_SAMPLE_SIZE = Number(
  process.env.NEO_EVAL_SUMMARY_SAMPLE_SIZE || 5
);
export const NEO_EVAL_DIGEST_SAMPLE_SIZE = Number(
  process.env.NEO_EVAL_DIGEST_SAMPLE_SIZE || 5
);
