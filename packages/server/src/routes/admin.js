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

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Get dashboard stats (users, posts, AI chats, open reports)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform statistics
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an admin
 */
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

    res.json({ data: stats, error: null, meta: null });
  } catch (err) {
    console.error('admin/stats error:', err);
    res.status(500).json({ data: null, error: 'Failed to load stats', meta: null });
  }
});

/**
 * @openapi
 * /admin/stats/versions:
 *   get:
 *     tags: [Admin]
 *     summary: Get desktop app version adoption stats (7-day window)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Version adoption breakdown
 */
router.get('/stats/versions', async (req, res) => {
  try {
    const data = await cacheWrap('admin:stats:versions', 300, async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [byVersion, totals] = await Promise.all([
        ActivityEvent.aggregate([
          {
            $match: {
              platform: 'desktop',
              appVersion: { $ne: null },
              createdAt: { $gte: sevenDaysAgo },
            },
          },
          {
            $group: {
              _id: '$appVersion',
              users: { $addToSet: { $ifNull: ['$user', 'anon'] } },
              requests: { $sum: 1 },
            },
          },
          {
            $project: {
              version: '$_id',
              userCount: { $size: '$users' },
              requestCount: '$requests',
              _id: 0,
            },
          },
          { $sort: { version: -1 } },
        ]),
        ActivityEvent.aggregate([
          {
            $match: {
              platform: 'desktop',
              createdAt: { $gte: sevenDaysAgo },
            },
          },
          {
            $group: {
              _id: null,
              totalDesktopEvents: { $sum: 1 },
              uniqueUsers: { $addToSet: { $ifNull: ['$user', 'anon'] } },
            },
          },
          {
            $project: {
              totalEvents: '$totalDesktopEvents',
              uniqueUsers: { $size: '$uniqueUsers' },
              _id: 0,
            },
          },
        ]),
      ]);

      return {
        window: { from: sevenDaysAgo.toISOString(), to: new Date().toISOString() },
        versions: byVersion,
        totals: totals[0] || { totalEvents: 0, uniqueUsers: 0 },
      };
    });

    res.json({ data, error: null, meta: null });
  } catch (err) {
    console.error('admin/stats/versions error:', err);
    res.status(500).json({ data: null, error: 'Failed to load version stats', meta: null });
  }
});

/**
 * @openapi
 * /admin/stats/platform:
 *   get:
 *     tags: [Admin]
 *     summary: Get platform-specific activity stats (30-day window)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform event and user breakdown
 */
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

    res.json({ data, error: null, meta: null });
  } catch (err) {
    console.error('admin/stats/platform error:', err);
    res.status(500).json({ data: null, error: 'Failed to load platform stats', meta: null });
  }
});

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List users with optional search and ban filter
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: banned
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *     responses:
 *       200:
 *         description: List of users
 */
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

    res.json({ data: users, error: null, meta: null });
  } catch (err) {
    console.error('admin/users error:', err);
    res.status(500).json({ data: null, error: 'Failed to load users', meta: null });
  }
});

/**
 * @openapi
 * /admin/users/{id}/ban:
 *   post:
 *     tags: [Admin]
 *     summary: Ban a user and force-logout all sessions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: User banned
 *       404:
 *         description: User not found
 */
router.post('/users/:id/ban', async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: true, banReason: reason || null, bannedAt: new Date() },
      { new: true }
    ).select('username isBanned banReason');

    if (!user) return res.status(404).json({ data: null, error: 'User not found', meta: null });

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

    res.json({ data: user, error: null, meta: null });
  } catch (err) {
    console.error('admin/ban error:', err);
    res.status(500).json({ data: null, error: 'Failed to ban user', meta: null });
  }
});

/**
 * @openapi
 * /admin/users/{id}/unban:
 *   post:
 *     tags: [Admin]
 *     summary: Unban a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User unbanned
 *       404:
 *         description: User not found
 */
router.post('/users/:id/unban', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false, banReason: null, bannedAt: null },
      { new: true }
    ).select('username isBanned');

    if (!user) return res.status(404).json({ data: null, error: 'User not found', meta: null });

    res.json({ data: user, error: null, meta: null });
  } catch (err) {
    console.error('admin/unban error:', err);
    res.status(500).json({ data: null, error: 'Failed to unban user', meta: null });
  }
});

// Gemini text-embedding-004 + 2.5 Flash pricing — update when you outgrow free tier
const COST_PER_1K_TOKENS = 0.000075;

/**
 * @openapi
 * /admin/ai/costs:
 *   get:
 *     tags: [Admin]
 *     summary: Get AI usage costs broken down by day and community
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daily AI token usage with estimated cost
 */
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

    res.json({ data: withCost, error: null, meta: null });
  } catch (err) {
    console.error('admin/ai/costs error:', err);
    res.status(500).json({ data: null, error: 'Failed to load AI costs', meta: null });
  }
});

// ── AI Community Analytics ─────────────────────────────────────────────────────

/**
 * @openapi
 * /admin/ai/community/{communityId}/breakdown:
 *   get:
 *     tags: [Admin]
 *     summary: Get AI message breakdown for a specific community
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: communityId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message counts, token usage, ratings, and daily trend
 */
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
      meta: null,
    });
  } catch (err) {
    console.error('admin/ai/breakdown error:', err);
    res.status(500).json({ data: null, error: 'Failed to load AI breakdown', meta: null });
  }
});

/**
 * @openapi
 * /admin/ai/community/{communityId}/low-rated:
 *   get:
 *     tags: [Admin]
 *     summary: Get downvoted AI messages for a specific community
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: communityId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of low-rated AI messages
 */
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

    res.json({ data: messages, error: null, meta: null });
  } catch (err) {
    console.error('admin/ai/low-rated error:', err);
    res.status(500).json({ data: null, error: 'Failed to load low-rated messages', meta: null });
  }
});

export default router;
