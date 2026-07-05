import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth.js';
import Vote from '../models/Vote.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';

const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { targetId, targetType, value } = req.body; // targetType: 'post' | 'comment', value: 1 | -1 | 0

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

    const Model = targetType === 'post' ? Post : Comment;
    const target = await Model.findById(targetId);

    if (!target) {
      return res.status(404).json({
        data: null,
        error: 'Target not found',
        meta: {},
      });
    }

    const existingVote = await Vote.findOne({
      user: req.user._id,
      target: targetId,
      targetType,
    });

    const previousValue = existingVote ? existingVote.value : 0;

    // Vote delta
    const delta = value - previousValue;

    if (value === 0) {
      if (existingVote) {
        await Vote.deleteOne({ _id: existingVote._id });
      }
    } else if (existingVote) {
      existingVote.value = value;
      await existingVote.save();
    } else {
      await Vote.create({
        user: req.user._id,
        target: targetId,
        targetType,
        value,
      });
    }

    let updatedTarget = target;

    if (delta !== 0) {
      updatedTarget = await Model.findByIdAndUpdate(
        targetId,
        { $inc: { score: delta } },
        { new: true }
      );

      // Recompute hot score for posts only
      if (targetType === 'post') {
        const hotScore = calculateHotScore(
          updatedTarget.score,
          updatedTarget.createdAt
        );

        updatedTarget = await Post.findByIdAndUpdate(
          targetId,
          { $set: { hotScore } },
          { new: true }
        );
      }
    }

    // Broadcast updated score
    const io = req.app.get('io');

    if (io) {
      if (targetType === 'post') {
        io.to(`post:${targetId}`).emit('vote:updated', {
          postId: targetId,
          newScore: updatedTarget.score,
        });
      } else {
        io.to(`post:${target.post}`).emit('vote:updated', {
          commentId: targetId,
          newScore: updatedTarget.score,
        });
      }
    }

    return res.json({
      data: {
        score: updatedTarget.score,
        userVote: value,
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

// Wilson score with time decay
function calculateHotScore(score, createdAt) {
  const order = Math.log10(Math.max(Math.abs(score), 1));
  const sign = score > 0 ? 1 : score < 0 ? -1 : 0;
  const seconds =
    (createdAt.getTime() - new Date(2024, 0, 1).getTime()) / 1000;

  return sign * order + seconds / 45000;
}

export default router;