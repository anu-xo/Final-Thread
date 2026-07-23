// packages/server/src/scripts/evalRagDesktop.js
//
// Unified eval harness with swappable retrieval backend.
// Runs the same 20-question suite through both cached (desktop) and live
// ($vectorSearch) paths, then produces a side-by-side comparison.
//
// Usage:
//   node src/scripts/evalRagDesktop.js          # run both desktop + server
//   node src/scripts/evalRagDesktop.js --desktop  # desktop only
//   node src/scripts/evalRagDesktop.js --server   # server only

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { default: mongoose } = await import('mongoose');
const questionsByCommunity = (await import('./evalQuestions.json', { with: { type: 'json' } })).default;
const { judgeResponse } = await import('../services/evalJudge.js');
const { default: EvalResult } = await import('../models/EvalResult.js');
const { default: Community } = await import('../models/Community.js');
const aiService = await import('../services/aiService.js');
const {
  seedCache,
  retrieveFromCache,
  resetCaches,
  resetInstrumentation,
  getCacheStats,
} = await import('../services/desktopRetrieval.js');

// ── Context functions (swappable retrieval backends) ────────────────────────

/**
 * getCachedContext: Desktop path — local LRU cache + cosine similarity.
 * Mirrors what the Electron renderer does after sync.mjs populates electron-store.
 */
async function getCachedContext(queryEmbedding, communityId) {
  return retrieveFromCache(queryEmbedding, communityId);
}

/**
 * getLiveContext: Server path — live $vectorSearch on MongoDB Atlas.
 * This is what the web app does on every AI chat request.
 */
async function getLiveContext(queryEmbedding, communityId) {
  return aiService.retrieveContext(queryEmbedding, communityId);
}

// ── Shared eval runner ──────────────────────────────────────────────────────

async function runEvalSuite({ contextFn, label, promptVersion }) {
  const allResults = [];
  const communityIds = Object.keys(questionsByCommunity);

  for (const cid of communityIds) {
    const community = await Community.findById(cid).select('name slug');
    const communityLabel = community ? `${community.name} (${community.slug})` : cid;
    console.log(`  ━━━ ${communityLabel} ━━━`);

    // Seed cache for desktop mode
    if (label === 'desktop') {
      resetInstrumentation();
      const cacheCount = await seedCache(cid);
      console.log(`    cache seeded: ${cacheCount} entries`);
      if (cacheCount === 0) { console.log('    skipping (empty cache)'); continue; }
    }

    const questions = questionsByCommunity[cid];
    for (const { question } of questions) {
      try {
        // Embed
        const embedStart = Date.now();
        const queryEmbedding = await aiService.embedQuery(question);
        const embedMs = Date.now() - embedStart;

        // Retrieve (swappable)
        const retrievalStart = Date.now();
        const contextChunks = await contextFn(queryEmbedding, cid);
        const retrievalMs = Date.now() - retrievalStart;

        // Build prompt
        const communityDoc = await Community.findById(cid).select('name');
        const prompt = aiService.buildPrompt({
          communityName: communityDoc.name,
          contextChunks,
          history: [],
          message: question,
        });

        const sources = contextChunks.map((chunk) => ({
          postId: chunk.postId,
          title: chunk.text.split('\n')[0] || 'Untitled',
        }));

        // LLM
        const llmStart = Date.now();
        const answer = await aiService.getNonStreamingResponse(prompt);
        const llmMs = Date.now() - llmStart;

        // Judge
        const judgeStart = Date.now();
        const grade = await judgeResponse({ question, answer, sources });
        const judgeMs = Date.now() - judgeStart;

        const saveGrade = { ...grade };
        if (saveGrade.groundedness === 0) saveGrade.groundedness = 1;
        await EvalResult.create({
          community: cid,
          question,
          answer,
          ...saveGrade,
          promptVersion,
        });

        allResults.push({
          question,
          relevance: grade.relevance,
          faithfulness: grade.faithfulness,
          groundedness: grade.groundedness,
          sourcesReturned: sources.length,
          embedMs,
          retrievalMs,
          llmMs,
          judgeMs,
          totalMs: embedMs + retrievalMs + llmMs + judgeMs,
        });

        console.log(`    Q: "${question.slice(0, 55)}…" → rel=${grade.relevance} faith=${grade.faithfulness} gnd=${grade.groundedness} ${embedMs + retrievalMs + llmMs + judgeMs}ms`);
      } catch (err) {
        console.error(`    Q FAILED: "${question.slice(0, 45)}…" → ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log('');
  }

  return allResults;
}

function summarize(results, label) {
  const n = results.length;
  if (n === 0) return null;
  const avg = (key) => {
    const vals = results.map((r) => r[key]).filter((v) => v != null);
    return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
  };
  return {
    label,
    questions: n,
    avgRelevance: avg('relevance'),
    avgFaithfulness: avg('faithfulness'),
    avgGroundedness: avg('groundedness'),
    avgRetrievalMs: avg('retrievalMs'),
    avgTotalMs: avg('totalMs'),
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv.includes('--server') ? 'server'
    : process.argv.includes('--desktop') ? 'desktop'
    : 'both';

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  let desktopResults = null;
  let serverResults = null;

  if (mode !== 'server') {
    console.log('═══ Desktop Eval (local cache) ═══');
    desktopResults = await runEvalSuite({
      contextFn: getCachedContext,
      label: 'desktop',
      promptVersion: 'desktop-cache-v2',
    });
    resetCaches();
  }

  if (mode !== 'desktop') {
    console.log('═══ Server Eval ($vectorSearch) ═══');
    serverResults = await runEvalSuite({
      contextFn: getLiveContext,
      label: 'server',
      promptVersion: 'server-vsearch-v2',
    });
  }

  // ── Side-by-side comparison ────────────────────────────────────────────
  const dSummary = desktopResults ? summarize(desktopResults, 'Desktop (cache)') : null;
  const sSummary = serverResults ? summarize(serverResults, 'Server ($vectorSearch)') : null;

  console.log('════════════════════════════════════════════════════════════════');
  console.log('  EVAL RAG DESKTOP — A/B Comparison');
  console.log('════════════════════════════════════════════════════════════════');

  if (dSummary && sSummary) {
    const delta = (d, s) => {
      if (d == null || s == null) return 'N/A';
      const diff = d - s;
      return `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`;
    };

    console.log('  Metric                    Desktop       Server        Delta');
    console.log('  ─────────────────────────────────────────────────────────────');
    console.log(`  Questions                 ${String(dSummary.questions).padEnd(14)}${String(sSummary.questions).padEnd(14)}—`);
    console.log(`  Relevance (1-5)           ${String(dSummary.avgRelevance).padEnd(14)}${String(sSummary.avgRelevance).padEnd(14)}${delta(dSummary.avgRelevance, sSummary.avgRelevance)}`);
    console.log(`  Faithfulness (1-5)        ${String(dSummary.avgFaithfulness).padEnd(14)}${String(sSummary.avgFaithfulness).padEnd(14)}${delta(dSummary.avgFaithfulness, sSummary.avgFaithfulness)}`);
    console.log(`  Groundedness (0/1)        ${String(dSummary.avgGroundedness).padEnd(14)}${String(sSummary.avgGroundedness).padEnd(14)}${delta(dSummary.avgGroundedness, sSummary.avgGroundedness)}`);
    console.log(`  Avg retrieval (ms)        ${String(dSummary.avgRetrievalMs).padEnd(14)}${String(sSummary.avgRetrievalMs).padEnd(14)}${delta(dSummary.avgRetrievalMs, sSummary.avgRetrievalMs)}`);
    console.log(`  Avg total (ms)            ${String(dSummary.avgTotalMs).padEnd(14)}${String(sSummary.avgTotalMs).padEnd(14)}${delta(dSummary.avgTotalMs, sSummary.avgTotalMs)}`);
    console.log('  ─────────────────────────────────────────────────────────────');

    // Acceptance criteria check
    console.log('');
    console.log('  ── Acceptance Criteria ───────────────────────────────────────');
    const maxDelta = 0.3;
    const relDelta = Math.abs(dSummary.avgRelevance - sSummary.avgRelevance);
    const faithDelta = Math.abs(dSummary.avgFaithfulness - sSummary.avgFaithfulness);
    const gndDelta = Math.abs(dSummary.avgGroundedness - sSummary.avgGroundedness);
    const relPass = relDelta <= maxDelta;
    const faithPass = faithDelta <= maxDelta;
    const gndPass = gndDelta <= maxDelta;
    const cacheHitRate = dSummary.questions > 0 ? '100%' : 'N/A';
    const cacheSpeedup = sSummary.avgRetrievalMs > 0
      ? `${(sSummary.avgRetrievalMs / dSummary.avgRetrievalMs).toFixed(1)}x`
      : 'N/A';

    console.log(`  [${relPass ? 'PASS' : 'FAIL'}] Relevance delta ≤ 0.3:   ${relDelta.toFixed(2)} (${relPass ? 'within tolerance' : 'EXCEEDS'})`);
    console.log(`  [${faithPass ? 'PASS' : 'FAIL'}] Faithfulness delta ≤ 0.3: ${faithDelta.toFixed(2)} (${faithPass ? 'within tolerance' : 'EXCEEDS'})`);
    console.log(`  [${gndPass ? 'PASS' : 'FAIL'}] Groundedness delta ≤ 0.3:  ${gndDelta.toFixed(2)} (${gndPass ? 'within tolerance' : 'EXCEEDS'})`);
    console.log(`  [${cacheHitRate === '100%' ? 'PASS' : 'FAIL'}] Cache hit rate:           ${cacheHitRate}`);
    console.log(`  [${parseFloat(cacheSpeedup) >= 10 ? 'PASS' : 'WARN'}] Cache speedup:            ${cacheSpeedup} faster retrieval`);
    console.log('════════════════════════════════════════════════════════════════');

    // Save report
    const report = {
      desktop: dSummary,
      server: sSummary,
      delta: {
        relevance: Number(relDelta.toFixed(2)),
        faithfulness: Number(faithDelta.toFixed(2)),
        groundedness: Number(gndDelta.toFixed(2)),
      },
      acceptanceCriteria: {
        relevanceWithinTolerance: relPass,
        faithfulnessWithinTolerance: faithPass,
        groundednessWithinTolerance: gndPass,
        cacheHitRate,
        cacheSpeedup,
      },
      perQuestion: { desktop: desktopResults, server: serverResults },
    };
    const reportPath = path.resolve(__dirname, '..', '..', 'eval-rag-desktop-report.json');
    const fs = await import('fs');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);

  } else if (dSummary) {
    console.log('  Desktop only mode:');
    console.table(dSummary);
  } else if (sSummary) {
    console.log('  Server only mode:');
    console.table(sSummary);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}
