import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth.js';
import Vote from '../models/Vote.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';

const router = express.Router();

/**
 * Helper function to calculate Reddit-style hot ranking score
 */
function calculateHotScore(score, createdAt) {
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  const seconds = (createdAt.getTime() - new Date(2024, 0, 1).getTime()) / 1000;

  return sign * order + seconds / 45000;
}

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

    if (!target) {
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
    const nextValue = value === 0 ? 0 : value;
    const normalizedValue = existingVote && existingVote.value === value ? 0 : nextValue;
    const delta = normalizedValue - previousValue;

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
      updatedTarget = await Model.findByIdAndUpdate(
        targetId,
        { $inc: { score: delta } },
        { new: true }
      );

      if (targetType === 'post') {
        const hotScore = calculateHotScore(updatedTarget.score, updatedTarget.createdAt);

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

    return res.json({
      data: {
        score: updatedTarget.score,
        userVote: normalizedValue,
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