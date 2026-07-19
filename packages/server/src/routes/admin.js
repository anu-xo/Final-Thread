import { Router } from 'express';
import User from '../models/User.js';
import Post from '../models/Post.js';
import AIConversation from '../models/AIConversation.js';
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

      const [totalUsers, totalPosts, aiChatsToday, openReports] = await Promise.all([
        User.countDocuments(),
        Post.countDocuments({ isRemoved: false }),
        AIConversation.countDocuments({ createdAt: { $gte: startOfDay } }),
        Report.countDocuments({ status: 'pending' }),
      ]);

      return { totalUsers, totalPosts, aiChatsToday, openReports };
    });

    res.json({ data: stats, error: null });
  } catch (err) {
    console.error('admin/stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
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

export default router;
