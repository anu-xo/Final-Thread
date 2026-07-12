// packages/server/src/routes/ai.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import aiRateLimiter from '../middleware/aiRateLimit.js';
import aiService from '../services/aiService.js';
import AIConversation from '../models/AIConversation.js';
import AIMessage from '../models/AIMessage.js';

const router = express.Router();

router.post('/chat', authMiddleware, aiRateLimiter, async (req, res) => {
  const { message, communityId, conversationId } = req.body;

  // 1. Initial Validation
  if (!message || !communityId) {
    return res.status(400).json({
      data: null,
      error: {
        message: 'message and communityId required',
      },
      meta: {},
    });
  }

  try {
    // 2. Fetch or Create Conversation (scoped securely to the logged-in user)
    let conversation = conversationId
      ? await AIConversation.findOne({ _id: conversationId, user: req.user.id })
      : null;

    if (!conversation) {
      conversation = await AIConversation.create({
        user: req.user.id,
        community: communityId,
      });
    }

    // 3. Persist the user's message immediately
    await AIMessage.create({
      conversation: conversation._id,
      role: 'user',
      content: message,
    });

    // 4. Set up Server-Sent Events (SSE) Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let fullText = '';
    let collectedSources = [];
    let tokensUsed = 0;

    try {
      // 5. Invoke and process the AI stream
      const { stream, sources, tokenCount } = await aiService.streamChatResponse({
        message,
        communityId,
        conversationId: conversation._id,
      });

      collectedSources = sources;
      tokensUsed = tokenCount;

      for await (const chunk of stream) {
        fullText += chunk;
        res.write(`data: ${JSON.stringify({ type: 'token', text: chunk })}\n\n`);
      }

      // Send the finish signal with final metadata
      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          conversationId: conversation._id,
          sources: collectedSources,
        })}\n\n`
      );
    } catch (streamErr) {
      console.error('AI streaming error:', streamErr);
      res.write(
        `data: ${JSON.stringify({ type: 'error', message: 'AI unavailable' })}\n\n`
      );
    } finally {
      // Close connection and save the assistant's response payload safely in the background
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
    // Fallback if DB operations fail before the SSE header can flush
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

export default router;