// packages/server/src/routes/ai.js
import express from 'express';
import * as Sentry from '@sentry/node';
import { authMiddleware } from '../middleware/auth.js';
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
router.post('/chat', authMiddleware, aiRateLimiter, async (req, res) => {
  const { message, communityId, conversationId } = req.body;

  if (!message || !communityId) {
    return res.status(400).json({
      data: null,
      error: 'message and communityId required',
      meta: {},
    });
  }

  try {
    // aiEnabled gate — check before doing any DB writes or hitting Gemini
    const community = await Community.findById(communityId).select('aiEnabled').lean();
    if (!community?.aiEnabled) {
      return res.status(403).json({
      data: null,
      error: 'AI chat is disabled for this community',
        meta: {},
      });
    }

    let conversation = conversationId
      ? await AIConversation.findOne({ _id: conversationId, user: req.user.id })
      : null;

    if (!conversation) {
      conversation = await AIConversation.create({
        user: req.user.id,
        community: communityId,
      });
    }

    await AIMessage.create({
      conversation: conversation._id,
      role: 'user',
      content: message,
    });

    logActivity('ai.chat', req, { communityId, conversationId: conversation._id });

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
        communityId,
        conversationId: conversation._id,
      });

      collectedSources = sources;
      tokensUsed = tokenCount;

      // "Limited context available" warning — sources IS the retrieved context here,
      // so its length is the right signal, not a separate `context` variable
      if (sources.length < 3) {
        res.write(
          `data: ${JSON.stringify({
            type: 'warning',
            message: 'Limited context available — this community may not have enough indexed posts yet.',
          })}\n\n`
        );
      }

      for await (const chunk of stream) {
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ type: 'token', text: chunk })}\n\n`);
      }

      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          conversationId: conversation._id,
          sources: collectedSources,
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

// POST /ai/messages/:id/feedback — rate an AI message (1 = thumbs up, -1 = thumbs down)
router.post('/messages/:id/feedback', authMiddleware, async (req, res) => {
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