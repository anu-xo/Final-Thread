import { Router } from 'express';
import User from '../models/User.js';
import Post from '../models/Post.js';
import AIConversation from '../models/AIConversation.js';
import Report from '../models/Report.js';
import { cacheWrap } from '../utils/cacheWrap.js';

const router = Router();

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

export default router;
