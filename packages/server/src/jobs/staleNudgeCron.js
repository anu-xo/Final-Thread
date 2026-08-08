// packages/server/src/jobs/staleNudgeCron.js
import cron from 'node-cron';
import Post from '../models/Post.js';
import Community from '../models/Community.js';
import Notification from '../models/Notification.js';
import NeoLog from '../models/NeoLog.js';
import { getIO } from '../socket.js';

const STALE_HOURS = Number(process.env.NEO_STALE_POST_HOURS || 12);
const MIN_MEMBERS = Number(process.env.NEO_STALE_MIN_COMMUNITY_MEMBERS || 5);

export async function runStaleNudgeCheck() {
  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

  // Only communities that are large enough for "zero comments" to be meaningful
  // signal, and that haven't disabled AI features.
  // NOTE: Community.members is a denormalized Number (default 0) — not an array
  // of ObjectIds — so a plain numeric filter works; no $expr/$size needed.
  const eligibleCommunities = await Community.find({
    aiEnabled: true,
    members: { $gte: MIN_MEMBERS },
  }).select('_id');
  const communityIds = eligibleCommunities.map((c) => c._id);

  const staleCandidates = await Post.find({
    community: { $in: communityIds },
    commentCount: 0,
    isRemoved: false,
    createdAt: { $lte: cutoff },
  }).select('_id author community createdAt');

  for (const post of staleCandidates) {
    // One nudge per post, ever — check before creating
    const alreadyNudged = await NeoLog.exists({
      triggerType: 'active_stale',
      sourcePostIds: post._id,
    });
    if (alreadyNudged) continue;

    const created = await Notification.create({
      user: post.author,
      type: 'stale_post_nudge',
      actor: null,
      target: post._id,
      targetType: 'Post',
      read: false,
    });

    // Reuse the Day-12 notification:new socket path so the bell badge/knot
    // updates live, exactly like a reply/mention notification.
    try {
      const io = getIO();
      io.to('user:' + created.user).emit('notification:new', {
        _id: created._id,
        type: created.type,
        actor: created.actor,
        target: created.target,
        targetType: created.targetType,
        createdAt: created.createdAt,
      });
    } catch {
      // Socket unavailable (tests / worker-only contexts) — notification still persisted.
    }

    await NeoLog.create({
      triggerType: 'active_stale',
      layerUsed: 'aggregation',
      sourcePostIds: [post._id],
      communityId: post.community,
      targetUserId: post.author,
      metadata: { hoursSincePosted: STALE_HOURS },
    });
  }

  return { checked: staleCandidates.length };
}

export function registerStaleNudgeCron() {
  // Run hourly, not daily — staleness is time-sensitive and you want the
  // nudge to land reasonably close to the threshold, not up to 24h late.
  cron.schedule('0 * * * *', async () => {
    console.log('[staleNudgeCron] starting stale-post check');
    try {
      const result = await runStaleNudgeCheck();
      console.log(`[staleNudgeCron] checked ${result.checked} stale posts`);
    } catch (err) {
      console.error('[staleNudgeCron] fatal error', err);
    }
  });
}
