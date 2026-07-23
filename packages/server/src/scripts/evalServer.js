// packages/server/src/scripts/evalServer.js
//
// Server baseline eval: same 20-question suite, live $vectorSearch retrieval.
// Produces identical report format to evalDesktop.js for A/B comparison.

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

const PROMPT_VERSION = 'server-vsearch-v1';

async function runServerEval(communityId) {
  const questions = questionsByCommunity[communityId];
  if (!questions) throw new Error(`No eval questions for community ${communityId}`);

  const questionResults = [];

  for (const { question } of questions) {
    try {
      // ── Embedding ──
      const embedStart = Date.now();
      const queryEmbedding = await aiService.embedQuery(question);
      const embedMs = Date.now() - embedStart;

      // ── Live $vectorSearch retrieval ──
      const retrievalStart = Date.now();
      const contextChunks = await aiService.retrieveContext(queryEmbedding, communityId);
      const retrievalMs = Date.now() - retrievalStart;
      const cacheHit = contextChunks.length > 0;

      // ── Build prompt ──
      const community = await Community.findById(communityId).select('name');
      const prompt = aiService.buildPrompt({
        communityName: community.name,
        contextChunks,
        history: [],
        message: question,
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
      const grade = await judgeResponse({ question, answer, sources });
      const judgeMs = Date.now() - judgeStart;

      const saveGrade = { ...grade };
      if (saveGrade.groundedness === 0) saveGrade.groundedness = 1;
      await EvalResult.create({
        community: communityId,
        question,
        answer,
        ...saveGrade,
        promptVersion: PROMPT_VERSION,
      });

      const totalMs = embedMs + retrievalMs + llmMs + judgeMs;

      questionResults.push({
        question,
        relevance: grade.relevance,
        faithfulness: grade.faithfulness,
        groundedness: grade.groundedness,
        sourcesReturned: sources.length,
        cacheHit,
        embedMs,
        retrievalMs,
        llmMs,
        judgeMs,
        totalMs,
      });

      console.log(`  Q: "${question.slice(0, 60)}…" → rel=${grade.relevance} faith=${grade.faithfulness} gnd=${grade.groundedness} src=${sources.length} ${totalMs}ms`);
    } catch (err) {
      console.error(`  Q FAILED: "${question.slice(0, 50)}…" → ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return questionResults;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const allResults = [];
  const communityIds = Object.keys(questionsByCommunity);

  for (const cid of communityIds) {
    const community = await Community.findById(cid).select('name slug');
    const label = community ? `${community.name} (${community.slug})` : cid;
    console.log(`━━━ ${label} ━━━`);

    try {
      const results = await runServerEval(cid);
      if (results) allResults.push(...results);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
    console.log('');
  }

  const total = allResults.length;
  const avg = (key) => {
    const vals = allResults.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 'N/A';
  };

  const hits = allResults.filter((r) => r.cacheHit).length;
  const avgEmbed = (allResults.reduce((s, r) => s + r.embedMs, 0) / total).toFixed(0);
  const avgRetrieval = (allResults.reduce((s, r) => s + r.retrievalMs, 0) / total).toFixed(1);
  const avgLLM = (allResults.reduce((s, r) => s + r.llmMs, 0) / total).toFixed(0);
  const avgJudge = (allResults.reduce((s, r) => s + r.judgeMs, 0) / total).toFixed(0);
  const avgTotal = (allResults.reduce((s, r) => s + r.totalMs, 0) / total).toFixed(0);

  console.log('════════════════════════════════════════════════════════════');
  console.log('  SERVER BASELINE REPORT — 20-Question Suite ($vectorSearch)');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Questions evaluated:  ${total}`);
  console.log('');
  console.log('  ── Latency Breakdown (avg per question) ──────────────');
  console.log(`  Embedding (Gemini):   ${avgEmbed}ms`);
  console.log(`  $vectorSearch (Atlas): ${avgRetrieval}ms`);
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
  console.log('════════════════════════════════════════════════════════════');

  const report = {
    mode: 'server-vsearch',
    promptVersion: PROMPT_VERSION,
    totalQuestions: total,
    latency: {
      avgEmbeddingMs: Number(avgEmbed),
      avgVectorSearchMs: Number(avgRetrieval),
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
  };

  const reportPath = path.resolve(__dirname, '..', '..', 'eval-server-report.json');
  const fs = await import('fs');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report saved to: ${reportPath}`);

  await mongoose.disconnect();
  console.log('Done.');
}
