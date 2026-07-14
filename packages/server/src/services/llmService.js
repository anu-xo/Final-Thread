import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Generate a chat completion with Gemini, falling back to Groq on 429.
 */
export async function generateCompletion(prompt) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    // Rate limit → fallback to Groq
    if (err.status === 429) {
      console.warn('[LLM] Gemini rate limited, falling back to Groq');
      const chat = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.1-8b-instant',
      });
      return chat.choices[0].message.content;
    }
    throw err;
  }
}