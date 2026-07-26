// packages/server/src/routes/mod.js
import express from 'express';
import mongoose from 'mongoose';
import {authMiddleware} from '../middleware/auth.js';
import modGuard from '../middleware/modGuard.js';
import Report from '../models/Report.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import CommunityMember from '../models/CommunityMember.js';
import ModerationLog from '../models/ModerationLog.js'; // create if not present yet

const router = express.Router();

// GET /mod/queue?communityId=&cursor=
/**
 * @openapi
 * /mod/queue:
 *   get:
 *     tags: [Moderation]
 *     summary: Get pending moderation reports for communities you moderate
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: communityId
 *         schema:
 *           type: string
 *         description: Filter to a specific community
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Pagination cursor
 *     responses:
 *       200:
 *         description: List of pending reports
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Report'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a moderator of the specified community
 */
router.get('/mod/queue', authMiddleware, async (req, res, next) => {
  try {
    const { communityId, cursor } = req.query;

    // Only return reports for communities where req.user is mod/admin
    const memberships = await CommunityMember.find({
      user: req.user._id,
      role: { $in: ['mod', 'admin'] },
    }).select('community').lean();

    const modCommunityIds = memberships.map((m) => m.community.toString());

    const filter = { status: 'pending', community: { $in: modCommunityIds } };
    if (communityId) {
      if (!modCommunityIds.includes(communityId)) {
        return res.status(403).json({ data: null, error: 'Forbidden', meta: null });
      }
      filter.community = communityId;
    }
    if (cursor) filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };

    const reports = await Report.find(filter)
      .sort({ _id: -1 })
      .limit(20)
      .populate('reporter', 'username')
      .populate('community', 'name slug')
      .lean();

    const hasMore = reports.length === 20;
    const nextCursor = hasMore ? reports[reports.length - 1]._id : null;

    res.json({
      data: reports,
      error: null,
      meta: { cursor: nextCursor, hasMore, total: null },
    });
  } catch (err) {
    next(err);
  }
});

// POST /mod/action  { type: 'approve'|'remove'|'ban', targetId, targetType, communityId, userId? }
/**
 * @openapi
 * /mod/action:
 *   post:
 *     tags: [Moderation]
 *     summary: Execute a moderation action (approve, remove, or ban)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, targetType]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [approve, remove, ban]
 *               targetId:
 *                 type: string
 *               targetType:
 *                 type: string
 *                 enum: [post, comment]
 *               communityId:
 *                 type: string
 *               userId:
 *                 type: string
 *               reportId:
 *                 type: string
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Action executed successfully
 *       400:
 *         description: Invalid action type or missing required fields
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a moderator
 */
router.post('/mod/action', authMiddleware, modGuard, async (req, res, next) => {
  try {
    const { type, targetId, targetType, communityId, userId, reportId } = req.body;

    if (!['approve', 'remove', 'ban'].includes(type)) {
      return res.status(400).json({ data: null, error: 'Invalid action type', meta: null });
    }

    if (type === 'remove') {
      const Model = targetType === 'comment' ? Comment : Post;
      await Model.findByIdAndUpdate(targetId, { isRemoved: true });
    }

    if (type === 'ban') {
      if (!userId) {
        return res.status(400).json({ data: null, error: 'userId required for ban', meta: null });
      }
      await CommunityMember.findOneAndUpdate(
        { user: userId, community: communityId },
        { role: 'banned' },
        { upsert: true }
      );
    }

    if (reportId) {
      const statusMap = { approve: 'dismissed', remove: 'removed', ban: 'removed' };
      await Report.findByIdAndUpdate(reportId, { status: statusMap[type] });
    }

    await ModerationLog.create({
      source: 'mod',
      moderator: req.user._id,
      action: type,
      target: targetId,
      targetType,
      community: communityId,
      reason: req.body.reason || null,
    });

    res.json({ data: { success: true }, error: null, meta: null });
  } catch (err) {
    next(err);
  }
});

export default router;