// jobs/neoAutonomousWorker.js
//
// Consumes the neo-autonomous queue. The 'mention' job fires when a user writes
// @AskAI in a comment — it grounds the reply in the post's thread via RAG, asks
// Gemini non-streaming (no SSE inside a worker), and posts the reply as a Neo
// comment authored by the seeded "neo-ai" system user, then pushes it to the
// post room so it appears live (comment:ai_posted).
//
// Startup (index.js) imports this module, which registers the processor — mirror
// of embeddingWorker.js. Transient failures (Gemini/RAG) throw so Bull retries
// with the job's attempts:3 / exponential backoff; permanent setup failures
// (missing trigger comment, unseeded system user) log and bail instead of
// burning retries.
import Comment from '../models/Comment.js';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Community from '../models/Community.js';
import NeoLog from '../models/NeoLog.js';
import { getNeoAutonomousQueue } from './neoAutonomousQueue.js';
import { getIO } from '../socket.js';
import {
  embedQuery,
  retrieveContext,
  buildPromptWithinBudget,
  buildSystemPrompt,
  generateNonStreamingResponse,
} from '../services/aiService.js';

// Nesting cap, mirrored from routes/comments.js. A reply that would exceed the
// cap attaches as a sibling at the same depth instead of being silently dropped.
const MAX_DEPTH = 5;

const neoAutonomousQueue = getNeoAutonomousQueue();

export const processNeoMentionJob = async (job) => {
  const { triggerCommentId, postId, communityId, requestingUserId, question } = job.data;
  const start = Date.now();

  const triggerComment = await Comment.findById(triggerCommentId);
  if (!triggerComment) {
    console.error(`[neo] trigger comment ${triggerCommentId} not found — aborting mention job`);
    return;
  }

  const neoUser = await User.findOne({ username: 'neo-ai' });
  if (!neoUser) {
    console.error('[neo] system user "neo-ai" not seeded — run `pnpm --filter server seed:neo`');
    return;
  }

  const community = communityId
    ? await Community.findById(communityId).select('name')
    : null;

  // Ground in the post's own thread first (two-tier retrieval), then build the
  // prompt. Gemini is called non-streaming — comments aren't SSE.
  const queryEmbedding = await embedQuery(question);
  const contextChunks = await retrieveContext({ queryEmbedding, communityId, postId });

  const { prompt } = await buildPromptWithinBudget({
    systemPrompt: buildSystemPrompt(community?.name || 'thread'),
    contextChunks: contextChunks.map((chunk) => chunk.text),
    history: [],
    userMessage: question,
  });

  const responseText = await generateNonStreamingResponse(prompt);

  const replyDepth = triggerComment.depth + 1;
  const atDepthCap = replyDepth > MAX_DEPTH;

  const neoComment = await Comment.create({
    body: responseText,
    author: neoUser._id,
    post: postId,
    parent: atDepthCap ? triggerComment.parent : triggerCommentId,
    depth: atDepthCap ? triggerComment.depth : replyDepth,
    isNeo: true,
    neoTrigger: 'mention',
  });

  // Keep the post's count honest (mirrors the route's $inc) and record the
  // reply time so the route's cooldown can skip redundant @AskAI enqueues.
  await Post.findByIdAndUpdate(postId, {
    $inc: { commentCount: 1 },
    lastNeoReplyAt: new Date(),
  });

  await NeoLog.create({
    triggerType: 'autonomous_mention',
    layerUsed: 'vector_search',
    sourcePostIds: [postId],
    communityId,
    targetUserId: requestingUserId,
    query: question,
    tokensUsed: null,
    latencyMs: Date.now() - start,
  });

  // Push the populated comment to the post room so the FE can render it live
  // without a refresh (sibling to the existing comment:new emit).
  const populated = await neoComment.populate('author', 'username karma');
  const io = getIO();
  io.to(`post:${postId}`).emit('comment:ai_posted', {
    postId,
    comment: {
      ...populated.toObject(),
      children: [],
      userVote: 0,
    },
  });

  return { commentId: neoComment._id };
};

export const startNeoAutonomousWorker = () => {
  neoAutonomousQueue.process('mention', processNeoMentionJob);

  neoAutonomousQueue.on('failed', (job, err) => {
    console.error(
      `[neo] job ${job.id} failed after ${job.attemptsMade} attempts:`,
      err.message
    );
  });

  neoAutonomousQueue.on('stalled', (job) => {
    console.warn(`[neo] job ${job.id} stalled`);
  });
};

startNeoAutonomousWorker();
