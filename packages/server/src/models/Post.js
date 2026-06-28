PostSchema.post('save', async function (doc) {

  try {
    const { getEmbeddingQueue } = await import('../jobs/embeddingQueue.js');
    const queue = getEmbeddingQueue();

    const text = `${doc.title}\n\n${doc.body || ''}`.trim();

    await queue.add(
      {
        postId: doc._id.toString(),
        communityId: doc.community.toString(),
        type: 'post',
        text,
      },
      {
        attempts: 3,                // Retry 3 times before moving to dead-letter
        backoff: { type: 'exponential', delay: 2000 }, // Wait 2s, 4s, 8s between retries
        removeOnComplete: 100,      // Keep last 100 completed jobs for debugging
        removeOnFail: 50,           // Keep last 50 failed jobs
      }
    );

    console.log(`📨 Embedding job queued for post: ${doc._id}`);
  } catch (err) {
    
    console.error('Failed to queue embedding job:', err.message);
  }
});