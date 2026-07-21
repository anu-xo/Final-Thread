import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getEmbeddingQueue } from './embeddingQueue.js';
import { PostEmbedding } from '../models/index.js';

const embeddingQueue = getEmbeddingQueue();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const BATCH_SIZE = 100;
const BATCH_WINDOW_MS = 2000;

let pendingBatch = [];
let batchTimer = null;
let flushing = false;

const embeddingModel = genAI.getGenerativeModel({
  model: 'gemini-embedding-001',
});

async function embedText(text) {
  const result = await embeddingModel.embedContent({
    content: { parts: [{ text }] },
    outputDimensionality: 768,
  });
  return result.embedding.values;
}

async function embedContentBatch(texts) {
  const result = await embeddingModel.batchEmbedContents({
    requests: texts.map((text) => ({
      content: { parts: [{ text }] },
    })),
  });
  return result.embeddings.map((e) => e.values);
}

async function shouldSkipEmbedding(text, communityId, embedding) {
  const similar = await PostEmbedding.aggregate([
    {
      $vectorSearch: {
        index: 'post_embedding_vector_index',
        path: 'embedding',
        queryVector: embedding,
        numCandidates: 20,
        limit: 1,
        filter: {
          communityId: new mongoose.Types.ObjectId(communityId),
        },
      },
    },
    {
      $project: {
        score: {
          $meta: 'vectorSearchScore',
        },
      },
    },
  ]);

  return similar.length > 0 && similar[0].score > 0.95;
}

embeddingQueue.process(async (job) => {
  return new Promise((resolve, reject) => {
    pendingBatch.push({
      job,
      resolve,
      reject,
    });

    if (pendingBatch.length >= BATCH_SIZE) {
      flushBatch().catch(console.error);
    } else if (!batchTimer) {
      batchTimer = setTimeout(() => {
        flushBatch().catch(console.error);
      }, BATCH_WINDOW_MS);
    }
  });
});

async function flushBatch() {
  if (flushing) return;

  flushing = true;

  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  const batch = pendingBatch.splice(0, pendingBatch.length);

  if (!batch.length) {
    flushing = false;
    return;
  }

  try {
    const texts = batch.map((item) => item.job.data.text);

    let embeddings;
    try {
      embeddings = await embedContentBatch(texts);
    } catch (batchErr) {
      console.warn(
        `[EmbeddingWorker] Batch API failed (${batchErr.message}), falling back to individual calls`
      );
      embeddings = await Promise.all(texts.map(embedText));
    }

    const docs = [];

    for (let i = 0; i < batch.length; i++) {
      const { job } = batch[i];

      const {
        postId,
        commentId,
        communityId,
        text,
        type = 'post',
      } = job.data;

      const skip = await shouldSkipEmbedding(
        text,
        communityId,
        embeddings[i]
      );

      if (!skip) {
        docs.push({
          postId,
          commentId,
          communityId,
          type,
          text,
          embedding: embeddings[i],
        });
      }
    }

    if (docs.length) {
      await PostEmbedding.insertMany(docs);
    }

    for (let i = 0; i < batch.length; i++) {
      const { job, resolve } = batch[i];

      const targetId =
        job.data.commentId || job.data.postId;

      console.log(
        `[EmbeddingWorker] Completed ${targetId}`
      );

      resolve({
        success: true,
      });
    }
  } catch (err) {
    for (const item of batch) {
      item.reject(err);
    }
  } finally {
    flushing = false;

    if (pendingBatch.length) {
      flushBatch().catch(console.error);
    }
  }
}

embeddingQueue.on('failed', (job, err) => {
  console.error(
    `[EmbeddingWorker] Job ${job.id} failed:`,
    err.message
  );
});

embeddingQueue.on('stalled', (job) => {
  console.warn(
    `[EmbeddingWorker] Job ${job.id} stalled`
  );
});

export { embeddingQueue };