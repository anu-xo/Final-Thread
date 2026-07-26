// packages/server/src/scripts/evalCompare.js
//
// Compares the most recent nightly eval run against the pre-launch baseline.
// Queries the EvalResult collection directly — no reliance on disk reports.
//
// Usage:
//   node src/scripts/evalCompare.js
//   node src/scripts/evalCompare.js --runId eval-nightly-2026-08-15T02:00:00Z

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { default: EvalResult } = await import('../models/EvalResult.js');

const EVAL_LABEL_BASELINE = 'pre-launch-baseline';
const EVAL_LABEL_NIGHTLY = 'nightly';
const DEGRADATION_THRESHOLD = 0.3; // max acceptable delta per metric

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getLatestRunResults(evalLabel, communityId = null) {
  const match = { evalLabel };
  if (communityId) match.community = new mongoose.Types.ObjectId(communityId);

  // Get the most recent runId for this label
  const latestRun = await EvalResult.findOne(match)
    .sort({ createdAt: -1 })
    .select('runId')
    .lean();

  if (!latestRun?.runId) return { runId: null, results: [] };

  const results = await EvalResult.find({ runId: latestRun.runId }).lean();
  return { runId: latestRun.runId, results };
}

function aggregate(results) {
  const n = results.length;
  if (n === 0) return null;

  const avg = (key) => {
    const vals = results.map((r) => r[key]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const avgLatency = (key) => {
    const vals = results.map((r) => r[key]).filter((v) => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };

  return {
    questions: n,
    avgRelevance: avg('relevance'),
    avgFaithfulness: avg('faithfulness'),
    avgGroundedness: avg('groundedness'),
    avgOverallScore: avg('relevance') != null && avg('faithfulness') != null
      ? (avg('relevance') + avg('faithfulness')) / 2
      : null,
    avgEmbedMs: avgLatency('embedMs'),
    avgRetrievalMs: avgLatency('retrievalMs'),
    avgLlmMs: avgLatency('llmMs'),
    avgTotalMs: avgLatency('totalMs'),
  };
}

function delta(a, b) {
  if (a == null || b == null) return null;
  return Number((a - b).toFixed(2));
}

function deltaPercent(a, b) {
  if (a == null || b == null || b === 0) return null;
  return Number((((a - b) / b) * 100).toFixed(1));
}

function status(deltaVal, threshold) {
  if (deltaVal == null) return 'N/A';
  return Math.abs(deltaVal) <= threshold ? 'PASS' : 'FAIL';
}

// ── Main ────────────────────────────────────────────────────────────────────

await mongoose.connect(process.env.MONGODB_URI);
console.log('Connected to MongoDB\n');

// Parse optional --runId flag
const runIdIdx = process.argv.indexOf('--runId');
const specificRunId = runIdIdx !== -1 ? process.argv[runIdIdx + 1] : null;

// Fetch baseline
const baseline = await getLatestRunResults(EVAL_LABEL_BASELINE);
if (!baseline.runId) {
  console.error('ERROR: No pre-launch-baseline results found in EvalResult.');
  console.error('Run: node src/scripts/evalBaseline.js');
  await mongoose.disconnect();
  process.exit(1);
}

console.log(`Baseline runId: ${baseline.runId}`);
console.log(`Baseline results: ${baseline.results.length}\n`);

// Fetch nightly (latest or specific)
let nightly;
if (specificRunId) {
  nightly = {
    runId: specificRunId,
    results: await EvalResult.find({ runId: specificRunId }).lean(),
  };
} else {
  nightly = await getLatestRunResults(EVAL_LABEL_NIGHTLY);
}

if (!nightly.runId || nightly.results.length === 0) {
  console.error('ERROR: No nightly eval results found.');
  console.error('Run: node src/jobs/evalCron.js');
  await mongoose.disconnect();
  process.exit(1);
}

console.log(`Nightly runId: ${nightly.runId}`);
console.log(`Nightly results: ${nightly.results.length}\n`);

// Aggregate
const bStats = aggregate(baseline.results);
const nStats = aggregate(nightly.results);

if (!bStats || !nStats) {
  console.error('ERROR: Insufficient data in one or both runs.');
  await mongoose.disconnect();
  process.exit(1);
}

// Edge-case sub-aggregation
const bEdge = aggregate(baseline.results.filter((r) => r.isEdgeCase));
const nEdge = aggregate(nightly.results.filter((r) => r.isEdgeCase));

// ── Report ──────────────────────────────────────────────────────────────────

console.log('════════════════════════════════════════════════════════════════');
console.log('  BASELINE vs NIGHTLY COMPARISON');
console.log('════════════════════════════════════════════════════════════════');

const header = '  Metric'.padEnd(30) + 'Baseline'.padEnd(14) + 'Nightly'.padEnd(14) + 'Delta'.padEnd(10) + 'Status';
console.log(header);
console.log('  ' + '─'.repeat(68));

const rows = [
  ['Relevance (1-5)', bStats.avgRelevance, nStats.avgRelevance],
  ['Faithfulness (1-5)', bStats.avgFaithfulness, nStats.avgFaithfulness],
  ['Groundedness (0/1)', bStats.avgGroundedness, nStats.avgGroundedness],
  ['Overall score', bStats.avgOverallScore, nStats.avgOverallScore],
];

for (const [label, bVal, nVal] of rows) {
  const d = delta(nVal, bVal);
  const s = status(d, DEGRADATION_THRESHOLD);
  console.log(
    `  ${label.padEnd(28)}${String(bVal?.toFixed(2) ?? 'N/A').padEnd(14)}${String(nVal?.toFixed(2) ?? 'N/A').padEnd(14)}${String(d != null ? (d >= 0 ? '+' : '') + d.toFixed(2) : 'N/A').padEnd(10)}[${s}]`
  );
}

console.log('');
console.log('  ── Latency Comparison (avg ms) ───────────────────────────');
const latRows = [
  ['Embedding', bStats.avgEmbedMs, nStats.avgEmbedMs],
  ['Retrieval', bStats.avgRetrievalMs, nStats.avgRetrievalMs],
  ['LLM generation', bStats.avgLlmMs, nStats.avgLlmMs],
  ['Total', bStats.avgTotalMs, nStats.avgTotalMs],
];

for (const [label, bVal, nVal] of latRows) {
  const d = delta(nVal, bVal);
  const pct = deltaPercent(nVal, bVal);
  console.log(
    `  ${label.padEnd(28)}${String(bVal ?? 'N/A').padEnd(14)}${String(nVal ?? 'N/A').padEnd(14)}${String(d != null ? `${d >= 0 ? '+' : ''}${d}ms (${pct > 0 ? '+' : ''}${pct}%)` : 'N/A')}`
  );
}

// ── Edge-case comparison ────────────────────────────────────────────────────

if (bEdge && nEdge) {
  console.log('');
  console.log('  ── Edge-Case Comparison ──────────────────────────────────');
  const ecRows = [
    ['Relevance', bEdge.avgRelevance, nEdge.avgRelevance],
    ['Faithfulness', bEdge.avgFaithfulness, nEdge.avgFaithfulness],
    ['Groundedness', bEdge.avgGroundedness, nEdge.avgGroundedness],
  ];
  for (const [label, bVal, nVal] of ecRows) {
    const d = delta(nVal, bVal);
    const s = status(d, DEGRADATION_THRESHOLD);
    console.log(
      `  ${label.padEnd(28)}${String(bVal?.toFixed(2) ?? 'N/A').padEnd(14)}${String(nVal?.toFixed(2) ?? 'N/A').padEnd(14)}${String(d != null ? (d >= 0 ? '+' : '') + d.toFixed(2) : 'N/A').padEnd(10)}[${s}]`
    );
  }
}

// ── Blocker check ───────────────────────────────────────────────────────────

console.log('');
console.log('  ── Acceptance Criteria ───────────────────────────────────');

const allPass = ['Relevance', 'Faithfulness', 'Groundedness'].every((metric) => {
  const key = `avg${metric.split(' ')[0].toLowerCase().replace(/^(.)/, (m) => m.toUpperCase())}`;
  const bVal = bStats[key];
  const nVal = nStats[key];
  return status(delta(nVal, bVal), DEGRADATION_THRESHOLD) === 'PASS';
});

// Check edge-case regression
let edgeCasePass = true;
if (bEdge && nEdge) {
  for (const metric of ['avgRelevance', 'avgFaithfulness']) {
    const d = delta(nEdge[metric], bEdge[metric]);
    if (status(d, DEGRADATION_THRESHOLD) === 'FAIL') {
      edgeCasePass = false;
      console.log(`  [FAIL] Edge-case ${metric} regression: ${d}`);
    }
  }
}

console.log(`  [${allPass ? 'PASS' : 'FAIL'}] Quality metrics within ${DEGRADATION_THRESHOLD} of baseline`);
console.log(`  [${edgeCasePass ? 'PASS' : 'FAIL'}] Edge-case quality within ${DEGRADATION_THRESHOLD} of baseline`);

if (!allPass || !edgeCasePass) {
  console.log('');
  console.log('  ⛔ BLOCKER DETECTED — Fix aiService.js prompt/guardrails TODAY, not Day 21.');
}

console.log('════════════════════════════════════════════════════════════════');

// ── Write comparison report ─────────────────────────────────────────────────

const report = {
  baseline: { runId: baseline.runId, stats: bStats },
  nightly: { runId: nightly.runId, stats: nStats },
  delta: {
    relevance: delta(nStats.avgRelevance, bStats.avgRelevance),
    faithfulness: delta(nStats.avgFaithfulness, bStats.avgFaithfulness),
    groundedness: delta(nStats.avgGroundedness, bStats.avgGroundedness),
    overallScore: delta(nStats.avgOverallScore, bStats.avgOverallScore),
  },
  latencyDelta: {
    embedMs: delta(nStats.avgEmbedMs, bStats.avgEmbedMs),
    retrievalMs: delta(nStats.avgRetrievalMs, bStats.avgRetrievalMs),
    llmMs: delta(nStats.avgLlmMs, bStats.avgLlmMs),
    totalMs: delta(nStats.avgTotalMs, bStats.avgTotalMs),
  },
  edgeCases: bEdge && nEdge ? {
    baseline: bEdge,
    nightly: nEdge,
    delta: {
      relevance: delta(nEdge.avgRelevance, bEdge.avgRelevance),
      faithfulness: delta(nEdge.avgFaithfulness, bEdge.avgFaithfulness),
      groundedness: delta(nEdge.avgGroundedness, bEdge.avgGroundedness),
    },
  } : null,
  acceptanceCriteria: {
    qualityWithinTolerance: allPass,
    edgeCasesWithinTolerance: edgeCasePass,
    threshold: DEGRADATION_THRESHOLD,
  },
  comparedAt: new Date().toISOString(),
};

const reportPath = path.resolve(__dirname, '../../eval-comparison-report.json');
const fs = await import('fs');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nComparison report saved to: ${reportPath}`);

await mongoose.disconnect();
console.log('Done.');
