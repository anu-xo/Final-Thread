// packages/server/src/scripts/evalBaseline.js
//
// Pre-launch baseline snapshot.  Runs the full eval suite and records every
// result in EvalResult with evalLabel = 'pre-launch-baseline'.
//
// This is the document that Day 21 compares against post-launch nightly evals.
//
// Usage:
//   node src/scripts/evalBaseline.js

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { runNightlyEval, EVAL_LABEL_BASELINE } = await import('../jobs/evalCron.js');

await mongoose.connect(process.env.MONGODB_URI);
console.log('Connected to MongoDB\n');

console.log('════════════════════════════════════════════════════════════════');
console.log('  PRE-LAUNCH BASELINE — Day 21 Snapshot');
console.log('  This is the canonical baseline for post-launch comparison.');
console.log('════════════════════════════════════════════════════════════════\n');

const summary = await runNightlyEval(EVAL_LABEL_BASELINE);

// Write comparison-ready snapshot
const snapshot = {
  label: EVAL_LABEL_BASELINE,
  capturedAt: new Date().toISOString(),
  summary: {
    totalQuestions: summary.total,
    edgeCases: summary.edgeCases,
    avgRelevance: summary.avgRelevance,
    avgFaithfulness: summary.avgFaithfulness,
    avgGroundedness: summary.avgGroundedness,
    avgScore: summary.avgScore,
    latency: summary.latency,
  },
  perQuestion: summary.results.map((r) => ({
    question: r.doc.question,
    isEdgeCase: r.doc.isEdgeCase,
    relevance: r.grade.relevance,
    faithfulness: r.grade.faithfulness,
    groundedness: r.grade.groundedness,
    embedMs: r.embedMs,
    retrievalMs: r.retrievalMs,
    llmMs: r.llmMs,
    judgeMs: r.judgeMs,
    totalMs: r.totalMs,
    sourcesReturned: r.sourcesReturned,
    cacheHit: r.cacheHit,
  })),
};

const snapshotPath = path.resolve(__dirname, '../../eval-pre-launch-baseline.json');
const fs = await import('fs');
fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
console.log(`\nBaseline snapshot saved to: ${snapshotPath}`);
console.log(`runId: ${summary.runId}`);
console.log(`Total results in EvalResult collection: ${summary.total}`);

await mongoose.disconnect();
console.log('\nDone.');
