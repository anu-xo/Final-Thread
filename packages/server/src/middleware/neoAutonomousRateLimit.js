// packages/server/src/middleware/neoAutonomousRateLimit.js
import { checkDailyRateLimit } from './dailyRateLimit.js';

// Combined daily budget for one user across BOTH autonomous triggers — the
// @mention auto-reply and the thread summary. Autonomous triggers post publicly
// visible comments, so the cap is deliberately tighter than the passive chat
// limiter (25/day).
export const NEO_AUTONOMOUS_DAILY_LIMIT =
  Number(process.env.NEO_AUTONOMOUS_DAILY_LIMIT) || 10;

const NEO_AUTONOMOUS_PREFIX = 'neo:autonomous';

/**
 * Checks a user's remaining autonomous budget. Reuses the chat limiter's daily
 * Redis pattern (key `neo:autonomous:${userId}:${YYYY-MM-DD}`, TTL-to-midnight).
 *
 * Returns `{ allowed, count, limit }` so callers can decide whether to enqueue
 * the autonomous job — the Gemini call stays off the API response path.
 */
export const checkNeoAutonomousLimit = async (userId) => {
  const { allowed, count } = await checkDailyRateLimit({
    prefix: NEO_AUTONOMOUS_PREFIX,
    identifier: userId,
    limit: NEO_AUTONOMOUS_DAILY_LIMIT,
  });

  return { allowed, count, limit: NEO_AUTONOMOUS_DAILY_LIMIT };
};
