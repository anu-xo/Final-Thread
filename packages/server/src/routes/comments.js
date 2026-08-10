import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import Vote from '../models/Vote.js';
import { resolveViewerUserId } from '../utils/voteResponse.js';
import { ASKAI_TRIGGER, stripNeoMention } from '../utils/neoMentionDetect.js';
import { checkNeoAutonomousLimit } from '../middleware/neoAutonomousRateLimit.js';
import requireCommunityMod from '../middleware/requireCommunityMod.js';
import { getNeoAutonomousQueue } from '../jobs/neoAutonomousQueue.js';

const router = express.Router({ mergeParams: true });

const MAX_DEPTH = 5;

// Skip enqueueing a new @AskAI job when Neo already replied to this post within
// the window — prevents Neo answering every mention in a hot thread.
const NEO_REPLY_COOLDOWN_MS = 30 * 60 * 1000;

// ==========================
// Create Comment
// POST /:id/comments
// ==========================
/**
 * @openapi
 * /posts/{id}/comments:
 *   post:
 *     tags: [Comments]
 *     summary: Create a comment on a post
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Post ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CommentInput'
 *     responses:
 *       201:
 *         description: Comment created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Comment'
 *       400:
 *         description: Missing body or invalid parent
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Post or parent comment not found
 */
router.post('/:id/comments', authMiddleware, writeLimiter, async (req, res) => {
  try {
    const { id: postId } = req.params;
    const { body, parentId } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({
        data: null,
        error: 'Comment body is required',
        meta: {},
      });
    }

    const post = await Post.findById(postId);

    if (!post || post.isRemoved) {
      return res.status(404).json({
        data: null,
        error: 'Post not found',
        meta: {},
      });
    }

    let depth = 0;
    let parent = null;

    if (parentId) {
      if (!mongoose.Types.ObjectId.isValid(parentId)) {
        return res.status(400).json({
          data: null,
          error: 'Invalid parent comment ID',
          meta: {},
        });
      }

      parent = await Comment.findById(parentId);

      if (!parent || parent.isRemoved) {
        return res.status(404).json({
          data: null,
          error: 'Parent comment not found',
          meta: {},
        });
      }

      if (String(parent.post) !== String(postId)) {
        return res.status(400).json({
          data: null,
          error: 'Parent comment belongs to a different post',
          meta: {},
        });
      }

      depth = parent.depth + 1;

      if (depth > MAX_DEPTH) {
        return res.status(400).json({
          data: null,
          error: `Max nesting depth (${MAX_DEPTH}) exceeded`,
          meta: {},
        });
      }
    }

    const comment = await Comment.create({
      body: body.trim(),
      author: req.user._id,
      post: postId,
      parent: parentId || null,
      depth,
      score: 0,
    });

    // Bump the post's comment count
    await Post.findByIdAndUpdate(postId, {
      $inc: { commentCount: 1 },
    });

    const populated = await comment.populate(
      'author',
      'username karma'
    );

    const io = req.app.get('io');

    if (io) {
      io.to(`post:${postId}`).emit('comment:new', {
        postId,
        comment: {
          ...populated.toObject(),
          children: [],
          userVote: 0,
        },
      });
    }

    // @AskAI invocation — separate check after the normal save, so the comment,
    // its mention notifications, and the socket push all behave exactly as
    // before. Only the autonomous reply is gated behind the trigger + daily
    // budget; the Gemini call itself happens in the worker, never here. If the
    // rate-limit bookkeeping throws we still 201 the comment — the flag is best
    // effort, the comment is never lost to an infra hiccup.
    let rateLimited = false;
    let neoCooldown = false;
    try {
      if (ASKAI_TRIGGER.test(comment.body)) {
        const { allowed } = await checkNeoAutonomousLimit(String(req.user._id));
        if (!allowed) {
          rateLimited = true;
        } else if (
          post.lastNeoReplyAt &&
          Date.now() - new Date(post.lastNeoReplyAt).getTime() < NEO_REPLY_COOLDOWN_MS
        ) {
          neoCooldown = true;
        } else {
          await getNeoAutonomousQueue().add(
            'mention',
            {
              trigger: 'mention',
              triggerCommentId: String(comment._id),
              postId: String(postId),
              communityId: post.community ? String(post.community) : null,
              requestingUserId: String(req.user._id),
              question: stripNeoMention(comment.body),
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: 100,
              removeOnFail: 50,
            }
          );
        }
      }
    } catch (err) {
      console.error('[neo] failed to enqueue @AskAI reply:', err.message);
    }

    const meta = {};
    if (rateLimited) meta.rateLimited = true;
    if (neoCooldown) meta.neoCooldown = true;

    return res.status(201).json({
      data: populated,
      error: null,
      meta,
    });
  } catch (err) {
    console.error('Create comment error:', err);

    return res.status(500).json({
      data: null,
      error: 'Failed to create comment',
      meta: {},
    });
  }
});

// ==========================
// Summarize Post Thread
// POST /:id/summarize
// ==========================
/**
 * @openapi
 * /posts/{id}/summarize:
 *   post:
 *     tags: [Posts]
 *     summary: Queue a Neo thread summary (community mod only)
 *     description: Enqueues a 'summary' job so the autonomous worker pins a
 *       Neo-authored summary comment at the top of the thread. One summary per
 *       post at a time — re-summarizing requires removing the existing summary
 *       comment first.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Summary job queued
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         queued:
 *                           type: boolean
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not a moderator of the post's community
 *       404:
 *         description: Post not found
 *       409:
 *         description: Thread already summarized
 */
router.post('/:id/summarize', authMiddleware, requireCommunityMod, async (req, res, next) => {
  try {
    const post = req.post || (await Post.findById(req.params.id));
    if (!post) {
      return res.status(404).json({
        data: null,
        error: 'Post not found',
        meta: {},
      });
    }

    const existing = await Comment.findOne({
      post: post._id,
      neoTrigger: 'summary',
      isRemoved: false,
    });
    if (existing) {
      return res.status(409).json({
        data: null,
        error: 'Thread already summarized — remove the existing summary comment first',
        meta: {},
      });
    }

    await getNeoAutonomousQueue().add('summary', {
      postId: String(post._id),
      communityId: post.community ? String(post.community) : null,
      requestingUserId: String(req.user._id),
    });

    res.json({ data: { queued: true }, error: null, meta: {} });
  } catch (err) {
    next(err);
  }
});

// ==========================
// Get Comments
// GET /:id/comments
// ==========================
/**
 * @openapi
 * /posts/{id}/comments:
 *   get:
 *     tags: [Comments]
 *     summary: Get nested comment tree for a post
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Nested comment tree sorted by score
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
 *                         $ref: '#/components/schemas/Comment'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 */
router.get('/:id/comments', async (req, res) => {
  try {
    const { id: postId } = req.params;
    const viewerUserId = await resolveViewerUserId(req);

    // Single flat fetch, sorted by score desc (ties broken by createdAt asc
    // so older comments at the same score don't jump around)
    const comments = await Comment.find({
      post: postId,
      isRemoved: false,
    })
      .sort({
        score: -1,
        createdAt: 1,
      })
      .populate('author', 'username karma')
      .lean();

    const tree = buildCommentTree(comments);
    const commentIds = comments.map((comment) => comment._id);
    let voteMap = new Map();

    if (viewerUserId && commentIds.length > 0) {
      const votes = await Vote.find({
        user: viewerUserId,
        target: { $in: commentIds },
        targetType: 'comment',
      }).lean();

      voteMap = new Map(votes.map((vote) => [String(vote.target), vote.value]));
    }

    const enrichedTree = tree.map((comment) => ({
      ...comment,
      userVote: voteMap.get(String(comment._id)) || 0,
      children: mergeCommentVotes(comment.children || [], voteMap),
    }));

    return res.json({
      data: enrichedTree,
      error: null,
      meta: {
        total: comments.length,
      },
    });
  } catch (err) {
    console.error('Fetch comments error:', err);

    return res.status(500).json({
      data: null,
      error: 'Failed to fetch comments',
      meta: {},
    });
  }
});

/**
 * Reconstructs a nested comment tree from a flat array.
 *
 * Two-pass approach:
 * Pass 1: Store every comment in a Map keyed by its _id
 * and initialize an empty children array.
 *
 * Pass 2: Attach each comment to its parent.
 * Root comments are pushed directly into the roots array.
 *
 * Since the initial query is already sorted by score,
 * child arrays remain correctly ordered.
 */
function buildCommentTree(flatComments) {
  const map = new Map();
  const roots = [];

  // Pass 1: Register every node
  for (const comment of flatComments) {
    map.set(String(comment._id), {
      ...comment,
      children: [],
    });
  }

  // Pass 2: Wire up parent -> children
  for (const comment of flatComments) {
    const node = map.get(String(comment._id));

    if (comment.parent) {
      const parentNode = map.get(String(comment.parent));

      if (parentNode) {
        parentNode.children.push(node);
      } else {
        // Parent missing or deleted
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function mergeCommentVotes(comments, voteMap) {
  return comments.map((comment) => ({
    ...comment,
    userVote: voteMap.get(String(comment._id)) || 0,
    children: mergeCommentVotes(comment.children || [], voteMap),
  }));
}

export default router;