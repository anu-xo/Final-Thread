import Bull from 'bull';

// Why a singleton export?
// The queue instance should be created ONCE and reused everywhere.
// Creating multiple Bull instances pointing to the same queue name can
// cause duplicate job processing.
let embeddingQueue;

export const getEmbeddingQueue = () => {
  if (!embeddingQueue) {
    embeddingQueue = new Bull('embedding', {
      createClient: (type) => {
        // Reuse same Redis config you built on Day 2
        const { redis } = await import('../config/redis.js');
        return redis;
      }
    });
  }
  return embeddingQueue;
};