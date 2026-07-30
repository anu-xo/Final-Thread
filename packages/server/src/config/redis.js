import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Redis } from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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