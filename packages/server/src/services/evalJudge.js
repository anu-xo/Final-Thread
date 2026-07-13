// packages/server/src/services/evalJudge.js
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

  const userContent = `QUESTION: ${question}

ANSWER: ${answer}

SOURCE SNIPPETS:
${sourceText}`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: JUDGE_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0, // grading should be deterministic, not creative
    });

    const text = completion.choices[0].message.content;
    const parsed = JSON.parse(text);

    return {
      relevance: parsed.relevance,
      faithfulness: parsed.faithfulness,
      groundedness: parsed.groundedness,
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    // Either the Groq call failed (rate limit, network) or the model returned malformed JSON —
    // either way, don't crash the whole 20-question eval run over one bad grade
    console.error('Judge failure:', err.message);
    return { relevance: null, faithfulness: null, groundedness: null, reasoning: 'JUDGE_ERROR' };
  }
}