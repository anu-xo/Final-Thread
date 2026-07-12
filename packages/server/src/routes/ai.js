// packages/server/src/routes/ai.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import aiRateLimiter from '../middleware/aiRateLimit.js';
import aiService from '../services/aiService.js';
import AIConversation from '../models/AIConversation.js';
import AIMessage from '../models/AIMessage.js';

const router = express.Router();

// POST /ai/chat — Handle interactive streaming sessions via SSE
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

// GET /ai/conversations/:communityId — List this user's conversations in a community
router.get('/conversations/:communityId', authMiddleware, async (req, res) => {
  try {
    const conversations = await AIConversation.find({
      user: req.user.id,
      community: req.params.communityId,
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    res.json({
      data: conversations,
      error: null,
      meta: { total: conversations.length },
    });
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ data: null, error: 'Internal server error', meta: {} });
  }
});

// GET /ai/conversations/:id/messages — Full transcript, oldest first
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  try {
    const conversation = await AIConversation.findOne({
      _id: req.params.id,
      user: req.user.id, // IDOR check — protects access from other users
    });

    if (!conversation) {
      return res.status(404).json({ data: null, error: 'Conversation not found', meta: {} });
    }

    const messages = await AIMessage.find({ conversation: conversation._id })
      .sort({ createdAt: 1 }) // Oldest first for chat timeline display
      .lean();

    res.json({
      data: messages,
      error: null,
      meta: { total: messages.length },
    });
  } catch (err) {
    console.error('Error fetching transcript:', err);
    res.status(500).json({ data: null, error: 'Internal server error', meta: {} });
  }
});
// POST /ai/messages/:id/feedback — { rating: 1 | -1 }
router.post('/messages/:id/feedback', authMiddleware, async (req, res) => {
  const { rating } = req.body;
  if (![1, -1].includes(rating)) {
    return res.status(400).json({ data: null, error: 'rating must be 1 or -1' });
  }

  const message = await AIMessage.findById(req.params.id).populate('conversation');
  if (!message || String(message.conversation.user) !== req.user.id) {
    return res.status(404).json({ data: null, error: 'Not found' });
  }
  if (message.role !== 'assistant') {
    return res.status(400).json({ data: null, error: 'Can only rate assistant messages' });
  }

  message.rating = rating;
  await message.save();

  res.json({ data: { id: message._id, rating }, error: null });
});

export default router;