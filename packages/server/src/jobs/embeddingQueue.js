import Bull from 'bull';

let embeddingQueue;

const getRedisConfig = () => {
  if (!process.env.REDIS_URL) {
    return null;
  }

  try {
    const url = new URL(process.env.REDIS_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      password: url.password ? decodeURIComponent(url.password) : undefined,
      tls: url.protocol === 'rediss:' ? {} : undefined,
    };
  } catch {
    return null;
  }
};

export const getEmbeddingQueue = () => {
  if (!embeddingQueue) {
    const redisConfig = getRedisConfig();
    embeddingQueue = new Bull('embedding', redisConfig ? { redis: redisConfig } : { redis: { host: '127.0.0.1', port: 6379 } });
  }
  return embeddingQueue;
};