import express from 'express';
import Notification from '../models/Notification.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// GET /notifications?cursor=&limit=20
router.get('/', async (req, res) => {
  try {
    const { cursor, limit = 20 } = req.query;
    const query = { user: req.user.id };
    if (cursor) query._id = { $lt: cursor };

    const notifications = await Notification.find(query)
      .sort({ _id: -1 })
      .limit(Number(limit))
      .populate('actor', 'username avatar')
      .lean();

    const hasMore = notifications.length === Number(limit);

    res.json({
      data: notifications,
      error: null,
      meta: {
        cursor: hasMore ? notifications[notifications.length - 1]._id : null,
        hasMore,
        total: undefined, // avoid a full count() on every page load; not needed for infinite scroll
      },
    });
  } catch (err) {
    res.status(500).json({ data: null, error: err.message, meta: {} });
  }
});

// GET /notifications/unread-count
router.get('/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({ user: req.user.id, read: false });
    res.json({ data: { count }, error: null, meta: {} });
  } catch (err) {
    res.status(500).json({ data: null, error: err.message, meta: {} });
  }
});

// PUT /notifications/read  { ids: [...] }
router.put('/read', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ data: null, error: 'ids array required', meta: {} });
    }
    await Notification.updateMany(
      { _id: { $in: ids }, user: req.user.id }, // IDOR guard — only touch your own notifications
      { $set: { read: true } }
    );
    res.json({ data: { updated: ids.length }, error: null, meta: {} });
  } catch (err) {
    res.status(500).json({ data: null, error: err.message, meta: {} });
  }
});

// PUT /notifications/read-all
router.put('/read-all', async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user.id, read: false },
      { $set: { read: true } }
    );
    res.json({ data: { updated: result.modifiedCount }, error: null, meta: {} });
  } catch (err) {
    res.status(500).json({ data: null, error: err.message, meta: {} });
  }
});

export default router;