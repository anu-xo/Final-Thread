import Bull from 'bull';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PostEmbedding } from '../models/index.js';

const embeddingQueue = new Bull('embedding', {
  redis: process.env.REDIS_URL,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Process embedding jobs
embeddingQueue.process(async (job) => {
  const { postId, communityId, text, type = 'post' } = job.data;

  console.log(`[EmbeddingWorker] Processing ${type} ${postId}`);

  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  const embedding = result.embedding.values;   // 768-dim array

  await PostEmbedding.create({ postId, communityId, type, text, embedding });

  console.log(`[EmbeddingWorker] ✓ Embedded ${type} ${postId} (${embedding.length} dims)`);
  return { success: true };
});

// Dead-letter queue — log failures
embeddingQueue.on('failed', (job, err) => {
  console.error(`[EmbeddingWorker] Job ${job.id} failed:`, err.message);
});

embeddingQueue.on('stalled', (job) => {
  console.warn(`[EmbeddingWorker] Job ${job.id} stalled`);
});

export { embeddingQueue };