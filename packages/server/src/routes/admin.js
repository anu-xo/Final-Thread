import { Router } from 'express';
import User from '../models/User.js';
import Post from '../models/Post.js';
import ActivityEvent from '../models/ActivityEvent.js';
import AIConversation from '../models/AIConversation.js';
import AIMessage from '../models/AIMessage.js';
import Report from '../models/Report.js';
import { cacheWrap } from '../utils/cacheWrap.js';
import { redis } from '../config/redis.js';
import { authMiddleware } from '../middleware/auth.js';
import adminGuard from '../middleware/adminGuard.js';

const router = Router();
router.use(authMiddleware);
router.use(adminGuard);

router.get('/stats', async (req, res) => {
  try {
    const stats = await cacheWrap('admin:stats', 300, async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [totalUsers, totalPosts, aiChatsToday, openReports, platformTotals, platformDaily] =
        await Promise.all([
          User.countDocuments(),
          Post.countDocuments({ isRemoved: false }),
          AIConversation.countDocuments({ createdAt: { $gte: startOfDay } }),
          Report.countDocuments({ status: 'pending' }),
          ActivityEvent.aggregate([
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            { $group: { _id: '$platform', count: { $sum: 1 } } },
          ]),
          ActivityEvent.aggregate([
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
              $group: {
                _id: {
                  day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  platform: '$platform',
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { '_id.day': -1 } },
          ]),
        ]);

      const platformBreakdown = { desktop: 0, web: 0 };
      for (const row of platformTotals) {
        platformBreakdown[row._id] = row.count;
      }

      return { totalUsers, totalPosts, aiChatsToday, openReports, platformBreakdown, platformDaily };
    });

    res.json({ data: stats, error: null });
  } catch (err) {
    console.error('admin/stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

router.get('/stats/platform', async (req, res) => {
  try {
    const data = await cacheWrap('admin:stats:platform', 300, async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [eventsByType, uniqueUsersByPlatform, desktopVersions] = await Promise.all([
        ActivityEvent.aggregate([
          { $match: { createdAt: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: { event: '$event', platform: '$platform' },
              count: { $sum: 1 },
            },
          },
          { $sort: { '_id.event': 1, '_id.platform': 1 } },
        ]),
        ActivityEvent.aggregate([
          { $match: { createdAt: { $gte: thirtyDaysAgo }, user: { $ne: null } } },
          {
            $group: {
              _id: { userId: '$user', platform: '$platform' },
            },
          },
          {
            $group: {
              _id: '$_id.platform',
              uniqueUsers: { $sum: 1 },
            },
          },
        ]),
        ActivityEvent.aggregate([
          { $match: { createdAt: { $gte: thirtyDaysAgo }, platform: 'desktop', appVersion: { $ne: null } } },
          { $group: { _id: '$appVersion', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
      ]);

      return { eventsByType, uniqueUsersByPlatform, desktopVersions };
    });

    res.json({ data, error: null });
  } catch (err) {
    console.error('admin/stats/platform error:', err);
    res.status(500).json({ error: 'Failed to load platform stats' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const { search, banned } = req.query;
    const filter = {};

    if (search) filter.$text = { $search: search };
    if (banned === 'true') filter.isBanned = true;
    if (banned === 'false') filter.isBanned = false;

    const users = await User.find(filter)
      .select('username email karma role isBanned createdAt')
      .limit(50)
      .lean();

    res.json({ data: users, error: null });
  } catch (err) {
    console.error('admin/users error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

router.post('/users/:id/ban', async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: true, banReason: reason || null, bannedAt: new Date() },
      { new: true }
    ).select('username isBanned banReason');

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Force logout: blacklist all active refresh tokens
    const userFull = await User.findById(req.params.id).select('refreshTokens');
    if (userFull?.refreshTokens?.length) {
      const pipeline = redis ? redis.pipeline() : null;
      if (pipeline) {
        for (const token of userFull.refreshTokens) {
          pipeline.set(`blacklist:${token}`, '1', 'EX', 7 * 24 * 60 * 60);
        }
        await pipeline.exec();
      }
      await User.findByIdAndUpdate(req.params.id, { $set: { refreshTokens: [] } });
    }

    res.json({ data: user, error: null });
  } catch (err) {
    console.error('admin/ban error:', err);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

router.post('/users/:id/unban', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false, banReason: null, bannedAt: null },
      { new: true }
    ).select('username isBanned');

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ data: user, error: null });
  } catch (err) {
    console.error('admin/unban error:', err);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

// Gemini text-embedding-004 + 2.5 Flash pricing — update when you outgrow free tier
const COST_PER_1K_TOKENS = 0.000075;

router.get('/ai/costs', async (req, res) => {
  try {
    const costs = await cacheWrap('admin:ai:costs', 300, async () => {
      return AIMessage.aggregate([
        {
          $lookup: {
            from: 'aiconversations',
            localField: 'conversation',
            foreignField: '_id',
            as: 'conv',
          },
        },
        { $unwind: '$conv' },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              community: '$conv.community',
            },
            totalTokens: { $sum: '$tokensUsed' },
            messageCount: { $sum: 1 },
          },
        },
        { $sort: { '_id.day': -1 } },
      ]);
    });

    const withCost = costs.map((c) => ({
      ...c,
      estimatedCostUsd: (c.totalTokens / 1000) * COST_PER_1K_TOKENS,
    }));

    res.json({ data: withCost, error: null });
  } catch (err) {
    console.error('admin/ai/costs error:', err);
    res.status(500).json({ error: 'Failed to load AI costs' });
  }
});

// ── AI Community Analytics ─────────────────────────────────────────────────────

router.get('/ai/community/:communityId/breakdown', async (req, res) => {
  try {
    const { communityId } = req.params;

    const [conversationIds] = await Promise.all([
      AIConversation.find({ community: communityId }).distinct('_id'),
    ]);

    const breakdown = await AIMessage.aggregate([
      { $match: { conversation: { $in: conversationIds } } },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: 1 },
          userMessages: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } },
          assistantMessages: { $sum: { $cond: [{ $eq: ['$role', 'assistant'] }, 1, 0] } },
          totalTokens: { $sum: '$tokensUsed' },
          avgRating: { $avg: { $cond: [{ $ne: ['$rating', null] }, '$rating', null] } },
          ratedCount: { $sum: { $cond: [{ $ne: ['$rating', null] }, 1, 0] } },
          upvotes: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
          downvotes: { $sum: { $cond: [{ $eq: ['$rating', -1] }, 1, 0] } },
        },
      },
    ]);

    const daily = await AIMessage.aggregate([
      { $match: { conversation: { $in: conversationIds } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          messages: { $sum: 1 },
          tokens: { $sum: '$tokensUsed' },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 30 },
    ]);

    const stats = breakdown[0] || {
      totalMessages: 0, userMessages: 0, assistantMessages: 0,
      totalTokens: 0, avgRating: null, ratedCount: 0, upvotes: 0, downvotes: 0,
    };

    res.json({
      data: { ...stats, conversations: conversationIds.length, daily },
      error: null,
    });
  } catch (err) {
    console.error('admin/ai/breakdown error:', err);
    res.status(500).json({ error: 'Failed to load AI breakdown' });
  }
});

router.get('/ai/community/:communityId/low-rated', async (req, res) => {
  try {
    const { communityId } = req.params;

    const conversationIds = await AIConversation.find({ community: communityId }).distinct('_id');

    const messages = await AIMessage.find({
      conversation: { $in: conversationIds },
      rating: -1,
    })
      .select('conversation content rating createdAt')
      .populate('conversation', 'user')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ data: messages, error: null });
  } catch (err) {
    console.error('admin/ai/low-rated error:', err);
    res.status(500).json({ error: 'Failed to load low-rated messages' });
  }
});

export default router;
