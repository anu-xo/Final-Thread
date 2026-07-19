import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth.js';
import Vote from '../models/Vote.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import { computeHotScore } from '../utils/scoring.js';
import { logActivity } from '../middleware/activityLog.js';

const router = express.Router();

/**
 * POST / - Handle voting for posts and comments
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { targetId, targetType, value } = req.body;

    // 1. Validations
    if (!['post', 'comment'].includes(targetType)) {
      return res.status(400).json({
        data: null,
        error: 'Invalid targetType',
        meta: {},
      });
    }

    if (![1, -1, 0].includes(value)) {
      return res.status(400).json({
        data: null,
        error: 'Invalid vote value',
        meta: {},
      });
    }

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({
        data: null,
        error: 'Invalid target ID',
        meta: {},
      });
    }

    // 2. Target existence check
    const Model = targetType === 'post' ? Post : Comment;
    const target = await Model.findById(targetId);

    if (!target || target.isRemoved || target.isDeleted) {
      return res.status(404).json({
        data: null,
        error: 'Target not found',
        meta: {},
      });
    }

    // 3. Determine vote changes & delta math
    const existingVote = await Vote.findOne({
      user: req.user._id,
      target: targetId,
      targetType,
    });

    const previousValue = existingVote ? existingVote.value : 0;
    const normalizedValue = existingVote && existingVote.value === value ? 0 : value;
    const delta = normalizedValue - previousValue;
    const upvoteDelta = (normalizedValue === 1 ? 1 : 0) - (previousValue === 1 ? 1 : 0);
    const downvoteDelta = (normalizedValue === -1 ? 1 : 0) - (previousValue === -1 ? 1 : 0);

    // 4. Update or Delete Vote document
    if (normalizedValue === 0) {
      if (existingVote) {
        await Vote.deleteOne({ _id: existingVote._id });
      }
    } else if (existingVote) {
      existingVote.value = normalizedValue;
      await existingVote.save();
    } else {
      await Vote.create({
        user: req.user._id,
        target: targetId,
        targetType,
        value: normalizedValue,
      });
    }

    let updatedTarget = target;

    // 5. Update Target score and ranking if changed
    if (delta !== 0) {
      const updatePayload =
        targetType === 'post'
          ? {
              $inc: {
                score: delta,
                upvotes: upvoteDelta,
                downvotes: downvoteDelta,
              },
            }
          : { $inc: { score: delta } };

      updatedTarget = await Model.findByIdAndUpdate(
        targetId,
        updatePayload,
        { new: true }
      );

      if (targetType === 'post') {
        const hotScore = computeHotScore(updatedTarget.upvotes, updatedTarget.downvotes, updatedTarget.createdAt);

        updatedTarget = await Post.findByIdAndUpdate(
          targetId,
          { $set: { hotScore } },
          { new: true }
        );
      }
    }

    // 6. Emit Real-time Updates via Socket.io
    const io = req.app.get('io');

    if (io) {
      if (targetType === 'post') {
        io.to(`post:${targetId}`).emit('vote:updated', {
          postId: targetId,
          newScore: updatedTarget.score,
        });
      } else {
        const parentPostId = target.post;
        io.to(`post:${parentPostId}`).emit('vote:updated', {
          commentId: targetId,
          newScore: updatedTarget.score,
        });
      }
    }

    logActivity('vote.cast', req, { targetId, targetType, value: normalizedValue });

    return res.json({
        userVote: normalizedValue,
        ...(targetType === 'post' ? { hotScore: updatedTarget.hotScore } : {}),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    console.error('Vote error:', err);

    return res.status(500).json({
      data: null,
      error: 'Failed to process vote',
      meta: {},
    });
  }
});

export default router;