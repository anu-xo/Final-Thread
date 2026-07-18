import { redis } from '../config/redis.js';

export async function cacheWrap(key, ttlSeconds, fn) {
  if (!redis) return fn();

  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const fresh = await fn();
  await redis.set(key, JSON.parse(JSON.stringify(fresh)), 'EX', ttlSeconds);
  return fresh;
}

export default cacheWrap;
