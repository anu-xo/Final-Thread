// packages/server/src/scripts/evalDesktop.js
//
// Mock-desktop eval: 20-question suite across 5 communities.
// Measures cache-hit rate, retrieval latency, and answer quality.
// Compare output against the server (live $vectorSearch) baseline.
//
// Records every result in EvalResult with runId, evalLabel, mode, latency,
// and isEdgeCase for the Day 21 pre-launch baseline.

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Dynamic imports AFTER dotenv — evalJudge.js and aiService.js instantiate
// Groq/Google clients at module top-level and need env vars loaded first.
const { default: mongoose } = await import('mongoose');
const questionsByCommunity = (await import('./evalQuestions.json', { with: { type: 'json' } })).default;
const { judgeResponse } = await import('../services/evalJudge.js');
const { default: EvalResult } = await import('../models/EvalResult.js');
const { default: Community } = await import('../models/Community.js');
const aiService = await import('../services/aiService.js');
const {
  seedCache,
  buildDesktopRagPrompt,
  retrieveFromCache,
  getCacheStats,
  resetCaches,
  resetInstrumentation,
} = await import('../services/desktopRetrieval.js');

const PROMPT_VERSION = 'desktop-cache-v1';

async function runDesktopEval(communityId, runId, evalLabel) {
  const questions = questionsByCommunity[communityId];
  if (!questions) throw new Error(`No eval questions for community ${communityId}`);

  // Seed the LRU cache (simulates electron-store sync.mjs population)
  const cacheStart = Date.now();
  const cacheCount = await seedCache(communityId);
  const seedMs = Date.now() - cacheStart;
  console.log(`  cache seeded: ${cacheCount} entries in ${seedMs}ms`);

  if (cacheCount === 0) {
    console.warn('  cache empty — skipping community');
    return null;
  }

  const questionResults = [];

  for (const q of questions) {
    try {
      // ── Embedding (Gemini API call — same for both desktop & server) ──
      const embedStart = Date.now();
      const queryEmbedding = await aiService.embedQuery(q.question);
      const embedMs = Date.now() - embedStart;

      // ── Cache retrieval (local cosine-sim — replaces $vectorSearch) ──
      const cacheRetrievalStart = Date.now();
      const contextChunks = retrieveFromCache(queryEmbedding, communityId);
      const cacheRetrievalMs = Date.now() - cacheRetrievalStart;
      const cacheHit = contextChunks.length > 0;

      // ── Build prompt ──
      const community = await Community.findById(communityId).select('name');
      const prompt = aiService.buildPrompt({
        communityName: community.name,
        contextChunks,
        history: [],
        message: q.question,
      });

      const sources = contextChunks.map((chunk) => ({
        postId: chunk.postId,
        title: chunk.text.split('\n')[0] || 'Untitled',
      }));

      // ── LLM generation ──
      const llmStart = Date.now();
      const answer = await aiService.getNonStreamingResponse(prompt);
      const llmMs = Date.now() - llmStart;

      // ── Judge grading ──
      const judgeStart = Date.now();
      const grade = await judgeResponse({ question: q.question, answer, sources });
      const judgeMs = Date.now() - judgeStart;

      // Save to DB — groundedness may be 0 which violates model min:1,
      // so we coerce to 1 for persistence but keep original for metrics
      const saveGrade = { ...grade };
      if (saveGrade.groundedness === 0) saveGrade.groundedness = 1;
      const totalMs = embedMs + cacheRetrievalMs + llmMs + judgeMs;

      await EvalResult.create({
        community: communityId,
        question: q.question,
        answer,
        ...saveGrade,
        hasCitation: sources.length > 0,
        promptVersion: PROMPT_VERSION,
        runId,
        mode: 'desktop-cache',
        evalLabel,
        embedMs,
        retrievalMs: cacheRetrievalMs,
        llmMs,
        judgeMs,
        totalMs,
        cacheHit,
        sourcesReturned: sources.length,
        isEdgeCase: q.isEdgeCase === true,
      });

      questionResults.push({
        question: q.question,
        isEdgeCase: q.isEdgeCase === true,
        relevance: grade.relevance,
        faithfulness: grade.faithfulness,
        groundedness: grade.groundedness,
        sourcesReturned: sources.length,
        cacheHit,
        embedMs,
        cacheRetrievalMs,
        llmMs,
        judgeMs,
        totalMs,
      });

      const tag = q.isEdgeCase ? ' [EDGE]' : '';
      console.log(`  Q: "${q.question.slice(0, 60)}…" → rel=${grade.relevance} faith=${grade.faithfulness} gnd=${grade.groundedness} cache=${cacheHit ? 'HIT' : 'MISS'} ${totalMs}ms${tag}`);
    } catch (err) {
      console.error(`  Q FAILED: "${q.question.slice(0, 50)}…" → ${err.message}`);
    }

    // Rate-limit delay
    await new Promise((r) => setTimeout(r, 500));
  }

  return questionResults;
}

// ── CLI entry point ─────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const runId = `eval-desktop-${new Date().toISOString()}`;
  const evalLabel = 'manual';

  const allResults = [];
  const edgeCaseResults = [];
  const communityIds = Object.keys(questionsByCommunity);

  for (const cid of communityIds) {
    const community = await Community.findById(cid).select('name slug');
    const label = community ? `${community.name} (${community.slug})` : cid;
    console.log(`━━━ ${label} ━━━`);
    resetInstrumentation();

    try {
      const results = await runDesktopEval(cid, runId, evalLabel);
      if (results) {
        allResults.push(...results);
        edgeCaseResults.push(...results.filter((r) => r.isEdgeCase));
      }
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
    console.log('');
  }

  // ── Final report ────────────────────────────────────────────────────────
  const total = allResults.length;
  const avg = (key) => {
    const vals = allResults.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 'N/A';
  };

  const cacheHits = allResults.filter((r) => r.cacheHit).length;
  const cacheMisses = allResults.filter((r) => !r.cacheHit).length;

  const avgEmbed = (allResults.reduce((s, r) => s + r.embedMs, 0) / total).toFixed(0);
  const avgCacheRetrieval = (allResults.reduce((s, r) => s + r.cacheRetrievalMs, 0) / total).toFixed(1);
  const avgLLM = (allResults.reduce((s, r) => s + r.llmMs, 0) / total).toFixed(0);
  const avgJudge = (allResults.reduce((s, r) => s + r.judgeMs, 0) / total).toFixed(0);
  const avgTotal = (allResults.reduce((s, r) => s + r.totalMs, 0) / total).toFixed(0);

  console.log('════════════════════════════════════════════════════════════');
  console.log('  DESKTOP EVAL REPORT — 20-Question Suite');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Questions evaluated:  ${total} (${edgeCaseResults.length} edge cases)`);
  console.log('');
  console.log('  ── Cache Performance ──────────────────────────────────');
  console.log(`  Cache hit rate:       ${cacheHits}/${total} (${(cacheHits / total * 100).toFixed(0)}%)`);
  console.log(`  Avg cache retrieval:  ${avgCacheRetrieval}ms`);
  console.log(`  (target: < 5ms local cosine-sim vs ~50ms $vectorSearch)`);
  console.log('');
  console.log('  ── Latency Breakdown (avg per question) ──────────────');
  console.log(`  Embedding (Gemini):   ${avgEmbed}ms`);
  console.log(`  Cache retrieval:      ${avgCacheRetrieval}ms`);
  console.log(`  LLM generation:       ${avgLLM}ms`);
  console.log(`  Judge grading:        ${avgJudge}ms`);
  console.log(`  ──────────────────────────────────────────────────────`);
  console.log(`  Total per question:   ${avgTotal}ms`);
  console.log('');
  console.log('  ── Answer Quality (Groq Judge) ───────────────────────');
  console.log(`  Relevance (1-5):      ${avg('relevance')}`);
  console.log(`  Faithfulness (1-5):   ${avg('faithfulness')}`);
  console.log(`  Groundedness (0/1):   ${avg('groundedness')} (${(avg('groundedness') * 100).toFixed(0)}% cited a source)`);
  console.log(`  Sources returned:     ${allResults.reduce((s, r) => s + r.sourcesReturned, 0) / total}`);
  console.log('');
  console.log('  ── vs Server Baseline ($vectorSearch) ────────────────');
  console.log('  Note: Server baseline has no pre-recorded latency data.');
  console.log('  Cache retrieval (local cosine-sim) should be ~10x faster');
  console.log('  than Atlas $vectorSearch (~2-5ms vs ~30-80ms).');
  console.log('  Answer quality should not regress — same embedding model,');
  console.log('  same LLM, same judge.');
  console.log('════════════════════════════════════════════════════════════');

  // ── Edge-case sub-report & blocker check ─────────────────────────────────
  if (edgeCaseResults.length > 0) {
    const ecAvg = (key) => {
      const vals = edgeCaseResults.map((r) => r[key]).filter((v) => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    console.log('');
    console.log('  ── Edge-Case Sub-Report ────────────────────────────────');
    console.log(`  Questions:            ${edgeCaseResults.length}`);
    console.log(`  Relevance:            ${ecAvg('relevance').toFixed(2)}`);
    console.log(`  Faithfulness:         ${ecAvg('faithfulness').toFixed(2)}`);
    console.log(`  Groundedness:         ${ecAvg('groundedness').toFixed(2)}`);

    const failedEdgeCases = edgeCaseResults.filter((r) => r.relevance != null && r.relevance < 3);
    if (failedEdgeCases.length > 0) {
      console.log('\n  ⛔ BLOCKER: Edge-case questions scored below threshold:');
      for (const r of failedEdgeCases) {
        console.log(`    - "${r.question.slice(0, 60)}…" rel=${r.relevance}`);
      }
      console.log('  → Fix aiService.js prompt/guardrails TODAY, not Day 21.\n');
    }
  }

  console.log('════════════════════════════════════════════════════════════');

  // Save structured report
  const report = {
    mode: 'desktop-cache',
    promptVersion: PROMPT_VERSION,
    totalQuestions: total,
    cache: {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: `${(cacheHits / total * 100).toFixed(0)}%`,
    },
    latency: {
      avgEmbeddingMs: Number(avgEmbed),
      avgCacheRetrievalMs: Number(avgCacheRetrieval),
      avgLlmMs: Number(avgLLM),
      avgJudgeMs: Number(avgJudge),
      avgTotalMs: Number(avgTotal),
    },
    quality: {
      avgRelevance: Number(avg('relevance')),
      avgFaithfulness: Number(avg('faithfulness')),
      avgGroundedness: Number(avg('groundedness')),
      avgSourcesReturned: Number((allResults.reduce((s, r) => s + r.sourcesReturned, 0) / total).toFixed(1)),
    },
    perQuestion: allResults,
    cacheStats: getCacheStats(),
  };

  const reportPath = path.resolve(__dirname, '..', '..', 'eval-desktop-report.json');
  const fs = await import('fs');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report saved to: ${reportPath}`);

  resetCaches();
  await mongoose.disconnect();
  console.log('Done.');
}
