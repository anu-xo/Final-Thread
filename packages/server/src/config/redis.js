import { Redis } from 'ioredis';

if (!process.env.REDIS_URL) {
  console.warn('⚠️  REDIS_URL not set — Redis disabled');
}

export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      tls: {},
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: null,
    })
  : null;

if (redis) {
  redis.on('connect', () => console.log('✅ Redis connected'));
  redis.on('error', (err) => console.error('❌ Redis error:', err.message));
}