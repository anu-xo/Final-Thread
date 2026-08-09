// packages/server/src/jobs/evalCron.js
//
// Nightly AI eval runner.  Records every result in EvalResult with a shared
// runId and evalLabel so Day 21 has a documented pre-launch baseline to
// compare against post-launch nightly evals.
//
// Usage:
//   — As cron job:     import { scheduleNightlyEval } from './jobs/evalCron.js'
//   — As CLI baseline: node src/jobs/evalCron.js --baseline
//   — As CLI nightly:  node src/jobs/evalCron.js

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import crypto from 'crypto';
import cron from 'node-cron';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import EvalResult from '../models/EvalResult.js';
import Community from '../models/Community.js';
import { generateNonStreamingResponse, embedQuery, retrieveContext, buildPrompt } from '../services/aiService.js';
import { judgeResponse } from '../services/evalJudge.js';

const questionsByCommunity = (await import('../scripts/evalQuestions.json', { with: { type: 'json' } })).default;

const LOW_SCORE_THRESHOLD = 3.0;
const EVAL_LABEL_BASELINE = 'pre-launch-baseline';
const EVAL_LABEL_NIGHTLY = 'nightly';

// ── Shared runner ───────────────────────────────────────────────────────────

async function runEvalQuestion(q, communityId, communityName, runId, evalLabel) {
  const embedStart = Date.now();
  const queryEmbedding = await embedQuery(q.question);
  const embedMs = Date.now() - embedStart;

  const retrievalStart = Date.now();
  const contextChunks = await retrieveContext({ queryEmbedding, communityId });
  const retrievalMs = Date.now() - retrievalStart;

  const cacheHit = contextChunks.length > 0;

  const prompt = buildPrompt({
    communityName,
    contextChunks,
    history: [],
    message: q.question,
  });

  const llmStart = Date.now();
  const answer = await generateNonStreamingResponse(prompt);
  const llmMs = Date.now() - llmStart;

  const sources = contextChunks.map((chunk) => ({
    postId: chunk.postId,
    title: chunk.text.split('\n')[0] || 'Untitled',
  }));

  const judgeStart = Date.now();
  const grade = await judgeResponse({ question: q.question, answer, sources });
  const judgeMs = Date.now() - judgeStart;

  const totalMs = embedMs + retrievalMs + llmMs + judgeMs;

  // Coerce groundedness 0→1 for model min:1 constraint (keep raw for metrics)
  const saveGrade = { ...grade };
  if (saveGrade.groundedness === 0) saveGrade.groundedness = 1;

  const doc = await EvalResult.create({
    community: communityId,
    question: q.question,
    answer,
    ...saveGrade,
    hasCitation: sources.length > 0,
    promptVersion: 'prompt-v3.0-2026-07-25',
    runId,
    mode: 'cron',
    evalLabel,
    embedMs,
    retrievalMs,
    llmMs,
    judgeMs,
    totalMs,
    cacheHit,
    sourcesReturned: sources.length,
    isEdgeCase: q.isEdgeCase === true,
  });

  return {
    doc,
    grade,
    embedMs,
    retrievalMs,
    llmMs,
    judgeMs,
    totalMs,
    sourcesReturned: sources.length,
    cacheHit,
  };
}

// ── Full eval run ───────────────────────────────────────────────────────────

async function runNightlyEval(evalLabel = EVAL_LABEL_NIGHTLY) {
  const runId = `eval-${evalLabel}-${new Date().toISOString()}`;
  const startedAt = new Date();
  const communityIds = Object.keys(questionsByCommunity);

  console.log(`[evalCron] starting eval run: ${runId}`);

  const allResults = [];
  const edgeCaseResults = [];

  for (const cid of communityIds) {
    const community = await Community.findById(cid).select('name slug');
    if (!community) {
      console.warn(`[evalCron] community ${cid} not found, skipping`);
      continue;
    }

    const questions = questionsByCommunity[cid];
    console.log(`  ━━━ ${community.name} (${community.slug}) — ${questions.length} questions ━━━`);

    for (const q of questions) {
      try {
        const result = await runEvalQuestion(q, cid, community.name, runId, evalLabel);
        allResults.push({ communityId: cid, ...result });

        if (q.isEdgeCase) {
          edgeCaseResults.push({ communityId: cid, ...result });
        }

        const tag = q.isEdgeCase ? ' [EDGE]' : '';
        console.log(
          `    Q: "${q.question.slice(0, 55)}…" → rel=${result.grade.relevance} faith=${result.grade.faithfulness} gnd=${result.grade.groundedness} ${result.totalMs}ms${tag}`
        );
      } catch (err) {
        console.error(`    Q FAILED: "${q.question.slice(0, 45)}…" → ${err.message}`);
      }

      // Rate limit: 500ms between questions
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log('');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = allResults.length;
  if (total === 0) {
    console.log('[evalCron] no results — skipping summary');
    return { runId, total: 0, avgScore: 0, results: [] };
  }

  const avg = (key) => {
    const vals = allResults.map((r) => r.grade[key]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const avgRelevance = avg('relevance');
  const avgFaithfulness = avg('faithfulness');
  const avgGroundedness = avg('groundedness');
  const avgScore = (avgRelevance + avgFaithfulness) / 2;

  const avgEmbedMs = Math.round(allResults.reduce((s, r) => s + r.embedMs, 0) / total);
  const avgRetrievalMs = Math.round(allResults.reduce((s, r) => s + r.retrievalMs, 0) / total);
  const avgLlmMs = Math.round(allResults.reduce((s, r) => s + r.llmMs, 0) / total);
  const avgJudgeMs = Math.round(allResults.reduce((s, r) => s + r.judgeMs, 0) / total);
  const avgTotalMs = Math.round(allResults.reduce((s, r) => s + r.totalMs, 0) / total);

  console.log('════════════════════════════════════════════════════════════');
  console.log(`  EVAL RUN REPORT — ${evalLabel.toUpperCase()}`);
  console.log(`  runId: ${runId}`);
  console.log(`  started: ${startedAt.toISOString()}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Questions evaluated:  ${total} (${edgeCaseResults.length} edge cases)`);
  console.log('');
  console.log('  ── Answer Quality ──────────────────────────────────────');
  console.log(`  Relevance (1-5):      ${avgRelevance.toFixed(2)}`);
  console.log(`  Faithfulness (1-5):   ${avgFaithfulness.toFixed(2)}`);
  console.log(`  Groundedness (0/1):   ${avgGroundedness.toFixed(2)} (${(avgGroundedness * 100).toFixed(0)}% cited a source)`);
  console.log(`  Overall avg:          ${avgScore.toFixed(2)}`);
  console.log('');
  console.log('  ── Latency (avg per question) ─────────────────────────');
  console.log(`  Embedding:            ${avgEmbedMs}ms`);
  console.log(`  Retrieval:            ${avgRetrievalMs}ms`);
  console.log(`  LLM generation:       ${avgLlmMs}ms`);
  console.log(`  Judge grading:        ${avgJudgeMs}ms`);
  console.log(`  Total:                ${avgTotalMs}ms`);
  console.log('');

  // ── Edge-case sub-report ──────────────────────────────────────────────────
  if (edgeCaseResults.length > 0) {
    const ecAvg = (key) => {
      const vals = edgeCaseResults.map((r) => r.grade[key]).filter((v) => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    console.log('  ── Edge-Case Sub-Report ────────────────────────────────');
    console.log(`  Questions:            ${edgeCaseResults.length}`);
    console.log(`  Relevance:            ${ecAvg('relevance').toFixed(2)}`);
    console.log(`  Faithfulness:         ${ecAvg('faithfulness').toFixed(2)}`);
    console.log(`  Groundedness:         ${ecAvg('groundedness').toFixed(2)}`);
    console.log('');

    // Blocker check: any edge case with relevance < 3 is a prompt/guardrail failure
    const failedEdgeCases = edgeCaseResults.filter((r) => r.grade.relevance != null && r.grade.relevance < 3);
    if (failedEdgeCases.length > 0) {
      console.log('  ⛔ BLOCKER: Edge-case questions scored below threshold:');
      for (const r of failedEdgeCases) {
        console.log(`    - "${r.doc.question.slice(0, 60)}…" rel=${r.grade.relevance}`);
      }
      console.log('  → Fix aiService.js prompt/guardrails TODAY, not Day 21.');
    }
  }

  console.log('════════════════════════════════════════════════════════════');

  // ── Alert on quality drop ─────────────────────────────────────────────────
  if (avgScore < LOW_SCORE_THRESHOLD) {
    console.log(`\n  ⚠️  Average score ${avgScore.toFixed(2)} is below threshold ${LOW_SCORE_THRESHOLD} — sending alert`);
    await notifyDiscord(avgScore, allResults, evalLabel);
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  return {
    runId,
    evalLabel,
    total,
    edgeCases: edgeCaseResults.length,
    avgRelevance,
    avgFaithfulness,
    avgGroundedness,
    avgScore,
    latency: { avgEmbedMs, avgRetrievalMs, avgLlmMs, avgJudgeMs, avgTotalMs },
    durationMs,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    results: allResults,
  };
}

// ── Discord alert ───────────────────────────────────────────────────────────

async function notifyDiscord(avgScore, results, evalLabel) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const lowScoring = results.filter((r) => {
    const s = (r.grade.groundedness + r.grade.relevance) / 2;
    return s < LOW_SCORE_THRESHOLD;
  });

  await axios.post(webhookUrl, {
    content:
      `⚠️ **ThreadVerse AI eval alert** (${evalLabel})\n` +
      `Average score dropped to **${avgScore.toFixed(2)}** (threshold: ${LOW_SCORE_THRESHOLD})\n` +
      `${lowScoring.length} of ${results.length} questions scored low.`,
  });
}

// ── Cron scheduler ──────────────────────────────────────────────────────────

export function scheduleNightlyEval() {
  // Runs at 2:00 AM server time every day
  cron.schedule('0 2 * * *', async () => {
    try {
      const summary = await runNightlyEval(EVAL_LABEL_NIGHTLY);
      console.log(`[evalCron] complete. avg score: ${summary.avgScore.toFixed(2)} (${summary.total} questions)`);
    } catch (err) {
      console.error('[evalCron] eval run failed:', err);
    }
  });
}

// ── CLI entry point ─────────────────────────────────────────────────────────

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const isBaseline = process.argv.includes('--baseline');
  const evalLabel = isBaseline ? EVAL_LABEL_BASELINE : EVAL_LABEL_NIGHTLY;

  // Connect to MongoDB for standalone runs
  const { default: mongoose } = await import('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const summary = await runNightlyEval(evalLabel);

  // Write structured report to disk
  const reportPath = path.resolve(
    __dirname,
    `../../eval-${evalLabel.replace(/\s+/g, '-')}-report.json`
  );
  const fs = await import('fs');
  const report = { ...summary, results: summary.results.map((r) => ({
    question: r.doc.question,
    relevance: r.grade.relevance,
    faithfulness: r.grade.faithfulness,
    groundedness: r.grade.groundedness,
    isEdgeCase: r.doc.isEdgeCase,
    embedMs: r.embedMs,
    retrievalMs: r.retrievalMs,
    llmMs: r.llmMs,
    judgeMs: r.judgeMs,
    totalMs: r.totalMs,
    sourcesReturned: r.sourcesReturned,
    cacheHit: r.cacheHit,
  }))};
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${reportPath}`);

  await mongoose.disconnect();
  console.log('Done.');
}

export { runNightlyEval, EVAL_LABEL_BASELINE, EVAL_LABEL_NIGHTLY };
