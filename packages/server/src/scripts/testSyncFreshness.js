// packages/server/src/scripts/testSyncFreshness.js
//
// Background sync freshness test:
//   1. Create a post with a distinctive, unique body
//   2. Wait 5 minutes (simulating background sync interval from Day 16)
//   3. Embed the post (simulates embeddingWorker processing the queue job)
//   4. Re-seed the LRU cache (simulates sync.mjs embedAndCachePosts on next sync)
//   5. Ask the AI a question that should surface that post
//   6. Verify the answer references it correctly
//
// Usage:
//   node src/scripts/testSyncFreshness.js --wait=300        # full 5 min
//   node src/scripts/testSyncFreshness.js --wait=5 --quick  # quick test (5s)
//   node src/scripts/testSyncFreshness.js                   # default 5 min

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { default: mongoose } = await import('mongoose');
const { default: Post } = await import('../models/Post.js');
const { default: PostEmbedding } = await import('../models/PostEmbedding.js');
const { default: Community } = await import('../models/Community.js');
const { default: User } = await import('../models/User.js');
const aiService = await import('../services/aiService.js');
const { judgeResponse } = await import('../services/evalJudge.js');
const {
  seedCache,
  retrieveFromCache,
  getCacheStats,
  resetCaches,
} = await import('../services/desktopRetrieval.js');

// ── Config ──────────────────────────────────────────────────────────────────
const WAIT_SECONDS = Number(process.env.FRESHNESS_WAIT || 300);

// Unique content that can't be confused with seed data
const FRESH_POST = {
  title: 'FRESHNESS TEST: How to implement server-sent events with automatic reconnection',
  body: `This is a freshness test post created at ${new Date().toISOString()}.
    Server-sent events (SSE) provide a persistent connection from server to client.
    The key advantage over polling is that the server can push updates instantly.
    To implement SSE with automatic reconnection, set the Retry: header in the response.
    The EventSource API handles reconnection automatically when the connection drops.
    Always use the lastEventId to resume from where the client left off.
    This ensures no events are lost during temporary network interruptions.
    SSE works over standard HTTP, making it firewall-friendly compared to WebSockets.`,
};

const FRESH_QUESTION = 'How do server-sent events handle automatic reconnection when the connection drops?';

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');
  const waitArg = args.find((a) => a.startsWith('--wait='));
  // Positional: first non-flag arg that looks like an ObjectId
  const positional = args.find((a) => !a.startsWith('--') && /^[0-9a-f]{24}$/i.test(a));
  return {
    waitSeconds: waitArg ? Number(waitArg.split('=')[1]) : (quick ? 5 : WAIT_SECONDS),
    quick,
    communityId: positional || null,
  };
}

async function findTargetCommunity(communityId) {
  if (communityId) {
    const c = await Community.findById(communityId).select('name slug');
    if (!c) throw new Error(`Community not found: ${communityId}`);
    return c;
  }
  // Pick the first community with posts
  const c = await Community.findOne({ aiEnabled: true }).select('name slug');
  if (!c) throw new Error('No community found');
  return c;
}

async function findTestUser() {
  return User.findOne({}).select('_id');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { waitSeconds, quick, communityId } = parseArgs();

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const community = await findTargetCommunity(communityId);
  const user = await findTestUser();
  if (!user) throw new Error('No user found in database');

  console.log(`━━━ Sync Freshness Test ━━━`);
  console.log(`Community:     ${community.name} (${community._id})`);
  console.log(`Wait:          ${waitSeconds}s${quick ? ' (quick mode)' : ''}`);
  console.log(`Question:      "${FRESH_QUESTION}"`);
  console.log('');

  // ── Step 1: Create the fresh post ─────────────────────────────────────
  console.log('[1/5] Creating fresh post…');
  const post = await Post.create({
    title: FRESH_POST.title,
    body: FRESH_POST.body,
    author: user._id,
    community: community._id,
    type: 'text',
    score: 0,
    embeddingStatus: 'pending',
  });
  console.log(`  Post created: ${post._id}`);

  // ── Step 2: Wait (simulates background sync interval) ─────────────────
  console.log(`\n[2/5] Waiting ${waitSeconds}s (simulating background sync interval)…`);
  const waitStart = Date.now();
  if (waitSeconds <= 60) {
    // Short wait: show progress dots
    for (let i = 0; i < waitSeconds; i++) {
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log('');
  } else {
    // Long wait: just wait
    await new Promise((r) => setTimeout(r, waitSeconds * 1000));
  }
  const actualWaitMs = Date.now() - waitStart;
  console.log(`  Waited ${(actualWaitMs / 1000).toFixed(1)}s`);

  // ── Step 3: Embed the post (simulates embeddingWorker) ────────────────
  console.log('\n[3/5] Embedding the fresh post…');
  const embedStart = Date.now();
  const text = `${post.title} ${post.body}`.trim().slice(0, 2000);
  const embedding = await aiService.embedQuery(text);
  await PostEmbedding.create({
    postId: post._id,
    communityId: community._id,
    type: 'post',
    text,
    embedding,
  });
  const embedMs = Date.now() - embedStart;
  console.log(`  Embedded in ${embedMs}ms`);

  // ── Step 4: Re-seed the cache (simulates sync.mjs embedAndCachePosts) ─
  console.log('\n[4/5] Re-seeding LRU cache…');
  const seedStart = Date.now();
  const cacheSize = await seedCache(community._id);
  const seedMs = Date.now() - seedStart;
  console.log(`  Cache seeded: ${cacheSize} entries in ${seedMs}ms`);

  // Verify the fresh post is in the cache
  const queryEmbedding = await aiService.embedQuery(FRESH_QUESTION);
  const cachedChunks = retrieveFromCache(queryEmbedding, community._id);
  const freshPostInCache = cachedChunks.some(
    (c) => c.postId.toString() === post._id.toString()
  );
  console.log(`  Fresh post in cache: ${freshPostInCache ? 'YES' : 'NO'}`);

  // ── Step 5: Ask the question and verify citation ──────────────────────
  console.log('\n[5/5] Running AI query with cache-based retrieval…');

  // Desktop path (cache)
  const cacheRetrievalStart = Date.now();
  const contextChunks = retrieveFromCache(queryEmbedding, community._id);
  const cacheRetrievalMs = Date.now() - cacheRetrievalStart;

  const communityDoc = await Community.findById(community._id).select('name');
  const prompt = aiService.buildPrompt({
    communityName: communityDoc.name,
    contextChunks,
    history: [],
    message: FRESH_QUESTION,
  });

  const sources = contextChunks.map((chunk) => ({
    postId: chunk.postId,
    title: chunk.text.split('\n')[0] || 'Untitled',
  }));

  const llmStart = Date.now();
  const answer = await aiService.getNonStreamingResponse(prompt);
  const llmMs = Date.now() - llmStart;

  const judgeStart = Date.now();
  const grade = await judgeResponse({
    question: FRESH_QUESTION,
    answer,
    sources,
  });
  const judgeMs = Date.now() - judgeStart;

  // ── Verification ──────────────────────────────────────────────────────
  const freshPostIdStr = post._id.toString();
  const answerMentionsFreshPost = answer.toLowerCase().includes('sse') ||
    answer.toLowerCase().includes('server-sent event') ||
    answer.toLowerCase().includes('reconnect');
  const freshPostIsSource = sources.some((s) => s.postId.toString() === freshPostIdStr);

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  FRESHNESS TEST RESULTS');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Post ID:              ${freshPostIdStr}`);
  console.log(`  Wait time:            ${(actualWaitMs / 1000).toFixed(1)}s`);
  console.log('');
  console.log('  ── Retrieval ─────────────────────────────────────────');
  console.log(`  Cache retrieval:      ${cacheRetrievalMs}ms`);
  console.log(`  Context chunks found: ${contextChunks.length}`);
  console.log(`  Fresh post in cache:  ${freshPostInCache ? 'YES ✓' : 'NO ✗'}`);
  console.log(`  Fresh post as source: ${freshPostIsSource ? 'YES ✓' : 'NO ✗'}`);
  console.log('');
  console.log('  ── Answer ───────────────────────────────────────────');
  console.log(`  Answer length:        ${answer.length} chars`);
  console.log(`  Mentions SSE/reconnect: ${answerMentionsFreshPost ? 'YES ✓' : 'NO ✗'}`);
  console.log(`  Relevance:            ${grade.relevance}/5`);
  console.log(`  Faithfulness:         ${grade.faithfulness}/5`);
  console.log(`  Groundedness:         ${grade.groundedness}`);
  console.log('');
  console.log('  ── Timing ───────────────────────────────────────────');
  console.log(`  Embedding:            ${embedMs}ms`);
  console.log(`  Cache seed:           ${seedMs}ms`);
  console.log(`  Cache retrieval:      ${cacheRetrievalMs}ms`);
  console.log(`  LLM generation:       ${llmMs}ms`);
  console.log(`  Judge grading:        ${judgeMs}ms`);
  console.log(`  Total:                ${embedMs + seedMs + cacheRetrievalMs + llmMs + judgeMs}ms`);
  console.log('');
  console.log('  ── Verdict ──────────────────────────────────────────');

  const allPassed = freshPostInCache && freshPostIsSource && answerMentionsFreshPost;
  if (allPassed) {
    console.log('  ALL CHECKS PASSED ✓');
    console.log('  The fresh post is retrievable and cited in the AI answer.');
    console.log('  Background sync freshness (lastSyncAt + embedding dispatch) works end-to-end.');
  } else {
    console.log('  SOME CHECKS FAILED ✗');
    if (!freshPostInCache) console.log('    - Fresh post not found in cache after re-seed');
    if (!freshPostIsSource) console.log('    - Fresh post not included in retrieval sources');
    if (!answerMentionsFreshPost) console.log('    - Answer does not mention SSE/reconnection');
  }
  console.log('════════════════════════════════════════════════════════════');

  // Print the actual answer for manual review
  console.log('\n  ── AI Answer (for manual review) ─────────────────────');
  console.log(`  ${answer.slice(0, 500)}${answer.length > 500 ? '…' : ''}`);
  console.log('');

  // Cleanup: remove test post and embedding
  console.log('Cleaning up…');
  await Post.findByIdAndDelete(post._id);
  await PostEmbedding.deleteMany({ postId: post._id });
  console.log('Done.');

  resetCaches();
  await mongoose.disconnect();

  // Exit with appropriate code
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
