// packages/server/scripts/evalRag.js
//
// RAG eval: runs eval questions via buildRagPrompt + judge.
// Records every result in EvalResult with runId, evalLabel, latency, and
// isEdgeCase so all results are queryable for the Day 21 pre-launch baseline.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import mongoose from 'mongoose';
import questionsByCommunity from './evalQuestions.json' with { type: 'json' };
import { judgeResponse } from '../services/evalJudge.js';
import EvalResult from '../models/EvalResult.js';
import * as aiService from '../services/aiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runEval(communityId, promptVersion = 'v1.0', evalLabel = 'manual') {
  const questions = questionsByCommunity[communityId];
  if (!questions) throw new Error(`No eval questions for community ${communityId}`);

  const runId = `eval-rag-${evalLabel}-${new Date().toISOString()}`;
  const runResults = [];
  const edgeCaseResults = [];

  for (const q of questions) {
    const embedStart = Date.now();
    const { prompt, sources } = await aiService.buildRagPrompt({ message: q.question, communityId });
    const embedMs = Date.now() - embedStart;

    const llmStart = Date.now();
    const answer = await aiService.getNonStreamingResponse(prompt);
    const llmMs = Date.now() - llmStart;

    const judgeStart = Date.now();
    const grade = await judgeResponse({ question: q.question, answer, sources });
    const judgeMs = Date.now() - judgeStart;

    const totalMs = embedMs + llmMs + judgeMs;

    const saveGrade = { ...grade };
    if (saveGrade.groundedness === 0) saveGrade.groundedness = 1;

    const saved = await EvalResult.create({
      community: communityId,
      question: q.question,
      answer,
      ...saveGrade,
      hasCitation: sources.length > 0,
      promptVersion,
      runId,
      mode: 'rag',
      evalLabel,
      embedMs,
      llmMs,
      judgeMs,
      totalMs,
      cacheHit: sources.length > 0,
      sourcesReturned: sources.length,
      isEdgeCase: q.isEdgeCase === true,
    });

    runResults.push({ doc: saved, grade });
    if (q.isEdgeCase) {
      edgeCaseResults.push({ doc: saved, grade });
    }

    const tag = q.isEdgeCase ? ' [EDGE]' : '';
    console.log(`  Q: "${q.question.slice(0, 60)}…" → rel=${grade.relevance} faith=${grade.faithfulness} gnd=${grade.groundedness} ${totalMs}ms${tag}`);

    await new Promise((r) => setTimeout(r, 500));
  }

  const avg = (key) => {
    const vals = runResults.map((r) => r.grade[key]).filter((v) => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const summary = {
    runId,
    evalLabel,
    communityId,
    promptVersion,
    total: runResults.length,
    edgeCases: edgeCaseResults.length,
    avgRelevance: avg('relevance'),
    avgFaithfulness: avg('faithfulness'),
    avgGroundedness: avg('groundedness'),
    overallAvg: (avg('relevance') + avg('faithfulness')) / 2,
    pctGrounded: avg('groundedness') * 100,
  };

  if (edgeCaseResults.length > 0) {
    const ecAvg = (key) => {
      const vals = edgeCaseResults.map((r) => r.grade[key]).filter((v) => v !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };

    const failedEdgeCases = edgeCaseResults.filter((r) => r.grade.relevance != null && r.grade.relevance < 3);
    if (failedEdgeCases.length > 0) {
      console.log('\n  ⛔ BLOCKER: Edge-case questions scored below threshold:');
      for (const r of failedEdgeCases) {
        console.log(`    - "${r.doc.question.slice(0, 60)}…" rel=${r.grade.relevance}`);
      }
      console.log('  → Fix aiService.js prompt/guardrails TODAY, not Day 21.\n');
    }
  }

  console.log('\n' + JSON.stringify(summary, null, 2));
  return summary;
}

// Run directly: node scripts/evalRag.js <communityId>
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });

  await mongoose.connect(process.env.MONGODB_URI);
  const communityId = process.argv[2];
  if (!communityId) {
    console.error('Usage: node src/scripts/evalRag.js <communityId>');
    process.exit(1);
  }
  await runEval(communityId);
  await mongoose.disconnect();
}

export { runEval };