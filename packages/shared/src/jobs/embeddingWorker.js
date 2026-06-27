const Bull = require('bull')
const PostEmbedding = require('../models/PostEmbedding')
const { embedText } = require('../services/embeddingService')

// Create the Bull queue backed by Redis
const embeddingQueue = new Bull('embedding', {
  redis: process.env.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100, // keep last 100 completed jobs
    removeOnFail: 50,
  },
})

// Process embedding jobs
embeddingQueue.process(async (job) => {
  const { postId, communityId, text, type = 'post' } = job.data

  console.log(`[EmbeddingWorker] Processing job for post ${postId}`)

  // Generate embedding vector
  const embedding = await embedText(text)

  // Check for near-duplicate (cosine similarity > 0.95) — Day 11 full impl
  // For now, just upsert the embedding
  await PostEmbedding.findOneAndUpdate(
    { postId, type },
    { postId, communityId, type, text, embedding },
    { upsert: true, new: true }
  )

  console.log(`[EmbeddingWorker] ✅ Embedded post ${postId}`)
  return { postId, dimensions: embedding.length }
})

embeddingQueue.on('failed', (job, err) => {
  console.error(`[EmbeddingWorker] ❌ Job ${job.id} failed:`, err.message)
})

embeddingQueue.on('completed', (job) => {
  console.log(`[EmbeddingWorker] ✅ Job ${job.id} completed`)
})

module.exports = embeddingQueue