// packages/server/src/scripts/runEval.js

import questions from '../fixtures/evalQuestions.json' assert { type: 'json' };

export async function runEvalRound(label) {
  const results = [];

  for (const q of questions) {
    const start = Date.now();

    const response = await simulateChatCall(q); // non-streaming helper wrapping the same aiService logic

    results.push({
      question: q.text,
      relevance: scoreRelevance(response), // 1–5, manual or heuristic
      groundedness: response.sources.length > 0,
      latencyMs: Date.now() - start,
    });
  }

  const avg =
    results.reduce((sum, result) => sum + result.relevance, 0) /
    results.length;

  console.log(
    `[${label}] avg relevance: ${avg.toFixed(2)}, target >= 3.5`
  );

  return results;
}