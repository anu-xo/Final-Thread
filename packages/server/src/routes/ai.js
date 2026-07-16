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


const router = express.Router();

// GET /ai/health
// Verifies Gemini connectivity independent of user auth.
// Useful for uptime monitoring and quick manual checks.
router.get('/health', async (req, res) => {
  try {
    const testEmbedding = await aiService.embedQuery('health check');

    if (Array.isArray(testEmbedding) && testEmbedding.length > 0) {
      return res.status(200).json({
        status: 'ok',
        gemini: 'connected',
        embeddingDims: testEmbedding.length,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(503).json({
      status: 'error',
      gemini: 'unexpected response',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('AI health check failed:', err);

    return res.status(503).json({
      status: 'error',
      gemini: 'unreachable',
      timestamp: new Date().toISOString(),
    });
  }
});
// POST /ai/chat — Handle interactive streaming sessions via SSE
router.post('/chat', authMiddleware, aiRateLimiter, async (req, res) => {
  const { message, communityId, conversationId } = req.body;

  if (!message || !communityId) {
    return res.status(400).json({
      data: null,
      error: { message: 'message and communityId required' },
      meta: {},
    });
  }

  try {
    // aiEnabled gate — check before doing any DB writes or hitting Gemini
    const community = await Community.findById(communityId).select('aiEnabled').lean();
    if (!community?.aiEnabled) {
      return res.status(403).json({
        data: null,
        error: { message: 'AI chat is disabled for this community' },
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
        error: { message: 'Internal server error occurred setup phase.' },
        meta: {},
      });
    }
    res.end();
  }
});

// ... your /conversations, /messages/:id/feedback routes stay exactly as they are ...

export default router;