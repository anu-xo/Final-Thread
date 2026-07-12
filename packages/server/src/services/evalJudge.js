// packages/server/src/services/evalJudge.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const judgeModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { responseMimeType: 'application/json' }, // forces valid JSON back
});

const JUDGE_PROMPT = `You are grading an AI assistant's answer. You will be given a QUESTION, the ANSWER the assistant gave, and the SOURCE SNIPPETS it was allowed to use.

Score on two dimensions, 1-5 each:
- relevance: does the answer actually address the question asked, on-topic and useful?
- faithfulness: is every factual claim in the answer directly supported by the source snippets? An answer that says "I don't have enough information" when sources are thin should score 5 for faithfulness, not be penalized.

Also return:
- groundedness: 1 if the answer cites at least one source, 0 if it makes claims with zero citations
- reasoning: one sentence explaining the scores

Respond ONLY with JSON matching this exact shape, nothing else:
{"relevance": <1-5>, "faithfulness": <1-5>, "groundedness": <0 or 1>, "reasoning": "<string>"}`;

export async function judgeResponse({ question, answer, sources }) {
  const sourceText = sources.length
    ? sources.map((s) => `- ${s.title}`).join('\n')
    : '(no sources were retrieved)';

  const prompt = `${JUDGE_PROMPT}

QUESTION: ${question}

ANSWER: ${answer}

SOURCE SNIPPETS:
${sourceText}`;

  const result = await judgeModel.generateContent(prompt);
  const text = result.response.text();

  try {
    const parsed = JSON.parse(text);
    return {
      relevance: parsed.relevance,
      faithfulness: parsed.faithfulness,
      groundedness: parsed.groundedness,
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    // Judge model returned malformed JSON — don't crash the whole eval run over one bad grade
    console.error('Judge parse failure:', text);
    return { relevance: null, faithfulness: null, groundedness: null, reasoning: 'PARSE_ERROR' };
  }
}