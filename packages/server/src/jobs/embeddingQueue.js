import Bull from 'bull';
import { getRedisConfig } from './redisConfig.js';

let embeddingQueue;

export const getEmbeddingQueue = () => {
  if (!embeddingQueue) {
    const redisConfig = getRedisConfig();
    embeddingQueue = new Bull('embedding', redisConfig ? { redis: redisConfig } : { redis: { host: '127.0.0.1', port: 6379 } });
  }
  return embeddingQueue;
};
