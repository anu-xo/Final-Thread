// jobs/pulseCron.js
//
// Hourly community-pulse computation: trending topics per community via simple
// term frequency (TF) over recent post titles — no NLP dependency, matching the
// "no new infra" constraint. Results are cached in Redis per community
// (community:{id}:pulse) so the FE widget renders without a heavy query and
// without hammering Mongo.
//
// Deliberately no NeoLog entry: this is pure aggregation with no LLM cost, and
// logging every hourly run for every community would flood the collection for
// no observability gain. (Pulse-click analytics, if ever wanted, is a PostHog
// event on the FE — not a NeoLog concern.)
import cron from 'node-cron';
import Community from '../models/Community.js';
import Post from '../models/Post.js';
import { redis } from '../config/redis.js';
import {
  NEO_PULSE_WINDOW_HOURS,
  NEO_PULSE_CACHE_TTL_SECONDS,
} from '../config/neoConfig.js';

// Keep this list in one place — don't scatter stopword logic.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'to', 'of', 'and', 'in', 'on', 'for', 'with',
  'this', 'that', 'my', 'your', 'how', 'what', 'why', 'do', 'does', 'i', 'it',
]);

function extractTerms(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

export async function computeCommunityPulse() {
  if (!redis) {
    console.warn('[pulseCron] Redis unavailable — skipping pulse computation');
    return { generated: 0 };
  }

  const windowStart = new Date(Date.now() - NEO_PULSE_WINDOW_HOURS * 60 * 60 * 1000);
  const communities = await Community.find({ aiEnabled: true }).select('_id');

  let generated = 0;

  for (const community of communities) {
    const recentPosts = await Post.find({
      community: community._id,
      createdAt: { $gte: windowStart },
      isRemoved: false,
    }).select('title');

    // Too little activity for "trending" to mean anything.
    if (recentPosts.length < 3) continue;

    const freq = new Map();
    for (const post of recentPosts) {
      for (const term of extractTerms(post.title)) {
        freq.set(term, (freq.get(term) || 0) + 1);
      }
    }

    const trending = [...freq.entries()]
      .filter(([, count]) => count >= 2) // must appear in at least 2 posts, not just be a fluke
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([term, count]) => ({ term, count }));

    if (trending.length === 0) continue;

    await redis.set(
      `community:${community._id}:pulse`,
      JSON.stringify(trending),
      'EX',
      NEO_PULSE_CACHE_TTL_SECONDS
    );
    generated++;
  }

  return { generated };
}

export function registerPulseCron() {
  // Hourly, offset from staleNudgeCron's :00 so both never hit Mongo at once.
  cron.schedule('15 * * * *', async () => {
    console.log('[pulseCron] starting community pulse computation');
    try {
      const result = await computeCommunityPulse();
      console.log(`[pulseCron] computed pulse for ${result.generated} communities`);
    } catch (err) {
      console.error('[pulseCron] fatal error', err);
    }
  });
}
