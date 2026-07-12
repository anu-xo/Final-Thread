// server/src/middleware/aiRateLimit.js
import { redis as redisClient } from '../config/redis.js'; // your existing ioredis instance

const AI_DAILY_LIMIT = 25;

async function aiRateLimit(req, res, next) {
  const key = `ai:rate:${req.user._id}:${new Date().toISOString().slice(0, 10)}`;

  const count = await redisClient.incr(key);

  if (count === 1) {
    await redisClient.expire(key, 86400); // 24h TTL, resets daily
  }

  if (count > AI_DAILY_LIMIT) {
    return res.status(429).json({
      data: null,
      error: {
        message: 'Daily AI chat limit reached (25/day)',
      },
      meta: {},
    });
  }

  next();
}

export default aiRateLimit;