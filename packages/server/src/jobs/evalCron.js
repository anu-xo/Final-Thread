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
import { runMentionSuite, runSummarySuite, runDigestSuite } from './evalNeoLayers.js';

const questionsByCommunity = (await import('../scripts/evalQuestions.json', { with: { type: 'json' } })).default;

const LOW_SCORE_THRESHOLD = 3.0;
const EVAL_LABEL_BASELINE = 'pre-launch-baseline';
const EVAL_LABEL_NIGHTLY = 'nightly';

const JUDGE_TYPES = new Set(['passive_chat', 'autonomous_mention', 'autonomous_summary', 'digest_highlight']);

// ── Type-aware judge ────────────────────────────────────────────────────────

function buildJudgePrompt(type, output, context) {
  const dimensionDefinitions = {
    passive_chat: {
      relevance: 'Does the response actually address the user\'s question?',
      groundedness: 'Is every claim traceable to the provided post/comment context?',
      faithfulness: 'Does it avoid inventing facts not present in the context?',
    },
    autonomous_mention: {
      relevance: 'Does the reply address what was asked in the triggering comment?',
      groundedness: 'Is it grounded in the specific post/thread it was posted under?',
      faithfulness: 'Does it avoid fabricating claims about the thread?',
    },
    autonomous_summary: {
      relevance: 'Does it capture the actual themes/points raised, not generic filler?',
      groundedness: 'Are all summarized points traceable to the top comments provided?',
      faithfulness: 'Does it stay neutral and avoid asserting a side was "right"?',
    },
    digest_highlight: {
      relevance: 'Does it reflect what this specific community actually discussed this week?',
      groundedness: 'Are the themes traceable to the top posts provided, not generic?',
      faithfulness: 'Does it avoid inventing activity/topics not present in the posts?',
    },
  };

  const defs = dimensionDefinitions[type];
  return `You are grading an AI-generated response for quality. Task type: ${type}.

Context provided to the AI:
${context}

AI's output:
${output}

Score each dimension 1-5:
- relevance: ${defs.relevance}
- groundedness: ${defs.groundedness}
- faithfulness: ${defs.faithfulness}

Respond ONLY with JSON: {"relevance": N, "groundedness": N, "faithfulness": N}`;
}

async function judgeOutput(type, output, context) {
  if (!JUDGE_TYPES.has(type)) {
    throw new Error(`unknown judge type: ${type}`);
  }

  const judgePrompt = buildJudgePrompt(type, output, context);
  const raw = await generateNonStreamingResponse(judgePrompt);

  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const parsed = JSON.parse(cleaned);
    const grade = {
      relevance: Number(parsed.relevance),
      groundedness: Number(parsed.groundedness),
      faithfulness: Number(parsed.faithfulness),
    };
    for (const [dim, val] of Object.entries(grade)) {
      if (!Number.isFinite(val) || val < 1 || val > 5) {
        throw new Error(`${dim} score out of range: ${parsed[dim]}`);
      }
    }
    return grade;
  } catch (err) {
    console.error(`[evalCron] judge JSON parse failed for "${type}", skipping eval row: ${err.message}`);
    console.error('[evalCron] raw judge response:', raw);
    throw err;
  }
}

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
  const judgeContext = [
    `QUESTION: ${q.question}`,
    'SOURCE SNIPPETS:',
    ...(contextChunks.length ? contextChunks.map((c) => c.text) : ['(no context retrieved)']),
  ].join('\n\n');
  const grade = await judgeOutput('passive_chat', answer, judgeContext);
  const judgeMs = Date.now() - judgeStart;

  const totalMs = embedMs + retrievalMs + llmMs + judgeMs;

  const doc = await EvalResult.create({
    community: communityId,
    question: q.question,
    answer,
    ...grade,
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

  // ── Neo-layer suites (mention / summary / digest) ─────────────────────────
  const suites = [];
  const suiteRunners = [
    { name: 'mention', runner: runMentionSuite },
    { name: 'summary', runner: runSummarySuite },
    { name: 'digest', runner: runDigestSuite },
  ];

  for (const { name, runner } of suiteRunners) {
    console.log(`  ━━━ ${name} suite ━━━`);
    try {
      const suite = await runner({ runId, evalLabel });
      suites.push(suite);
      console.log(`  ${suite.results.length} samples evaluated`);
    } catch (err) {
      console.error(`  [${name}] suite FAILED: ${err.message}`);
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
  console.log(`  Groundedness (1-5):   ${avgGroundedness.toFixed(2)}`);
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

  // ── Neo-layer suite sub-report ─────────────────────────────────────────────
  if (suites.length > 0) {
    console.log('  ── Neo Layer Suites (1-5 each) ───────────────────────────');
    for (const suite of suites) {
      const vals = suite.results.map((r) => r.grade).filter((g) => g && g.relevance != null);
      if (vals.length === 0) {
        console.log(`  ${suite.label}: 0 samples evaluated`);
        continue;
      }
      const avg = (k) => vals.reduce((a, b) => a + b[k], 0) / vals.length;
      const below =
        avg('relevance') < LOW_SCORE_THRESHOLD ||
        avg('groundedness') < LOW_SCORE_THRESHOLD ||
        avg('faithfulness') < LOW_SCORE_THRESHOLD
          ? ' ⚠️ below threshold'
          : '';
      console.log(
        `  ${suite.label}: n=${vals.length} rel=${avg('relevance').toFixed(2)} gnd=${avg('groundedness').toFixed(2)} faith=${avg('faithfulness').toFixed(2)}${below}`
      );
      if (suite.note) {
        console.log(`    ${suite.note}`);
      }
    }
    console.log('');
  }

  console.log('════════════════════════════════════════════════════════════');

  // ── Alert on quality drop (per-type, not blended) ─────────────────────────
  const perType = buildPerTypeReport(allResults, suites);
  const belowTypes = perType.filter((t) => t.below);
  if (belowTypes.length > 0) {
    console.log(
      `\n  ⚠️  Below threshold (${LOW_SCORE_THRESHOLD}): ${belowTypes.map((t) => t.type).join(', ')} — sending alert`
    );
    await notifyDiscord(perType, evalLabel);
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
    suites: suites.map((s) => {
      const vals = s.results.map((r) => r.grade).filter((g) => g && g.relevance != null);
      const avg = (k) => (vals.length ? vals.reduce((a, b) => a + b[k], 0) / vals.length : 0);
      return {
        type: s.type,
        label: s.label,
        note: s.note || null,
        count: vals.length,
        avgRelevance: avg('relevance'),
        avgGroundedness: avg('groundedness'),
        avgFaithfulness: avg('faithfulness'),
        results: s.results.map((r) => ({
          question: r.doc.question,
          relevance: r.grade.relevance,
          groundedness: r.grade.groundedness,
          faithfulness: r.grade.faithfulness,
          llmMs: r.llmMs,
          judgeMs: r.judgeMs,
          totalMs: r.totalMs,
        })),
      };
    }),
  };
}

// ── Per-type breakdown + Discord alert ─────────────────────────────────────

const TRIGGER_TYPES = ['passive_chat', 'autonomous_mention', 'autonomous_summary', 'digest_highlight'];

// A blended average across all four trigger types can hide one broken layer
// behind three healthy ones, so the alert reports each type separately and
// flags types individually below threshold rather than the overall mean.
function buildPerTypeReport(allResults, suites) {
  const groups = {
    passive_chat: allResults.map((r) => r.grade).filter((g) => g && g.relevance != null),
    ...suites.reduce((acc, suite) => {
      acc[suite.type] = (suite.results || [])
        .map((r) => r.grade)
        .filter((g) => g && g.relevance != null);
      return acc;
    }, {}),
  };

  return TRIGGER_TYPES.map((type) => {
    const grades = groups[type] || [];
    if (grades.length === 0) {
      return { type, samples: 0, avgScore: null, below: false };
    }
    const avg = (key) => grades.reduce((sum, g) => sum + g[key], 0) / grades.length;
    const avgScore = (avg('relevance') + avg('faithfulness')) / 2;
    return { type, samples: grades.length, avgScore, below: avgScore < LOW_SCORE_THRESHOLD };
  });
}

async function notifyDiscord(perType, evalLabel) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const date = new Date().toISOString().slice(0, 10);
  const lines = perType.map((t) => {
    if (t.samples === 0) return `${t.type}: no samples evaluated`;
    const flag = t.below ? '  ⚠️ BELOW THRESHOLD' : '';
    return `${t.type}: ${t.avgScore.toFixed(1)} avg (${t.samples} samples)${flag}`;
  });

  await axios.post(webhookUrl, {
    content: `⚠️ **ThreadVerse Neo nightly eval** — ${date} (${evalLabel})\n` + lines.join('\n'),
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

export { runNightlyEval, EVAL_LABEL_BASELINE, EVAL_LABEL_NIGHTLY, buildJudgePrompt, judgeOutput, buildPerTypeReport, notifyDiscord };
