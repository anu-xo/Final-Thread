import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import Vote from '../models/Vote.js';
import { resolveViewerUserId } from '../utils/voteResponse.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

async function loadUser(username) {
  return User.findOne({ username })
    .select('username avatar bio role karma createdAt')
    .lean();
}

function parseLimit(limitValue) {
  const parsed = Number.parseInt(limitValue, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function buildCursorQuery(cursor) {
  if (!cursor) {
    return {};
  }

  if (!mongoose.isValidObjectId(cursor)) {
    const error = new Error('Invalid cursor');
    error.status = 400;
    throw error;
  }

  return { _id: { $lt: cursor } };
}

function applyUserVote(documents, voteMap) {
  return documents.map((document) => ({
    ...document,
    userVote: voteMap.get(String(document._id)) || 0,
  }));
}

async function addVoteMapForTargets(viewerUserId, targetType, documents) {
  if (!viewerUserId || documents.length === 0) {
    return new Map();
  }

  const targetIds = documents.map((document) => document._id);
  const votes = await Vote.find({
    user: viewerUserId,
    target: { $in: targetIds },
    targetType,
  }).lean();

  return new Map(votes.map((vote) => [String(vote.target), vote.value]));
}

// GET /users/:username
router.get('/:username', async (req, res) => {
  const user = await loadUser(req.params.username);

  if (!user) {
    return res.status(404).json({ data: null, error: 'User not found', meta: null });
  }

  const [postKarma, commentKarma] = await Promise.all([
    Post.aggregate([
      { $match: { author: user._id, isRemoved: false } },
      { $group: { _id: null, total: { $sum: '$score' } } },
    ]),
    Comment.aggregate([
      { $match: { author: user._id, isRemoved: false } },
      { $group: { _id: null, total: { $sum: '$score' } } },
    ]),
  ]);

  res.json({
    data: {
      ...user,
      karma: (postKarma[0]?.total || 0) + (commentKarma[0]?.total || 0),
    },
    error: null,
    meta: null,
  });
});

// GET /users/:username/posts
router.get('/:username/posts', async (req, res) => {
  try {
    const user = await loadUser(req.params.username);

    if (!user) {
      return res.status(404).json({ data: null, error: 'User not found', meta: null });
    }

    const viewerUserId = await resolveViewerUserId(req);
    const limit = parseLimit(req.query.limit);
    const query = {
      author: user._id,
      isRemoved: false,
      ...buildCursorQuery(req.query.cursor),
    };

    const posts = await Post.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate('author', 'username avatarUrl')
      .populate('community', 'slug name icon')
      .lean();

    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;
    const voteMap = await addVoteMapForTargets(viewerUserId, 'post', page);
    const enrichedPosts = applyUserVote(page, voteMap);

    return res.json({
      data: enrichedPosts,
      error: null,
      meta: {
        cursor: hasMore && page.length > 0 ? page[page.length - 1]._id : null,
        hasMore,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ data: null, error: err.message || 'Failed to fetch posts', meta: null });
  }
});

// GET /users/:username/comments
router.get('/:username/comments', async (req, res) => {
  try {
    const user = await loadUser(req.params.username);

    if (!user) {
      return res.status(404).json({ data: null, error: 'User not found', meta: null });
    }

    const viewerUserId = await resolveViewerUserId(req);
    const limit = parseLimit(req.query.limit);
    const query = {
      author: user._id,
      isRemoved: false,
      ...buildCursorQuery(req.query.cursor),
    };

    const comments = await Comment.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate('author', 'username karma')
      .populate({
        path: 'post',
        select: 'title community',
        populate: { path: 'community', select: 'slug name' },
      })
      .lean();

    const hasMore = comments.length > limit;
    const page = hasMore ? comments.slice(0, limit) : comments;
    const voteMap = await addVoteMapForTargets(viewerUserId, 'comment', page);
    const enrichedComments = applyUserVote(page, voteMap);

    return res.json({
      data: enrichedComments,
      error: null,
      meta: {
        cursor: hasMore && page.length > 0 ? page[page.length - 1]._id : null,
        hasMore,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ data: null, error: err.message || 'Failed to fetch comments', meta: null });
  }
});

router.put('/me', authMiddleware, async (req, res) => {
  const { bio, avatar, notifPrefs } = req.body;
  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { bio, avatar, notifPrefs } },
    { new: true, runValidators: true }
  ).select('-passwordHash -refreshTokens');

  res.json({ data: updated, error: null, meta: null });
});

export default router;