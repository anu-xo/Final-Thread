// packages/server/scripts/evalRag.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import mongoose from 'mongoose';
import questionsByCommunity from './evalQuestions.json' with { type: 'json' };
import * as aiService from '../services/aiService.js';
import { judgeResponse } from '../services/evalJudge.js';
import EvalResult from '../models/EvalResult.js';

async function runEval(communityId, promptVersion = 'v1.0') {
  const questions = questionsByCommunity[communityId];
  if (!questions) throw new Error(`No eval questions for community ${communityId}`);

  const runResults = [];

  for (const { question } of questions) {
    const { prompt, sources } = await aiService.buildRagPrompt({ message: question, communityId });
    const answer = await aiService.getNonStreamingResponse(prompt);

    const grade = await judgeResponse({ question, answer, sources });

    const saved = await EvalResult.create({
      community: communityId,
      question,
      answer,
      ...grade,
      promptVersion,
    });

    runResults.push(saved);
    // small delay to stay well under Gemini free-tier rate limits across 20 sequential calls
    await new Promise((r) => setTimeout(r, 500));
  }

  const avg = (key) => {
    const vals = runResults.map((r) => r[key]).filter((v) => v !== null);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const summary = {
    communityId,
    promptVersion,
    avgRelevance: avg('relevance'),
    avgFaithfulness: avg('faithfulness'),
    avgGroundedness: avg('groundedness'),
    overallAvg: (avg('relevance') + avg('faithfulness') + avg('groundedness') * 5) / 3, // groundedness scaled to 1-5
  };

  console.log(summary);
  return summary;
}

// Run directly: node scripts/evalRag.js <communityId>
if (import.meta.url === `file://${process.argv[1]}`) {
  await mongoose.connect(process.env.MONGO_URI);
  const communityId = process.argv[2];
  await runEval(communityId);
  await mongoose.disconnect();
}

export { runEval };