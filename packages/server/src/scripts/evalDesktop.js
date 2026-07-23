// packages/server/src/scripts/evalDesktop.js
//
// Mock-desktop eval harness:
//   - Seeds an in-memory LRU cache from PostEmbedding (simulates electron-store sync)
//   - Retrieval via local cosine similarity instead of $vectorSearch
//   - LLM + judge reuse the same path as evalRag.js (Day 10)
//
// Usage:
//   node src/scripts/evalDesktop.js <communityId>
//
// Compare against server eval:
//   node src/scripts/evalRag.js <communityId>

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import questionsByCommunity from './evalQuestions.json' with { type: 'json' };
import { judgeResponse } from '../services/evalJudge.js';
import EvalResult from '../models/EvalResult.js';
import Community from '../models/Community.js';
import * as aiService from '../services/aiService.js';
import {
  seedCache,
  buildDesktopRagPrompt,
  getCacheStats,
  resetCaches,
} from '../services/desktopRetrieval.js';

const PROMPT_VERSION = 'desktop-cache-v1';

async function runDesktopEval(communityId) {
  const questions = questionsByCommunity[communityId];
  if (!questions) throw new Error(`No eval questions for community ${communityId}`);

  // 1. Seed the LRU cache — this is the step that simulates
  //    sync.mjs's embedAndCachePosts IPC handler populating electron-store
  console.log(`[evalDesktop] seeding cache for community ${communityId}…`);
  const cacheCount = await seedCache(communityId);
  console.log(`[evalDesktop] cache populated: ${cacheCount} entries`);
  const stats = getCacheStats();
  console.log(`[evalDesktop] cache stats:`, JSON.stringify(stats));

  if (cacheCount === 0) {
    console.warn('[evalDesktop] cache empty — no embeddings found. Run embeddingWorker first.');
    return null;
  }

  // 2. Run each question through the desktop retrieval path
  const runResults = [];

  for (const { question } of questions) {
    const { prompt, sources, retrievalSource, cacheSize } = await buildDesktopRagPrompt({
      message: question,
      communityId,
      embedQuery: aiService.embedQuery,
      buildPrompt: aiService.buildPrompt,
      Community,
    });

    const answer = await aiService.getNonStreamingResponse(prompt);
    const grade = await judgeResponse({ question, answer, sources });

    const saved = await EvalResult.create({
      community: communityId,
      question,
      answer,
      ...grade,
      promptVersion: PROMPT_VERSION,
    });

    runResults.push({ ...saved, retrievalSource, cacheSize });
    // rate-limit: same delay as evalRag.js
    await new Promise((r) => setTimeout(r, 500));
  }

  // 3. Aggregate results — same shape as evalRag.js for easy comparison
  const avg = (key) => {
    const vals = runResults.map((r) => r[key]).filter((v) => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const summary = {
    mode: 'desktop-cache',
    communityId,
    promptVersion: PROMPT_VERSION,
    cacheEntries: cacheCount,
    avgRelevance: avg('relevance'),
    avgFaithfulness: avg('faithfulness'),
    avgGroundedness: avg('groundedness'),
    overallAvg: (avg('relevance') + avg('faithfulness')) / 2,
    pctGrounded: avg('groundedness') * 100,
  };

  console.log('\n[evalDesktop] Results:');
  console.log(summary);

  return summary;
}

// ── CLI entry point ─────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const communityId = process.argv[2];
  if (!communityId) {
    console.error('Usage: node src/scripts/evalDesktop.js <communityId>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[evalDesktop] connected to MongoDB');

  try {
    await runDesktopEval(communityId);
  } finally {
    resetCaches();
    await mongoose.disconnect();
    console.log('[evalDesktop] done');
  }
}

export { runDesktopEval };
