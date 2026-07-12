// packages/server/scripts/evalRag.js
const testQuestions = require('./evalQuestions.json'); // 20 per community

async function runEval(communityId) {
  const results = [];

  for (const q of testQuestions[communityId]) {
    const { prompt, sources } = await aiService.buildRagPrompt({ message: q.question, communityId });
    const response = await aiService.getNonStreamingResponse(prompt);

    results.push({
      question: q.question,
      response,
      sources,
      relevance: null,     // fill in manually or via a second Gemini call as judge
      groundedness: sources.length > 0 ? 1 : 0, // citation present?
      faithfulness: null,  // manual/second-model check for hallucination
    });
  }

  return results;
}