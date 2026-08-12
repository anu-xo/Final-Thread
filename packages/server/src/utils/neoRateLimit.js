// packages/server/src/utils/neoRateLimit.js
//
// Shared per-user daily cap for the active layer (Day 23 dedup notification +
// stale-nudge cron combined). Both features import this single check so the
// budget is shared across them — a single active user posting a lot across
// several communities can't accumulate multiple active-layer notifications
// per day.
//
// Key: `neo:active:${userId}:${YYYY-MM-DD}`. The counter is incremented FIRST,
// then checked — the 4th call in a day still bumps the counter (so the count
// stays accurate for observability) but returns false, and the caller must NOT
// create the Notification/NeoLog for that call. This is separate from the
// per-post dedup check (NeoLog.exists), which stops the same post ever being
// double-nudged.

import { redis } from '../config/redis.js';
import User from '../models/User.js';
import { NEO_ACTIVE_DAILY_LIMIT } from '../config/neoConfig.js';

export async function checkActiveLayerRateLimit(userId) {
  if (!redis) return true; // fail-open: no Redis configured, no cap

  const key = `neo:active:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 24 * 60 * 60);
  }
  return count <= NEO_ACTIVE_DAILY_LIMIT;
}

// Combined gate used by both active-layer call sites (dedup notification +
// stale nudge): the user's opt-out pref AND the shared daily rate cap must
// both pass. `neoActiveNudges` is treated as true when unset (undefined is
// not a rejection) so users who saved prefs before this field existed are not
// silently opted out.
export async function isActiveLayerNudgeAllowed(userId) {
  const user = await User.findById(userId).select('notifPrefs.neoActiveNudges').lean();
  if (user?.notifPrefs?.neoActiveNudges === false) return false;
  return checkActiveLayerRateLimit(userId);
}
