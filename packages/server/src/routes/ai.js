// packages/server/src/routes/ai.js
import express from 'express';
import * as Sentry from '@sentry/node';
import { authMiddleware } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimiter.js';
import aiRateLimiter from '../middleware/aiRateLimit.js';
// import aiService from '../services/aiService.js';
import AIConversation from '../models/AIConversation.js';
import AIMessage from '../models/AIMessage.js';
import Community from '../models/Community.js';
import * as aiService from '../services/aiService.js'; // adjust the path if different
import { logActivity } from '../middleware/activityLog.js';


const router = express.Router();

// GET /ai/health
// Verifies Gemini connectivity independent of user auth.
// Useful for uptime monitoring and quick manual checks.
/**
 * @openapi
 * /ai/health:
 *   get:
 *     tags: [AI]
 *     summary: Check Gemini API connectivity
 *     responses:
 *       200:
 *         description: Gemini connected
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
 *                         status:
 *                           type: string
 *                           enum: [ok, error]
 *                         gemini:
 *                           type: string
 *                         embeddingDims:
 *                           type: integer
 *                         timestamp:
 *                           type: string
 *                           format: date-time
 *       503:
 *         description: Gemini unreachable
 */
router.get('/health', async (req, res) => {
  try {
    const testEmbedding = await aiService.embedQuery('health check');

    if (Array.isArray(testEmbedding) && testEmbedding.length > 0) {
      return res.status(200).json({
        data: { status: 'ok', gemini: 'connected', embeddingDims: testEmbedding.length, timestamp: new Date().toISOString() },
        error: null,
        meta: null,
      });
    }

    return res.status(503).json({
      data: { status: 'error', gemini: 'unexpected response', timestamp: new Date().toISOString() },
      error: null,
      meta: null,
    });
  } catch (err) {
    console.error('AI health check failed:', err);

    return res.status(503).json({
      data: { status: 'error', gemini: 'unreachable', timestamp: new Date().toISOString() },
      error: null,
      meta: null,
    });
  }
});
// POST /ai/chat — Handle interactive streaming sessions via SSE
/**
 * @openapi
 * /ai/chat:
 *   post:
 *     tags: [AI]
 *     summary: Stream AI chat response via SSE (RAG + Gemini)
 *     description: >
 *       Returns a `text/event-stream` response. Events:
 *       - `{ type: "warning", message }` — if fewer than 3 sources found
 *       - `{ type: "token", text }` — each generated token chunk
 *       - `{ data: { conversationId, sources }, error, meta }` — stream complete
 *       - `{ type: "error", message }` — error during generation
 *       `communityId` is optional: omit it for the standalone site-wide assistant
 *       (global retrieval across all communities, no aiEnabled gate).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *               communityId:
 *                 type: string
 *                 description: >
 *                   Omit for the standalone site-wide chat. When present, scopes
 *                   retrieval to the community and enforces Community.aiEnabled.
 *               conversationId:
 *                 type: string
 *                 description: Existing conversation ID to continue
 *               postId:
 *                 type: string
 *                 description: >
 *                   Pin the chat to a specific post. Retrieval biases toward the
 *                   post's own embedding + its comment thread and only falls
 *                   back to community-wide (or global) search when that thread
 *                   is thin.
 *               thread:
 *                 type: object
 *                 description: Pin a specific post (+ its comments) as context
 *                 properties:
 *                   postId:
 *                     type: string
 *     responses:
 *       200:
 *         description: SSE stream of AI tokens
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Missing message
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: AI chat disabled for this community
 */
router.post('/chat', authMiddleware, aiRateLimiter, async (req, res) => {
  const { message, communityId, conversationId, postId, thread } = req.body;

  if (!message) {
    return res.status(400).json({
      data: null,
      error: 'message required',
      meta: {},
    });
  }

  try {
    // aiEnabled gate — only when a community is being chatted about. The
    // standalone site-wide chat (no communityId) is always available.
    if (communityId) {
      const community = await Community.findById(communityId).select('aiEnabled').lean();
      if (!community?.aiEnabled) {
        return res.status(403).json({
          data: null,
          error: 'AI chat is disabled for this community',
          meta: {},
        });
      }
    }

    let conversation = conversationId
      ? await AIConversation.findOne({ _id: conversationId, user: req.user.id })
      : null;

    if (!conversation) {
      conversation = await AIConversation.create({
        user: req.user.id,
        community: communityId || null,
      });
    }

    await AIMessage.create({
      conversation: conversation._id,
      role: 'user',
      content: message,
    });

    logActivity('ai.chat', req, { communityId: communityId || null, conversationId: conversation._id });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let fullText = '';
    let collectedSources = [];
    let tokensUsed = 0;

    try {
      const { stream, sources, tokenCount } = await aiService.streamChatResponse({
        message,
        communityId: communityId || null,
        conversationId: conversation._id,
        postId,
        thread,
      });

      collectedSources = sources;
      tokensUsed = tokenCount;

      // "Limited context available" warning — sources IS the retrieved context here,
      // so its length is the right signal, not a separate `context` variable
      if (sources.length < 3) {
        res.write(
          `data: ${JSON.stringify({
            type: 'warning',
            message: communityId
              ? 'Limited context available — this community may not have enough indexed posts yet.'
              : 'Limited context available — try asking about posts that exist on ThreadVerse.',
          })}\n\n`
        );
      }

      for await (const chunk of stream) {
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ type: 'token', text: chunk })}\n\n`);
      }

      res.write(
        `data: ${JSON.stringify({
          data: {
            conversationId: conversation._id,
            sources: collectedSources,
          },
          error: null,
          meta: {},
        })}\n\n`
      );
    } catch (streamErr) {
      console.error('AI streaming error:', streamErr);
      Sentry.captureException(streamErr, { extra: { communityId, message } });
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: 'AI unavailable' })}\n\n`
      );
    } finally {
      res.end();
      if (fullText) {
        await AIMessage.create({
          conversation: conversation._id,
          role: 'assistant',
          content: fullText,
          sources: collectedSources,
          tokensUsed,
        });
      }
    }
  } catch (err) {
    console.error('AI routing error:', err);
    Sentry.captureException(err);
    if (!res.headersSent) {
      return res.status(500).json({
      data: null,
      error: 'Internal server error occurred setup phase.',
        meta: {},
      });
    }
    res.end();
  }
});

// GET /ai/conversations — list the user's AI conversations.
// Without query params this returns the user's most recent conversations.
//   ?global=1        → only standalone site-wide chats (community: null)
//   ?communityId=xxx → only chats inside that community
// Sorted by most recently updated, newest first. Used by the standalone chat
// drawer to resume where the user left off.
/**
 * @openapi
 * /ai/conversations:
 *   get:
 *     tags: [AI]
 *     summary: List the user's AI conversations
 *     description: >
 *       Newest first. Pass `?global=1` for the standalone site-wide chat
 *       (community: null) or `?communityId=<id>` to scope to a community.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: global
 *         schema:
 *           type: string
 *           enum: ['1']
 *         description: Return only standalone site-wide conversations
 *       - in: query
 *         name: communityId
 *         schema:
 *           type: string
 *         description: Return only conversations for this community
 *     responses:
 *       200:
 *         description: Conversation list sorted by updatedAt desc
 *       401:
 *         description: Not authenticated
 */
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const { communityId, global } = req.query;
    const filter = { user: req.user.id };

    if (global === '1') filter.community = null;
    else if (communityId) filter.community = communityId;

    const conversations = await AIConversation.find(filter)
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    return res.json({ data: conversations, error: null, meta: {} });
  } catch (err) {
    console.error('Error listing conversations:', err);
    return res.status(500).json({
      data: null,
      error: 'Failed to list conversations',
      meta: {},
    });
  }
});

// GET /ai/conversations/:id/messages — retrieve message history for a conversation
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    const conversation = await AIConversation.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!conversation) {
      return res.status(404).json({
        data: null,
        error: 'Conversation not found',
        meta: {},
      });
    }

    const messages = await AIMessage.find({ conversation: conversation._id })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ data: messages, error: null, meta: {} });
  } catch (err) {
    console.error('Error fetching conversation messages:', err);
    return res.status(500).json({
      data: null,
      error: 'Failed to fetch messages',
      meta: {},
    });
  }
});

/**
 * @openapi
 * /ai/conversations/{id}/messages:
 *   get:
 *     tags: [AI]
 *     summary: Get conversation message history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     responses:
 *       200:
 *         description: Messages sorted by creation time
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
 *                         $ref: '#/components/schemas/AIMessage'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Conversation not found or not owned by user
 */
// POST /ai/messages/:id/feedback — rate an AI message (1 = thumbs up, -1 = thumbs down)
/**
 * @openapi
 * /ai/messages/{id}/feedback:
 *   post:
 *     tags: [AI]
 *     summary: Rate an AI message (thumbs up/down)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: AIMessage ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating:
 *                 type: integer
 *                 enum: [1, -1]
 *                 description: 1 = thumbs up, -1 = thumbs down
 *     responses:
 *       200:
 *         description: Feedback recorded
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
 *                         rating:
 *                           type: integer
 *       400:
 *         description: Invalid rating or not an assistant message
 *       403:
 *         description: Not authorized to rate this message
 *       404:
 *         description: Message not found
 */
router.post('/messages/:id/feedback', authMiddleware, writeLimiter, async (req, res) => {
  const { rating } = req.body;

  if (rating !== 1 && rating !== -1) {
    return res.status(400).json({
      data: null,
      error: 'rating must be 1 (thumbs up) or -1 (thumbs down)',
      meta: {},
    });
  }

  try {
    const message = await AIMessage.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
      data: null,
      error: 'Message not found',
        meta: {},
      });
    }

    if (message.role !== 'assistant') {
      return res.status(400).json({
      data: null,
      error: 'Can only rate assistant messages',
        meta: {},
      });
    }

    // Verify the message belongs to a conversation owned by this user
    const conversation = await AIConversation.findOne({
      _id: message.conversation,
      user: req.user.id,
    });

    if (!conversation) {
      return res.status(403).json({
      data: null,
      error: 'Not authorized to rate this message',
        meta: {},
      });
    }

    message.rating = rating;
    await message.save();

    return res.json({ data: { rating }, error: null, meta: {} });
  } catch (err) {
    console.error('Error saving feedback:', err);
    return res.status(500).json({
      data: null,
      error: 'Failed to save feedback',
      meta: {},
    });
  }
});

export default router;