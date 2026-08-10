// jobs/digestHighlights.js
//
// Phase 1 of the weekly digest cron: per-community AI highlights. The highlight
// is generated ONCE per community per ISO week and cached in Redis so every
// subscriber's email reuses the same text — O(active communities) Gemini calls
// instead of O(users). digestCron.js awaits this before phase 2 (per-user email
// assembly in emailService.js) so ordering stays guaranteed.
import { redis } from '../config/redis.js';
import { NEO_DIGEST_HIGHLIGHT_TOP_N } from '../config/neoConfig.js';
import { currentIsoWeekKey } from '../utils/isoWeekKey.js';
export { currentIsoWeekKey };
import {
  buildDigestHighlightPrompt,
  generateNonStreamingResponse,
} from '../services/aiService.js';
import Community from '../models/Community.js';
import Post from '../models/Post.js';
import NeoLog from '../models/NeoLog.js';

// 8 days — outlives next Monday's run, so a restarted cron never regenerates.
const DIGEST_CACHE_TTL_SECONDS = 8 * 24 * 60 * 60;

export async function generateCommunityHighlights() {
  if (!redis) {
    console.warn('[digestHighlights] Redis unavailable — skipping per-community highlights');
    return { generated: 0, skipped: 0 };
  }

  const weekKey = currentIsoWeekKey();
  const communities = await Community.find({ aiEnabled: true }).select('_id name');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let generated = 0;
  let skipped = 0;

  for (const community of communities) {
    const redisKey = `neo:digest:community:${community._id}:${weekKey}`;
    const cached = await redis.get(redisKey);
    if (cached) {
      // Already generated this week (handles cron restarts / re-runs)
      skipped++;
      continue;
    }

    const topPosts = await Post.find({
      community: community._id,
      createdAt: { $gte: sevenDaysAgo },
      isRemoved: false,
    })
      .sort({ score: -1 })
      .limit(NEO_DIGEST_HIGHLIGHT_TOP_N)
      .select('title body score');

    // No activity, nothing to summarize — don't call Gemini for an empty week
    if (topPosts.length === 0) {
      skipped++;
      continue;
    }

    const prompt = buildDigestHighlightPrompt({ communityName: community.name, topPosts });
    const start = Date.now();
    const highlightText = await generateNonStreamingResponse(prompt);

    await redis.set(redisKey, highlightText, 'EX', DIGEST_CACHE_TTL_SECONDS);
    await NeoLog.create({
      triggerType: 'digest',
      layerUsed: 'aggregation',
      sourcePostIds: topPosts.map((p) => p._id),
      communityId: community._id,
      latencyMs: Date.now() - start,
    });
    generated++;
  }

  return { generated, skipped };
}
