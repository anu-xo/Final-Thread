// packages/server/src/services/moderationService.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Replicate __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODERATION_PROMPT = `Classify the following content as exactly one word: SAFE, SPAM, HATE, or NSFW.
Respond with ONLY that single word, nothing else.

Content:
"""
{{TEXT}}
"""`;

export async function classifyContent(text) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = MODERATION_PROMPT.replace('{{TEXT}}', text.slice(0, 4000));

  const result = await model.generateContent(prompt);
  const label = result.response.text().trim().toUpperCase();

  const valid = ['SAFE', 'SPAM', 'HATE', 'NSFW'];
  return valid.includes(label) ? label : 'SAFE'; 
}