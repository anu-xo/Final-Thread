import { GoogleGenerativeAI } from '@google/generative-ai';
import { getEmbeddingQueue } from './embeddingQueue.js';
import { PostEmbedding } from '../models/index.js';

const embeddingQueue = getEmbeddingQueue();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

embeddingQueue.process(async (job) => {
  const { postId, commentId, communityId, text, type = 'post' } = job.data;
  const targetId = commentId || postId;
  console.log(`[EmbeddingWorker] Processing ${type} ${targetId}`);
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  const embedding = result.embedding.values;
  await PostEmbedding.create({ postId, commentId, communityId, type, text, embedding });
  console.log(`[EmbeddingWorker] Done: ${targetId} (${embedding.length} dims)`);
  return { success: true };
});

embeddingQueue.on('failed', (job, err) => {
  console.error(`[EmbeddingWorker] Job ${job.id} failed:`, err.message);
});

embeddingQueue.on('stalled', (job) => {
  console.warn(`[EmbeddingWorker] Job ${job.id} stalled`);
});

export { embeddingQueue };
