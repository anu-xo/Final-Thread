import express from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import Vote from '../models/Vote.js';
import { resolveViewerUserId } from '../utils/voteResponse.js';
import { detectNeoMention } from '../utils/neoMentionDetect.js';
import { checkNeoAutonomousLimit } from '../middleware/neoAutonomousRateLimit.js';
import { getNeoAutonomousQueue } from '../jobs/neoAutonomousQueue.js';

const router = express.Router({ mergeParams: true });

const MAX_DEPTH = 5;

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

    // @AskAI invocation — dispatched fire-and-forget so the comment-creation
    // response never waits on Redis rate-limit bookkeeping or (down the line) a
    // Gemini call. The user comment above is already saved and notified exactly
    // as before; this only enqueues the autonomous reply job.
    dispatchNeoMentionJob({
      body: comment.body,
      postId,
      communityId: post.community,
      comment,
      authorId: req.user._id,
    });

    return res.status(201).json({
      data: populated,
      error: null,
      meta: {},
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

/**
 * Fire-and-forget enqueue for the @AskAI autonomous reply. Non-blocking by
 * design: the Gemini call happens in the neo-autonomous worker, never in the
 * comment-creation response path. When the daily autonomous budget is spent the
 * job is silently skipped — the user's comment still stands on its own.
 */
async function dispatchNeoMentionJob({ body, postId, communityId, comment, authorId }) {
  try {
    if (!detectNeoMention(body)) return;

    const { allowed } = await checkNeoAutonomousLimit(String(authorId));
    if (!allowed) {
      console.log(
        `[neo] autonomous daily limit reached for user ${authorId} — skipping @AskAI reply`
      );
      return;
    }

    await getNeoAutonomousQueue().add(
      'mention',
      {
        trigger: 'mention',
        postId: String(postId),
        communityId: communityId ? String(communityId) : null,
        sourceCommentId: String(comment._id), // Neo replies as a child of the @AskAI comment
        parentId: comment.parent ? String(comment.parent) : null,
        authorId: String(authorId),
        body,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    console.log(`[neo] @AskAI reply job queued for comment ${comment._id}`);
  } catch (err) {
    console.error('[neo] failed to enqueue @AskAI reply:', err.message);
  }
}

export default router;