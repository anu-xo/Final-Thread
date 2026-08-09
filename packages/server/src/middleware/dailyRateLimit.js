// packages/server/src/middleware/dailyRateLimit.js
import { redis as redisClient } from '../config/redis.js';

/**
 * Per-calendar-day Redis rate limit — the shared implementation behind the Day 9
 * passive-chat limiter (aiRateLimit.js). Copied verbatim rather than
 * reimplemented so every daily budget shares the same key shape and TTL behavior.
 *
 * Key: `${prefix}:${identifier}:${YYYY-MM-DD}`. TTL is set once on the first hit
 * of the day (86400s) so the key resets the next day — mirrors the chat limiter
 * exactly.
 */
export const checkDailyRateLimit = async ({ prefix, identifier, limit }) => {
  if (!redisClient) {
    return { allowed: true, count: 0 };
  }

  const key = `${prefix}:${identifier}:${new Date().toISOString().slice(0, 10)}`;

  const count = await redisClient.incr(key);

  if (count === 1) {
    await redisClient.expire(key, 86400); // 24h TTL, resets daily
  }

  return { allowed: count <= limit, count };
};
