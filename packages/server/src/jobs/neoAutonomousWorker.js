// jobs/neoAutonomousWorker.js
//
// Consumes the neo-autonomous queue. Two processors:
//  - 'mention' fires when a user writes @AskAI in a comment — it grounds the
//    reply in the post's thread via RAG, asks Gemini non-streaming (no SSE
//    inside a worker), and posts the reply as a Neo comment authored by the
//    seeded "neo-ai" system user, then pushes it to the post room so it appears
//    live (comment:ai_posted).
//  - 'summary' fires when a community mod asks for a thread summary — it
//    condenses the post + its top-30 comments (direct comment fetch, no vector
//    search) and pins a top-level Neo summary comment.
//
// Startup (index.js) imports this module, which registers the processors —
// mirror of embeddingWorker.js. Transient failures (Gemini) throw so Bull
// retries with the job's attempts:3 / exponential backoff; permanent setup
// failures (missing post/trigger comment, unseeded system user) log and bail
// instead of burning retries.
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
  buildThreadSummaryPrompt,
  generateNonStreamingResponse,
} from '../services/aiService.js';

// Nesting cap, mirrored from routes/comments.js. A reply that would exceed the
// cap attaches as a sibling at the same depth instead of being silently dropped.
const MAX_DEPTH = 5;

// Summary token budget — top 30 by score, not all comments on large threads.
const MAX_SUMMARY_COMMENTS = 30;

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

export const processNeoSummaryJob = async (job) => {
  const { postId, communityId, requestingUserId } = job.data;
  const start = Date.now();

  const post = await Post.findById(postId);
  if (!post) {
    console.error(`[neo] post ${postId} not found — aborting summary job`);
    return;
  }

  // Direct comment fetch, not a vector search — the whole thread gets condensed,
  // so ground the summary in the thread's own highest-scored comments. 30 is
  // the token budget; tying scores break oldest-first like the comments route.
  const topComments = await Comment.find({ post: postId, isRemoved: false })
    .sort({ score: -1, createdAt: 1 })
    .limit(MAX_SUMMARY_COMMENTS)
    .select('body author score depth')
    .lean();

  const community = communityId
    ? await Community.findById(communityId).select('name')
    : null;

  const prompt = buildThreadSummaryPrompt({
    communityName: community?.name || 'thread',
    post,
    topComments,
  });

  const responseText = await generateNonStreamingResponse(prompt);

  const neoUser = await User.findOne({ username: 'neo-ai' });
  if (!neoUser) {
    console.error('[neo] system user "neo-ai" not seeded — run `pnpm --filter server seed:neo`');
    return;
  }

  // Top-level pinned comment so the summary floats at the top of the thread.
  const summaryComment = await Comment.create({
    body: responseText,
    author: neoUser._id,
    post: postId,
    parent: null,
    depth: 0,
    isNeo: true,
    neoTrigger: 'summary',
    isPinned: true,
  });

  // Keep the post's count honest (mirrors the route's $inc). Not setting
  // lastNeoReplyAt — a summary isn't a reply, so it must not trip the @AskAI
  // mention cooldown.
  await Post.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } });

  await NeoLog.create({
    triggerType: 'autonomous_summary',
    layerUsed: 'aggregation',
    sourcePostIds: [postId],
    communityId,
    targetUserId: requestingUserId,
    query: null,
    tokensUsed: null,
    latencyMs: Date.now() - start,
  });

  const populated = await summaryComment.populate('author', 'username karma');
  const io = getIO();
  io.to(`post:${postId}`).emit('comment:ai_posted', {
    postId,
    comment: {
      ...populated.toObject(),
      children: [],
      userVote: 0,
    },
  });

  return { commentId: summaryComment._id };
};

export const startNeoAutonomousWorker = () => {
  neoAutonomousQueue.process('mention', processNeoMentionJob);
  neoAutonomousQueue.process('summary', processNeoSummaryJob);

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
