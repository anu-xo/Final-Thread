// server/src/routes/ai.js
import express from 'express';
import authMiddleware from '../middleware/auth.js';
import aiRateLimit from '../middleware/aiRateLimit.js';
import aiService from '../services/aiService.js';
import AIConversation from '../models/AIConversation.js';
import AIMessage from '../models/AIMessage.js';

const router = express.Router();

router.post('/chat', authMiddleware, aiRateLimit, async (req, res) => {
  const { message, communityId, conversationId } = req.body;

  if (!message || !communityId) {
    return res.status(400).json({
      data: null,
      error: {
        message: 'message and communityId required',
      },
      meta: {},
    });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const conversation = conversationId
      ? await AIConversation.findById(conversationId)
      : await AIConversation.create({
          user: req.user._id,
          community: communityId,
        });

    const result = await aiService.handleChat({
      userId: req.user._id,
      message,
      communityId,
      conversationId: conversation._id,
      onToken: (token) => {
        res.write(
          `data: ${JSON.stringify({
            type: 'token',
            token,
          })}\n\n`
        );
      },
      onSources: (sources) => {
        res.write(
          `data: ${JSON.stringify({
            type: 'sources',
            sources,
          })}\n\n`
        );
      },
    });

    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        conversationId: conversation._id,
        messageId: result.messageId,
      })}\n\n`
    );

    res.end();
  } catch (err) {
    console.error('AI chat error:', err);

    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        message: 'AI unavailable, please try again',
      })}\n\n`
    );

    res.end();
  }
});

export default router;